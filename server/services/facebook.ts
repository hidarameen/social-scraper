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
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 800 }
      });

      // Add cookies if available
      if (fbCookies.length > 0) {
        console.log(`[Browser Scraper] Adding ${fbCookies.length} cookies to browser context`);
        const playwrightCookies = fbCookies.flatMap(c => {
          if (c.value.includes('\t')) { // Netscape format
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
                    path: parts[2].trim(),
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
            path: '/'
          }];
        }) as any[];
        
        await context.addCookies(playwrightCookies);
      }

      const page = await context.newPage();
      
      // Navigate to the URL
      console.log(`[Browser Scraper] Navigating to ${task.url}...`);
      await page.goto(task.url, { waitUntil: 'networkidle', timeout: 60000 });

      // Wait for content to load
      try {
        await page.waitForSelector('[role="article"]', { timeout: 10000 });
      } catch (e) {
        console.log("[Browser Scraper] Timeout waiting for articles, might be a different layout or blocked.");
      }

      // Extract posts
      const posts = await page.evaluate((limit) => {
        const results: any[] = [];
        const articles = document.querySelectorAll('[role="article"]');
        
        for (let i = 0; i < Math.min(articles.length, limit || 10); i++) {
          const el = articles[i];
          
          // Basic selectors
          const textEl = el.querySelector('[data-ad-comet-preview="message"], [data-ad-preview="message"], .userContent');
          let postText = textEl ? textEl.textContent?.trim() : '';
          
          if (!postText) {
            const genericText = el.querySelector('div[dir="auto"]');
            postText = genericText ? genericText.textContent?.trim() : '';
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
