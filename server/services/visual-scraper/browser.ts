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
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      
      // Inject base URL to help resolving relative paths in the proxy
      await page.evaluate((baseUrl) => {
        const base = document.createElement('base');
        base.href = baseUrl;
        document.head.prepend(base);
      }, url);

      // Handle cookie consent banners and overlays
      const selectorsToHide = [
        '#onetrust-consent-sdk',
        '.onetrust-pc-dark-filter',
        '[id*="consent"]',
        '[class*="consent"]',
        '[id*="cookie"]',
        '[class*="cookie"]',
        '[id*="modal"]',
        '[class*="modal"]',
        '[id*="overlay"]',
        '[class*="overlay"]'
      ];
      
      await page.evaluate((selectors) => {
        selectors.forEach(sel => {
          const elements = document.querySelectorAll(sel);
          elements.forEach(el => {
            (el as HTMLElement).style.display = 'none';
            (el as HTMLElement).style.pointerEvents = 'none';
          });
        });
        // Reset body overflow if hidden by a modal
        document.body.style.overflow = 'auto';
        document.body.style.position = 'static';
        
        // Fix relative images and links if needed (though <base> tag usually handles this)
        // This is a backup for elements that might not respect <base>
        document.querySelectorAll('img[src^="/"]').forEach(img => {
          const src = img.getAttribute('src');
          if (src) img.setAttribute('src', new URL(src, window.location.href).href);
        });
      }, selectorsToHide);

      // Wait for a bit to let dynamic content load
      await page.waitForTimeout(5000);
      const content = await page.content();
      return content;
    } finally {
      await browser.close();
    }
  }

  async getVisualData(url: string, selectors: { title: string; content?: string; image?: string; link?: string }, userAgent?: string) {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: userAgent || "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await context.newPage();
    
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
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
