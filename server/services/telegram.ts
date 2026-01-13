import TelegramBot from "node-telegram-bot-api";
import { IStorage } from "../storage";
import path from "path";
import fs from "fs";
import youtubedl from "youtube-dl-exec";
import { createHash } from "crypto";

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
          console.log(`Telegram Service: Processing video URL: ${video}`);
          const isFacebookVideo = video.includes('/videos/') || video.includes('/watch/') || video.includes('/reel/');
          
          if (isFacebookVideo) {
            console.log(`Telegram Service: Downloading video from: ${video}`);
            // Use a unique ID based on the video URL hash to avoid collisions and track uniquely
            const urlHash = createHash('md5').update(video).digest('hex').substring(0, 8);
            const uniqueId = `${Date.now()}_${urlHash}`;
            const tempFile = path.join("/tmp", `fb_video_${uniqueId}.mp4`);
            
            console.log(`Telegram Service: Target temp file: ${tempFile}`);
            
            try {
            await youtubedl(video, {
              output: tempFile,
              noCheckCertificates: true,
              format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
              recodeVideo: 'mp4',
              addHeader: [
                'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language:en-US,en;q=0.9',
                'Sec-Fetch-Mode:navigate'
              ]
            });

              if (fs.existsSync(tempFile)) {
                const stats = fs.statSync(tempFile);
                console.log(`Telegram Service: Downloaded video size: ${stats.size} bytes. Path: ${tempFile}`);
                
                if (stats.size > 0) {
                  await bot.sendVideo(chatId, tempFile, { 
                    caption: message, 
                    parse_mode: 'HTML',
                    supports_streaming: true
                  });
                  console.log(`Telegram Service: Video sent successfully to ${chatId}`);
                } else {
                  throw new Error("Downloaded file is empty");
                }
              } else {
                throw new Error("Downloaded file not found after yt-dlp execution");
              }
            } finally {
              // Always try to clean up the temp file
              if (fs.existsSync(tempFile)) {
                try {
                  fs.unlinkSync(tempFile);
                  console.log(`Telegram Service: Cleaned up temp file ${tempFile}`);
                } catch (delErr) {
                  console.error(`Failed to delete temp file ${tempFile}:`, delErr);
                }
              }
            }
          } else {
            console.log(`Telegram Service: Sending video as direct URL: ${video}`);
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
