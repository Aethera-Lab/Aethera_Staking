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

interface GoogleSearchItem {
  title: string;
  link: string;
  snippet: string;
  displayLink: string;
}

export class GoogleSearchScraper extends BaseScraper {
  name = "google-cse";

  async scrape(query: string): Promise<ScraperResult> {
    if (!config.googleApiKey || !config.googleSearchEngineId) {
      logger.info("Google CSE: Skipping — no API key/engine ID configured");
      return this.createResult([]);
    }

    const articles: Article[] = [];
    const errors: string[] = [];

    const queries = [
      `${query} tokenization 2024 2025 2026`,
      "solar energy tokenization blockchain",
      "real world asset tokenization regulation",
    ];

    for (const q of queries) {
      try {
        logger.info(`Google CSE: Searching "${q}"...`);
        const { data } = await axios.get(
          "https://www.googleapis.com/customsearch/v1",
          {
            params: {
              key: config.googleApiKey,
              cx: config.googleSearchEngineId,
              q,
              num: 10,
              dateRestrict: "m3", // last 3 months
            },
            timeout: 15000,
          }
        );

        for (const item of (data.items || []) as GoogleSearchItem[]) {
          articles.push({
            title: item.title || "",
            url: item.link || "",
            source: `Google / ${item.displayLink || "Unknown"}`,
            summary: (item.snippet || "").slice(0, 500),
            content: (item.snippet || "").slice(0, 5000),
            category: categorizeArticle(item.title, item.snippet),
            tags: extractTags(item.title, item.snippet),
            region: detectRegion(item.title, item.snippet),
            publishedAt: new Date().toISOString(),
            scrapedAt: new Date().toISOString(),
            relevanceScore: computeRelevanceScore(
              item.title,
              item.snippet,
              item.displayLink
            ),
          });
        }

        await this.delay(config.requestDelayMs);
      } catch (err) {
        const msg = `Google CSE: Search "${q}" failed: ${(err as Error).message}`;
        logger.warn(msg);
        errors.push(msg);
      }
    }

    logger.info(`Google CSE: Collected ${articles.length} articles`);
    return this.createResult(articles, errors);
  }
}
