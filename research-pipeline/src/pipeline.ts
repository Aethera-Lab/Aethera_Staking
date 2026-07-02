import { RssScraper, WebScraper, NewsApiScraper, GoogleSearchScraper } from "./scrapers/index.js";
import type { BaseScraper } from "./scrapers/index.js";
import { ResearchDB } from "./storage/database.js";
import { TOPICS } from "./config.js";
import { logger } from "./utils/logger.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = path.resolve(__dirname, "../data/runs");

function saveRunJson(label: string, articles: import("./config.js").Article[], meta: object) {
  if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = label.replace(/[^a-z0-9]+/gi, "_").toLowerCase().slice(0, 40);
  const filename = `${ts}__${slug}.json`;
  const filepath = path.join(RUNS_DIR, filename);

  fs.writeFileSync(
    filepath,
    JSON.stringify({ ...meta, articles }, null, 2),
    "utf-8"
  );
  logger.info(`Pipeline: Saved run → data/runs/${filename}`);
  return filename;
}

export class Pipeline {
  private scrapers: BaseScraper[];
  private db: ResearchDB;

  constructor(db?: ResearchDB) {
    this.db = db || new ResearchDB();
    this.scrapers = [
      new RssScraper(),
      new WebScraper(),
      new NewsApiScraper(),
      new GoogleSearchScraper(),
    ];
  }

  async runAll(): Promise<{
    totalFound: number;
    totalNew: number;
    errors: string[];
    savedFile: string;
  }> {
    logger.info("Pipeline: Starting full scrape across all topics...");
    const startedAt = new Date().toISOString();
    let totalFound = 0;
    let totalNew = 0;
    const allErrors: string[] = [];
    const allArticles: import("./config.js").Article[] = [];

    for (const [name, query] of Object.entries(TOPICS)) {
      logger.info(`Pipeline: Topic — ${name}`);
      const result = await this.runQuery(query, { saveJson: false });
      totalFound += result.totalFound;
      totalNew += result.totalNew;
      allErrors.push(...result.errors);
      allArticles.push(...result.articles);
    }

    const completedAt = new Date().toISOString();

    this.db.recordJob({
      startedAt,
      completedAt,
      status: "completed",
      articlesFound: totalFound,
      articlesNew: totalNew,
      errors: allErrors,
      query: "all_topics",
    });

    const savedFile = saveRunJson("all_topics", allArticles, {
      query: "all_topics",
      startedAt,
      completedAt,
      totalFound,
      totalNew,
    });

    logger.info(`Pipeline: Complete — found ${totalFound} articles, ${totalNew} new`);
    return { totalFound, totalNew, errors: allErrors, savedFile };
  }

  async runQuery(
    query: string,
    opts: { saveJson?: boolean } = { saveJson: true }
  ): Promise<{
    totalFound: number;
    totalNew: number;
    errors: string[];
    articles: import("./config.js").Article[];
    savedFile?: string;
  }> {
    logger.info(`Pipeline: Scraping for "${query}"...`);
    const startedAt = new Date().toISOString();
    let totalFound = 0;
    let totalNew = 0;
    const allErrors: string[] = [];
    const allArticles: import("./config.js").Article[] = [];

    for (const scraper of this.scrapers) {
      try {
        const result = await scraper.scrape(query);
        totalFound += result.articles.length;
        allArticles.push(...result.articles);

        if (result.articles.length > 0) {
          const { inserted } = this.db.bulkUpsert(result.articles);
          totalNew += inserted;
        }

        allErrors.push(...result.errors);
      } catch (err) {
        const msg = `Pipeline: ${scraper.name} failed: ${(err as Error).message}`;
        logger.error(msg);
        allErrors.push(msg);
      }
    }

    const completedAt = new Date().toISOString();

    this.db.recordJob({
      startedAt,
      completedAt,
      status: "completed",
      articlesFound: totalFound,
      articlesNew: totalNew,
      errors: allErrors,
      query,
    });

    // Save per-run JSON by default (skip when called from runAll to avoid duplicates)
    let savedFile: string | undefined;
    if (opts.saveJson !== false) {
      savedFile = saveRunJson(query, allArticles, {
        query,
        startedAt,
        completedAt,
        totalFound,
        totalNew,
      });
    }

    return { totalFound, totalNew, errors: allErrors, articles: allArticles, savedFile };
  }

  getDB(): ResearchDB {
    return this.db;
  }

  close() {
    this.db.close();
  }
}
