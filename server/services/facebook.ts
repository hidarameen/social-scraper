import { chromium } from 'playwright';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Task } from "@shared/schema";
import { storage } from "../storage";

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
    try {
      const userCookies = await storage.getCookies(task.userId);
      const fbCookies = userCookies.filter(c => c.platform === 'facebook');

      browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-extensions']
      });
      
      const context = await browser.newContext({
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
          await context.addCookies(playwrightCookies as any).catch(err => {
            console.error("[Browser Scraper] Cookie injection failed, continuing without them...");
          });
        }
      }

      const page = await context.newPage();
      await page.goto(task.url, { waitUntil: 'load', timeout: 90000 });
      
      try {
        await page.waitForSelector('[role="article"]', { timeout: 45000 });
        
        const expand = async () => {
          const seeMoreSelectors = [
            'div[role="button"]:has-text("See more")',
            'div[role="button"]:has-text("عرض المزيد")',
            'div[role="button"]:has-text("... See more")',
            '.see_more_link',
            'text="عرض المزيد"',
            'text="See more"'
          ];
          
          for (const sel of seeMoreSelectors) {
            try {
              const elements = await page.$$(sel);
              for (const el of elements) {
                if (await el.isVisible()) {
                  await el.click({ force: true, timeout: 1000 }).catch(() => {});
                  await page.waitForTimeout(300);
                }
              }
            } catch (error) {}
          }
        };

        let currentPosts = 0;
        let scrolls = 0;
        while (currentPosts < (task.postLimit || 10) && scrolls < 5) {
          try {
            await this.storage.createLog({
              taskId: task.id,
              status: "running",
              message: `[Scroll ${scrolls + 1}] Scrolling to find more posts... (Current: ${currentPosts}/${task.postLimit})`,
            });
          } catch (logErr) {}

          await page.evaluate(() => window.scrollBy(0, 2500));
          await page.waitForTimeout(3000);
          await expand();
          
          currentPosts = await page.evaluate(() => {
            return document.querySelectorAll('[role="article"]').length;
          });
          scrolls++;
        }
        
        try {
          await this.storage.createLog({
            taskId: task.id,
            status: "running",
            message: `Finished scanning. Found ${currentPosts} potential post containers. Starting extraction...`,
          });
        } catch (logErr) {}
      } catch (error: any) {
        console.log("[Browser Scraper] Content wait warning:", error.message);
      }

        const extractedPosts = await page.evaluate(({ limit, task_url }) => {
          const results: any[] = [];
          const seenTexts = new Set();
          
          // Debugging within evaluate to see what's happening
          console.log("Starting extraction in browser context...");
          
          const containers = Array.from(document.querySelectorAll('[role="article"]'));
          console.log(`Found ${containers.length} total article roles`);

          const filteredContainers = containers.filter(el => {
            const isComment = el.closest('[role="complementary"]') || 
                             el.closest('[aria-label*="Comment"]') || 
                             el.closest('[aria-label*="تعليق"]') ||
                             el.getAttribute('aria-label')?.includes('Comment') ||
                             el.getAttribute('aria-label')?.includes('تعليق');
            
            // Be more lenient with message detection
            const hasMessage = el.querySelector('[data-ad-comet-preview="message"], [data-ad-preview="message"], .userContent, div[dir="auto"], [data-testid="post_message"], .x1iorvi4');
            
            return !isComment && hasMessage;
          });
          
          console.log(`Filtered down to ${filteredContainers.length} valid post containers`);

          for (const container of filteredContainers) {
            if (results.length >= (limit || 10)) break;

          const textSelectors = [
            '[data-ad-comet-preview="message"]',
            '[data-ad-preview="message"]',
            '.userContent',
            'div[dir="auto"] span',
            '[data-testid="post_message"]',
            '.x1iorvi4',
            '.x1yzt60 .x1n2onr6',
            'div.xdj266r',
            'div[style*="text-align"]'
          ];

          let postText = '';
          for (const sel of textSelectors) {
            const el = container.querySelector(sel);
            if (el) {
              const clone = el.cloneNode(true) as HTMLElement;
              clone.querySelectorAll('[role="button"], .see-more, a[href*="/posts/"], span[aria-label*="like"], span[aria-label*="comment"]').forEach(b => b.remove());
              const content = clone.textContent?.trim() || '';
              if (content.length > 5) {
                postText = content;
                break;
              }
            }
          }

          if (!postText || postText.length < 5 || seenTexts.has(postText)) continue;
          seenTexts.add(postText);

          const link = container.querySelector('a[href*="/posts/"], a[href*="/permalink.php"], a[href*="/reel/"], a[href*="/videos/"], a[href*="/story.php"]');
          let postUrl = link ? (link as HTMLAnchorElement).href : '';
          
          let postId = '';
          if (postUrl) {
            try {
              const urlObj = new URL(postUrl);
              const pathParts = urlObj.pathname.split('/').filter(Boolean);
              
              if (postUrl.includes('/posts/')) {
                postId = pathParts[pathParts.indexOf('posts') + 1];
              } else if (postUrl.includes('/permalink.php')) {
                postId = urlObj.searchParams.get('story_fbid') || urlObj.searchParams.get('id') || '';
              } else if (postUrl.includes('/reel/') || postUrl.includes('/videos/')) {
                postId = pathParts[pathParts.length - 1];
              }
            } catch (e) {}
          }

          if (!postId) {
            postId = postText.substring(0, 100).split('').reduce((a, b) => {
              a = ((a << 5) - a) + b.charCodeAt(0);
              return a & a;
            }, 0).toString(36);
          }

          const imgEl = container.querySelector('img[src^="http"]:not([src*="static.xx.fbcdn.net"])');
          const videoEl = container.querySelector('video');
          let videoUrl = videoEl ? (videoEl as HTMLVideoElement).src : '';
          
          if (!videoUrl) {
            const videoLink = container.querySelector('a[href*="/videos/"], a[href*="/watch/"], a[href*="/reel/"]');
            if (videoLink) {
              videoUrl = (videoLink as HTMLAnchorElement).href;
            }
          }

          results.push({
            text: postText,
            url: postUrl || task_url,
            id: postId,
            image: imgEl ? (imgEl as HTMLImageElement).src : '',
            video: videoUrl,
            platform: 'Facebook',
            date: new Date().toLocaleString('ar-EG')
          });
        }
        return results;
      }, { limit: task.postLimit, task_url: task.url });

      const uniquePosts = [];
      const seenUrls = new Set();
      for (const p of extractedPosts) {
        if (p.url && !seenUrls.has(p.url)) {
          seenUrls.add(p.url);
          uniquePosts.push(p);
        }
      }

      if (uniquePosts.length > 0) {
        for (const p of uniquePosts) {
          try {
            const shortText = p.text.substring(0, 60).replace(/\n/g, ' ') + "...";
            await this.storage.createLog({
              taskId: task.id,
              status: "running",
              message: `[Extraction] Extracted: "${shortText}" (URL: ${p.url})`,
            });
          } catch (e) {}
        }
      }

      return {
        items: uniquePosts.length,
        message: `Scraped ${uniquePosts.length} posts.`,
        data: uniquePosts
      };
    } catch (error: any) {
      console.error("[Browser Scraper] Final Error:", error.message);
      return { items: 0, message: `Error: ${error.message}` };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  async scrapeLegacy(task: Task) {
    console.log(`[Facebook Scraper] Attempting legacy HTML scrape for: ${task.url}`);
    try {
      // Use mbasic.facebook.com as it is the most reliable for raw HTML scraping
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

      // mbasic selectors are distinct (usually tables and simple divs)
      $('div[role="article"], table[role="presentation"]').each((_, el) => {
        if (posts.length >= (task.postLimit || 10)) return;

        const container = $(el);
        
        // Better targeting for mbasic post content
        // mbasic typically puts the post text in a div that isn't nested too deep and isn't part of the header/footer
        const postText = container.find('div.msg, div > div > span, div > p').first().text().trim();
        
        if (postText && postText.length > 5 && !seenTexts.has(postText)) {
          seenTexts.add(postText);
          
          let postUrl = task.url;
          // Look for 'Full Story' or similar links in mbasic
          const link = container.find('a[href*="/story.php"], a[href*="/posts/"], a[href*="/permalink.php"]').attr('href');
          if (link) {
            // Fix: ensure the link is correctly formatted and not just a relative path
            const cleanPath = link.split('?')[0]; // Remove tracking params
            postUrl = cleanPath.startsWith('http') ? cleanPath : `https://facebook.com${cleanPath}`;
            // Convert mobile links back to desktop for better compatibility in Telegram
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
        message: `HTML Scraping failed: ${error.message}. Please use 'browser' method for better results.` 
      };
    }
  }
}
