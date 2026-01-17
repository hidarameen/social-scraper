import { TelegramClient } from 'telethon';
import { StringSession } from 'telethon/sessions';
import { IStorage } from '../storage';

export class TelegramUserbotService {
  private clients: Map<number, TelegramClient> = new Map();

  constructor(private storage: IStorage) {}

  async getClient(userId: number): Promise<TelegramClient | null> {
    if (this.clients.has(userId)) {
      return this.clients.get(userId)!;
    }

    const settings = await this.storage.getSettings(userId);
    const apiId = settings.find(s => s.key === 'tg_api_id')?.value;
    const apiHash = settings.find(s => s.key === 'tg_api_hash')?.value;
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
    const settings = await this.storage.getSettings(userId);
    const apiId = settings.find(s => s.key === 'tg_api_id')?.value;
    const apiHash = settings.find(s => s.key === 'tg_api_hash')?.value;

    if (!apiId || !apiHash) throw new Error("Missing API ID or API Hash");

    const client = new TelegramClient(new StringSession(''), parseInt(apiId), apiHash, {
      connectionRetries: 5,
    });

    await client.connect();
    const result = await client.sendCode({
      apiId: parseInt(apiId),
      apiHash: apiHash,
    }, phoneNumber);

    // Store phone code hash temporarily in memory or DB
    // For simplicity, we'll store the client instance
    this.clients.set(userId, client);
    return result.phoneCodeHash;
  }

  async completeLogin(userId: number, phoneNumber: string, code: string, phoneCodeHash: string, password?: string) {
    const client = this.clients.get(userId);
    if (!client) throw new Error("No active login session found");

    try {
      await client.signIn({
        phoneNumber,
        phoneCodeHash,
        phoneCode: code,
        password: password ? async () => password : undefined,
      });

      const sessionStr = (client.session as StringSession).save();
      await this.storage.upsertSetting({
        userId,
        key: 'tg_session',
        value: sessionStr
      });

      return { success: true };
    } catch (error: any) {
      if (error.message.includes('SESSION_PASSWORD_NEEDED')) {
        return { needs2FA: true };
      }
      throw error;
    }
  }
}
