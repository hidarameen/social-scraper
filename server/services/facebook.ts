import { chromium } from 'playwright';
import { Task } from "@shared/schema";
import { storage } from "../storage";

export class FacebookScraper {
  async scrape(task: Task) {
    console.log(`[Browser Scraper] Attempting to scrape Facebook: ${task.url}`);
    
    let browser;
    try {
      const useBrowser = task.scrapeMethod === 'browser';
      if (!useBrowser) return this.scrapeLegacy(task);

      const userCookies = await storage.getCookies(task.userId);
      const fbCookies = userCookies.filter(c => c.platform === 'facebook');

      browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
      });
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
      });

      if (fbCookies.length > 0) {
        const playwrightCookies = fbCookies.flatMap(c => {
          if (c.value.includes('\t')) {
            return c.value.split('\n')
              .map(line => line.trim())
              .filter(line => line && !line.startsWith('#'))
              .map(line => {
                const parts = line.split(/\s+/);
                if (parts.length >= 7) {
                  return {
                    name: parts[5].trim(),
                    value: parts[6].trim(),
                    domain: parts[0].trim().startsWith('.') ? parts[0].trim() : `.${parts[0].trim()}`,
                    path: parts[2].trim() || '/',
                    expires: parseInt(parts[4].trim()) || -1,
                    httpOnly: false,
                    secure: parts[3].trim().toUpperCase() === 'TRUE'
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
            secure: true
          }];
        }) as any[];
        
        await context.addCookies(playwrightCookies).catch(e => console.error("Cookie Error:", e.message));
      }

      const page = await context.newPage();
      await page.goto(task.url, { waitUntil: 'networkidle', timeout: 60000 });

      try {
        await page.waitForSelector('[role="article"]', { timeout: 15000 });
        
        // Find and click "See More" buttons
        const seeMoreButtons = await page.$$('div[role="button"]:has-text("See more"), div[role="button"]:has-text("عرض المزيد")');
        for (const button of seeMoreButtons) {
          await button.click().catch(() => {});
          await page.waitForTimeout(500);
        }
        
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(2000);
      } catch (e) {}

      const posts = await page.evaluate((limit) => {
        const results: any[] = [];
        const articles = document.querySelectorAll('[role="article"]');
        
        for (let i = 0; i < Math.min(articles.length, limit || 10); i++) {
          const el = articles[i];
          const textSelectors = ['[data-ad-comet-preview="message"]', '[data-ad-preview="message"]', '.userContent', 'div[dir="auto"]'];
          let postText = '';
          
          for (const selector of textSelectors) {
            const textEl = el.querySelector(selector);
            if (textEl) {
              const clone = textEl.cloneNode(true) as HTMLElement;
              clone.querySelectorAll('[role="button"], .see-more').forEach(b => b.remove());
              postText = clone.textContent?.trim() || '';
              if (postText) break;
            }
          }

          const linkEl = Array.from(el.querySelectorAll('a')).find(a => {
            const h = a.getAttribute('href') || '';
            return h.includes('/posts/') || h.includes('/permalink.php') || h.includes('/reel/') || h.includes('/videos/');
          });
          
          const postLink = linkEl ? linkEl.getAttribute('href') : '';
          const imgEl = el.querySelector('img[src^="http"]');
          const postImage = imgEl ? imgEl.getAttribute('src') : '';
          const videoEl = el.querySelector('video');
          const postVideo = videoEl ? (videoEl.getAttribute('src') || '') : '';

          if (postText || postImage || postVideo) {
            results.push({ text: postText, url: postLink || '', image: postImage || '', video: postVideo || '', platform: 'Facebook', date: new Date().toLocaleString('ar-EG') });
          }
        }
        return results;
      }, task.postLimit);

      await browser.close();
      return {
        items: posts.length,
        message: `Scraped ${posts.length} posts.`,
        data: posts.map(p => ({ ...p, id: p.url.split('/').pop() || Math.random().toString(36).substring(7), url: p.url.startsWith('http') ? p.url : `https://facebook.com${p.url}`, accountName: task.url.split('/').pop() || 'User' }))
      };
    } catch (error: any) {
      if (browser) await browser.close();
      return { items: 0, message: `Error: ${error.message}` };
    }
  }

  async scrapeLegacy(task: Task) {
    // Basic fallback implementation
    return { items: 0, message: "Legacy mode not implemented with full browser support." };
  }
}
