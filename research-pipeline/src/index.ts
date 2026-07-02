import cron from "node-cron";
import { Pipeline } from "./pipeline.js";
import { config } from "./config.js";
import { logger } from "./utils/logger.js";

async function main() {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║   AETHERA RESEARCH PIPELINE                   ║
  ║   Global Tokenization Intelligence Engine      ║
  ╚═══════════════════════════════════════════════╝
  `);

  const pipeline = new Pipeline();

  // Run initial scrape
  logger.info("Running initial scrape...");
  const result = await pipeline.runAll();
  logger.info(
    `Initial scrape complete: ${result.totalFound} found, ${result.totalNew} new`
  );

  // Schedule recurring scrapes
  const cronExpr = `0 */${config.scrapeIntervalHours} * * *`;
  cron.schedule(cronExpr, async () => {
    logger.info("Scheduled scrape starting...");
    try {
      await pipeline.runAll();
    } catch (err) {
      logger.error(`Scheduled scrape failed: ${(err as Error).message}`);
    }
  });

  logger.info(
    `Scheduled scrapes every ${config.scrapeIntervalHours} hours (${cronExpr})`
  );
  logger.info("Pipeline running. Press Ctrl+C to stop.");

  // Import and start the API server alongside
  await import("./api/server.js");
}

main().catch((err) => {
  logger.error(`Fatal: ${err.message}`);
  process.exit(1);
});
