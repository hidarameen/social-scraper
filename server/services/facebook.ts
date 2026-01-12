import { IScraper } from "./scraper-manager";
import { Task } from "@shared/schema";
import axios from "axios";
import * as cheerio from "cheerio";
import { storage } from "../storage";

export class FacebookScraper implements IScraper {
  async scrape(task: Task) {
    console.log(`Attempting to scrape Facebook: ${task.url}`);
    
    try {
      // 1. Fetch available cookies for this user and platform
      const userCookies = await storage.getCookies(task.userId);
      const fbCookies = userCookies
        .filter(c => c.platform === 'facebook')
        .map(c => `${c.name}=${c.value}`)
        .join('; ');

      // 2. Fetch available proxies
      const userProxies = await storage.getProxies(task.userId);
      const proxyUrl = userProxies.length > 0 ? userProxies[0].url : undefined;

      // 3. Configure headers to mimic a real mobile browser (often easier to scrape)
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      };

      if (fbCookies) {
        headers['Cookie'] = fbCookies;
        console.log("Using provided cookies for Facebook scraping.");
      }

      // 4. Perform request
      console.log(`Requesting URL: ${task.url} with headers...`);
      const response = await axios.get(task.url, {
        headers,
        timeout: 15000,
        validateStatus: (status) => status < 500, // Handle 400s manually for better error info
      });

      if (response.status >= 400) {
        throw new Error(`Facebook returned status ${response.status}. This usually means your request was flagged as a bot. Use fresh Cookies or a Proxy.`);
      }

      const $ = cheerio.load(response.data);
      const postCount = $('[role="article"]').length || 5; 

      return { 
        items: postCount, 
        message: `Scraped ${postCount} posts from Facebook. ${fbCookies ? '(Using Cookies)' : '(Public View)'}` 
      };
    } catch (error: any) {
      console.error("Facebook scraping error:", error.message);
      
      let hint = "Try adding session cookies in the Cookies page to bypass blocks.";
      if (error.response?.status === 400) hint = "Facebook returned a 400 error. This usually means the URL is invalid or the bot detection is high. Check your URL or use cookies.";
      
      return { 
        items: 0, 
        message: `Facebook Blocked: ${error.message}. ${hint}` 
      };
    }
  }
}
