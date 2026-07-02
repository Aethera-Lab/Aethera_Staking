import axios from "axios";
import { BaseScraper, type ScraperResult } from "./base.js";
import type { Article } from "../config.js";
import { config } from "../config.js";
import {
  computeRelevanceScore,
  categorizeArticle,
  extractTags,
  detectRegion,
} from "../utils/relevance.js";
import { logger } from "../utils/logger.js";

interface NewsApiArticle {
  title: string;
  url: string;
  source: { name: string };
  description: string;
  content: string;
  publishedAt: string;
}

export class NewsApiScraper extends BaseScraper {
  name = "newsapi";

  async scrape(query: string): Promise<ScraperResult> {
    if (!config.newsApiKey) {
      logger.info("NewsAPI: Skipping — no API key configured");
      return this.createResult([]);
    }

    const articles: Article[] = [];
    const errors: string[] = [];

    const queries = [
      query,
      "tokenization solar energy",
      "real world asset tokenization",
      "carbon credit blockchain",
      "DePIN renewable energy",
    ];

    for (const q of queries) {
      try {
        logger.info(`NewsAPI: Searching "${q}"...`);
        const { data } = await axios.get("https://newsapi.org/v2/everything", {
          params: {
            q,
            sortBy: "publishedAt",
            language: "en",
            pageSize: 20,
            apiKey: config.newsApiKey,
          },
          timeout: 15000,
        });

        for (const item of (data.articles || []) as NewsApiArticle[]) {
          const content = `${item.description || ""} ${item.content || ""}`;

          articles.push({
            title: item.title || "",
            url: item.url || "",
            source: `NewsAPI / ${item.source?.name || "Unknown"}`,
            summary: (item.description || "").slice(0, 500),
            content: content.slice(0, 5000),
            category: categorizeArticle(item.title, content),
            tags: extractTags(item.title, content),
            region: detectRegion(item.title, content),
            publishedAt: item.publishedAt || new Date().toISOString(),
            scrapedAt: new Date().toISOString(),
            relevanceScore: computeRelevanceScore(
              item.title,
              content,
              item.source?.name || ""
            ),
          });
        }

        await this.delay(config.requestDelayMs);
      } catch (err) {
        const msg = `NewsAPI: Search "${q}" failed: ${(err as Error).message}`;
        logger.warn(msg);
        errors.push(msg);
      }
    }

    logger.info(`NewsAPI: Collected ${articles.length} articles`);
    return this.createResult(articles, errors);
  }
}
