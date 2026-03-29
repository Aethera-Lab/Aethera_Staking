import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { stakingController } from "./controllers/staking.controllers";

// Load environment variables
dotenv.config();

const app: Application = express();
const PORT = process.env.PORT || 3000;

// ============ Middleware ============

// Security
app.use(helmet());

// CORS
const allowedOrigins: string[] = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, Postman, server-to-server)
      if (!origin) return callback(null, true);

      if (allowedOrigins.length === 0) {
        // No origins configured — open in development, blocked in production
        if (process.env.NODE_ENV === "production") {
          return callback(
            new Error(
              `CORS: no allowed origins configured. Set CORS_ORIGIN env var.`,
            ),
            false,
          );
        }
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error(`CORS: origin "${origin}" is not allowed.`),
        false,
      );
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cache-Control",
      "Pragma",
      "Expires",
    ],
  }),
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging
app.use(morgan("combined"));

// Rate limiting
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
});

// Relaxed limiter for public APIs
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
});

app.use("/api/admin", adminLimiter);
app.use("/api", publicLimiter);
// ============ Routes ============

// Health check
app.get("/health", (req: Request, res: Response) => {
  res.json({
    success: true,
    message: "Aethera Staking API is running",
    timestamp: new Date().toISOString(),
  });
});

// Debug endpoint — exposes config state, NO secrets
app.get("/debug", (req: Request, res: Response) => {
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const vaultAuthority = process.env.VAULT_AUTHORITY_ADDRESS;
  const network = process.env.APTOS_NETWORK;
  const nodeUrl = process.env.APTOS_NODE_URL;
  const corsOrigin = process.env.CORS_ORIGIN;

  // Derive what fullnode URL the SDK will actually use
  const resolvedNodeUrl =
    nodeUrl ||
    (network?.toLowerCase() === "devnet"
      ? "https://api.devnet.aptoslabs.com/v1"
      : network?.toLowerCase() === "testnet"
        ? "https://fullnode.testnet.aptoslabs.com/v1"
        : network?.toLowerCase() === "mainnet"
          ? "https://fullnode.mainnet.aptoslabs.com/v1"
          : "(SDK default — APTOS_NETWORK not set)");

  // Collect ALL env vars that start with APTOS_ so we can see everything Render injects
  const aptosEnvVars: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith("APTOS_")) {
      aptosEnvVars[key] = value ?? "(empty string)";
    }
  }

  res.json({
    env: {
      NODE_ENV: process.env.NODE_ENV || "(not set)",
      APTOS_NETWORK: network || "(not set)",
      APTOS_NODE_URL_set: !!nodeUrl,
      APTOS_NODE_URL_value: nodeUrl || "(not set)",
      resolved_fullnode_url: resolvedNodeUrl,
      CONTRACT_ADDRESS: contractAddress
        ? `${contractAddress.slice(0, 10)}...${contractAddress.slice(-6)}`
        : "(not set — WILL CRASH ON START)",
      VAULT_AUTHORITY_ADDRESS: vaultAuthority
        ? `${vaultAuthority.slice(0, 10)}...${vaultAuthority.slice(-6)}`
        : "(not set — WILL CRASH ON START)",
      CORS_ORIGIN: corsOrigin || "(not set — open in dev, blocked in prod)",
    },
    all_APTOS_env_vars: aptosEnvVars,
  });
});

// Public endpoints
app.get(
  "/api/vault/info",
  stakingController.getVaultInfo.bind(stakingController),
);
app.get(
  "/api/player/:address",
  stakingController.getPlayerInfo.bind(stakingController),
);
app.get("/api/stats", stakingController.getStats.bind(stakingController));
app.get(
  "/api/balance/:address",
  stakingController.getBalance.bind(stakingController),
);
app.post(
  "/api/stake/simulate",
  stakingController.simulateStake.bind(stakingController),
);

// Admin endpoints ( protected with authentication middleware)
app.post(
  "/api/admin/config",
  stakingController.updateConfig.bind(stakingController),
);
app.post(
  "/api/admin/deposit",
  stakingController.deposit.bind(stakingController),
);
app.post(
  "/api/admin/withdraw",
  stakingController.withdraw.bind(stakingController),
);

// ============ Error Handling ============

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("Error:", err);
  res.status(500).json({
    success: false,
    error: err.message || "Internal server error",
  });
});

// ============ Start Server ============

app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║   Aethera Staking API Server         ║
  ╠═══════════════════════════════════════╣
  ║   Environment: ${process.env.NODE_ENV || "development"}
  ║   Port: ${PORT}
  ║   Network: ${process.env.APTOS_NETWORK || "testnet"}
  ╚═══════════════════════════════════════╝
  `);
});
