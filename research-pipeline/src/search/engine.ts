import { ResearchDB } from "../storage/database.js";
import type { Article, Category } from "../config.js";
import { CATEGORIES } from "../config.js";
import { logger } from "../utils/logger.js";

export interface SearchQuery {
  text?: string;
  category?: Category;
  region?: string;
  minScore?: number;
  since?: string;
  limit?: number;
  offset?: number;
  sortBy?: "relevance" | "date" | "score";
}

export interface SearchResult {
  articles: Article[];
  total: number;
  query: SearchQuery;
  executedAt: string;
}

export interface TrendReport {
  topArticles: Article[];
  categoryBreakdown: Record<string, number>;
  regionBreakdown: Record<string, number>;
  topSources: Record<string, number>;
  totalArticles: number;
  recentArticles: number;
  generatedAt: string;
}

export class SearchEngine {
  constructor(private db: ResearchDB) {}

  search(query: SearchQuery): SearchResult {
    logger.info(
      `Search: query="${query.text || "*"}" category=${query.category || "all"} region=${query.region || "all"}`
    );

    const articles = this.db.search({
      query: query.text,
      category: query.category,
      region: query.region,
      minScore: query.minScore,
      since: query.since,
      limit: query.limit || 50,
      offset: query.offset || 0,
    });

    return {
      articles,
      total: articles.length,
      query,
      executedAt: new Date().toISOString(),
    };
  }

  trending(days = 7, limit = 20): Article[] {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const results = this.db.search({
      since,
      minScore: 10,
      limit,
    });
    return results;
  }

  byCategory(category: Category, limit = 30): Article[] {
    return this.db.search({ category, limit });
  }

  byRegion(region: string, limit = 30): Article[] {
    return this.db.search({ region, limit });
  }

  generateReport(): TrendReport {
    const stats = this.db.getStats();
    const topArticles = this.db.getTopArticles(20);

    return {
      topArticles,
      categoryBreakdown: stats.byCategory,
      regionBreakdown: stats.byRegion,
      topSources: stats.bySource,
      totalArticles: stats.totalArticles,
      recentArticles: stats.recentCount,
      generatedAt: new Date().toISOString(),
    };
  }

  getCategories(): readonly string[] {
    return CATEGORIES;
  }
}
