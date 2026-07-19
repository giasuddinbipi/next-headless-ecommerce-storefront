import "server-only";

import {
  createHmac,
} from "node:crypto";

import {
  Ratelimit,
} from "@upstash/ratelimit";

import {
  getRedisClient,
} from "@/lib/redis";

/* =========================================================
   Public types
========================================================= */

export type CspReportRateLimitResult =
  Readonly<{
    allowed:
      boolean;

    degraded:
      boolean;

    limit:
      number;

    remaining:
      number;

    reset:
      number;

    retryAfterSeconds:
      number;
  }>;

export type CspReportDuplicateResult =
  Readonly<{
    duplicate:
      boolean;

    degraded:
      boolean;

    reason:
      | "first_seen"
      | "duplicate"
      | "protection_degraded"
      | "invalid_fingerprint";
  }>;

/* =========================================================
   Constants
========================================================= */

const RATE_LIMIT_PREFIX =
  "storefront:ratelimit:v1:csp-report:ip";

const DUPLICATE_KEY_PREFIX =
  "storefront:csp-report-dedupe:v1";

const RATE_LIMIT_MAX_REQUESTS =
  60;

const RATE_LIMIT_WINDOW =
  "1 m";

const RATE_LIMIT_TIMEOUT_MS =
  1_500;

const DUPLICATE_TTL_SECONDS =
  10 * 60;

const CSP_FINGERPRINT_PATTERN =
  /^[a-f0-9]{24}$/;

/* =========================================================
   Singleton rate limiter
========================================================= */

let cspReportRateLimiter:
  Ratelimit | null =
  null;

function getCspReportRateLimiter():
  Ratelimit {
  if (
    cspReportRateLimiter
  ) {
    return cspReportRateLimiter;
  }

  cspReportRateLimiter =
    new Ratelimit({
      redis:
        getRedisClient(),

      limiter:
        Ratelimit.slidingWindow(
          RATE_LIMIT_MAX_REQUESTS,
          RATE_LIMIT_WINDOW,
        ),

      analytics:
        false,

      prefix:
        RATE_LIMIT_PREFIX,

      timeout:
        RATE_LIMIT_TIMEOUT_MS,
    });

  return cspReportRateLimiter;
}

/* =========================================================
   Environment helpers
========================================================= */

function readFirstNonEmptyEnvironmentValue(
  names:
    string[],
): string | null {
  for (
    const name of names
  ) {
    const value =
      process.env[
        name
      ]?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

function getProtectionHashSecret():
  string | null {
  return readFirstNonEmptyEnvironmentValue([
    "CSP_REPORT_HASH_SECRET",
    "AUDIT_LOG_HASH_SECRET",
    "AUTH_SECRET",
    "NEXTAUTH_SECRET",
    "HEALTH_CHECK_TOKEN",
  ]);
}

/* =========================================================
   Client IP handling
========================================================= */

function normalizeClientIp(
  value:
    string | null,
): string | null {
  if (!value) {
    return null;
  }

  const firstValue =
    value
      .split(
        ",",
      )[0]
      ?.trim() ??
    "";

  if (
    !firstValue ||
    firstValue.length >
      120
  ) {
    return null;
  }

  /*
   * Accept characters expected in IPv4 and IPv6.
   * Hostnames and arbitrary user input are rejected.
   */
  if (
    !/^[A-Fa-f0-9:.]+$/.test(
      firstValue,
    )
  ) {
    return null;
  }

  return firstValue
    .toLowerCase();
}

function readClientIp(
  request:
    Request,
): string {
  const candidates = [
    request.headers.get(
      "x-vercel-forwarded-for",
    ),

    request.headers.get(
      "x-forwarded-for",
    ),

    request.headers.get(
      "x-real-ip",
    ),
  ];

  for (
    const candidate of
    candidates
  ) {
    const normalized =
      normalizeClientIp(
        candidate,
      );

    if (normalized) {
      return normalized;
    }
  }

  return "unknown";
}

function createPrivacySafeReference(
  type:
    string,

  value:
    string,
): string | null {
  const secret =
    getProtectionHashSecret();

  if (!secret) {
    return null;
  }

  return createHmac(
    "sha256",
    secret,
  )
    .update(
      `${type}:${value}`,
      "utf8",
    )
    .digest(
      "hex",
    );
}

/* =========================================================
   Shared helpers
========================================================= */

function calculateRetryAfterSeconds(
  reset:
    number,
): number {
  return Math.max(
    1,
    Math.ceil(
      (
        reset -
        Date.now()
      ) /
        1_000,
    ),
  );
}

function createDegradedRateLimitResult():
  CspReportRateLimitResult {
  return {
    allowed:
      true,

    degraded:
      true,

    limit:
      0,

    remaining:
      0,

    reset:
      Date.now(),

    retryAfterSeconds:
      0,
  };
}

function writeProtectionFailureLog(
  operation:
    string,

  error:
    unknown,
): void {
  console.error(
    JSON.stringify({
      timestamp:
        new Date()
          .toISOString(),

      level:
        "error",

      event:
        "security.csp_report_protection_degraded",

      operation,

      errorName:
        error instanceof Error
          ? error.name
          : "UnknownError",
    }),
  );
}

/* =========================================================
   CSP report rate limiting
========================================================= */

export async function checkCspReportRateLimit(
  request:
    Request,
): Promise<
  CspReportRateLimitResult
> {
  const clientIp =
    readClientIp(
      request,
    );

  const identifier =
    createPrivacySafeReference(
      "csp-report-client-ip",
      clientIp,
    );

  /*
   * Raw IP must never be stored in Redis.
   * Missing hashing configuration therefore fails open.
   */
  if (!identifier) {
    return createDegradedRateLimitResult();
  }

  try {
    const limiter =
      getCspReportRateLimiter();

    const result =
      await limiter.limit(
        identifier,
      );

    if (
      result.reason ===
      "timeout"
    ) {
      return createDegradedRateLimitResult();
    }

    return {
      allowed:
        result.success,

      degraded:
        false,

      limit:
        result.limit,

      remaining:
        Math.max(
          0,
          result.remaining,
        ),

      reset:
        result.reset,

      retryAfterSeconds:
        result.success
          ? 0
          : calculateRetryAfterSeconds(
              result.reset,
            ),
    };
  } catch (
    error
  ) {
    /*
     * CSP reporting must not break browser requests when
     * Redis or the rate limiter is temporarily unavailable.
     */
    writeProtectionFailureLog(
      "rate_limit",
      error,
    );

    return createDegradedRateLimitResult();
  }
}

export function getCspReportRateLimitHeaders(
  result:
    CspReportRateLimitResult,
): Record<
  string,
  string
> {
  if (
    result.degraded
  ) {
    return {
      "X-CSP-RateLimit-Degraded":
        "true",
    };
  }

  const headers:
    Record<string, string> = {
    "X-CSP-RateLimit-Degraded":
      "false",

    "RateLimit-Limit":
      String(
        result.limit,
      ),

    "RateLimit-Remaining":
      String(
        result.remaining,
      ),

    "RateLimit-Reset":
      String(
        Math.ceil(
          result.reset /
            1_000,
        ),
      ),
  };

  if (
    !result.allowed
  ) {
    headers[
      "Retry-After"
    ] =
      String(
        result
          .retryAfterSeconds,
      );
  }

  return headers;
}

/* =========================================================
   Duplicate fingerprint suppression
========================================================= */

function normalizeFingerprint(
  fingerprint:
    string,
): string | null {
  const normalized =
    fingerprint
      .trim()
      .toLowerCase();

  if (
    !CSP_FINGERPRINT_PATTERN.test(
      normalized,
    )
  ) {
    return null;
  }

  return normalized;
}

export async function checkCspReportDuplicate(
  fingerprint:
    string,
): Promise<
  CspReportDuplicateResult
> {
  const normalizedFingerprint =
    normalizeFingerprint(
      fingerprint,
    );

  /*
   * Invalid internal data fails open rather than dropping
   * a potentially useful security report.
   */
  if (
    !normalizedFingerprint
  ) {
    return {
      duplicate:
        false,

      degraded:
        true,

      reason:
        "invalid_fingerprint",
    };
  }

  const key =
    `${DUPLICATE_KEY_PREFIX}:${normalizedFingerprint}`;

  try {
    const redis =
      getRedisClient();

    const result =
      await redis.set(
        key,
        "1",
        {
          nx:
            true,

          ex:
            DUPLICATE_TTL_SECONDS,
        },
      );

    if (
      result ===
      "OK"
    ) {
      return {
        duplicate:
          false,

        degraded:
          false,

        reason:
          "first_seen",
      };
    }

    return {
      duplicate:
        true,

      degraded:
        false,

      reason:
        "duplicate",
    };
  } catch (
    error
  ) {
    /*
     * Duplicate protection failing must not discard reports.
     */
    writeProtectionFailureLog(
      "duplicate_check",
      error,
    );

    return {
      duplicate:
        false,

      degraded:
        true,

      reason:
        "protection_degraded",
    };
  }
}