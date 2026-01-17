import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
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
    const apiId = process.env.TG_API_ID || process.env.API_ID;
    const apiHash = process.env.TG_API_HASH || process.env.API_HASH;
    const sessionStr = settings.find(s => s.key === 'tg_session')?.value;

    if (!apiId || !apiHash || !sessionStr) return null;

    const client = new TelegramClient(
      new StringSession(sessionStr),
      parseInt(apiId),
      apiHash,
      { connectionRetries: 5 }
    );

    await client.connect();
    this.clients.set(userId, client);
    return client;
  }

  async startLogin(userId: number, phoneNumber: string) {
    console.log(`[TelegramUserbotService] startLogin for user ${userId}, phone ${phoneNumber}`);
    const apiId = process.env.TG_API_ID || process.env.API_ID;
    const apiHash = process.env.TG_API_HASH || process.env.API_HASH;

    if (!apiId || !apiHash) {
      console.error(`[TelegramUserbotService] Missing API ID or API Hash in environment variables`);
      throw new Error("Missing API ID or API Hash in environment variables");
    }

    const client = new TelegramClient(new StringSession(''), parseInt(apiId), apiHash, {
      connectionRetries: 5,
    });

    console.log(`[TelegramUserbotService] Connecting client...`);
    await client.connect();
    
    const { Api } = await import('telegram');
    console.log(`[TelegramUserbotService] Sending code...`);
    
    try {
      const result = await client.invoke(
        new Api.auth.SendCode({
          phoneNumber: phoneNumber,
          apiId: parseInt(apiId),
          apiHash: apiHash,
          settings: new Api.CodeSettings({
            allowFlashcall: false,
            currentNumber: true,
            allowAppHash: true,
          }),
        })
      );

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
      console.log(`[TelegramUserbotService] Attempting manual signIn flow...`);
      if (!client.connected) {
        await client.connect();
      }
      
      const { Api } = await import('telegram');

      try {
        // Try to sign in with code first
        await client.invoke(
          new Api.auth.SignIn({
            phoneNumber,
            phoneCodeHash,
            phoneCode: code,
          })
        );
      } catch (error: any) {
        if (error.message.includes('SESSION_PASSWORD_NEEDED')) {
          console.log(`[TelegramUserbotService] 2FA Required`);
          if (!password) {
            return { needs2FA: true };
          }

          console.log(`[TelegramUserbotService] Verifying 2FA password...`);
          // Handle 2FA Password
          const passwordSettings = await client.invoke(new Api.account.GetPassword());
          const { computeCheck } = await import('telegram/Password');
          const check = await computeCheck(passwordSettings, password);
          
          await client.invoke(
            new Api.auth.CheckPassword({
              password: check,
            })
          );
        } else {
          throw error;
        }
      }

      console.log(`[TelegramUserbotService] Login successful. Saving session...`);
      const sessionStr = (client.session as StringSession).save();
      await this.storage.upsertSetting({
        userId,
        key: 'tg_session',
        value: sessionStr
      });

      return { success: true };
    } catch (error: any) {
      console.error(`[TelegramUserbotService] Login error catch: ${error.message}`);
      if (error.message.includes('SESSION_PASSWORD_NEEDED') || 
          error.message.includes('password is empty') || 
          error.message.includes('PASSWORD_HASH_INVALID')) {
        return { needs2FA: true };
      }
      throw error;
    }
  }
}
