import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const openrouter = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENROUTER_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENROUTER_BASE_URL,
});

export interface AIAnalysisResult {
  improvedText: string;
  relevanceScore: number;
  tags: string[];
  isPost?: boolean;
}

export class AIService {
  async extractSelectors(html: string, platform: string): Promise<string[] | null> {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ 
          role: "user", 
          content: `Given the HTML of a ${platform} page, identify CSS selectors for post containers and post text. 
          Return the result strictly in JSON format.
          Format: { "containerSelectors": [".class1", "div[role='article']"], "textSelectors": [".textClass"] }
          HTML snippet: ${html.substring(0, 10000)}` 
        }],
        response_format: { type: "json_object" }
      });
      const content = response.choices[0].message.content;
      if (!content) return null;
      const data = JSON.parse(content);
      return [...(data.containerSelectors || []), ...(data.textSelectors || [])];
    } catch (error) {
      console.error("[AIService] Error extracting selectors:", error);
      return null;
    }
  }

  async analyzePost(
    text: string, 
    provider: "openai" | "groq", 
    model: string, 
    customPrompt?: string
  ): Promise<AIAnalysisResult | null> {
    try {
      const client = provider === "openai" ? openai : openrouter;
      
      let prompt = customPrompt || `Analyze the following content from a social media page. 
      Determine if it is an actual post (not a comment, ad, or sidebar element).
      Maintain the original language and tone of the text. Do not translate. 
      If you are not asked to summarize or rewrite, keep 'improvedText' exactly the same as the original content.
      You must return the response in JSON format.
      Expected JSON format: { "improvedText": "original or improved text", "relevanceScore": 0-100, "tags": ["tag1"], "isPost": true/false }`;

      // Always ensure the word "json" is in the prompt to satisfy OpenAI's requirements
      if (!prompt.toLowerCase().includes("json")) {
        prompt += "\n\nResponse must be in JSON format.";
      }

      prompt += `\n\nContent: ${text}`;

      const response = await client.chat.completions.create({
        model: model,
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
      });

      const content = response.choices[0].message.content;
      if (!content) return null;
      
      return JSON.parse(content) as AIAnalysisResult;
    } catch (error) {
      console.error("[AIService] Error analyzing post:", error);
      return null;
    }
  }
}

export const aiService = new AIService();
