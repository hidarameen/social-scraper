import { chromium } from 'playwright';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Task } from "@shared/schema";
import { storage } from "../storage";

import { aiService } from './ai-service';

export class FacebookScraper {
  private storage: any;

  constructor() {
    this.storage = storage;
  }

  async scrape(task: Task) {
    console.log(`[Facebook Scraper] Starting: ${task.url} using ${task.scrapeMethod} method`);
    
    if (task.scrapeMethod !== 'browser') {
      return this.scrapeLegacy(task);
    }

    let browser;
    let context;
    let page;
    try {
      const userCookies = await storage.getCookies(task.userId);
      const fbCookies = userCookies.filter(c => c.platform === 'facebook');

      browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-extensions']
      });
      
      context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 },
        locale: 'ar-EG'
      });

      if (fbCookies.length > 0) {
        const playwrightCookies = fbCookies.flatMap(c => {
          try {
            const rawValue = c.value.replace(/^loc#/, '#').trim();
            if (rawValue.includes('\t') || rawValue.includes('Netscape')) {
              return rawValue.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'))
                .map(line => {
                  const parts = line.split(/\s+/);
                  if (parts.length >= 7) {
                    let domain = parts[0].trim();
                    domain = domain.startsWith('.') ? domain : `.${domain}`;
                    
                    return {
                      name: parts[5].trim(),
                      value: parts[6].trim(),
                      domain: domain,
                      path: parts[2].trim() || '/',
                      secure: parts[3].trim().toUpperCase() === 'TRUE',
                      httpOnly: false,
                      sameSite: 'Lax' as const
                    };
                  }
                  return null;
                }).filter(Boolean);
            }
            return [{
              name: c.name || 'session',
              value: c.value,
              domain: '.facebook.com',
              path: '/',
              secure: true,
              sameSite: 'Lax' as const
            }];
          } catch (e) { return []; }
        }).filter((cookie: any) => cookie && cookie.name && cookie.value && cookie.domain);
        
        if (playwrightCookies.length > 0) {
          await context.addCookies(playwrightCookies as any).catch(() => {});
        }
      }

      page = await context.newPage();
      
      // Navigate and wait
      try {
        await page.goto(task.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);

        // Dynamic AI Selector Extraction
        if (task.aiEnabled) {
          const html = await page.content();
          const dynamicSelectors = await aiService.extractSelectors(html, 'Facebook');
          if (dynamicSelectors) {
            console.log(`[Facebook Scraper] AI suggested selectors: ${dynamicSelectors.join(', ')}`);
          }
        }
      } catch (gotoErr: any) {
        console.error(`[Facebook Scraper] Navigation error: ${gotoErr.message}`);
        return { items: 0, message: `Navigation failed: ${gotoErr.message}` };
      }

      if (page.isClosed()) return { items: 0, message: "Page closed unexpectedly" };

      // Scrolling logic
      let scrolls = 0;
      const maxScrolls = 10; // زيادة عدد مرات التمرير لضمان الوصول للعدد المطلوب
      let postsCount = 0;

      while (scrolls < maxScrolls) {
        if (page.isClosed()) break;
        
        postsCount = await page.evaluate(() => document.querySelectorAll('div[role="article"], div[data-testid="fbfeed_story"]').length);
        
        if (postsCount >= (task.postLimit || 10)) {
          console.log(`[Facebook Scraper] Found ${postsCount} posts, stopping scroll.`);
          break;
        }

        await this.storage.createLog({
          taskId: task.id,
          status: "running",
          message: `[Scroll ${scrolls + 1}] Scanning page... (Found ${postsCount}/${task.postLimit})`,
        }).catch(() => {});

        await page.evaluate(() => window.scrollBy(0, 2000));
        await page.waitForTimeout(3000);
        scrolls++;
      }

      if (page.isClosed()) return { items: 0, message: "Page closed during scrolling" };

      const extractedPosts = await page.evaluate(({ limit, task_url }) => {
        const results: any[] = [];
        const seenTexts = new Set();
        
        const containers = Array.from(document.querySelectorAll('div[role="article"], div[data-testid="fbfeed_story"], div[class*="feed_unit"], div[class*="x1yzt60"]'));

        for (const container of containers) {
          if (results.length >= (limit || 10)) break;

          const textSelectors = [
            '[data-ad-comet-preview="message"]',
            '[data-ad-preview="message"]',
            '.userContent',
            'div[dir="auto"]',
            '[data-testid="post_message"]',
            '.x1iorvi4'
          ];

          let postText = '';
          for (const sel of textSelectors) {
            const el = container.querySelector(sel);
            if (el) {
              postText = el.textContent?.trim() || '';
              if (postText.length > 10) break;
            }
          }

          if (!postText || postText.length < 10 || seenTexts.has(postText)) continue;
          seenTexts.add(postText);

          const link = container.querySelector('a[href*="/posts/"], a[href*="/permalink.php"], a[href*="/reel/"], a[href*="/story.php"], a[href*="/share/"]');
          const postUrl = link ? (link as HTMLAnchorElement).href : task_url;
          
          let postId = '';
          try {
            const urlObj = new URL(postUrl);
            postId = urlObj.pathname + urlObj.search;
          } catch(e) {
            postId = postText.substring(0, 30).replace(/\s+/g, '_');
          }

          results.push({
            text: postText,
            url: postUrl,
            id: postId,
            platform: 'Facebook',
            date: new Date().toLocaleString('ar-EG')
          });
        }
        return results;
      }, { limit: task.postLimit, task_url: task.url });

      const uniquePosts = Array.isArray(extractedPosts) ? extractedPosts : [];

      if (uniquePosts.length > 0) {
        for (const p of uniquePosts) {
          const shortText = p.text.substring(0, 50).replace(/\n/g, ' ') + "...";
          await this.storage.createLog({
            taskId: task.id,
            status: "running",
            message: `[Extraction] Found: "${shortText}"`,
          }).catch(() => {});
        }
      }

      return {
        items: uniquePosts.length,
        message: `Scraped ${uniquePosts.length} posts.`,
        data: uniquePosts
      };

    } catch (error: any) {
      console.error("[Facebook Scraper] Final Error:", error.message);
      return { items: 0, message: `Error: ${error.message}` };
    } finally {
      if (page && !page.isClosed()) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }

  async scrapeLegacy(task: Task) {
    console.log(`[Facebook Scraper] Attempting legacy HTML scrape for: ${task.url}`);
    try {
      const mobileUrl = task.url.includes('facebook.com') ? task.url.replace('www.facebook.com', 'mbasic.facebook.com') : task.url;
      
      const response = await axios.get(mobileUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': 'https://mbasic.facebook.com/',
        },
        timeout: 15000,
        validateStatus: (status) => status < 500
      });

      if (response.status !== 200) {
        throw new Error(`Facebook blocked the request (Status ${response.status}).`);
      }

      const $ = cheerio.load(response.data);
      const posts: any[] = [];
      const seenTexts = new Set();

      $('div[role="article"], table[role="presentation"]').each((_, el) => {
        if (posts.length >= (task.postLimit || 10)) return;

        const container = $(el);
        const postText = container.find('div.msg, div > div > span, div > p').first().text().trim();
        
        if (postText && postText.length > 5 && !seenTexts.has(postText)) {
          seenTexts.add(postText);
          
          let postUrl = task.url;
          const link = container.find('a[href*="/story.php"], a[href*="/posts/"], a[href*="/permalink.php"]').attr('href');
          if (link) {
            const cleanPath = link.split('?')[0];
            postUrl = cleanPath.startsWith('http') ? cleanPath : `https://facebook.com${cleanPath}`;
            postUrl = postUrl.replace('mbasic.facebook.com', 'facebook.com').replace('m.facebook.com', 'facebook.com');
          }
          
          posts.push({
            text: postText,
            url: postUrl,
            platform: 'Facebook',
            date: new Date().toLocaleString('ar-EG')
          });
        }
      });

      return {
        items: posts.length,
        message: `Scraped ${posts.length} posts using HTML method.`,
        data: posts.map(p => ({
          ...p,
          id: p.url.split('/').filter(Boolean).pop()?.split('?')[0] || Math.random().toString(36).substring(7),
          accountName: task.url.split('/').filter(Boolean).pop() || 'User'
        }))
      };
    } catch (error: any) {
      console.error("[Facebook Scraper] Legacy Error:", error.message);
      return { 
        items: 0, 
        message: `HTML Scraping failed: ${error.message}.` 
      };
    }
  }
}
