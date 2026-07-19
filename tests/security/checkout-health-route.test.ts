import {
  NextRequest,
} from "next/server";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/* =========================================================
   Hoisted mock bridge
========================================================= */

const routeBridge =
  vi.hoisted(() => ({
    runCheckoutDependencyHealthChecks:
      vi.fn(),

    createHealthAuditContext:
      vi.fn(),

    getHealthAuditHeaders:
      vi.fn(),

    checkHealthReadinessRateLimit:
      vi.fn(),

    getHealthRateLimitHeaders:
      vi.fn(),

    healthAuditInfo:
      vi.fn(),

    healthAuditWarn:
      vi.fn(),

    healthAuditError:
      vi.fn(),
  }));

vi.mock(
  "@/lib/health-dependencies",
  () => ({
    runCheckoutDependencyHealthChecks:
      routeBridge
        .runCheckoutDependencyHealthChecks,
  }),
);

vi.mock(
  "@/lib/health-monitoring",
  () => ({
    createHealthAuditContext:
      routeBridge
        .createHealthAuditContext,

    getHealthAuditHeaders:
      routeBridge
        .getHealthAuditHeaders,

    checkHealthReadinessRateLimit:
      routeBridge
        .checkHealthReadinessRateLimit,

    getHealthRateLimitHeaders:
      routeBridge
        .getHealthRateLimitHeaders,

    healthAuditInfo:
      routeBridge
        .healthAuditInfo,

    healthAuditWarn:
      routeBridge
        .healthAuditWarn,

    healthAuditError:
      routeBridge
        .healthAuditError,
  }),
);

/*
 * Mocks-এর পরে route import।
 */
import {
  GET,
} from "@/app/api/health/checkout/route";

/* =========================================================
   Constants
========================================================= */

const HEALTH_TOKEN =
  "checkout-health-token-1234567890-secure-test-value";

const REQUEST_ID =
  "health-request-test-123456";

const CHECKED_AT =
  "2026-07-19T12:00:00.000Z";

/* =========================================================
   Types
========================================================= */

type UnknownRecord =
  Record<string, unknown>;

type DependencyName =
  | "application"
  | "redis"
  | "woocommerce";

type DependencyStatus =
  | "healthy"
  | "degraded"
  | "unhealthy";

/* =========================================================
   Helpers
========================================================= */

function isObject(
  value:
    unknown,
): value is UnknownRecord {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value,
    )
  );
}

async function readJsonResponse(
  response:
    Response,
): Promise<UnknownRecord> {
  const data:
    unknown =
    await response.json();

  if (!isObject(data)) {
    throw new Error(
      "Expected a JSON object response.",
    );
  }

  return data;
}

function createHealthRequest(
  authorization?:
    string,
): NextRequest {
  const headers =
    new Headers({
      Accept:
        "application/json",

      "X-Forwarded-For":
        "203.0.113.25",

      "X-Request-Id":
        REQUEST_ID,
    });

  if (authorization) {
    headers.set(
      "Authorization",
      authorization,
    );
  }

  return new NextRequest(
    "https://store.example/api/health/checkout",
    {
      method:
        "GET",

      headers,
    },
  );
}

function createDependency({
  name,
  status = "healthy",
  critical = true,
  code,
  message,
}: {
  name: DependencyName;
  status?: DependencyStatus;
  critical?: boolean;
  code: string;
  message: string;
}) {
  return {
    name,
    status,
    critical,
    latencyMs: 10,
    checkedAt: CHECKED_AT,
    code,
    message,
  };
}

function createHealthyDependencies() {
  return [
    createDependency({
      name:
        "application",

      code:
        "application_available",

      message:
        "Application runtime is available.",
    }),

    createDependency({
      name:
        "redis",

      code:
        "redis_available",

      message:
        "Redis is available.",
    }),

    createDependency({
      name:
        "woocommerce",

      code:
        "woocommerce_available",

      message:
        "WooCommerce is available.",
    }),
  ];
}

function createAllowedRateLimitResult() {
  return {
    allowed:
      true,

    degraded:
      false,

    limit:
      30,

    remaining:
      29,

    reset:
      Date.now() +
      60_000,

    retryAfterSeconds:
      0,
  };
}

/* =========================================================
   Setup
========================================================= */

beforeEach(() => {
  routeBridge
    .runCheckoutDependencyHealthChecks
    .mockReset()
    .mockResolvedValue(
      createHealthyDependencies(),
    );

  routeBridge
    .createHealthAuditContext
    .mockReset()
    .mockReturnValue({
      requestId:
        REQUEST_ID,

      route:
        "/api/health/checkout",

      method:
        "GET",

      startedAt:
        CHECKED_AT,

      startedAtMilliseconds:
        performance.now(),

      clientReference:
        "hashed-client-reference",
    });

  routeBridge
    .getHealthAuditHeaders
    .mockReset()
    .mockReturnValue({
      "X-Request-Id":
        REQUEST_ID,
    });

  routeBridge
    .checkHealthReadinessRateLimit
    .mockReset()
    .mockResolvedValue(
      createAllowedRateLimitResult(),
    );

  routeBridge
    .getHealthRateLimitHeaders
    .mockReset()
    .mockReturnValue({
      "X-RateLimit-Degraded":
        "false",

      "RateLimit-Limit":
        "30",

      "RateLimit-Remaining":
        "29",

      "RateLimit-Reset":
        "1784462460",
    });

  routeBridge
    .healthAuditInfo
    .mockReset();

  routeBridge
    .healthAuditWarn
    .mockReset();

  routeBridge
    .healthAuditError
    .mockReset();

  vi.stubEnv(
    "HEALTH_CHECK_TOKEN",
    HEALTH_TOKEN,
  );

  vi.stubEnv(
    "NODE_ENV",
    "test",
  );

  vi.stubEnv(
    "VERCEL_ENV",
    "",
  );

  vi.stubEnv(
    "APP_RELEASE",
    "abcdef1234567890",
  );

  vi.stubEnv(
    "VERCEL_GIT_COMMIT_SHA",
    "",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* =========================================================
   Configuration and authentication
========================================================= */

describe(
  "GET /api/health/checkout authentication",
  () => {
    it(
      "fails closed when the endpoint token is not configured",
      async () => {
        vi.stubEnv(
          "HEALTH_CHECK_TOKEN",
          "",
        );

        const response =
          await GET(
            createHealthRequest(
              `Bearer ${HEALTH_TOKEN}`,
            ),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          503,
        );

        expect(
          data,
        ).toMatchObject({
          status:
            "unavailable",

          code:
            "health_endpoint_not_configured",

          requestId:
            REQUEST_ID,
        });

        expect(
          response.headers.get(
            "x-request-id",
          ),
        ).toBe(
          REQUEST_ID,
        );

        expect(
          routeBridge
            .checkHealthReadinessRateLimit,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge
            .runCheckoutDependencyHealthChecks,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge
            .healthAuditWarn,
        ).toHaveBeenCalledWith(
          expect.anything(),

          "health.not_configured",

          expect.objectContaining({
            statusCode:
              503,
          }),
        );
      },
    );

    it(
      "rejects a request without authorization",
      async () => {
        const response =
          await GET(
            createHealthRequest(),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          401,
        );

        expect(
          data,
        ).toMatchObject({
          status:
            "unauthorized",

          code:
            "health_check_unauthorized",

          requestId:
            REQUEST_ID,
        });

        expect(
          response.headers.get(
            "www-authenticate",
          ),
        ).toBe(
          'Bearer realm="checkout-health"',
        );

        expect(
          response.headers.get(
            "x-request-id",
          ),
        ).toBe(
          REQUEST_ID,
        );

        expect(
          response.headers.get(
            "x-health-check-type",
          ),
        ).toBe(
          "readiness",
        );

        expect(
          routeBridge
            .checkHealthReadinessRateLimit,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          routeBridge
            .runCheckoutDependencyHealthChecks,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge
            .healthAuditWarn,
        ).toHaveBeenCalledWith(
          expect.anything(),

          "health.unauthorized",

          expect.objectContaining({
            statusCode:
              401,
          }),
        );
      },
    );

    it(
      "rejects an incorrect bearer token without exposing it",
      async () => {
        const invalidToken =
          "incorrect-health-token-12345678901234567890";

        const response =
          await GET(
            createHealthRequest(
              `Bearer ${invalidToken}`,
            ),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          401,
        );

        const serialized =
          JSON.stringify(
            data,
          );

        expect(
          serialized,
        ).not.toContain(
          invalidToken,
        );

        expect(
          serialized,
        ).not.toContain(
          HEALTH_TOKEN,
        );

        expect(
          routeBridge
            .runCheckoutDependencyHealthChecks,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects a malformed authorization header",
      async () => {
        const response =
          await GET(
            createHealthRequest(
              `Basic ${HEALTH_TOKEN}`,
            ),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          401,
        );

        expect(
          data.code,
        ).toBe(
          "health_check_unauthorized",
        );

        expect(
          routeBridge
            .runCheckoutDependencyHealthChecks,
        ).not.toHaveBeenCalled();
      },
    );
  },
);

/* =========================================================
   Rate-limit behavior
========================================================= */

describe(
  "GET /api/health/checkout rate limiting",
  () => {
    it(
      "returns HTTP 429 before authorization and dependency checks",
      async () => {
        routeBridge
          .checkHealthReadinessRateLimit
          .mockResolvedValue({
            allowed:
              false,

            degraded:
              false,

            limit:
              30,

            remaining:
              0,

            reset:
              Date.now() +
              15_000,

            retryAfterSeconds:
              15,
          });

        routeBridge
          .getHealthRateLimitHeaders
          .mockReturnValue({
            "X-RateLimit-Degraded":
              "false",

            "RateLimit-Limit":
              "30",

            "RateLimit-Remaining":
              "0",

            "RateLimit-Reset":
              "1784462460",

            "Retry-After":
              "15",
          });

        const response =
          await GET(
            createHealthRequest(),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          429,
        );

        expect(
          data,
        ).toMatchObject({
          status:
            "rate_limited",

          code:
            "health_check_rate_limited",

          retryAfterSeconds:
            15,

          requestId:
            REQUEST_ID,
        });

        expect(
          response.headers.get(
            "retry-after",
          ),
        ).toBe(
          "15",
        );

        expect(
          response.headers.get(
            "ratelimit-remaining",
          ),
        ).toBe(
          "0",
        );

        expect(
          response.headers.get(
            "x-request-id",
          ),
        ).toBe(
          REQUEST_ID,
        );

        expect(
          routeBridge
            .runCheckoutDependencyHealthChecks,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge
            .healthAuditWarn,
        ).toHaveBeenCalledWith(
          expect.anything(),

          "health.rate_limited",

          expect.objectContaining({
            statusCode:
              429,

            retryAfterSeconds:
              15,
          }),
        );
      },
    );

    it(
      "continues when the rate limiter is degraded",
      async () => {
        routeBridge
          .checkHealthReadinessRateLimit
          .mockResolvedValue({
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
          });

        routeBridge
          .getHealthRateLimitHeaders
          .mockReturnValue({
            "X-RateLimit-Degraded":
              "true",
          });

        const response =
          await GET(
            createHealthRequest(
              `Bearer ${HEALTH_TOKEN}`,
            ),
          );

        expect(
          response.status,
        ).toBe(
          200,
        );

        expect(
          response.headers.get(
            "x-ratelimit-degraded",
          ),
        ).toBe(
          "true",
        );

        expect(
          routeBridge
            .runCheckoutDependencyHealthChecks,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          routeBridge
            .healthAuditWarn,
        ).toHaveBeenCalledWith(
          expect.anything(),

          "health.rate_limit_degraded",

          expect.objectContaining({
            degraded:
              true,
          }),
        );
      },
    );
  },
);

/* =========================================================
   Healthy response
========================================================= */

describe(
  "GET /api/health/checkout healthy response",
  () => {
    it(
      "returns HTTP 200 with request and rate-limit headers",
      async () => {
        const response =
          await GET(
            createHealthRequest(
              `Bearer ${HEALTH_TOKEN}`,
            ),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          200,
        );

        expect(
          data,
        ).toMatchObject({
          status:
            "healthy",

          environment:
            "test",

          release:
            "abcdef123456",

          requestId:
            REQUEST_ID,
        });

        expect(
          data.dependencies,
        ).toHaveLength(
          3,
        );

        expect(
          response.headers.get(
            "x-request-id",
          ),
        ).toBe(
          REQUEST_ID,
        );

        expect(
          response.headers.get(
            "x-health-check-type",
          ),
        ).toBe(
          "readiness",
        );

        expect(
          response.headers.get(
            "x-ratelimit-degraded",
          ),
        ).toBe(
          "false",
        );

        expect(
          response.headers.get(
            "ratelimit-limit",
          ),
        ).toBe(
          "30",
        );

        expect(
          response.headers.get(
            "cache-control",
          ),
        ).toContain(
          "no-store",
        );

        expect(
          routeBridge
            .runCheckoutDependencyHealthChecks,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          routeBridge
            .healthAuditInfo,
        ).toHaveBeenCalledWith(
          expect.anything(),

          "health.completed",

          expect.objectContaining({
            statusCode:
              200,

            overallStatus:
              "healthy",
          }),
        );

        expect(
          JSON.stringify(
            data,
          ),
        ).not.toContain(
          HEALTH_TOKEN,
        );
      },
    );
  },
);

/* =========================================================
   Dependency status responses
========================================================= */

describe(
  "GET /api/health/checkout dependency status",
  () => {
    it(
      "returns HTTP 503 when a critical dependency is unhealthy",
      async () => {
        routeBridge
          .runCheckoutDependencyHealthChecks
          .mockResolvedValue([
            createDependency({
              name:
                "application",

              code:
                "application_available",

              message:
                "Application runtime is available.",
            }),

            createDependency({
              name:
                "redis",

              status:
                "unhealthy",

              critical:
                true,

              code:
                "redis_unavailable",

              message:
                "Redis is unavailable.",
            }),

            createDependency({
              name:
                "woocommerce",

              code:
                "woocommerce_available",

              message:
                "WooCommerce is available.",
            }),
          ]);

        const response =
          await GET(
            createHealthRequest(
              `Bearer ${HEALTH_TOKEN}`,
            ),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          503,
        );

        expect(
          data.status,
        ).toBe(
          "unhealthy",
        );

        expect(
          data.requestId,
        ).toBe(
          REQUEST_ID,
        );

        expect(
          data.dependencies,
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name:
                "redis",

              status:
                "unhealthy",

              code:
                "redis_unavailable",
            }),
          ]),
        );

        expect(
          routeBridge
            .healthAuditWarn,
        ).toHaveBeenCalledWith(
          expect.anything(),

          "health.completed",

          expect.objectContaining({
            statusCode:
              503,

            overallStatus:
              "unhealthy",
          }),
        );
      },
    );

    it(
      "returns HTTP 503 for a degraded dependency summary",
      async () => {
        routeBridge
          .runCheckoutDependencyHealthChecks
          .mockResolvedValue([
            createDependency({
              name:
                "application",

              code:
                "application_available",

              message:
                "Application runtime is available.",
            }),

            createDependency({
              name:
                "redis",

              code:
                "redis_available",

              message:
                "Redis is available.",
            }),

            createDependency({
              name:
                "woocommerce",

              status:
                "degraded",

              critical:
                false,

              code:
                "woocommerce_slow",

              message:
                "WooCommerce response is slow.",
            }),
          ]);

        const response =
          await GET(
            createHealthRequest(
              `Bearer ${HEALTH_TOKEN}`,
            ),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          503,
        );

        expect(
          data.status,
        ).toBe(
          "degraded",
        );

        expect(
          routeBridge
            .healthAuditWarn,
        ).toHaveBeenCalledWith(
          expect.anything(),

          "health.completed",

          expect.objectContaining({
            overallStatus:
              "degraded",
          }),
        );
      },
    );

    it(
      "returns a safe response when dependency execution throws",
      async () => {
        const providerError =
          new Error(
            "Secret provider token was rejected.",
          );

        routeBridge
          .runCheckoutDependencyHealthChecks
          .mockRejectedValue(
            providerError,
          );

        const response =
          await GET(
            createHealthRequest(
              `Bearer ${HEALTH_TOKEN}`,
            ),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          503,
        );

        expect(
          data,
        ).toMatchObject({
          status:
            "unhealthy",

          code:
            "health_check_execution_failed",

          requestId:
            REQUEST_ID,
        });

        expect(
          JSON.stringify(
            data,
          ),
        ).not.toContain(
          "Secret provider token",
        );

        expect(
          routeBridge
            .healthAuditError,
        ).toHaveBeenCalledWith(
          expect.anything(),

          "health.execution_failed",

          providerError,

          expect.objectContaining({
            statusCode:
              503,

            code:
              "health_check_execution_failed",
          }),
        );
      },
    );
  },
);

/* =========================================================
   Common monitoring behavior
========================================================= */

describe(
  "GET /api/health/checkout monitoring behavior",
  () => {
    it(
      "creates an audit context and records request receipt",
      async () => {
        const request =
          createHealthRequest(
            `Bearer ${HEALTH_TOKEN}`,
          );

        await GET(
          request,
        );

        expect(
          routeBridge
            .createHealthAuditContext,
        ).toHaveBeenCalledWith(
          request,
        );

        expect(
          routeBridge
            .healthAuditInfo,
        ).toHaveBeenCalledWith(
          expect.anything(),

          "health.request_received",
        );
      },
    );
  },
);