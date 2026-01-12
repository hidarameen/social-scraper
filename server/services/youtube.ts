import { IScraper } from "./scraper-manager";
import { Task } from "@shared/schema";

export class YoutubeScraper implements IScraper {
  async scrape(task: Task) {
    console.log(`Scraping Youtube: ${task.url}`);
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { items: 2, message: "Successfully scraped 2 videos" };
  }
}
