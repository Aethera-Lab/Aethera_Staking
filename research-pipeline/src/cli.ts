import { Command } from "commander";
import chalk from "chalk";
import fs from "fs";
import path from "path";
import Table from "cli-table3";
import { Pipeline } from "./pipeline.js";
import { SearchEngine } from "./search/engine.js";
import { ResearchDB } from "./storage/database.js";
import { TOPICS, CATEGORIES, type Category } from "./config.js";
import { logger } from "./utils/logger.js";

const program = new Command();

program
  .name("aethera-research")
  .description("Aethera Research Pipeline — Global tokenization intelligence")
  .version("1.0.0");

// ── Scrape command ──────────────────────────────────────────
program
  .command("scrape")
  .description("Run scraping pipeline")
  .option("--all", "Scrape all predefined topics")
  .option("-q, --query <query>", "Custom search query")
  .action(async (opts) => {
    const pipeline = new Pipeline();

    try {
      if (opts.all) {
        console.log(chalk.cyan("\n🔍 Running full scrape across all topics...\n"));
        const result = await pipeline.runAll();
        console.log(chalk.green(`\n✅ Done!`));
        console.log(`   Articles found: ${chalk.bold(String(result.totalFound))}`);
        console.log(`   New articles:   ${chalk.bold(String(result.totalNew))}`);
        console.log(`   Saved to:       ${chalk.dim(`data/runs/${result.savedFile}`)}`);
        if (result.errors.length > 0) {
          console.log(chalk.yellow(`   Errors: ${result.errors.length}`));
        }
      } else {
        const query = opts.query || TOPICS.SOLAR_TOKENIZATION;
        console.log(chalk.cyan(`\n🔍 Scraping: "${query}"\n`));
        const result = await pipeline.runQuery(query);
        console.log(chalk.green(`\n✅ Done!`));
        console.log(`   Articles found: ${chalk.bold(String(result.totalFound))}`);
        console.log(`   New articles:   ${chalk.bold(String(result.totalNew))}`);
        console.log(`   Saved to:       ${chalk.dim(`data/runs/${result.savedFile}`)}`);
      }
    } finally {
      pipeline.close();
    }
  });

// ── Search command ──────────────────────────────────────────
program
  .command("search")
  .description("Search scraped articles")
  .argument("[query]", "Search text")
  .option("-c, --category <category>", `Filter by category (${CATEGORIES.join(", ")})`)
  .option("-r, --region <region>", "Filter by region")
  .option("-s, --min-score <score>", "Minimum relevance score", "0")
  .option("-n, --limit <limit>", "Max results", "20")
  .option("--since <date>", "Articles published since (ISO date)")
  .action((query, opts) => {
    const db = new ResearchDB();
    const engine = new SearchEngine(db);

    try {
      const result = engine.search({
        text: query,
        category: opts.category as Category | undefined,
        region: opts.region,
        minScore: parseInt(opts.minScore),
        since: opts.since,
        limit: parseInt(opts.limit),
      });

      if (result.articles.length === 0) {
        console.log(chalk.yellow("\nNo articles found. Try running 'scrape' first.\n"));
        return;
      }

      console.log(
        chalk.cyan(`\n📊 Found ${result.total} articles\n`)
      );

      const table = new Table({
        head: ["#", "Score", "Title", "Source", "Category", "Region", "Date"],
        colWidths: [4, 7, 45, 20, 12, 14, 12],
        wordWrap: true,
      });

      result.articles.forEach((a, i) => {
        table.push([
          i + 1,
          a.relevanceScore,
          a.title.slice(0, 80),
          a.source.slice(0, 18),
          a.category,
          a.region,
          new Date(a.publishedAt).toLocaleDateString(),
        ]);
      });

      console.log(table.toString());
      console.log(chalk.dim(`\nUse --limit to see more results. URLs available via the API.\n`));
    } finally {
      db.close();
    }
  });

// ── Report command ──────────────────────────────────────────
program
  .command("report")
  .description("Generate a trend report")
  .action(() => {
    const db = new ResearchDB();
    const engine = new SearchEngine(db);

    try {
      const report = engine.generateReport();

      console.log(chalk.cyan("\n═══ AETHERA RESEARCH REPORT ═══\n"));
      console.log(`Total articles:  ${chalk.bold(String(report.totalArticles))}`);
      console.log(`Last 24 hours:   ${chalk.bold(String(report.recentArticles))}`);
      console.log(`Generated:       ${new Date(report.generatedAt).toLocaleString()}\n`);

      // Category breakdown
      console.log(chalk.cyan("── By Category ──"));
      for (const [cat, count] of Object.entries(report.categoryBreakdown)) {
        const bar = "█".repeat(Math.min(count, 40));
        console.log(`  ${cat.padEnd(14)} ${String(count).padStart(5)}  ${chalk.green(bar)}`);
      }

      // Region breakdown
      console.log(chalk.cyan("\n── By Region ──"));
      for (const [region, count] of Object.entries(report.regionBreakdown)) {
        const bar = "█".repeat(Math.min(count, 40));
        console.log(`  ${region.padEnd(16)} ${String(count).padStart(5)}  ${chalk.blue(bar)}`);
      }

      // Top sources
      console.log(chalk.cyan("\n── Top Sources ──"));
      for (const [source, count] of Object.entries(report.topSources).slice(0, 10)) {
        console.log(`  ${source.padEnd(30)} ${count}`);
      }

      // Top articles
      if (report.topArticles.length > 0) {
        console.log(chalk.cyan("\n── Top Articles ──"));
        report.topArticles.slice(0, 10).forEach((a, i) => {
          console.log(
            `  ${chalk.bold(`${i + 1}.`)} [${a.relevanceScore}] ${a.title.slice(0, 70)}`
          );
          console.log(chalk.dim(`     ${a.url}`));
          console.log(chalk.dim(`     ${a.source} | ${a.category} | ${a.region}\n`));
        });
      }
    } finally {
      db.close();
    }
  });

// ── Export command ──────────────────────────────────────────
program
  .command("export")
  .description("Export all scraped data to JSON")
  .option("-o, --output <path>", "Output file path", "./data/articles.json")
  .option("--pretty", "Pretty-print JSON", true)
  .action((opts) => {
    const db = new ResearchDB();

    try {
      const articles = db.getAllArticles();
      const stats = db.getStats();

      const exportData = {
        exportedAt: new Date().toISOString(),
        stats,
        totalArticles: articles.length,
        articles,
      };

      const outputPath = path.resolve(opts.output);
      const json = opts.pretty
        ? JSON.stringify(exportData, null, 2)
        : JSON.stringify(exportData);

      fs.writeFileSync(outputPath, json, "utf-8");

      console.log(chalk.green(`\n✅ Exported ${articles.length} articles to:`));
      console.log(`   ${outputPath}\n`);
    } finally {
      db.close();
    }
  });

// ── Topics command ──────────────────────────────────────────
program
  .command("topics")
  .description("List all tracked topics")
  .action(() => {
    console.log(chalk.cyan("\n── Tracked Topics ──\n"));
    for (const [key, value] of Object.entries(TOPICS)) {
      console.log(`  ${chalk.bold(key.padEnd(25))} "${value}"`);
    }
    console.log("");
  });

program.parse();
