import { IScraper } from "./scraper-manager";
import { Task } from "@shared/schema";
import axios from "axios";
import * as cheerio from "cheerio";

export class TwitterScraper implements IScraper {
  async scrape(task: Task) {
    console.log(`Attempting to scrape Twitter: ${task.url}`);
    try {
      // Twitter blocks direct scraping. 
      // We try to fetch the page and extract whatever content is available in the initial HTML.
      const response = await axios.get(task.url, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        }
      });

      const $ = cheerio.load(response.data);
      const posts: any[] = [];

      // Twitter's modern site is JS-heavy, but sometimes meta tags or noscript content exists.
      // Also checking for potential SSR content or structured data.
      
      // Try to find content in meta tags for the main tweet if it's a direct tweet URL
      if (task.url.includes('/status/')) {
        const description = $('meta[property="og:description"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content');
        const image = $('meta[property="og:image"]').attr('content');
        
        if (description) {
          posts.push({
            id: task.url.split('/').pop(),
            text: description,
            url: task.url,
            image: image,
            platform: 'twitter',
            accountName: title || 'Twitter User',
            date: new Date().toISOString()
          });
        }
      }

      // If it's a profile, we might find some basic info but tweets are usually JS-rendered.
      // This is a placeholder for more advanced scraping or API integration.

      if (posts.length === 0) {
        return { 
          items: 0, 
          message: "Twitter page fetched, but no posts could be extracted (JS-rendered content). API keys recommended.",
          data: []
        };
      }

      return { 
        items: posts.length, 
        message: `Successfully extracted ${posts.length} posts from Twitter page.`,
        data: posts
      };
    } catch (e: any) {
      console.error(`Twitter scraping error: ${e.message}`);
      return { items: 0, message: `Twitter block detected or invalid URL: ${e.message}` };
    }
  }
}
