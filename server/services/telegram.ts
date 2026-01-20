import TelegramBot from "node-telegram-bot-api";
import { IStorage } from "../storage";
import path from "path";
import fs from "fs";
import youtubedl from "youtube-dl-exec";
import { createHash } from "crypto";
import ffmpeg from "fluent-ffmpeg";
import { TelegramUserbotService } from "./telegram-userbot";

export class TelegramService {
  private storage: IStorage;
  private userbotService: TelegramUserbotService;

  constructor(storage: IStorage) {
    this.storage = storage;
    this.userbotService = new TelegramUserbotService(storage);
  }

  private async getVideoMetadata(filePath: string): Promise<{ duration?: number, width?: number, height?: number }> {
    return new Promise((resolve) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          console.error("FFprobe error:", err);
          resolve({});
          return;
        }
        
        // Find the video stream
        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        
        // Duration can be in format.duration or stream.duration
        let duration = metadata.format.duration;
        if (!duration && videoStream?.duration) {
          duration = parseFloat(videoStream.duration);
        }

        console.log(`Metadata for ${path.basename(filePath)}: duration=${duration}, size=${videoStream?.width}x${videoStream?.height}`);

        resolve({
          duration: duration ? Math.round(Number(duration)) : undefined,
          width: videoStream?.width,
          height: videoStream?.height
        });
      });
    });
  }

  private async generateThumbnail(videoPath: string, thumbnailPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      // Create a more robust thumbnail generation
      // We try to take a screenshot at 1 second, or 10% of duration if 1 second fails
      ffmpeg(videoPath)
        .screenshots({
          timestamps: [1], // Start at 1 second
          filename: path.basename(thumbnailPath),
          folder: path.dirname(thumbnailPath),
          size: '320x?'
        })
        .on('end', () => {
          if (fs.existsSync(thumbnailPath) && fs.statSync(thumbnailPath).size > 0) {
            resolve(true);
          } else {
            console.error("Thumbnail generated but file is empty or missing");
            resolve(false);
          }
        })
        .on('error', (err) => {
          console.error("Thumbnail generation error:", err);
          // Try a fallback: first frame
          ffmpeg(videoPath)
            .screenshots({
              timestamps: [0],
              filename: path.basename(thumbnailPath),
              folder: path.dirname(thumbnailPath),
              size: '320x?'
            })
            .on('end', () => resolve(fs.existsSync(thumbnailPath)))
            .on('error', () => resolve(false));
        });
    });
  }

  async sendMessage(userId: number, target: string, message: string, image?: string, video?: string) {
    try {
      const settings = await this.storage.getSettings(userId);
      const useUserbot = settings.find(s => s.key === 'tg_use_userbot')?.value === 'true';

      if (useUserbot) {
        const client = await this.userbotService.getClient(userId);
        if (client) {
          console.log(`Telegram Service: Using Userbot for user ${userId}`);
          let chatId = target.toString().trim();
          if (!chatId.startsWith('@') && !chatId.startsWith('-') && isNaN(Number(chatId))) {
            chatId = `@${chatId}`;
          }

          if (video) {
            try {
              console.log(`[Telegram Userbot] Attempting to send video: ${video} to ${chatId}`);
              await client.sendFile(chatId, {
                file: video,
                caption: message,
                parseMode: 'html'
              });
            } catch (mediaErr: any) {
              console.error(`[Telegram Userbot] Video send failed: ${mediaErr.message}. Falling back to text.`);
              await client.sendMessage(chatId, {
                message: `${message}\n\n🎬 <b>Video Link:</b> ${video}`,
                parseMode: 'html'
              });
            }
          } else if (image) {
            try {
              console.log(`[Telegram Userbot] Attempting to send image: ${image} to ${chatId}`);
              await client.sendFile(chatId, {
                file: image,
                caption: message,
                parseMode: 'html'
              });
            } catch (mediaErr: any) {
              console.error(`[Telegram Userbot] Image send failed: ${mediaErr.message}. Falling back to text.`);
              await client.sendMessage(chatId, {
                message: `${message}\n\n🖼 <b>Image Link:</b> ${image}`,
                parseMode: 'html'
              });
            }
          } else {
            await client.sendMessage(chatId, { message, parseMode: 'html' });
          }
          console.log(`Telegram message sent via Userbot to ${target}`);
          return;
        }
        console.warn(`Userbot client not initialized for user ${userId}, falling back to Bot API`);
      }

      const botToken = settings.find(s => s.key === 'telegram_bot_token')?.value;
      if (!botToken) {
        console.warn(`Telegram bot token not found for user ${userId}`);
        return;
      }
      // ... (rest of existing bot API implementation)

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
          const isFacebookVideo = video.includes('facebook.com') || video.includes('fb.watch') || video.includes('/videos/') || video.includes('/watch/') || video.includes('/reel/');
          const isTwitterVideo = video.includes('twitter.com') || video.includes('x.com') || video.includes('twimg.com') || video.includes('attached_assets/downloads');
          
          if (isFacebookVideo || isTwitterVideo) {
            console.log(`Telegram Service: Processing video: ${video}`);
            // Use a unique ID based on the video URL hash to avoid collisions and track uniquely
            const urlHash = createHash('md5').update(video).digest('hex').substring(0, 8);
            const uniqueId = `${Date.now()}_${urlHash}`;
            const tempFile = path.join("/tmp", `vid_${uniqueId}.mp4`);
            const thumbFile = path.join("/tmp", `thumb_${uniqueId}.jpg`);
            
            console.log(`Telegram Service: Target temp file: ${tempFile}`);
            
            try {
              if (video.startsWith('/attached_assets/')) {
                // If it's a local file already downloaded by scraper
                const localPath = path.join(process.cwd(), video.startsWith('/') ? video.substring(1) : video);
                if (fs.existsSync(localPath)) {
                  console.log(`Telegram Service: Using existing local file: ${localPath}`);
                  fs.copyFileSync(localPath, tempFile);
                } else {
                  // Try without leading slash if still not found
                  const fallbackPath = path.join(process.cwd(), video.replace(/^\//, ''));
                  if (fs.existsSync(fallbackPath)) {
                    console.log(`Telegram Service: Using fallback local file: ${fallbackPath}`);
                    fs.copyFileSync(fallbackPath, tempFile);
                  } else {
                    throw new Error(`Local video file not found: ${localPath} or ${fallbackPath}`);
                  }
                }
              } else {
                // Try to download with best quality mp4
                await youtubedl(video, {
                  output: tempFile,
                  noCheckCertificates: true,
                  format: 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                  recodeVideo: 'mp4',
                  addHeader: [
                    'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  ]
                });
              }

              if (fs.existsSync(tempFile)) {
                const stats = fs.statSync(tempFile);
                console.log(`Telegram Service: Downloaded video size: ${stats.size} bytes. Path: ${tempFile}`);
                
                if (stats.size > 0) {
                  // Get metadata for duration
                  const meta = await this.getVideoMetadata(tempFile);
                  
                  // Generate thumbnail
                  const hasThumb = await this.generateThumbnail(tempFile, thumbFile);

                  // Check caption length (Telegram limit is 1024 characters for media captions)
                  let caption = message;
                  if (caption.length > 1000) {
                    caption = caption.substring(0, 997) + "...";
                  }

                  const options: any = { 
                    caption: caption, 
                    parse_mode: 'HTML',
                    supports_streaming: true,
                    duration: meta.duration || 0, // Ensure duration is at least 0
                    width: meta.width,
                    height: meta.height
                  };

                  if (hasThumb && fs.existsSync(thumbFile)) {
                    options.thumb = thumbFile;
                  } else if (image && image.startsWith('http')) {
                    // Fallback to original image if local thumbnail generation failed
                    options.thumb = image;
                  }

                  // Check file size before sending (Telegram Bot API limit is 50MB for bots)
                  const MAX_SIZE = 50 * 1024 * 1024;
                  if (stats.size > MAX_SIZE) {
                    console.log(`Telegram Service: Video too large (${stats.size} bytes), sending link instead`);
                    // If video is too large for bot API, try to send it as a document (sometimes works up to 2GB but Bot API is 50MB)
                    // For now, we stick to the limit but provide a clearer message
                    await bot.sendMessage(chatId, `${message}\n\n🎬 <b>Video Link (File too large for Telegram Bot API - 50MB limit):</b> ${video}`, { parse_mode: 'HTML' });
                  } else {
                    await bot.sendVideo(chatId, tempFile, options, { filename: path.basename(tempFile), contentType: 'video/mp4' });
                    console.log(`Telegram Service: Video sent successfully to ${chatId}`);
                  }
                } else {
                  throw new Error("Downloaded file is empty");
                }
              } else {
                throw new Error("Downloaded file not found after yt-dlp execution");
              }
            } finally {
              // Always try to clean up temp files
              [tempFile, thumbFile].forEach(f => {
                if (fs.existsSync(f)) {
                  try { fs.unlinkSync(f); } catch (e) {}
                }
              });
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
        let caption = message;
        if (caption.length > 1000) {
          caption = caption.substring(0, 997) + "...";
        }
        await bot.sendPhoto(chatId, image, { caption: caption, parse_mode: 'HTML' });
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
