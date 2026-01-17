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
        let targetUrl = task.url;
        // ضمان التوجه لقسم المنشورات دائماً
        if (!targetUrl.includes('/posts') && !targetUrl.includes('permalink') && !targetUrl.includes('/share/')) {
          targetUrl = targetUrl.replace(/\/$/, '') + '/posts';
        }
        
        console.log(`[Facebook Scraper] Navigating to: ${targetUrl}`);
        await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 90000 });
        await page.waitForTimeout(10000); // زيادة وقت الانتظار لضمان تحميل المحتوى الديناميكي

        // محاولة إغلاق النوافذ المنبثقة (مثل تسجيل الدخول)
        try {
          const closeButton = await page.$('[aria-label="Close"], [aria-label="إغلاق"], .x92rt8a');
          if (closeButton) await closeButton.click();
        } catch (e) {}

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
        
        postsCount = await page.evaluate(() => {
          const articles = document.querySelectorAll('div[role="article"], div[data-testid="fbfeed_story"]');
          return Array.from(articles).filter(el => !el.parentElement?.closest('div[role="article"]')).length;
        });
        
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
        
        // 1. تحديد حاويات المنشورات بشكل أكثر دقة - التركيز على المنشورات فقط
        const containers = Array.from(document.querySelectorAll('div[role="article"], div[data-testid="fbfeed_story"]'))
          .filter(el => {
            // استبعاد أي حاوية داخل حاوية أخرى (لتجنب التعليقات أو المنشورات المضمنة)
            const isNested = !!el.parentElement?.closest('div[role="article"]');
            
            // التأكد من أنها ليست قائمة جانبية أو اقتراحات
            const isSidebar = !!el.closest('div[role="complementary"], div[aria-label*="Suggested"], div[aria-label*="مقتراحات"]');
            
            if (isNested || isSidebar) return false;

            // المنشورات الحقيقية عادة ما تكون في الخلاصة الرئيسية
            // إضافة فلاتر إضافية للتأكد من أنها في قسم المنشورات
            const isInMainFeed = !!el.closest('div[role="main"], [data-pagelet="ProfileTimeline"], [data-pagelet="GroupFeed"]');
            
            // التحقق من أن العنصر يحتوي على بصمة منشور
            // تم تحسين الفلترة لتكون أكثر مرونة مع تغيرات فيسبوك المستمرة
            const textContent = el.textContent || '';
            const isSuggested = !!textContent.includes('Suggested for you') || !!textContent.includes('مقترح لك') || !!textContent.includes('Sponsored') || !!textContent.includes('ممول');
            const hasPostMetadata = !!el.querySelector('a[href*="/posts/"], a[href*="/permalink.php"], a[href*="/reel/"], a[href*="/videos/"]');
            
            // استبعاد الفيديوهات التي ليست منشورات أصلية (مثل المقترحات)
            const isExternalVideo = !!el.closest('[aria-label="Reels"]');
            
            return isInMainFeed && hasPostMetadata && !isSuggested && !isExternalVideo && textContent.length > 20;
          });

        for (const container of containers) {
          if (results.length >= (limit || 10)) break;

          // 2. تحسين استخراج النصوص باستخدام مصفوفة واسعة من الـ selectors
          const textSelectors = [
            '[data-ad-comet-preview="message"]',
            '[data-ad-preview="message"]',
            '.userContent',
            'div[dir="auto"]',
            '[data-testid="post_message"]',
            '.x1iorvi4',
            '.x193iq5w',
            '.x1lliihq'
          ];

          let postText = '';
          for (const sel of textSelectors) {
            const elements = container.querySelectorAll(sel);
            for (const el of Array.from(elements)) {
              const text = el.textContent?.trim() || '';
              if (text.length > postText.length) {
                postText = text;
              }
            }
            if (postText.length > 50) break;
          }

          // إذا لم نجد نصاً، نحاول البحث عن أي div يحتوي على نص طويل داخل الحاوية
          if (!postText || postText.length < 10) {
            const allDivs = Array.from(container.querySelectorAll('div[dir="auto"]'));
            for (const d of allDivs) {
              const t = d.textContent?.trim() || '';
              if (t.length > postText.length) postText = t;
            }
          }

          if (!postText || postText.length < 5 || seenTexts.has(postText)) continue;
          seenTexts.add(postText);

          // 3. استخراج الصور والفيديوهات والروابط
          const imgEl = container.querySelector('img[src*="fbcdn.net/v/"], img[src*="external"]');
          const imageUrl = imgEl ? (imgEl as HTMLImageElement).src : undefined;

          const videoLink = container.querySelector('a[href*="/videos/"], a[href*="/watch/"], a[href*="/reel/"]');
          const videoUrl = videoLink ? (videoLink as HTMLAnchorElement).href : undefined;

          // محاولة العثور على رابط المنشور الحقيقي
          const postLinks = [
            'a[href*="/posts/"]',
            'a[href*="/permalink.php"]',
            'a[href*="/reel/"]',
            'a[href*="/story.php"]',
            'a[href*="/groups/"]',
            'span > a[role="link"]'
          ];
          
          // 3. استخراج المعرف الفريد للمنشور بدقة (Post ID)
          // هذا الجزء بالغ الأهمية لمنع التكرار
          let postId = '';
          let finalPostUrl = task_url;

          for (const sel of postLinks) {
            const linkEl = container.querySelector(sel) as HTMLAnchorElement;
            if (linkEl && linkEl.href) {
              const href = linkEl.href;
              finalPostUrl = href;
              
              // محاولة استخراج المعرف الرقمي أو النصي من الرابط
              if (href.includes('/posts/')) {
                const match = href.match(/\/posts\/([a-zA-Z0-9.]+)/);
                if (match) postId = match[1];
              } else if (href.includes('fbid=')) {
                try {
                  const urlParams = new URLSearchParams(new URL(href).search);
                  postId = urlParams.get('fbid') || '';
                } catch(e) {}
              } else if (href.includes('/reel/')) {
                const match = href.match(/\/reel\/(\d+)/);
                if (match) postId = match[1];
              } else if (href.includes('/videos/')) {
                const match = href.match(/\/videos\/(\d+)/);
                if (match) postId = match[1];
              }
              
              if (postId) break;
            }
          }

          // إذا لم يجد معرفاً، نستخدم بصمة ثابتة للنص لمنع التكرار حتى لو تغير الرابط
          if (!postId) {
            let hash = 0;
            const cleanText = postText.trim().toLowerCase().replace(/\s+/g, '');
            for (let i = 0; i < cleanText.length; i++) {
              hash = ((hash << 5) - hash) + cleanText.charCodeAt(i);
              hash |= 0;
            }
            postId = `hsh_${Math.abs(hash)}`;
          }

          results.push({
            text: postText,
            url: finalPostUrl,
            id: postId,
            image: imageUrl,
            video: videoUrl,
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
