import {
  timingSafeEqual,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  createHealthCheckSummary,
} from "@/lib/health-check";

import {
  runCheckoutDependencyHealthChecks,
} from "@/lib/health-dependencies";

import {
  checkHealthReadinessRateLimit,
  createHealthAuditContext,
  getHealthAuditHeaders,
  getHealthRateLimitHeaders,
  healthAuditError,
  healthAuditInfo,
  healthAuditWarn,
} from "@/lib/health-monitoring";

/*
 * timingSafeEqual এবং health monitoring module
 * Node.js runtime ব্যবহার করে।
 */
export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export const revalidate =
  0;

/* =========================================================
   Constants
========================================================= */

const MINIMUM_TOKEN_LENGTH =
  32;

const MAXIMUM_TOKEN_LENGTH =
  512;

const BASE_RESPONSE_HEADERS = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate",

  Pragma:
    "no-cache",

  Expires:
    "0",

  "X-Content-Type-Options":
    "nosniff",

  "X-Robots-Tag":
    "noindex, nofollow, noarchive",

  "X-Health-Check-Type":
    "readiness",
} as const;

/* =========================================================
   Response helper
========================================================= */

function createJsonResponse(
  body:
    Record<string, unknown>,

  status:
    number,

  additionalHeaders:
    Record<string, string> = {},
): NextResponse {
  return NextResponse.json(
    body,
    {
      status,

      headers: {
        ...BASE_RESPONSE_HEADERS,
        ...additionalHeaders,
      },
    },
  );
}

/* =========================================================
   Token configuration
========================================================= */

function getConfiguredHealthToken():
  string | null {
  const token =
    process.env
      .HEALTH_CHECK_TOKEN
      ?.trim() ??
    "";

  if (
    token.length <
      MINIMUM_TOKEN_LENGTH ||
    token.length >
      MAXIMUM_TOKEN_LENGTH
  ) {
    return null;
  }

  return token;
}

/* =========================================================
   Authorization parsing
========================================================= */

function readBearerToken(
  request:
    NextRequest,
): string | null {
  const authorization =
    request.headers.get(
      "authorization",
    );

  if (!authorization) {
    return null;
  }

  const match =
    authorization.match(
      /^Bearer\s+(.+)$/i,
    );

  if (!match) {
    return null;
  }

  const token =
    match[1]
      ?.trim() ??
    "";

  if (
    token.length <
      MINIMUM_TOKEN_LENGTH ||
    token.length >
      MAXIMUM_TOKEN_LENGTH
  ) {
    return null;
  }

  return token;
}

/* =========================================================
   Constant-time token comparison
========================================================= */

function secureTokenEquals(
  receivedToken:
    string,

  configuredToken:
    string,
): boolean {
  const receivedBuffer =
    Buffer.from(
      receivedToken,
      "utf8",
    );

  const configuredBuffer =
    Buffer.from(
      configuredToken,
      "utf8",
    );

  if (
    receivedBuffer.length !==
    configuredBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    receivedBuffer,
    configuredBuffer,
  );
}

/* =========================================================
   GET /api/health/checkout
========================================================= */

export async function GET(
  request:
    NextRequest,
): Promise<NextResponse> {
  const context =
    createHealthAuditContext(
      request,
    );

  const checkedAt =
    new Date()
      .toISOString();

  const auditHeaders =
    getHealthAuditHeaders(
      context,
    );

  healthAuditInfo(
    context,
    "health.request_received",
  );

  const configuredToken =
    getConfiguredHealthToken();

  /*
   * Endpoint secret ঠিকভাবে configured না থাকলে
   * fail closed করা হবে।
   */
  if (!configuredToken) {
    healthAuditWarn(
      context,
      "health.not_configured",
      {
        statusCode:
          503,

        code:
          "health_endpoint_not_configured",
      },
    );

    return createJsonResponse(
      {
        status:
          "unavailable",

        code:
          "health_endpoint_not_configured",

        message:
          "Health endpoint is unavailable.",

        checkedAt,

        requestId:
          context.requestId,
      },
      503,
      auditHeaders,
    );
  }

  /*
   * Authorization validation-এর আগে IP-based
   * rate limiting করা হচ্ছে, যাতে invalid-token
   * brute-force traffic-ও সীমাবদ্ধ থাকে।
   */
  const rateLimit =
    await checkHealthReadinessRateLimit(
      request,
    );

  const rateLimitHeaders =
    getHealthRateLimitHeaders(
      rateLimit,
    );

  const monitoredResponseHeaders = {
    ...auditHeaders,
    ...rateLimitHeaders,
  };

  /*
   * Redis rate limiter timeout অথবা unavailable
   * হলে endpoint fail-open mode-এ চলবে।
   *
   * Redis dependency probe পরে actual Redis health
   * status report করবে।
   */
  if (
    rateLimit.degraded
  ) {
    healthAuditWarn(
      context,
      "health.rate_limit_degraded",
      {
        degraded:
          true,
      },
    );
  }

  if (
    !rateLimit.allowed
  ) {
    healthAuditWarn(
      context,
      "health.rate_limited",
      {
        statusCode:
          429,

        code:
          "health_check_rate_limited",

        degraded:
          false,

        limit:
          rateLimit.limit,

        remaining:
          rateLimit.remaining,

        retryAfterSeconds:
          rateLimit
            .retryAfterSeconds,
      },
    );

    return createJsonResponse(
      {
        status:
          "rate_limited",

        code:
          "health_check_rate_limited",

        message:
          "Too many health-check requests. Please try again later.",

        checkedAt,

        retryAfterSeconds:
          rateLimit
            .retryAfterSeconds,

        requestId:
          context.requestId,
      },
      429,
      monitoredResponseHeaders,
    );
  }

  const receivedToken =
    readBearerToken(
      request,
    );

  if (
    !receivedToken ||
    !secureTokenEquals(
      receivedToken,
      configuredToken,
    )
  ) {
    healthAuditWarn(
      context,
      "health.unauthorized",
      {
        statusCode:
          401,

        code:
          "health_check_unauthorized",

        degraded:
          rateLimit.degraded,
      },
    );

    return createJsonResponse(
      {
        status:
          "unauthorized",

        code:
          "health_check_unauthorized",

        message:
          "Valid health-check credentials are required.",

        checkedAt,

        requestId:
          context.requestId,
      },
      401,
      {
        ...monitoredResponseHeaders,

        "WWW-Authenticate":
          'Bearer realm="checkout-health"',
      },
    );
  }

  try {
    const dependencies =
      await runCheckoutDependencyHealthChecks();

    const summary =
      createHealthCheckSummary({
        dependencies,

        startedAt:
          context
            .startedAtMilliseconds,
      });

    const responseStatus =
      summary.status ===
      "healthy"
        ? 200
        : 503;

    const auditMetadata = {
      statusCode:
        responseStatus,

      overallStatus:
        summary.status,

      degraded:
        rateLimit.degraded,

      durationMs:
        summary.durationMs,

      dependencies:
        summary.dependencies.map(
          (
            dependency,
          ) => ({
            name:
              dependency.name,

            status:
              dependency.status,

            latencyMs:
              dependency.latencyMs,

            code:
              dependency.code,
          }),
        ),
    };

    if (
      summary.status ===
      "healthy"
    ) {
      healthAuditInfo(
        context,
        "health.completed",
        auditMetadata,
      );
    } else {
      healthAuditWarn(
        context,
        "health.completed",
        auditMetadata,
      );
    }

    return createJsonResponse(
      {
        ...summary,

        requestId:
          context.requestId,
      },
      responseStatus,
      monitoredResponseHeaders,
    );
  } catch (
    error
  ) {
    const durationMs =
      Math.max(
        0,

        Math.round(
          performance.now() -
            context
              .startedAtMilliseconds,
        ),
      );

    healthAuditError(
      context,
      "health.execution_failed",
      error,
      {
        statusCode:
          503,

        code:
          "health_check_execution_failed",

        degraded:
          rateLimit.degraded,

        durationMs,
      },
    );

    return createJsonResponse(
      {
        status:
          "unhealthy",

        code:
          "health_check_execution_failed",

        message:
          "Health check could not be completed.",

        checkedAt:
          new Date()
            .toISOString(),

        durationMs,

        requestId:
          context.requestId,
      },
      503,
      monitoredResponseHeaders,
    );
  }
}