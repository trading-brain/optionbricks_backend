// queues/redis.connection.js
const IORedis = require("ioredis");

const url = process.env.REDIS_URL;

const connection = url
  ? new IORedis(url, { maxRetriesPerRequest: null })
  : new IORedis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: parseInt(process.env.REDIS_PORT || "6379", 10),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    });

// Throttle reconnect-error spam: ioredis emits `error` on every retry tick.
// Log a given message once, then stay quiet until it changes or we reconnect.
let lastErrorMsg = null;
connection.on("connect", () => {
  console.log("✅ Redis connected");
  lastErrorMsg = null;
});
connection.on("error", (err) => {
  if (err.message !== lastErrorMsg) {
    console.error("❌ Redis error:", err.message, "(suppressing repeats)");
    lastErrorMsg = err.message;
  }
});

module.exports = { connection };
