
import { FacebookScraper } from './server/services/facebook.js';
import { storage } from './server/storage.js';

async function test() {
  console.log("Starting Manual Facebook Scrape Test...");
  
  const scraper = new FacebookScraper();
  const mockTask = {
    id: 999,
    userId: 1, // Assuming admin or first user
    url: "https://www.facebook.com/aljazeerachannel",
    platform: "facebook",
    status: "active",
    interval: 60,
    postLimit: 5,
    includeImages: true,
    includeVideos: true,
    scrapeMethod: "browser"
  };

  try {
    const result = await scraper.scrape(mockTask as any);
    console.log("Test Result:", JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Test Failed:", error);
  }
}

test();
