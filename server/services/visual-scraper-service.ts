import { IStorage } from "../storage";
import { BrowserService } from "./visual-scraper/browser";
import { TelegramService } from "./telegram";

export class VisualScraperService {
  private browserService: BrowserService;
  private telegramService: TelegramService;

  constructor(private storage: IStorage) {
    this.browserService = BrowserService.getInstance();
    this.telegramService = new TelegramService(storage);
  }

  async runTask(task: any) {
    console.log(`[VisualScraper] Running task ${task.id} for ${task.url}`);
    
    try {
      const selectors = {
        title: task.selectorTitle,
        content: task.selectorContent,
        image: task.selectorImage,
        link: task.selectorLink
      };

      const results = await this.browserService.getVisualData(task.url, selectors, task.userAgent);
      
      let newPostsCount = 0;
      for (const post of results.slice(0, task.postLimit || 10)) {
        const postId = post.link || post.title;
        if (!postId) continue;

        const alreadySent = await this.storage.isPostSent(task.id, postId);
        if (alreadySent) continue;

        console.log(`[VisualScraper] New post found: ${post.title}`);
        
        await this.telegramService.sendMessage(task.userId, task.target, post.title + (post.content ? `\n\n${post.content}` : ""), post.image);

        await this.storage.markPostAsSent(task.id, postId);
        newPostsCount++;
      }

      await this.storage.createLog({
        taskId: task.id,
        status: "success",
        message: `Successfully checked website. Found ${newPostsCount} new posts.`,
        itemsFound: newPostsCount,
      });

      await this.storage.updateTask(task.id, { lastRun: new Date() });
    } catch (error: any) {
      console.error(`[VisualScraper] Error in task ${task.id}:`, error);
      await this.storage.createLog({
        taskId: task.id,
        status: "error",
        message: `Visual scraping failed: ${error.message}`,
      });
    }
  }
}
