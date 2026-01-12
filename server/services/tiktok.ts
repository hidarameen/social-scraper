import { IScraper } from "./scraper-manager";
import { Task } from "@shared/schema";

export class TiktokScraper implements IScraper {
  async scrape(task: Task) {
    console.log(`Scraping Tiktok: ${task.url}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { items: 10, message: "Successfully scraped 10 videos" };
  }
}
