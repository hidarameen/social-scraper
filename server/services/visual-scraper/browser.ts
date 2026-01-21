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
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
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
      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      
      const results = await page.evaluate((sel) => {
        const elements = document.querySelectorAll(sel.title);
        return Array.from(elements).map(el => ({
          title: el.textContent?.trim(),
          content: sel.content ? document.querySelector(sel.content)?.textContent?.trim() : "",
          image: sel.image ? (document.querySelector(sel.image) as HTMLImageElement)?.src : "",
          link: sel.link ? (document.querySelector(sel.link) as HTMLAnchorElement)?.href : (el.closest('a')?.href || ""),
          timestamp: new Date().toISOString()
        }));
      }, selectors);

      return results;
    } finally {
      await browser.close();
    }
  }
}
