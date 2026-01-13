import TelegramBot from "node-telegram-bot-api";
import { IStorage } from "../storage";

export class TelegramService {
  private storage: IStorage;

  constructor(storage: IStorage) {
    this.storage = storage;
  }

  async sendMessage(userId: number, target: string, message: string, image?: string, video?: string) {
    try {
      const settings = await this.storage.getSettings(userId);
      const botToken = settings.find(s => s.key === 'telegram_bot_token')?.value;

      if (!botToken) {
        console.warn(`Telegram bot token not found for user ${userId}`);
        return;
      }

      const bot = new TelegramBot(botToken);
      
      // Target can be a channel ID or username (starting with @)
      // Ensure target is a string and clean it
      let chatId = target.toString().trim();
      
      // Automatically prepend @ if it looks like a username and is missing it
      if (!chatId.startsWith('@') && !chatId.startsWith('-') && isNaN(Number(chatId))) {
        chatId = `@${chatId}`;
      }
      
      if (video) {
        await bot.sendVideo(chatId, video, { caption: message, parse_mode: 'HTML' });
      } else if (image) {
        await bot.sendPhoto(chatId, image, { caption: message, parse_mode: 'HTML' });
      } else {
        await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
      }
      console.log(`Telegram message sent to ${target}`);
    } catch (error: any) {
      let hint = "";
      if (error.message.includes("chat not found")) {
        hint = " Error: Chat not found. Make sure the target (e.g., @channelname or chat ID) is correct and the bot is a member/admin.";
      }
      console.error("Telegram notification error:", error.message);
      throw new Error(`Telegram failed: ${error.message}.${hint}`);
    }
  }
}
