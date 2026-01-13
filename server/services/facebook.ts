import { chromium } from 'playwright';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Task } from "@shared/schema";
import { storage } from "../storage";

export class FacebookScraper {
  async scrape(task: Task) {
    console.log(`[Facebook Scraper] Starting: ${task.url} using ${task.scrapeMethod} method`);
    
    let browser;
    try {
      const useBrowser = task.scrapeMethod === 'browser';
      
      if (!useBrowser) {
        return this.scrapeLegacy(task);
      }

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
                    // Playwright strict domain: remove leading dot for compatibility if needed
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
      // Increase timeout and use a more robust wait strategy
      await page.goto(task.url, { waitUntil: 'load', timeout: 90000 });
      
      try {
        // Wait for article or main content with a longer timeout
        await page.waitForSelector('[role="article"]', { timeout: 45000 });
        
        // Comprehensive "See More" expansion
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

        await expand();
        // Single scroll to load a few more and trigger lazy expansion
        await page.evaluate(() => window.scrollBy(0, 1200));
        await page.waitForTimeout(1000);
        await expand(); 
      } catch (error: any) {
        console.log("[Browser Scraper] Content wait warning:", error.message);
      }

      const posts = await page.evaluate((limit) => {
        const results: any[] = [];
        const seenTexts = new Set();
        
        // Find article containers or text blocks, specifically looking for top-level posts
        const containers = Array.from(document.querySelectorAll('[role="article"]')).filter(el => {
          // Filter out elements that are likely comments or within comment sections
          const isComment = el.closest('[role="complementary"]') || 
                           el.closest('[aria-label*="Comment"]') || 
                           el.closest('[aria-label*="تعليق"]') ||
                           el.getAttribute('aria-label')?.includes('Comment') ||
                           el.getAttribute('aria-label')?.includes('تعليق');
          return !isComment;
        });
        
        for (const container of containers) {
          if (results.length >= (limit || 10)) break;

          // Extract text from common Facebook post structures
          const textSelectors = [
            '[data-ad-comet-preview="message"]',
            '[data-ad-preview="message"]',
            '.userContent',
            'div[dir="auto"]',
            '[data-testid="post_message"]'
          ];

          let postText = '';
          for (const sel of textSelectors) {
            const el = container.querySelector(sel);
            if (el) {
              const clone = el.cloneNode(true) as HTMLElement;
              // Remove "See more" text if it survived expansion
              clone.querySelectorAll('[role="button"], .see-more, a[href*="/posts/"]').forEach(b => b.remove());
              const content = clone.textContent?.trim() || '';
              if (content.length > postText.length) postText = content;
            }
          }

          if (!postText || postText.length < 5 || seenTexts.has(postText)) continue;
          seenTexts.add(postText);

          // Find Link
          const link = container.querySelector('a[href*="/posts/"], a[href*="/permalink.php"], a[href*="/reel/"], a[href*="/videos/"]');
          const postUrl = link ? (link as HTMLAnchorElement).href : '';

          // Find Media
          const img = container.querySelector('img[src^="http"]:not([src*="static.xx.fbcdn.net"])');
          const video = container.querySelector('video');

          results.push({
            text: postText,
            url: postUrl,
            image: img ? (img as HTMLImageElement).src : '',
            video: video ? (video as HTMLVideoElement).src : '',
            platform: 'Facebook',
            date: new Date().toLocaleString('ar-EG')
          });
        }
        return results;
      }, task.postLimit);

      if (!browser) throw new Error("Browser closed unexpectedly before completion");

      await browser.close();
      
      return {
        items: posts.length,
        message: `Scraped ${posts.length} posts.`,
        data: posts.map(p => ({
          ...p,
          id: p.url ? p.url.split('/').filter(Boolean).pop()?.split('?')[0] : Math.random().toString(36).substring(7),
          url: p.url || task.url,
          accountName: task.url.split('/').filter(Boolean).pop() || 'User'
        }))
      };

    } catch (error: any) {
      if (browser) await browser.close();
      console.error("[Browser Scraper] Final Error:", error.message);
      return { items: 0, message: `Error: ${error.message}` };
    }
  }

  async scrapeLegacy(task: Task) {
    console.log(`[Facebook Scraper] Attempting legacy HTML scrape for: ${task.url}`);
    try {
      // Use a mobile user agent as it sometimes bypasses some desktop-only protections
      const response = await axios.get(task.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'max-age=0'
        },
        timeout: 15000,
        validateStatus: (status) => status < 500 // Accept 4xx errors to log them better
      });

      if (response.status === 400 || response.status === 403 || response.status === 404) {
        throw new Error(`Facebook blocked the request (Status ${response.status}). Non-browser scraping is highly restricted.`);
      }

      const $ = cheerio.load(response.data);
      const posts: any[] = [];
      const seenTexts = new Set();

      // Legacy Facebook selectors (very unreliable now, but fulfilling the 'html' request)
      $('div[role="article"], .userContentWrapper, ._5pcr').each((_, el) => {
        if (posts.length >= (task.postLimit || 10)) return;

        const container = $(el);
        const postText = container.find('[data-ad-comet-preview="message"], .userContent, [data-testid="post_message"]').text().trim();
        
        if (postText && postText.length > 5 && !seenTexts.has(postText)) {
          seenTexts.add(postText);
          const link = container.find('a[href*="/posts/"], a[href*="/permalink.php"]').attr('href');
          
          posts.push({
            text: postText,
            url: link ? (link.startsWith('http') ? link : `https://facebook.com${link}`) : task.url,
            platform: 'Facebook',
            date: new Date().toLocaleString('ar-EG')
          });
        }
      });

      return {
        items: posts.length,
        message: `Scraped ${posts.length} posts using HTML method. Note: This method is less reliable for Facebook.`,
        data: posts.map(p => ({
          ...p,
          id: Math.random().toString(36).substring(7),
          accountName: task.url.split('/').filter(Boolean).pop() || 'User'
        }))
      };
    } catch (error: any) {
      console.error("[Facebook Scraper] Legacy Error:", error.message);
      return { 
        items: 0, 
        message: `HTML Scraping failed: ${error.message}. Facebook often blocks non-browser requests. Please use 'browser' method.` 
      };
    }
  }
}
