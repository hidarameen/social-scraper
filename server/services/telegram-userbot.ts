import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { computeCheck } from 'telegram/Password';
import { IStorage } from '../storage';

export class TelegramUserbotService {
  private clients: Map<number, TelegramClient> = new Map();

  constructor(private storage: IStorage) {}

  async getClient(userId: number): Promise<TelegramClient | null> {
    if (this.clients.has(userId)) {
      const existingClient = this.clients.get(userId)!;
      if (existingClient.connected) return existingClient;
    }

    const settings = await this.storage.getSettings(userId);
    const apiId = settings.find(s => s.key === 'tg_api_id')?.value || process.env.API_ID || process.env.TG_API_ID;
    const apiHash = settings.find(s => s.key === 'tg_api_hash')?.value || process.env.API_HASH || process.env.TG_API_HASH;
    const sessionStr = settings.find(s => s.key === 'tg_session')?.value;

    if (!apiId || !apiHash || !sessionStr) {
      if (sessionStr) {
        console.warn(`[TelegramUserbotService] Session exists but missing API credentials for user ${userId}`);
      }
      return null;
    }

    try {
      const client = new TelegramClient(
        new StringSession(sessionStr),
        parseInt(apiId),
        apiHash,
        { 
          connectionRetries: 5,
          useWSS: false,
          autoReconnect: true
        }
      );

      console.log(`[TelegramUserbotService] Connecting to Telegram...`);
      await client.connect();
      
      // Check if the session is actually valid
      try {
        const me = await client.getMe();
        console.log(`[TelegramUserbotService] Logged in as: ${me.username || me.id}`);
      } catch (sessionErr: any) {
        console.error(`[TelegramUserbotService] Session invalid or expired for user ${userId}: ${sessionErr.message}`);
        this.clients.delete(userId);
        return null;
      }

      this.clients.set(userId, client);
      return client;
    } catch (error: any) {
      console.error(`[TelegramUserbotService] Connection error for user ${userId}: ${error.message}`);
      return null;
    }
  }

  async startLogin(userId: number, phoneNumber: string) {
    console.log(`[TelegramUserbotService] startLogin for user ${userId}, phone ${phoneNumber}`);
    const settings = await this.storage.getSettings(userId);
    const apiId = settings.find(s => s.key === 'tg_api_id')?.value || process.env.TG_API_ID || process.env.API_ID;
    const apiHash = settings.find(s => s.key === 'tg_api_hash')?.value || process.env.TG_API_HASH || process.env.API_HASH;

    if (!apiId || !apiHash) {
      console.error(`[TelegramUserbotService] Missing API ID or API Hash in environment variables`);
      throw new Error("Missing API ID or API Hash in environment variables");
    }

    const client = new TelegramClient(new StringSession(''), parseInt(apiId), apiHash, {
      connectionRetries: 5,
    });

    console.log(`[TelegramUserbotService] Connecting client...`);
    await client.connect();
    
    console.log(`[TelegramUserbotService] Sending code...`);
    
    try {
      const result = await client.invoke(
        new Api.auth.SendCode({
          phoneNumber: phoneNumber,
          apiId: parseInt(apiId),
          apiHash: apiHash,
          settings: new Api.CodeSettings({}),
        })
      ) as any;

      console.log(`[TelegramUserbotService] Code sent. PhoneCodeHash: ${result.phoneCodeHash}`);
      this.clients.set(userId, client);
      return result.phoneCodeHash;
    } catch (error: any) {
      console.error(`[TelegramUserbotService] SendCode error: ${error.message}`);
      throw error;
    }
  }

  async completeLogin(userId: number, phoneNumber: string, code: string, phoneCodeHash: string, password?: string) {
    console.log(`[TelegramUserbotService] completeLogin for user ${userId}, phone ${phoneNumber}`);
    const client = this.clients.get(userId);
    if (!client) {
      console.error(`[TelegramUserbotService] No active login session found for user ${userId}`);
      throw new Error("No active login session found");
    }

    try {
      if (!client.connected) {
        await client.connect();
      }
      
      try {
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber,
            phoneCodeHash,
            phoneCode: code,
          })
        );
      } catch (err: any) {
        if (err.errorMessage === "SESSION_PASSWORD_NEEDED" || err.message.includes('SESSION_PASSWORD_NEEDED')) {
          if (!password) {
            return { needs2FA: true };
          }

          const passwordInfo = await client.invoke(
            new Api.account.GetPassword()
          );

          const srp = await computeCheck(passwordInfo, password);

          await client.invoke(
            new Api.auth.CheckPassword({
              password: srp,
            })
          );
        } else {
          throw err;
        }
      }

      console.log(`[TelegramUserbotService] Login successful. Saving session...`);
      const sessionStr = (client.session as StringSession).save();
      
      // Get API credentials to save them too
      const settings = await this.storage.getSettings(userId);
      const apiId = settings.find(s => s.key === 'tg_api_id')?.value || process.env.API_ID || process.env.TG_API_ID;
      const apiHash = settings.find(s => s.key === 'tg_api_hash')?.value || process.env.API_HASH || process.env.TG_API_HASH;

      console.log(`[TelegramUserbotService] Saving credentials: apiId=${!!apiId}, apiHash=${!!apiHash}`);

      await Promise.all([
        this.storage.upsertSetting({
          userId,
          key: 'tg_session',
          value: sessionStr
        }),
        apiId ? this.storage.upsertSetting({
          userId,
          key: 'tg_api_id',
          value: apiId
        }) : Promise.resolve(),
        apiHash ? this.storage.upsertSetting({
          userId,
          key: 'tg_api_hash',
          value: apiHash
        }) : Promise.resolve()
      ]);

      return { success: true };
    } catch (error: any) {
      console.error(`[TelegramUserbotService] Login error: ${error.message}`);
      throw error;
    }
  }
}
