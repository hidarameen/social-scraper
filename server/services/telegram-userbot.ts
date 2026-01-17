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
    console.log(`[TelegramUserbotService] Client connected. Sending code...`);
    const result = await client.sendCode({
      apiId: parseInt(apiId),
      apiHash: apiHash,
    }, phoneNumber);

    console.log(`[TelegramUserbotService] Code sent. PhoneCodeHash: ${result.phoneCodeHash}`);
    this.clients.set(userId, client);
    return result.phoneCodeHash;
  }

  async completeLogin(userId: number, phoneNumber: string, code: string, phoneCodeHash: string, password?: string) {
    console.log(`[TelegramUserbotService] completeLogin for user ${userId}, phone ${phoneNumber}, passwordProvided: ${!!password}`);
    const client = this.clients.get(userId);
    if (!client) {
      console.error(`[TelegramUserbotService] No active login session found for user ${userId}`);
      throw new Error("No active login session found");
    }

    try {
      console.log(`[TelegramUserbotService] Attempting signIn...`);
      if (!client.connected) {
        await client.connect();
      }
      
      try {
        await client.signIn({
          phoneNumber: async () => phoneNumber,
          phoneCode: async () => code,
          password: async (hint) => {
            if (!password) {
              console.log(`[TelegramUserbotService] 2FA Password needed. Hint: ${hint}`);
              throw new Error('SESSION_PASSWORD_NEEDED');
            }
            return password;
          },
          phoneCodeHash: phoneCodeHash,
          onError: (err) => {
            console.error(`[TelegramUserbotService] client.signIn error: ${err.message}`);
          }
        });
      } catch (innerError: any) {
        // Handle the specific GramJS error for 2FA password required
        if (innerError.message.includes('SESSION_PASSWORD_NEEDED') || 
            innerError.message.includes('password is empty') || 
            innerError.message.includes('PASSWORD_HASH_INVALID')) {
          console.log(`[TelegramUserbotService] 2FA required detected in inner catch`);
          return { needs2FA: true };
        }
        throw innerError;
      }

      console.log(`[TelegramUserbotService] Login successful. Saving session...`);
      const sessionStr = (client.session as StringSession).save();
      await this.storage.upsertSetting({
        userId,
        key: 'tg_session',
        value: sessionStr
      });

      console.log(`[TelegramUserbotService] Session saved.`);
      return { success: true };
    } catch (error: any) {
      console.error(`[TelegramUserbotService] Login error outer catch: ${error.message}`);
      if (error.message.includes('SESSION_PASSWORD_NEEDED') || 
          error.message.includes('password is empty') || 
          error.message.includes('PASSWORD_HASH_INVALID')) {
        return { needs2FA: true };
      }
      throw error;
    }
  }
}
