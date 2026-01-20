import { IStorage } from "../storage";
import { Task } from "@shared/schema";
import { TelegramService } from "./telegram";
import { aiService } from "./ai-service";

export interface IScraper {
  scrape(task: Task): Promise<{ items: number, message: string, data?: any }>;
}

import { FacebookScraper } from "./facebook";
import { TwitterScraper } from "./twitter";
import { InstagramScraper } from "./instagram";
import { YoutubeScraper } from "./youtube";
import { TiktokScraper } from "./tiktok";

export class ScraperManager {
  private storage: IStorage;
  private scrapers: Record<string, IScraper>;
  private telegram: TelegramService;
  private interval: NodeJS.Timeout | null = null;

  constructor(storage: IStorage) {
    this.storage = storage;
    this.telegram = new TelegramService(storage);
    this.scrapers = {
      facebook: new FacebookScraper() as any,
      twitter: new TwitterScraper(),
      instagram: new InstagramScraper(),
      youtube: new YoutubeScraper(),
      tiktok: new TiktokScraper(),
    };
  }

  start() {
    // Check every minute
    this.interval = setInterval(() => this.checkTasks(), 60 * 1000);
    // Cleanup sent posts every hour
    setInterval(() => this.storage.cleanupSentPosts().catch(err => console.error("Cleanup failed:", err)), 60 * 60 * 1000);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }

  async checkTasks() {
    try {
      const tasks = await this.storage.getAllTasks();
      const now = new Date();
      
      for (const task of tasks) {
        if (task.status !== 'active') continue;
        
        const lastRun = task.lastRun ? new Date(task.lastRun) : new Date(0);
        const diffMinutes = (now.getTime() - lastRun.getTime()) / (1000 * 60);
        
        if (diffMinutes >= (task.interval || 60)) {
          console.log(`Running scheduled task: ${task.id} (${task.platform})`);
          try {
            await this.runTask(task);
          } catch (err) {
            console.error(`Scheduled task ${task.id} failed:`, err);
            await this.storage.createLog({
              taskId: task.id,
              status: "error",
              message: `Task execution failed: ${err instanceof Error ? err.message : String(err)}`,
            }).catch(logErr => console.error("Failed to log error:", logErr));
          }
        }
      }
    } catch (e) {
      console.error("Error checking tasks:", e);
    }
  }

  async runTask(task: Task) {
    const scraper = this.scrapers[task.platform];
    if (!scraper) {
      throw new Error(`No scraper found for platform: ${task.platform}`);
    }

    try {
      await this.storage.createLog({
        taskId: task.id,
        status: "running",
        message: "Starting scrape...",
      });

      const result = await scraper.scrape(task);
      
      console.log(`--------------------------------------------------`);
      console.log(`[TASK EXECUTION] ID: ${task.id} | Platform: ${task.platform.toUpperCase()}`);
      console.log(`[STATUS] ${result.message}`);
      
      const allPosts = Array.isArray(result.data) ? result.data : [];
      console.log(`[FOUND] Total posts extracted: ${allPosts.length}`);
      
      if (allPosts.length > 0) {
        console.log(`[PROCESSING] Starting status verification for each post...`);
      }
      console.log(`--------------------------------------------------`);

      // Deduplicate within the current batch first
      const uniqueBatch = [];
      const seenInBatch = new Set();
      let duplicateInBatchCount = 0;

      for (const p of allPosts) {
        // IMPROVED: Use stable ID from scraper, or normalize URL
        let pid = p.id;
        
        if (!pid && p.url) {
          try {
            const urlObj = new URL(p.url);
            // Remove tracking and dynamic params for stable ID
            urlObj.searchParams.delete('__cft__[0]');
            urlObj.searchParams.delete('__tn__');
            urlObj.searchParams.delete('ref');
            urlObj.searchParams.delete('fref');
            pid = urlObj.pathname + urlObj.search;
          } catch (e) {
            pid = p.url;
          }
        }
        
        // Final fallback to text hash for stability
        if (!pid) {
          let hash = 0;
          const cleanText = (p.text || '').trim().toLowerCase().replace(/\s+/g, '');
          for (let i = 0; i < cleanText.length; i++) {
            hash = ((hash << 5) - hash) + cleanText.charCodeAt(i);
            hash |= 0;
          }
          pid = `mgr_${Math.abs(hash)}`;
        }
        
        p.normalizedId = pid;
        if (pid && !seenInBatch.has(pid)) {
          seenInBatch.add(pid);
          uniqueBatch.push(p);
        } else {
          duplicateInBatchCount++;
          try {
            await this.storage.createLog({
              taskId: task.id,
              status: "duplicate",
              message: `Skipped duplicate post in batch: ${pid || 'unknown'}`,
            });
          } catch (e) {
            console.error("Log error (duplicate):", e);
          }
        }
      }

      // Filter against database (sent_posts)
      const newPosts = [];
      let alreadySentCount = 0;
      
      // Get the last sent post ID for this task to stop processing older ones
      const lastPostId = task.lastPostId;

      // Log lastPostId for debugging
      console.log(`[ScraperManager] Task ${task.id} lastPostId from DB: "${lastPostId}"`);

      for (const post of uniqueBatch) {
        // Log the post we are checking
        console.log(`[ScraperManager] Checking post: "${post.normalizedId}"`);

        // If we encountered the last seen post ID, we can stop adding "new" posts
        // because usually posts are ordered by date (newest first)
        // CRITICAL FIX: For Twitter, we should continue checking the batch because scrolling might bring older posts first
        // or the order might be non-linear. Let's just use isPostSent check for each.
        
        const alreadySent = await this.storage.isPostSent(task.id, post.normalizedId);
        if (!alreadySent) {
          console.log(`[ScraperManager] Post ${post.normalizedId} is NEW.`);
          // AI Enhancement if enabled
          if (task.aiEnabled) {
            try {
              const aiResult = await aiService.analyzePost(
                post.text, 
                task.aiProvider as any, 
                task.aiModel || "gpt-4o-mini",
                task.aiPrompt || undefined
              );
              
              if (aiResult) {
                // Only process if it's confirmed as a post
                if (aiResult.isPost === false) {
                  console.log(`[ScraperManager] AI filtered out non-post: ${post.normalizedId}`);
                  try {
                    await this.storage.createLog({
                      taskId: task.id,
                      status: "skipped",
                      message: `AI filtered out non-post content: ${post.normalizedId}`,
                    });
                  } catch (e) {}
                  continue; // Skip this item
                }

                post.text = aiResult.improvedText;
                // Add tags if present
                if (aiResult.tags && aiResult.tags.length > 0) {
                  post.aiTags = aiResult.tags;
                }
              }
            } catch (aiErr) {
              console.error("[ScraperManager] AI analysis failed:", aiErr);
            }
          }

          newPosts.push(post);
          try {
            await this.storage.createLog({
              taskId: task.id,
              status: "found",
              message: `Found new post: ${post.normalizedId}`,
            });
          } catch (e) {
            console.error("Log error (found):", e);
          }
        } else {
          alreadySentCount++;
          try {
            await this.storage.createLog({
              taskId: task.id,
              status: "skipped",
              message: `Post already sent: ${post.normalizedId}`,
            });
          } catch (e) {
            console.error("Log error (skipped):", e);
          }
        }
      }

      await this.storage.createLog({
        taskId: task.id,
        status: "success",
        message: result.message + ` (${newPosts.length} new)`,
        itemsFound: newPosts.length,
      });

      // Update last run and last post ID (ALWAYS update to the most recent extracted ID)
      const updates: any = { lastRun: new Date() };
      if (allPosts.length > 0) {
        // Find the absolute latest ID found in the scrape (the first one extracted)
        const latestId = allPosts[0].normalizedId || allPosts[0].id;
        updates.lastPostId = latestId;
        console.log(`[ScraperManager] Task ${task.id}: Scraped ${allPosts.length} posts, latest ID: ${latestId}`);
      }
      await this.storage.updateTask(task.id, updates);

      // Send to Telegram if new items found
      if (task.target && newPosts.length > 0) {
        console.log(`[ScraperManager] Task ${task.id}: Sending ${newPosts.length} new posts to Telegram target: ${task.target}`);
        // Send in reverse order so newest is last in Telegram
        for (const post of [...newPosts].reverse()) {
          try {
            await this.storage.createLog({
              taskId: task.id,
              status: "running",
              message: `Processing post: ${post.normalizedId}`,
            });

            let notifyMsg = task.messageTemplate || `<b>[ScrapeMaster]</b>\nPlatform: {platform}\nURL: {url}\n\n{text}\n\n<a href="{url}">View Post</a>`;
            
            // Replace placeholders safely
            const safeReplace = (tmpl: string, key: string, val: any) => {
              const cleanVal = (val || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');
              const placeholder = new RegExp(`\\{${key}\\}`, 'g');
              return tmpl.replace(placeholder, key === 'url' ? (val || '') : cleanVal);
            };

            notifyMsg = safeReplace(notifyMsg, 'platform', post.platform || task.platform);
            notifyMsg = safeReplace(notifyMsg, 'text', post.text);
            notifyMsg = safeReplace(notifyMsg, 'account', post.accountName || '');
            notifyMsg = safeReplace(notifyMsg, 'date', post.date || '');
            notifyMsg = safeReplace(notifyMsg, 'url', post.url);

            if (post.aiTags && post.aiTags.length > 0) {
              notifyMsg += `\n\nTags: ${post.aiTags.join(', ')}`;
            }

            const imageToSend = task.includeImages ? post.image : undefined;
            const videoToSend = task.includeVideos ? post.video : undefined;
            
            await this.telegram.sendMessage(task.userId, task.target, notifyMsg, imageToSend, videoToSend);
            
            // Mark as sent in DB
            await this.storage.markPostAsSent(task.id, post.normalizedId);
            
            await this.storage.createLog({
              taskId: task.id,
              status: "sent",
              message: `Successfully sent post to Telegram: ${post.normalizedId}`,
            });

            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (sendErr: any) {
            console.error(`Failed to send post ${post.normalizedId}:`, sendErr.message);
            await this.storage.createLog({
              taskId: task.id,
              status: "error",
              message: `Failed to send post ${post.normalizedId}: ${sendErr.message}`,
            });
          }
        }
      }

    } catch (error: any) {
      await this.storage.createLog({
        taskId: task.id,
        status: "error",
        message: error.message,
      });
      throw error;
    }
  }
}
