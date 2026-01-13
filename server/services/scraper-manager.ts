import { IStorage } from "../storage";
import { Task } from "@shared/schema";
import { TelegramService } from "./telegram";

export interface IScraper {
  scrape(task: Task): Promise<{ items: number, message: string, data?: any }>;
}

import { FacebookScraper } from "./facebook";
import { TwitterScraper } from "./twitter";
import { InstagramScraper } from "./instagram";
import { YoutubeScraper } from "./youtube";
import { TiktokScraper } from "./tiktok";

export class ScraperManager {
  private storage: IStorage;
  private scrapers: Record<string, IScraper>;
  private telegram: TelegramService;
  private interval: NodeJS.Timeout | null = null;

  constructor(storage: IStorage) {
    this.storage = storage;
    this.telegram = new TelegramService(storage);
    this.scrapers = {
      facebook: new FacebookScraper(),
      twitter: new TwitterScraper(),
      instagram: new InstagramScraper(),
      youtube: new YoutubeScraper(),
      tiktok: new TiktokScraper(),
    };
  }

  start() {
    // Check every minute
    this.interval = setInterval(() => this.checkTasks(), 60 * 1000);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }

  async checkTasks() {
    try {
      const tasks = await this.storage.getAllTasks();
      const now = new Date();
      
      for (const task of tasks) {
        if (task.status !== 'active') continue;
        
        const lastRun = task.lastRun ? new Date(task.lastRun) : new Date(0);
        const diffMinutes = (now.getTime() - lastRun.getTime()) / (1000 * 60);
        
        if (diffMinutes >= (task.interval || 60)) {
          console.log(`Running scheduled task: ${task.id} (${task.platform})`);
          this.runTask(task).catch(err => console.error(`Scheduled task ${task.id} failed:`, err));
        }
      }
    } catch (e) {
      console.error("Error checking tasks:", e);
    }
  }

  async runTask(task: Task) {
    const scraper = this.scrapers[task.platform];
    if (!scraper) {
      throw new Error(`No scraper found for platform: ${task.platform}`);
    }

    try {
      await this.storage.createLog({
        taskId: task.id,
        status: "running",
        message: "Starting scrape...",
      });

      const result = await scraper.scrape(task);
      
      let newPosts = result.data || [];
      if (task.lastPostId && Array.isArray(newPosts)) {
        console.log(`Checking for new posts. Last post ID: ${task.lastPostId}`);
        const lastIdx = newPosts.findIndex((p: any) => {
          const pid = (p.id || '').toString().split(/[?&]/)[0];
          const tid = (task.lastPostId || '').toString().split(/[?&]/)[0];
          return pid === tid;
        });
        
        if (lastIdx !== -1) {
          console.log(`Found last post at index ${lastIdx}. New posts: ${lastIdx}`);
          newPosts = newPosts.slice(0, lastIdx);
        } else {
          console.log(`Last post not found in current results. All ${newPosts.length} posts might be new.`);
        }
      }

      await this.storage.createLog({
        taskId: task.id,
        status: "success",
        message: result.message + (newPosts.length !== result.items ? ` (${newPosts.length} new)` : ''),
        itemsFound: newPosts.length,
      });

      // Update last run and last post ID
      const updates: any = { lastRun: new Date() };
      if (Array.isArray(result.data) && result.data.length > 0) {
        updates.lastPostId = (result.data[0].id || '').toString().split(/[?&]/)[0];
      }
      await this.storage.updateTask(task.id, updates);

      // Send to Telegram if new items found
      if (task.target && newPosts.length > 0) {
        // Send in reverse order so newest is last in Telegram
        for (const post of [...newPosts].reverse()) {
          let notifyMsg = task.messageTemplate || `<b>[ScrapeMaster]</b>\nPlatform: {platform}\nURL: {url}\n\n{text}\n\n<a href="{url}">View Post</a>`;
          
          // Replace placeholders safely
          const safeReplace = (tmpl: string, key: string, val: any) => {
            const cleanVal = (val || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');
            // Use regex with global flag to ensure all occurrences are replaced exactly once per key
            const placeholder = new RegExp(`\\{${key}\\}`, 'g');
            return tmpl.replace(placeholder, key === 'url' ? (val || '') : cleanVal);
          };

          notifyMsg = safeReplace(notifyMsg, 'platform', post.platform || task.platform);
          notifyMsg = safeReplace(notifyMsg, 'text', post.text);
          notifyMsg = safeReplace(notifyMsg, 'account', post.accountName || '');
          notifyMsg = safeReplace(notifyMsg, 'date', post.date || '');
          notifyMsg = safeReplace(notifyMsg, 'url', post.url);

          const imageToSend = task.includeImages ? post.image : undefined;
          const videoToSend = task.includeVideos ? post.video : undefined;
          await this.telegram.sendMessage(task.userId, task.target, notifyMsg, imageToSend, videoToSend);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

    } catch (error: any) {
      await this.storage.createLog({
        taskId: task.id,
        status: "error",
        message: error.message,
      });
      throw error;
    }
  }
}
