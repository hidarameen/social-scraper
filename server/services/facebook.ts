import { IScraper } from "./scraper-manager";
import { Task } from "@shared/schema";
import axios from "axios";
import * as cheerio from "cheerio";
import { storage } from "../storage";

export class FacebookScraper implements IScraper {
  async scrape(task: Task) {
    console.log(`Attempting to scrape Facebook: ${task.url}`);
    
    try {
      // 1. Fetch available cookies for this user and platform
      const userCookies = await storage.getCookies(task.userId);
      const fbCookies = userCookies
        .filter(c => c.platform === 'facebook')
        .map(c => {
          // If it's a Netscape cookie file format, parse it
          // Standard Netscape starts with # Netscape, but some exporters add prefixes
          if (c.value.includes('\t') || c.value.toLowerCase().includes('netscape')) {
            return c.value
              .split('\n')
              .map(line => line.trim())
              .filter(line => line && !line.startsWith('#'))
              .map(line => {
                const parts = line.split(/\s+/);
                // Netscape format: domain, flag, path, secure, expiration, name, value
                if (parts.length >= 7) {
                  const name = parts[5].trim();
                  const value = parts[6].trim();
                  return `${name}=${value}`;
                }
                return '';
              })
              .filter(Boolean)
              .join('; ');
          }
          // Handle name=value or JSON/raw string
          // Remove any non-ASCII or control characters that might break headers
          const cleanValue = c.value.replace(/[\r\n\t]/g, ' ').replace(/[^\x20-\x7E]/g, '').trim();
          return cleanValue.includes('=') ? cleanValue : `${c.name}=${cleanValue}`;
        })
        .filter(Boolean)
        .join('; ');

      // 2. Fetch available proxies
      const userProxies = await storage.getProxies(task.userId);
      const proxyUrl = userProxies.length > 0 ? userProxies[0].url : undefined;

      // 3. Configure headers to mimic a real modern desktop browser
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Connection': 'keep-alive',
      };

      if (fbCookies) {
        headers['Cookie'] = fbCookies;
        console.log("Using provided cookies for Facebook scraping.");
      }

      // 4. Perform request
      console.log(`Requesting URL: ${task.url} with headers...`);
      const response = await axios.get(task.url, {
        headers,
        timeout: 15000,
        validateStatus: (status) => status < 500, // Handle 400s manually for better error info
      });

      if (response.status >= 400) {
        throw new Error(`Facebook returned status ${response.status}. This usually means your request was flagged as a bot. Use fresh Cookies or a Proxy.`);
      }

      const $ = cheerio.load(response.data);
      const posts: { text: string, url: string }[] = [];
      
      $('[role="article"]').each((i, el) => {
        if (i >= (task.postLimit || 10)) return;
        
        // Try multiple selectors for post content
        const postTextEl = $(el).find('[data-ad-comet-preview="message"], [data-ad-preview="message"], .userContent').first();
        let postText = postTextEl.text().trim();
        
        // If not found, try a more generic but restricted search to avoid capturing everything
        if (!postText) {
          postText = $(el).find('div[dir="auto"]').first().text().trim();
        }

        const postLink = $(el).find('a[href*="/posts/"], a[href*="/permalink.php"], a[href*="/groups/"]').first().attr('href');
        let postId = '';
        if (postLink) {
          const match = postLink.match(/(?:posts\/|permalink\.php\?story_fbid=)(\d+)/) || postLink.match(/\/(\d+)\/?$/);
          postId = match ? match[1] : postLink;
        }

        // Try to find a high-quality image in the post
        const postImage = $(el).find('img').filter((_, img) => {
          const src = $(img).attr('src');
          const width = parseInt($(img).attr('width') || '0');
          // Filter out small icons, emojis, and tracking pixels
          return !!(src && src.startsWith('http') && !src.includes('static.xx.fbcdn.net') && (width > 100 || !width));
        }).first().attr('src');
        
        // Try to find a video in the post - improved selectors including Reels
        let postVideo = $(el).find('video').first().attr('src') || 
                          $(el).find('video source').first().attr('src') ||
                          $(el).find('[data-video-url]').first().attr('data-video-url');

        // Fallback to link-based video discovery if direct src is not found or is a blob
        if (!postVideo || postVideo.startsWith('blob:')) {
          // Look for specific video/reel links within the post container only
          const videoLink = $(el).find('a').filter((_, link) => {
            const href = $(link).attr('href') || '';
            // Must be a link to a video, reel, or watch, and NOT a general profile link
            return (href.includes('/videos/') || href.includes('/watch/') || href.includes('/reel/')) && 
                   !href.includes('/groups/') && !href.includes('/events/');
          }).first().attr('href');

          if (videoLink) {
            postVideo = videoLink.startsWith('http') ? videoLink : `https://www.facebook.com${videoLink.startsWith('/') ? '' : '/'}${videoLink}`;
          }
        }
        
        if (postText || postImage || postVideo) {
          // Clean up text: remove "See more" etc if present at the end
          postText = postText.replace(/See more$/i, '').trim();
          
          if (postText || postImage || postVideo) {
            console.log(`Facebook Scraper: Found content. Text: ${!!postText}, Image: ${!!postImage}, Video URL: ${postVideo}`);
            
            posts.push({
              id: postId || (postVideo ? postVideo.split('/').pop() : ''),
              text: postText.substring(0, 1000) + (postText.length > 1000 ? '...' : ''),
              url: postLink ? (postLink.startsWith('http') ? postLink : `https://facebook.com${postLink}`) : (postVideo || task.url),
              image: postImage,
              video: postVideo,
              accountName: task.url.split('/').pop() || 'Facebook User',
              platform: 'Facebook',
              date: new Date().toLocaleString('ar-EG')
            });
          }
        }
      });

      const postCount = posts.length;

      if (postCount === 0 && !fbCookies) {
        throw new Error("No posts found. You likely need cookies to view this profile.");
      }

      return { 
        items: postCount, 
        message: `Scraped ${postCount} posts from Facebook. ${fbCookies ? '(Using Cookies)' : '(Public View)'}`,
        data: posts
      };
    } catch (error: any) {
      console.error("Facebook scraping error:", error.message);
      
      let hint = "Try adding session cookies in the Cookies page to bypass blocks.";
      if (error.response?.status === 400) hint = "Facebook returned a 400 error. This usually means the URL is invalid or the bot detection is high. Check your URL or use cookies.";
      
      return { 
        items: 0, 
        message: `Facebook Blocked: ${error.message}. ${hint}` 
      };
    }
  }
}
