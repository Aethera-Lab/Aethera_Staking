import type { Article } from "../config.js";

export interface ScraperResult {
  articles: Article[];
  source: string;
  scrapedAt: string;
  errors: string[];
}

export abstract class BaseScraper {
  abstract name: string;

  abstract scrape(query: string): Promise<ScraperResult>;

  protected createResult(articles: Article[], errors: string[] = []): ScraperResult {
    return {
      articles,
      source: this.name,
      scrapedAt: new Date().toISOString(),
      errors,
    };
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
