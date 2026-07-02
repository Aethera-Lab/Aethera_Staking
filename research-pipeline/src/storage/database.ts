import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { config, type Article } from "../config.js";
import { logger } from "../utils/logger.js";

export class ResearchDB {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || config.dbPath;
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(resolvedPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        url TEXT UNIQUE NOT NULL,
        source TEXT NOT NULL,
        summary TEXT,
        content TEXT,
        category TEXT NOT NULL DEFAULT 'general',
        tags TEXT DEFAULT '[]',
        region TEXT DEFAULT 'Global',
        published_at TEXT NOT NULL,
        scraped_at TEXT NOT NULL,
        relevance_score INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
      CREATE INDEX IF NOT EXISTS idx_articles_region ON articles(region);
      CREATE INDEX IF NOT EXISTS idx_articles_relevance ON articles(relevance_score DESC);
      CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source);

      -- Full-text search index
      CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
        title,
        summary,
        content,
        tags,
        content='articles',
        content_rowid='id',
        tokenize='porter unicode61'
      );

      -- Triggers to keep FTS in sync
      CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
        INSERT INTO articles_fts(rowid, title, summary, content, tags)
        VALUES (new.id, new.title, new.summary, new.content, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
        INSERT INTO articles_fts(articles_fts, rowid, title, summary, content, tags)
        VALUES ('delete', old.id, old.title, old.summary, old.content, old.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
        INSERT INTO articles_fts(articles_fts, rowid, title, summary, content, tags)
        VALUES ('delete', old.id, old.title, old.summary, old.content, old.tags);
        INSERT INTO articles_fts(rowid, title, summary, content, tags)
        VALUES (new.id, new.title, new.summary, new.content, new.tags);
      END;

      -- Scrape job tracking
      CREATE TABLE IF NOT EXISTS scrape_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT DEFAULT 'running',
        articles_found INTEGER DEFAULT 0,
        articles_new INTEGER DEFAULT 0,
        errors TEXT DEFAULT '[]',
        query TEXT
      );
    `);

    logger.info("Database initialized");
  }

  upsertArticle(article: Article): { inserted: boolean } {
    const stmt = this.db.prepare(`
      INSERT INTO articles (title, url, source, summary, content, category, tags, region, published_at, scraped_at, relevance_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET
        relevance_score = MAX(relevance_score, excluded.relevance_score),
        scraped_at = excluded.scraped_at
    `);

    const info = stmt.run(
      article.title,
      article.url,
      article.source,
      article.summary,
      article.content,
      article.category,
      JSON.stringify(article.tags),
      article.region,
      article.publishedAt,
      article.scrapedAt,
      article.relevanceScore
    );

    return { inserted: info.changes > 0 };
  }

  bulkUpsert(articles: Article[]): { total: number; inserted: number } {
    let inserted = 0;
    const tx = this.db.transaction((items: Article[]) => {
      for (const article of items) {
        const result = this.upsertArticle(article);
        if (result.inserted) inserted++;
      }
    });
    tx(articles);
    return { total: articles.length, inserted };
  }

  search(params: {
    query?: string;
    category?: string;
    region?: string;
    minScore?: number;
    since?: string;
    limit?: number;
    offset?: number;
  }): Article[] {
    const { query, category, region, minScore, since, limit = 50, offset = 0 } = params;
    const conditions: string[] = [];
    const bindings: (string | number)[] = [];

    let sql: string;

    if (query) {
      // Use FTS for text queries
      sql = `
        SELECT a.*, rank
        FROM articles a
        JOIN articles_fts fts ON a.id = fts.rowid
        WHERE articles_fts MATCH ?
      `;
      bindings.push(query);
    } else {
      sql = `SELECT a.*, 0 as rank FROM articles a WHERE 1=1`;
    }

    if (category) {
      conditions.push("a.category = ?");
      bindings.push(category);
    }
    if (region) {
      conditions.push("a.region = ?");
      bindings.push(region);
    }
    if (minScore !== undefined) {
      conditions.push("a.relevance_score >= ?");
      bindings.push(minScore);
    }
    if (since) {
      conditions.push("a.published_at >= ?");
      bindings.push(since);
    }

    if (conditions.length) {
      sql += " AND " + conditions.join(" AND ");
    }

    sql += query
      ? " ORDER BY rank, a.relevance_score DESC"
      : " ORDER BY a.relevance_score DESC, a.published_at DESC";

    sql += " LIMIT ? OFFSET ?";
    bindings.push(limit, offset);

    const rows = this.db.prepare(sql).all(...bindings) as (Article & { rank: number })[];

    return rows.map((row) => ({
      ...row,
      tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags,
    }));
  }

  getStats(): {
    totalArticles: number;
    byCategory: Record<string, number>;
    byRegion: Record<string, number>;
    bySource: Record<string, number>;
    recentCount: number;
  } {
    const total = (
      this.db.prepare("SELECT COUNT(*) as count FROM articles").get() as {
        count: number;
      }
    ).count;

    const catRows = this.db
      .prepare("SELECT category, COUNT(*) as count FROM articles GROUP BY category ORDER BY count DESC")
      .all() as { category: string; count: number }[];

    const regionRows = this.db
      .prepare("SELECT region, COUNT(*) as count FROM articles GROUP BY region ORDER BY count DESC")
      .all() as { region: string; count: number }[];

    const sourceRows = this.db
      .prepare("SELECT source, COUNT(*) as count FROM articles GROUP BY source ORDER BY count DESC LIMIT 20")
      .all() as { source: string; count: number }[];

    const recentCount = (
      this.db
        .prepare(
          "SELECT COUNT(*) as count FROM articles WHERE scraped_at >= datetime('now', '-24 hours')"
        )
        .get() as { count: number }
    ).count;

    return {
      totalArticles: total,
      byCategory: Object.fromEntries(catRows.map((r) => [r.category, r.count])),
      byRegion: Object.fromEntries(regionRows.map((r) => [r.region, r.count])),
      bySource: Object.fromEntries(sourceRows.map((r) => [r.source, r.count])),
      recentCount,
    };
  }

  getTopArticles(limit = 20): Article[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM articles ORDER BY relevance_score DESC, published_at DESC LIMIT ?`
      )
      .all(limit) as Article[];
    return rows.map((row) => ({
      ...row,
      tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags,
    }));
  }

  recordJob(job: {
    startedAt: string;
    completedAt?: string;
    status: string;
    articlesFound: number;
    articlesNew: number;
    errors: string[];
    query: string;
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO scrape_jobs (started_at, completed_at, status, articles_found, articles_new, errors, query)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      job.startedAt,
      job.completedAt || null,
      job.status,
      job.articlesFound,
      job.articlesNew,
      JSON.stringify(job.errors),
      job.query
    );
    return info.lastInsertRowid as number;
  }

  getRecentJobs(limit = 10) {
    return this.db
      .prepare(
        "SELECT * FROM scrape_jobs ORDER BY started_at DESC LIMIT ?"
      )
      .all(limit);
  }

  getAllArticles(): Article[] {
    const rows = this.db
      .prepare("SELECT * FROM articles ORDER BY relevance_score DESC, published_at DESC")
      .all() as Article[];
    return rows.map((row) => ({
      ...row,
      tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags,
    }));
  }

  close() {
    this.db.close();
  }
}
