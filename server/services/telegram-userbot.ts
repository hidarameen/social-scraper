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
    const apiId = process.env.TG_API_ID || process.env.API_ID;
    const apiHash = process.env.TG_API_HASH || process.env.API_HASH;

    if (!apiId || !apiHash) throw new Error("Missing API ID or API Hash in environment variables");

    const client = new TelegramClient(new StringSession(''), parseInt(apiId), apiHash, {
      connectionRetries: 5,
    });

    await client.connect();
    const result = await client.sendCode({
      apiId: parseInt(apiId),
      apiHash: apiHash,
    }, phoneNumber);

    this.clients.set(userId, client);
    return result.phoneCodeHash;
  }

  async completeLogin(userId: number, phoneNumber: string, code: string, phoneCodeHash: string, password?: string) {
    const client = this.clients.get(userId);
    if (!client) throw new Error("No active login session found");

    try {
      await client.signInUser({
        apiId: parseInt(process.env.TG_API_ID || process.env.API_ID || ""),
        apiHash: process.env.TG_API_HASH || process.env.API_HASH || "",
      }, {
        phoneNumber: async () => phoneNumber,
        phoneCode: async () => code,
        password: async () => {
          if (!password) {
            const err = new Error('SESSION_PASSWORD_NEEDED');
            throw err;
          }
          return password;
        },
        onError: (err) => {
          // If password is required, this will be handled by the catch block
          if (err.message.includes('SESSION_PASSWORD_NEEDED') || err.message.includes('password is empty')) {
             return; // Let the async password function or catch handle it
          }
          throw err;
        }
      });

      const sessionStr = (client.session as StringSession).save();
      await this.storage.upsertSetting({
        userId,
        key: 'tg_session',
        value: sessionStr
      });

      return { success: true };
    } catch (error: any) {
      if (error.message.includes('SESSION_PASSWORD_NEEDED') || error.message.includes('password is empty')) {
        return { needs2FA: true };
      }
      throw error;
    }
  }
}
