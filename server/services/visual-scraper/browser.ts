import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// Add stealth plugin to playwright-extra
chromium.use(StealthPlugin());

export class BrowserService {
  private static instance: BrowserService;
  
  private constructor() {}

  public static getInstance(): BrowserService {
    if (!BrowserService.instance) {
      BrowserService.instance = new BrowserService();
    }
    return BrowserService.instance;
  }

  async getPageContent(url: string, userAgent?: string) {
    const browser = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1280,720'
      ]
    });
    const context = await browser.newContext({
      userAgent: userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      hasTouch: false,
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      }
    });
    const page = await context.newPage();
    
    try {
      // Set extra headers and cookies to appear more human
      await context.addCookies([
        {
          name: 'cf_clearance',
          value: 'manual_bypass_placeholder',
          domain: new URL(url).hostname,
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 3600
        }
      ]);

      // Handle navigation and state
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      } catch (gotoErr: any) {
        console.warn(`[Browser] Initial navigation timed out, trying domcontentloaded: ${gotoErr.message}`);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      }
      
      // We will NO LONGER inject a base tag or modify CSP via JS if it's breaking SPA integrity.
      // We will only do absolute URL fixing which is safer.

      // Add script to fix relative URLs without breaking React state
      await page.evaluate(`(function() {
        const fixUrls = function() {
          const origin = window.location.origin;
          document.querySelectorAll('img[src], a[href], link[href]').forEach(el => {
            const attr = el.tagName === 'IMG' ? 'src' : 'href';
            const val = el.getAttribute(attr);
            if (val && !val.startsWith('http') && !val.startsWith('//') && !val.startsWith('data:')) {
              try {
                const absolute = new URL(val, origin).href;
                el.setAttribute(attr, absolute);
              } catch(e) {}
            }
          });
        };
        fixUrls();
        const observer = new MutationObserver(fixUrls);
        observer.observe(document.body, { childList: true, subtree: true });
      })()`);

      // Wait for a bit to let dynamic content (GraphQL/React) settle
      await page.waitForTimeout(8000);
      const content = await page.content();
      return content;
    } finally {
      await browser.close();
    }
  }

  async getVisualData(url: string, selectors: { title: string; content?: string; image?: string; link?: string }, userAgent?: string) {
    const browser = await chromium.launch({ 
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        '--window-size=1280,720'
      ]
    });
    const context = await browser.newContext({
      userAgent: userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      hasTouch: false,
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
      }
    });
    const page = await context.newPage();
    
    try {
      // Set extra headers and cookies to appear more human
      await context.addCookies([
        {
          name: 'cf_clearance',
          value: 'manual_bypass_placeholder',
          domain: new URL(url).hostname,
          path: '/',
          expires: Math.floor(Date.now() / 1000) + 3600
        }
      ]);

      // Use domcontentloaded for faster loading of the main content, 
      // then wait for networkidle for a short burst to get dynamic elements
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        // After DOM is loaded, wait for network to settle for a bit, but with a short timeout
        // to avoid hanging on persistent trackers or heavy ads
        await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {
          console.log('[Browser] Network didn\'t reach idle, continuing with DOM content');
        });
      } catch (gotoErr: any) {
        console.warn(`[Browser] Initial navigation timed out or failed, trying fallback: ${gotoErr.message}`);
        // If it failed, try one more time with very basic settings
        await page.goto(url, { waitUntil: "commit", timeout: 20000 });
      }
      
      // Check for Cloudflare/Security challenges
      const content_lower = (await page.content()).toLowerCase();
      if (content_lower.includes('cloudflare') || content_lower.includes('verify you are human')) {
        console.log('[Browser] Security challenge detected, allowing manual interaction...');
        // Wait longer to let user solve it if we were in a real-time session,
        // but since this is a proxy, we need to ensure the challenge is rendered.
        await page.waitForTimeout(5000);
      }
      await page.waitForTimeout(5000);
      
      const results = await page.evaluate((sel) => {
        const elements = document.querySelectorAll(sel.title);
        return Array.from(elements).map(el => {
          const container = el.parentElement; // Try to find container for better context
          return {
            title: el.textContent?.trim(),
            content: sel.content ? (container?.querySelector(sel.content) || document.querySelector(sel.content))?.textContent?.trim() : "",
            image: sel.image ? (container?.querySelector(sel.image) as HTMLImageElement || document.querySelector(sel.image) as HTMLImageElement)?.src : "",
            link: sel.link ? (container?.querySelector(sel.link) as HTMLAnchorElement || document.querySelector(sel.link) as HTMLAnchorElement)?.href : (el.closest('a')?.href || ""),
            timestamp: new Date().toISOString()
          };
        });
      }, selectors);

      return results;
    } finally {
      await browser.close();
    }
  }
}
