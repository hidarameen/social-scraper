import { IStorage } from "../storage";
import { Task } from "@shared/schema";

export interface IScraper {
  scrape(task: Task): Promise<{ items: number, message: string }>;
}

import { FacebookScraper } from "./facebook";
import { TwitterScraper } from "./twitter";
import { InstagramScraper } from "./instagram";
import { YoutubeScraper } from "./youtube";
import { TiktokScraper } from "./tiktok";

export class ScraperManager {
  private storage: IStorage;
  private scrapers: Record<string, IScraper>;
  private interval: NodeJS.Timeout | null = null;

  constructor(storage: IStorage) {
    this.storage = storage;
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

      await this.storage.createLog({
        taskId: task.id,
        status: "success",
        message: result.message,
        itemsFound: result.items,
      });

      // Update last run
      await this.storage.updateTask(task.id, { lastRun: new Date() });

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
