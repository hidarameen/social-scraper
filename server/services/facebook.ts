import { chromium } from 'playwright';
import { Task } from "@shared/schema";
import { storage } from "../storage";

export class FacebookScraper {
  async scrape(task: Task) {
    console.log(`[Browser Scraper] Attempting to scrape Facebook: ${task.url}`);
    
    let browser;
    try {
      // 1. Fetch available cookies for this user and platform
      const userCookies = await storage.getCookies(task.userId);
      const fbCookies = userCookies.filter(c => c.platform === 'facebook');

      browser = await chromium.launch({ 
        headless: true,
        args: [
          '--no-sandbox', 
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-dev-shm-usage',
          '--no-zygote'
        ]
      });
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
      });

      // Add cookies if available
      if (fbCookies.length > 0) {
        console.log(`[Browser Scraper] Processing ${fbCookies.length} cookies...`);
        const playwrightCookies = fbCookies.flatMap(c => {
          try {
            if (c.value.includes('\t')) { // Netscape format
              return c.value.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'))
                .map(line => {
                  const parts = line.split(/\s+/);
                  if (parts.length >= 7) {
                    let expires = parseInt(parts[4].trim());
                    if (isNaN(expires) || expires <= 0) expires = -1;
                    
                    let domain = parts[0].trim();
                    if (!domain.startsWith('.') && !/^\d+\.\d+\.\d+\.\d+$/.test(domain)) {
                      domain = '.' + domain.replace(/^\./, '');
                    }

                    return {
                      name: parts[5].trim(),
                      value: parts[6].trim(),
                      domain: domain,
                      path: parts[2].trim() || '/',
                      expires: expires,
                      httpOnly: false,
                      secure: parts[3].trim().toUpperCase() === 'TRUE'
                    };
                  }
                  return null;
                }).filter(Boolean);
            }
            
            // Raw name=value or simple value
            let name = c.name;
            let value = c.value;
            
            if (!name && value.includes('=')) {
              const firstEq = value.indexOf('=');
              name = value.substring(0, firstEq).trim();
              value = value.substring(firstEq + 1).trim();
            }

            if (!name || !value) return [];

            return [{
              name: name,
              value: value,
              domain: '.facebook.com',
              path: '/',
              secure: true
            }];
          } catch (e) {
            console.error(`[Browser Scraper] Error parsing cookie:`, e);
            return [];
          }
        }).filter((cookie: any) => {
          const isValid = cookie && 
                 typeof cookie.name === 'string' && cookie.name.trim().length > 0 &&
                 typeof cookie.value === 'string' && 
                 typeof cookie.domain === 'string' && cookie.domain.trim().length > 0 &&
                 !cookie.domain.startsWith('http');
          
          return isValid;
        }) as any[];
        
        if (playwrightCookies.length > 0) {
          console.log(`[Browser Scraper] Adding ${playwrightCookies.length} valid cookies to context`);
          try {
            await context.addCookies(playwrightCookies);
          } catch (e: any) {
            console.error(`[Browser Scraper] Critical error adding cookies: ${e.message}`);
            // If adding cookies fails, we might still want to try scraping without them or let the user know
          }
        }
      }

      const page = await context.newPage();
      
      // Navigate to the URL
      console.log(`[Browser Scraper] Navigating to ${task.url}...`);
      await page.goto(task.url, { waitUntil: 'networkidle', timeout: 60000 });

      // Wait for content to load
      try {
        await page.waitForSelector('[role="article"]', { timeout: 15000 });
        
        // Handle "See More" expansion
        console.log("[Browser Scraper] Attempting to expand 'See More' buttons...");
        const seeMoreButtons = await page.$$('div[role="button"]:has-text("See more"), div[role="button"]:has-text("عرض المزيد")');
        console.log(`[Browser Scraper] Found ${seeMoreButtons.length} potential buttons.`);
        
        for (const button of seeMoreButtons) {
          try {
            await button.click({ timeout: 2000 });
            await page.waitForTimeout(500); // Small wait for content to expand
          } catch (e) {
            // Ignore individual button failures
          }
        }
        
        // Optional: Scroll a bit to trigger more loading
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(2000);
        
      } catch (e) {
        console.log("[Browser Scraper] Timeout or error during page preparation.");
      }

      // Extract posts
      const posts = await page.evaluate((limit) => {
        const results: any[] = [];
        const articles = document.querySelectorAll('[role="article"]');
        
        for (let i = 0; i < Math.min(articles.length, limit || 10); i++) {
          const el = articles[i];
          
          // Try to find expanded text
          const textSelectors = [
            '[data-ad-comet-preview="message"]',
            '[data-ad-preview="message"]',
            '.userContent',
            'div[dir="auto"]'
          ];
          
          let postText = '';
          for (const selector of textSelectors) {
            const textEl = el.querySelector(selector);
            if (textEl) {
              // Get clean text, ignoring the "See more" button text itself
              const clone = textEl.cloneNode(true) as HTMLElement;
              const buttons = clone.querySelectorAll('[role="button"], .see-more');
              buttons.forEach(b => b.remove());
              postText = clone.textContent?.trim() || '';
              if (postText) break;
            }
          }

          const linkEl = Array.from(el.querySelectorAll('a')).find(a => {
            const href = a.getAttribute('href') || '';
            return href.includes('/posts/') || href.includes('/permalink.php') || href.includes('/reel/') || href.includes('/videos/');
          });
          
          const postLink = linkEl ? linkEl.getAttribute('href') : '';
          const imgEl = el.querySelector('img[src^="http"]');
          const postImage = imgEl ? imgEl.getAttribute('src') : '';
          
          const videoEl = el.querySelector('video');
          const postVideo = videoEl ? (videoEl.getAttribute('src') || '') : '';

          if (postText || postImage || postVideo) {
            results.push({
              text: postText || '',
              url: postLink || '',
              image: postImage || '',
              video: postVideo || '',
              platform: 'Facebook',
              date: new Date().toLocaleString('ar-EG')
            });
          }
        }
        return results;
      }, task.postLimit);

      await browser.close();

      return {
        items: posts.length,
        message: `Scraped ${posts.length} posts from Facebook using Browser.`,
        data: posts.map(p => ({
          ...p,
          id: p.url.split('/').pop() || Math.random().toString(36).substring(7),
          url: p.url.startsWith('http') ? p.url : `https://facebook.com${p.url}`,
          accountName: task.url.split('/').pop() || 'Facebook User'
        }))
      };

    } catch (error: any) {
      if (browser) await browser.close();
      console.error("[Browser Scraper] Error:", error.message);
      return {
        items: 0,
        message: `Browser Scraper Error: ${error.message}`
      };
    }
  }
}
