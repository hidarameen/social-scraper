import { IScraper } from "./scraper-manager";
import { Task } from "@shared/schema";
import axios from "axios";
import * as cheerio from "cheerio";
import { chromium } from 'playwright';
import { storage } from "../storage";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

const execAsync = promisify(exec);

export class TwitterScraper implements IScraper {
  private nitterInstances = [
    'https://nitter.net',
    'https://nitter.cz',
    'https://nitter.it',
    'https://nitter.privacydev.net',
    'https://nitter.poast.org',
    'https://nitter.moomoo.me'
  ];

  private async downloadVideo(videoUrl: string): Promise<string | undefined> {
    try {
      const outputDir = path.join(process.cwd(), 'attached_assets', 'downloads');
      await fs.mkdir(outputDir, { recursive: true });
      
      const fileName = `twitter_${Date.now()}.mp4`;
      const outputPath = path.join(outputDir, fileName);
      
      console.log(`[Twitter Video] Downloading: ${videoUrl}`);
      // Use yt-dlp to download the video. We use -f 'bestvideo+bestaudio/best' to get quality
      // and --merge-output-format mp4 to ensure it's a standard format.
      await execAsync(`yt-dlp -f "best" -o "${outputPath}" "${videoUrl}"`);
      
      // Return the public path that can be used by the frontend
      // In Replit, attached_assets is usually served or aliased
      return `/attached_assets/downloads/${fileName}`;
    } catch (error) {
      console.error(`[Twitter Video] Download failed: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }
  }

  async scrape(task: Task) {
    console.log(`Attempting to scrape Twitter: ${task.url} using ${task.scrapeMethod} method`);

    const result = await (task.scrapeMethod === 'browser' 
      ? this.scrapeWithBrowser(task) 
      : this.scrapeWithHtml(task));

    // After scraping, if we found video URLs, try to download them
    if (result && result.data && result.data.length > 0) {
      for (const item of result.data) {
        if (item.video && (item.video.startsWith('http') || item.video.includes('twitter.com') || item.video.includes('x.com'))) {
          const downloadedUrl = await this.downloadVideo(item.url || item.video);
          if (downloadedUrl) {
            item.video = downloadedUrl;
          }
        }
      }
    }
    
    return result;
  }

  private async scrapeWithBrowser(task: Task) {
    let browser: any;
    try {
      const cookiesList = await storage.getCookies(task.userId);
      const twitterCookie = cookiesList.find(c => c.platform === 'twitter');
      
      browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      if (twitterCookie) {
        console.log(`[Twitter Browser] Applying cookies for task ${task.id}`);
        try {
          // Check if it's Netscape format or JSON
          let cookies: any[] = [];
          if (twitterCookie.value.includes('# Netscape HTTP Cookie File')) {
            // Simple Netscape parser
            const lines = twitterCookie.value.split('\n');
            for (const line of lines) {
              if (!line.trim() || line.startsWith('#')) continue;
              const parts = line.split('\t');
              if (parts.length >= 7) {
                cookies.push({
                  name: parts[5],
                  value: parts[6].replace(/\r/g, ''),
                  domain: parts[0],
                  path: parts[2],
                  expires: parseInt(parts[4]),
                  secure: parts[3] === 'TRUE'
                });
              }
            }
          } else {
            const cookieData = JSON.parse(twitterCookie.value);
            cookies = Array.isArray(cookieData) ? cookieData : [cookieData];
          }

          if (cookies.length > 0) {
            await context.addCookies(cookies.map((c: any) => ({
              name: c.name,
              value: c.value,
              domain: c.domain.startsWith('.') ? c.domain : `.${c.domain}`,
              path: c.path || '/',
              expires: c.expires || -1,
              httpOnly: c.httpOnly || false,
              secure: c.secure !== undefined ? c.secure : true,
              sameSite: c.sameSite || 'Lax'
            })));
          }
        } catch (e) {
          console.error(`[Twitter Browser] Failed to parse cookies: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      const page = await context.newPage();
      
      console.log(`[Twitter Browser] Navigating to: ${task.url}`);
      try {
        await page.goto(task.url, { waitUntil: 'commit', timeout: 30000 });
        await page.waitForLoadState('domcontentloaded', { timeout: 30000 });
      } catch (gotoErr) {
        console.warn(`[Twitter Browser] Navigation warning: ${gotoErr instanceof Error ? gotoErr.message : String(gotoErr)}`);
      }
      
      await page.waitForTimeout(5000); // Wait for JS content

      const posts = await page.evaluate(() => {
        const results: any[] = [];
        const articles = document.querySelectorAll('article[data-testid="tweet"]');
        
        articles.forEach((el) => {
          // 1. Exclude Retweets (Social context like "Retweeted by")
          const socialContext = el.querySelector('div[data-testid="socialContext"]');
          if (socialContext) return;

          // 2. Exclude Replies
          // Check for "Replying to" span
          const isReply = Array.from(el.querySelectorAll('div[dir="ltr"] span')).some(s => s.textContent?.includes('Replying to'));
          if (isReply) return;

          const textEl = el.querySelector('div[data-testid="tweetText"]');
          const timeEl = el.querySelector('time');
          const linkEl = el.querySelector('a[href*="/status/"]');
          
          const imgEl = el.querySelector('div[data-testid="tweetPhoto"] img');
          const videoEl = el.querySelector('div[data-testid="videoPlayer"] video, div[data-testid="videoComponent"] video, [data-testid="tweet"] video');
          const videoSource = videoEl ? (videoEl as HTMLVideoElement).src : null;
          
          if (textEl && linkEl) {
            const textContent = textEl.textContent || '';
            // 3. Exclude replies to other accounts (@username)
            if (textContent.trim().startsWith('@')) return;

            const href = (linkEl as HTMLAnchorElement).href;
            if (!href.includes('/status/')) return;
            
            const tweetId = href.split('/status/')[1]?.split('?')[0]; 
            
            results.push({
              id: tweetId,
              text: textContent,
              url: href,
              image: imgEl ? (imgEl as HTMLImageElement).src : undefined,
              video: videoSource || (videoEl ? href : undefined), // If we see a video element but no src, use the tweet URL for yt-dlp
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
