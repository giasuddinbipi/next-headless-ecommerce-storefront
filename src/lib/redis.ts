import "server-only";

import {
  Redis,
} from "@upstash/redis";

let redisClient:
  Redis | null = null;

export class RedisConfigurationError extends Error {
  constructor(
    message: string,
  ) {
    super(message);

    this.name =
      "RedisConfigurationError";
  }
}

export function getRedisClient():
  Redis {
  if (redisClient) {
    return redisClient;
  }

  const url =
    process.env
      .UPSTASH_REDIS_REST_URL
      ?.trim();

  const token =
    process.env
      .UPSTASH_REDIS_REST_TOKEN
      ?.trim();

  if (!url) {
    throw new RedisConfigurationError(
      "UPSTASH_REDIS_REST_URL is missing.",
    );
  }

  if (!token) {
    throw new RedisConfigurationError(
      "UPSTASH_REDIS_REST_TOKEN is missing.",
    );
  }

  redisClient =
    new Redis({
      url,
      token,
    });

  return redisClient;
}