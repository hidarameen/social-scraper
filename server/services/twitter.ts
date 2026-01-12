import { IScraper } from "./scraper-manager";
import { Task } from "@shared/schema";

export class TwitterScraper implements IScraper {
  async scrape(task: Task) {
    console.log(`Scraping Twitter: ${task.url}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { items: 3, message: "Successfully scraped 3 tweets" };
  }
}
