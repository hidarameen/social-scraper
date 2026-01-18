import { IScraper } from "./scraper-manager";
import { Task } from "@shared/schema";
import axios from "axios";
import * as cheerio from "cheerio";
import { chromium } from 'playwright';

export class TwitterScraper implements IScraper {
  private nitterInstances = [
    'https://nitter.net',
    'https://nitter.cz',
    'https://nitter.it',
    'https://nitter.privacydev.net',
    'https://nitter.poast.org',
    'https://nitter.moomoo.me'
  ];

  async scrape(task: Task) {
    console.log(`Attempting to scrape Twitter: ${task.url} using ${task.scrapeMethod} method`);

    if (task.scrapeMethod === 'browser') {
      return this.scrapeWithBrowser(task);
    }
    
    // Default to Nitter/Meta extraction for 'html' or other methods
    return this.scrapeWithHtml(task);
  }

  private async scrapeWithBrowser(task: Task) {
    let browser: any;
    try {
      browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });
      const page = await context.newPage();
      
      console.log(`[Twitter Browser] Navigating to: ${task.url}`);
      await page.goto(task.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(5000); // Wait for JS content

      const posts = await page.evaluate(() => {
        const results: any[] = [];
        // X/Twitter uses article tags for tweets
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        
        articles.forEach((el) => {
          const textEl = el.querySelector('div[data-testid="tweetText"]');
          const timeEl = el.querySelector('time');
          const linkEl = el.querySelector('a[href*="/status/"]');
          
          // Media extraction
          const imgEl = el.querySelector('div[data-testid="tweetPhoto"] img');
          const videoEl = el.querySelector('div[data-testid="videoPlayer"] video');
          const videoSource = videoEl ? (videoEl as HTMLVideoElement).src : null;
          
          if (textEl && linkEl) {
            const href = (linkEl as HTMLAnchorElement).href;
            results.push({
              id: href.split('/').pop(),
              text: textEl.textContent || '',
              url: href,
              image: imgEl ? (imgEl as HTMLImageElement).src : undefined,
              video: videoSource || undefined,
              platform: 'twitter',
              date: timeEl ? timeEl.getAttribute('datetime') : new Date().toISOString()
            });
          }
        });
        return results;
      });

      if (posts.length > 0) {
        return {
          items: posts.length,
          message: `Successfully extracted ${posts.length} posts via browser.`,
          data: posts
        };
      }

      console.log("[Twitter Browser] No posts found, falling back to HTML extraction.");
      return this.scrapeWithHtml(task);
    } catch (e: any) {
      console.error(`[Twitter Browser] Error: ${e.message}`);
      return this.scrapeWithHtml(task);
    } finally {
      if (browser) await browser.close();
    }
  }

  private async scrapeWithHtml(task: Task) {
    // 1. Try Meta Tag Extraction First (Fastest)
    try {
      const response = await axios.get(task.url, {
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
        timeout: 5000
      });

      const $ = cheerio.load(response.data);
      if (task.url.includes('/status/')) {
        const description = $('meta[property="og:description"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content');
        const image = $('meta[property="og:image"]').attr('content');
        const video = $('meta[property="og:video"]').attr('content');
        
        if (description) {
          return {
            items: 1,
            message: `Successfully extracted post via Meta tags.`,
            data: [{
              id: task.url.split('/').pop(),
              text: description,
              url: task.url,
              image: image,
              video: video,
              platform: 'twitter',
              accountName: title || 'Twitter User',
              date: new Date().toISOString()
            }]
          };
        }
      }
    } catch (e: any) {
      console.log(`Twitter meta extraction failed: ${e.message}`);
    }

    // 2. Try Nitter Fallback (More reliable for profiles/feeds)
    console.log(`Trying Nitter fallback for: ${task.url}`);
    for (const instance of this.nitterInstances) {
      try {
        let nitterUrl = task.url;
        if (task.url.includes('twitter.com')) nitterUrl = task.url.replace('twitter.com', new URL(instance).hostname);
        else if (task.url.includes('x.com')) nitterUrl = task.url.replace('x.com', new URL(instance).hostname);
        
        const response = await axios.get(nitterUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 8000
        });

        const $ = cheerio.load(response.data);
        const posts: any[] = [];

        $('.timeline-item').each((_, el) => {
          const text = $(el).find('.tweet-content').text().trim();
          const link = $(el).find('.tweet-link').attr('href');
          const id = link ? link.split('/').pop() : null;
          const image = $(el).find('.attachment.image img').attr('src');
          const video = $(el).find('.attachment.video video').attr('src');
          const date = $(el).find('.tweet-date a').attr('title');

          if (text && id) {
            posts.push({
              id,
              text,
              url: `https://twitter.com${link}`,
              image: image ? `${instance}${image}` : undefined,
              video: video ? `${instance}${video}` : undefined,
              platform: 'twitter',
              date: date || new Date().toISOString()
            });
          }
        });

        if (posts.length > 0) {
          return {
            items: posts.length,
            message: `Successfully extracted ${posts.length} posts via Nitter (${instance}).`,
            data: posts
          };
        }
      } catch (e: any) {
        console.log(`Nitter instance ${instance} failed: ${e.message}`);
        continue;
      }
    }

    return { 
      items: 0, 
      message: "Twitter/X content extraction failed. Twitter strictly blocks scraping; please use an API key for reliable results.",
      data: []
    };
  }
}
