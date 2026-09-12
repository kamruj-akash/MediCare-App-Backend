import { createClient } from "redis";
import config from "../config";

if (!config.redis_url) {
  throw new Error("REDIS_URL is not set");
}

export const redisClient = createClient({ url: config.redis_url });

redisClient.on("error", (err) => {
  console.error("Redis client error:", err);
});
