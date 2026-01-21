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
        
        // Disable CSP if possible to allow cross-origin scripts/styles
        const meta = document.createElement('meta');
        meta.httpEquiv = "Content-Security-Policy";
        meta.content = "default-src * 'unsafe-inline' 'unsafe-eval'; script-src * 'unsafe-inline' 'unsafe-eval'; connect-src * 'unsafe-inline'; img-src * data: blob: 'unsafe-inline'; style-src * 'unsafe-inline';";
        document.head.appendChild(meta);
      }, url);

      // Add script to prevent navigation loops and handle errors
      await page.addInitScript(() => {
        window.addEventListener('error', (e) => {
          if (e.message.includes('reCAPTCHA') || e.message.includes('cloudflare')) {
            console.warn('Security challenge detected:', e.message);
          }
        });
      });

      // Handle cookie consent banners and overlays
      // We will hide them by default for a clean view, but we'll also try to auto-accept
      // to avoid persistent blocking elements
      await page.evaluate(`(function() {
        const acceptButtons = [
          'accept', 'agree', 'allow', 'consent', 'السماح', 'موافق', 'قبول',
          'accept all', 'allow all', 'السماح للكل', 'accept cookies', 'yes', 'i agree'
        ];
        
        const findAndClick = function() {
          const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"], span'));
          let clicked = false;
          for (let i = 0; i < buttons.length; i++) {
            const btn = buttons[i];
            const text = btn.textContent ? btn.textContent.toLowerCase().trim() : "";
            if (text && acceptButtons.some(function(b) { return text === b || text.indexOf(b) !== -1; })) {
              try {
                btn.click();
                clicked = true;
              } catch(e) {}
            }
          }
          return clicked;
        };

        // Try multiple times as some banners load late
        findAndClick();
        setTimeout(findAndClick, 2000);
        setTimeout(findAndClick, 5000);
      })()`);

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
        '[class*="overlay"]',
        '.tp-modal',
        '.tp-backdrop',
        '#sp_message_container',
        '.qc-cmp2-container',
        '.fc-consent-root',
        '.aad-banner',
        '.reCAPTCHA',
        'iframe[src*="recaptcha"]',
        '.grecaptcha-badge'
      ];
      
      await page.evaluate(`(function(selectors) {
        const hide = function() {
          selectors.forEach(function(sel) {
            const elements = document.querySelectorAll(sel);
            elements.forEach(function(el) {
              el.style.setProperty('display', 'none', 'important');
              el.style.setProperty('visibility', 'hidden', 'important');
              el.style.setProperty('pointer-events', 'none', 'important');
              el.style.setProperty('opacity', '0', 'important');
              el.style.setProperty('z-index', '-1', 'important');
            });
          });
          // Reset body/html overflow if hidden by a modal
          [document.body, document.documentElement].forEach(el => {
            if (el) {
              el.style.setProperty('overflow', 'auto', 'important');
              el.style.setProperty('position', 'static', 'important');
              el.style.setProperty('height', 'auto', 'important');
            }
          });
        };
        
        hide();
        // Periodically check for reappearing overlays
        setInterval(hide, 1000);
        
        // Fix relative images and links to use absolute URLs
        const fixUrls = function() {
          const origin = window.location.origin;
          const currentPath = window.location.pathname;
          
          document.querySelectorAll('img[src], a[href], link[href], script[src]').forEach(el => {
            const attr = (el.tagName === 'IMG' || el.tagName === 'SCRIPT') ? 'src' : 'href';
            const val = el.getAttribute(attr);
            if (val && !val.startsWith('http') && !val.startsWith('//') && !val.startsWith('data:') && !val.startsWith('mailto:') && !val.startsWith('tel:') && !val.startsWith('#')) {
              try {
                if (val.startsWith('/')) {
                  el.setAttribute(attr, origin + val);
                } else {
                  const dir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
                  el.setAttribute(attr, origin + dir + val);
                }
              } catch(e) {}
            }
          });
          
          // Fix background images
          document.querySelectorAll('[style*="url("]').forEach(el => {
            const style = el.getAttribute('style');
            if (style && style.includes('url(/')) {
              el.setAttribute('style', style.replace(/url\\((\\/)/g, 'url(' + origin + '$1'));
            }
          });
        };
        fixUrls();
        // MutationObserver to fix lazy-loaded content
        const observer = new MutationObserver(fixUrls);
        observer.observe(document.body, { childList: true, subtree: true });
      })(${JSON.stringify(selectorsToHide)})`);

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
