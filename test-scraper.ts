import { BrowserService } from "./server/services/visual-scraper/browser";

async function test() {
  const browserService = BrowserService.getInstance();
  const url = "https://www.aljazeera.net";
  console.log("Testing aljazeera.net...");
  
  try {
    // Try to get content first
    const content = await browserService.getPageContent(url);
    console.log("Content length:", content.length);
    
    // Try to extract some data with common selectors
    const selectors = {
      title: "h3", // Common for news titles
      content: "p",
      image: "img",
      link: "a"
    };
    
    const results = await browserService.getVisualData(url, selectors);
    console.log("Results found:", results.length);
    if (results.length > 0) {
      console.log("First result:", results[0]);
    }
  } catch (e) {
    console.error("Test failed:", e);
  }
}

test();
