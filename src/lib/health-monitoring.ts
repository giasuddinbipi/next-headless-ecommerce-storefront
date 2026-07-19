import "server-only";

import {
  createHmac,
  randomUUID,
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

export type HealthRateLimitResult = {
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
};

export type HealthAuditLevel =
  | "info"
  | "warn"
  | "error";

export type HealthAuditEvent =
  | "health.request_received"
  | "health.not_configured"
  | "health.rate_limited"
  | "health.rate_limit_degraded"
  | "health.unauthorized"
  | "health.completed"
  | "health.execution_failed";

export type HealthAuditContext = {
  requestId:
    string;

  route:
    string;

  method:
    string;

  startedAt:
    string;

  startedAtMilliseconds:
    number;

  clientReference:
    string | null;
};

export type HealthAuditDependency = {
  name:
    string;

  status:
    string;

  latencyMs:
    number;

  code?:
    string;
};

export type HealthAuditMetadata = {
  statusCode?:
    number;

  code?:
    string;

  overallStatus?:
    string;

  degraded?:
    boolean;

  limit?:
    number;

  remaining?:
    number;

  retryAfterSeconds?:
    number;

  durationMs?:
    number;

  errorName?:
    string;

  dependencies?:
    HealthAuditDependency[];
};

/* =========================================================
   Constants
========================================================= */

const HEALTH_ROUTE =
  "/api/health/checkout";

const REQUEST_ID_PATTERN =
  /^[A-Za-z0-9._:-]{8,160}$/;

const RATE_LIMIT_PREFIX =
  "storefront:ratelimit:v1:health-readiness:ip";

const RATE_LIMIT_MAX_REQUESTS =
  30;

const RATE_LIMIT_WINDOW =
  "1 m";

const RATE_LIMIT_TIMEOUT_MS =
  1_500;

const MAXIMUM_AUDIT_STRING_LENGTH =
  160;

/* =========================================================
   Singleton rate limiter
========================================================= */

let readinessRateLimiter:
  Ratelimit | null =
  null;

function getReadinessRateLimiter():
  Ratelimit {
  if (
    readinessRateLimiter
  ) {
    return readinessRateLimiter;
  }

  readinessRateLimiter =
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

  return readinessRateLimiter;
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

function getIdentifierHashSecret():
  string | null {
  return readFirstNonEmptyEnvironmentValue([
    "HEALTH_RATE_LIMIT_HASH_SECRET",

    "AUDIT_LOG_HASH_SECRET",

    "AUTH_SECRET",

    "NEXTAUTH_SECRET",

    /*
     * HEALTH_CHECK_TOKEN server-only secret।
     * Dedicated hash secret না থাকলে fallback।
     */
    "HEALTH_CHECK_TOKEN",
  ]);
}

/* =========================================================
   Client identifier helpers
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
      .split(",")[0]
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
   * Only characters expected in IPv4,
   * IPv6 and proxy-provided address values।
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
    getIdentifierHashSecret();

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
   Request-ID helpers
========================================================= */

function normalizeRequestId(
  value:
    string | null,
): string | null {
  const normalized =
    value?.trim() ??
    "";

  if (
    !REQUEST_ID_PATTERN.test(
      normalized,
    )
  ) {
    return null;
  }

  return normalized;
}

function resolveRequestId(
  request:
    Request,
): string {
  return (
    normalizeRequestId(
      request.headers.get(
        "x-request-id",
      ),
    ) ??
    normalizeRequestId(
      request.headers.get(
        "x-correlation-id",
      ),
    ) ??
    randomUUID()
  );
}

/* =========================================================
   Audit context
========================================================= */

export function createHealthAuditContext(
  request:
    Request,
): HealthAuditContext {
  const clientIp =
    readClientIp(
      request,
    );

  return {
    requestId:
      resolveRequestId(
        request,
      ),

    route:
      HEALTH_ROUTE,

    method:
      request.method,

    startedAt:
      new Date()
        .toISOString(),

    startedAtMilliseconds:
      performance.now(),

    clientReference:
      createPrivacySafeReference(
        "health-client-ip",
        clientIp,
      ),
  };
}

export function getHealthAuditHeaders(
  context:
    HealthAuditContext,
): Record<
  string,
  string
> {
  return {
    "X-Request-Id":
      context.requestId,
  };
}

/* =========================================================
   Rate-limit check
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
  HealthRateLimitResult {
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

export async function checkHealthReadinessRateLimit(
  request:
    Request,
): Promise<
  HealthRateLimitResult
> {
  const clientIp =
    readClientIp(
      request,
    );

  const identifier =
    createPrivacySafeReference(
      "health-rate-limit-ip",
      clientIp,
    );

  /*
   * Identifier hashing secret না থাকলে raw IP
   * Redis-এ পাঠানো হবে না। Endpoint fail-open
   * degraded mode-এ চলবে।
   */
  if (!identifier) {
    return createDegradedRateLimitResult();
  }

  try {
    const limiter =
      getReadinessRateLimiter();

    const result =
      await limiter.limit(
        identifier,
      );

    const degraded =
      result.reason ===
      "timeout";

    if (degraded) {
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
     * Redis failure readiness endpoint বন্ধ করবে না।
     * Dependency probe নিজে Redis health report করবে।
     */
    console.error(
      "Health readiness rate-limit check failed.",

      error instanceof Error
        ? error.name
        : "UnknownError",
    );

    return createDegradedRateLimitResult();
  }
}

export function getHealthRateLimitHeaders(
  result:
    HealthRateLimitResult,
): Record<
  string,
  string
> {
  if (
    result.degraded
  ) {
    return {
      "X-RateLimit-Degraded":
        "true",
    };
  }

  const headers:
    Record<string, string> = {
    "X-RateLimit-Degraded":
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
   Audit sanitization
========================================================= */

function sanitizeAuditString(
  value:
    string | undefined,
): string | undefined {
  const normalized =
    value
      ?.replace(
        /[\r\n\t]+/g,
        " ",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.slice(
    0,
    MAXIMUM_AUDIT_STRING_LENGTH,
  );
}

function sanitizeAuditMetadata(
  metadata:
    HealthAuditMetadata | undefined,
): HealthAuditMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  return {
    statusCode:
      metadata.statusCode,

    code:
      sanitizeAuditString(
        metadata.code,
      ),

    overallStatus:
      sanitizeAuditString(
        metadata.overallStatus,
      ),

    degraded:
      metadata.degraded,

    limit:
      metadata.limit,

    remaining:
      metadata.remaining,

    retryAfterSeconds:
      metadata.retryAfterSeconds,

    durationMs:
      metadata.durationMs,

    errorName:
      sanitizeAuditString(
        metadata.errorName,
      ),

    dependencies:
      metadata.dependencies?.map(
        (
          dependency,
        ) => ({
          name:
            sanitizeAuditString(
              dependency.name,
            ) ??
            "unknown",

          status:
            sanitizeAuditString(
              dependency.status,
            ) ??
            "unknown",

          latencyMs:
            Math.max(
              0,
              Math.round(
                dependency.latencyMs,
              ),
            ),

          code:
            sanitizeAuditString(
              dependency.code,
            ),
        }),
      ),
  };
}

/* =========================================================
   Structured audit logging
========================================================= */

export function writeHealthAuditLog({
  level,
  event,
  context,
  metadata,
}: {
  level:
    HealthAuditLevel;

  event:
    HealthAuditEvent;

  context:
    HealthAuditContext;

  metadata?:
    HealthAuditMetadata;
}): void {
  const entry = {
    timestamp:
      new Date()
        .toISOString(),

    level,
    event,

    requestId:
      context.requestId,

    operation:
      "checkout-health-readiness",

    route:
      context.route,

    method:
      context.method,

    clientReference:
      context.clientReference,

    durationMs:
      Math.max(
        0,
        Math.round(
          performance.now() -
            context
              .startedAtMilliseconds,
        ),
      ),

    metadata:
      sanitizeAuditMetadata(
        metadata,
      ),
  };

  const serialized =
    JSON.stringify(
      entry,
    );

  if (
    level ===
    "error"
  ) {
    console.error(
      serialized,
    );

    return;
  }

  if (
    level ===
    "warn"
  ) {
    console.warn(
      serialized,
    );

    return;
  }

  console.info(
    serialized,
  );
}

export function healthAuditInfo(
  context:
    HealthAuditContext,

  event:
    HealthAuditEvent,

  metadata?:
    HealthAuditMetadata,
): void {
  writeHealthAuditLog({
    level:
      "info",

    event,
    context,
    metadata,
  });
}

export function healthAuditWarn(
  context:
    HealthAuditContext,

  event:
    HealthAuditEvent,

  metadata?:
    HealthAuditMetadata,
): void {
  writeHealthAuditLog({
    level:
      "warn",

    event,
    context,
    metadata,
  });
}

export function healthAuditError(
  context:
    HealthAuditContext,

  event:
    HealthAuditEvent,

  error:
    unknown,

  metadata?:
    HealthAuditMetadata,
): void {
  writeHealthAuditLog({
    level:
      "error",

    event,
    context,

    metadata: {
      ...metadata,

      /*
       * Raw error message বা stack log করা হচ্ছে না।
       */
      errorName:
        error instanceof Error
          ? error.name
          : "UnknownError",
    },
  });
}