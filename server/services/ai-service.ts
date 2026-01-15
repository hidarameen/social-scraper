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
}

export class AIService {
  async analyzePost(
    text: string, 
    provider: "openai" | "groq", 
    model: string, 
    customPrompt?: string
  ): Promise<AIAnalysisResult | null> {
    try {
      const client = provider === "openai" ? openai : openrouter;
      // Note: For Groq via OpenRouter, the provider might need to be mapped or model name verified.
      // The user asked for Groq, so we'll use OpenRouter which supports it.
      
      const prompt = customPrompt || `Analyze the following social media post and extract key information. 
      Return JSON format: { "improvedText": "summary", "relevanceScore": 0-100, "tags": ["tag1", "tag2"] }
      Post text: ${text}`;

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
