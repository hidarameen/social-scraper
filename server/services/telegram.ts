import TelegramBot from "node-telegram-bot-api";
import { IStorage } from "../storage";
import path from "path";
import fs from "fs";
import youtubedl from "youtube-dl-exec";

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
        try {
          if (video.includes('/videos/') || video.includes('/watch/') || video.includes('/reel/')) {
            console.log(`Downloading video from: ${video}`);
            const tempFile = path.join("/tmp", `video_${Date.now()}.mp4`);
            
            await youtubedl(video, {
              output: tempFile,
              noCheckCertificates: true,
              addHeader: [
                'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language:en-US,en;q=0.9',
                'Sec-Fetch-Mode:navigate'
              ]
            });

            if (fs.existsSync(tempFile)) {
              await bot.sendVideo(chatId, tempFile, { caption: message, parse_mode: 'HTML' });
              fs.unlinkSync(tempFile);
            } else {
              throw new Error("Downloaded file not found");
            }
          } else {
            await bot.sendVideo(chatId, video, { caption: message, parse_mode: 'HTML' });
          }
        } catch (vErr: any) {
          console.error("Failed to download or send video, falling back to message with link:", vErr.message);
          await bot.sendMessage(chatId, `${message}\n\n🎬 <b>Video Link:</b> ${video}`, { parse_mode: 'HTML' });
        }
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
