import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config, CATEGORIES, type Category } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RUNS_DIR = path.resolve(__dirname, "../../data/runs");
import { ResearchDB } from "../storage/database.js";
import { SearchEngine } from "../search/engine.js";
import { Pipeline } from "../pipeline.js";
import { logger } from "../utils/logger.js";

const app = express();
app.use(cors());
app.use(express.json());

const db = new ResearchDB();
const engine = new SearchEngine(db);

// ── Health ──────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "aethera-research-pipeline" });
});

// ── Search ──────────────────────────────────────────────────
app.get("/api/search", (req, res) => {
  const {
    q,
    category,
    region,
    minScore,
    since,
    limit = "50",
    offset = "0",
  } = req.query;

  const result = engine.search({
    text: q as string | undefined,
    category: category as Category | undefined,
    region: region as string | undefined,
    minScore: minScore ? parseInt(minScore as string) : undefined,
    since: since as string | undefined,
    limit: parseInt(limit as string),
    offset: parseInt(offset as string),
  });

  res.json(result);
});

// ── Trending ────────────────────────────────────────────────
app.get("/api/trending", (req, res) => {
  const days = parseInt((req.query.days as string) || "7");
  const limit = parseInt((req.query.limit as string) || "20");
  const articles = engine.trending(days, limit);
  res.json({ articles, total: articles.length });
});

// ── By category ─────────────────────────────────────────────
app.get("/api/categories", (_req, res) => {
  res.json({ categories: CATEGORIES });
});

app.get("/api/category/:category", (req, res) => {
  const { category } = req.params;
  const limit = parseInt((req.query.limit as string) || "30");
  const articles = engine.byCategory(category as Category, limit);
  res.json({ category, articles, total: articles.length });
});

// ── By region ───────────────────────────────────────────────
app.get("/api/region/:region", (req, res) => {
  const { region } = req.params;
  const limit = parseInt((req.query.limit as string) || "30");
  const articles = engine.byRegion(region, limit);
  res.json({ region, articles, total: articles.length });
});

// ── Report ──────────────────────────────────────────────────
app.get("/api/report", (_req, res) => {
  const report = engine.generateReport();
  res.json(report);
});

// ── Stats ───────────────────────────────────────────────────
app.get("/api/stats", (_req, res) => {
  const stats = db.getStats();
  res.json(stats);
});

// ── Trigger scrape ──────────────────────────────────────────
app.post("/api/scrape", async (req, res) => {
  const { query, all } = req.body || {};

  const pipeline = new Pipeline(db);

  try {
    if (all) {
      const result = await pipeline.runAll();
      res.json({ status: "completed", ...result });
    } else {
      const q = query || "solar energy tokenization";
      const result = await pipeline.runQuery(q);
      res.json({ status: "completed", query: q, ...result });
    }
  } catch (err) {
    logger.error(`API scrape error: ${(err as Error).message}`);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── List saved run files ────────────────────────────────────
app.get("/api/runs", (_req, res) => {
  if (!fs.existsSync(RUNS_DIR)) return res.json({ runs: [] });
  const files = fs.readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .map((f) => ({
      filename: f,
      path: `data/runs/${f}`,
      sizeKb: Math.round(fs.statSync(path.join(RUNS_DIR, f)).size / 1024),
    }));
  res.json({ runs: files, total: files.length });
});

// ── Recent scrape jobs ──────────────────────────────────────
app.get("/api/jobs", (_req, res) => {
  const jobs = db.getRecentJobs();
  res.json({ jobs });
});

// ── Start server ────────────────────────────────────────────
app.listen(config.port, () => {
  logger.info(`Research Pipeline API running on port ${config.port}`);
  console.log(`\n🔬 Aethera Research Pipeline API`);
  console.log(`   http://localhost:${config.port}/health`);
  console.log(`   http://localhost:${config.port}/api/search?q=solar+tokenization`);
  console.log(`   http://localhost:${config.port}/api/trending`);
  console.log(`   http://localhost:${config.port}/api/report\n`);
});

export default app;
