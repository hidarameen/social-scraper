import { IScraper } from "./scraper-manager";
import { Task } from "@shared/schema";

export class InstagramScraper implements IScraper {
  async scrape(task: Task) {
    console.log(`Scraping Instagram: ${task.url}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { items: 8, message: "Successfully scraped 8 photos" };
  }
}
