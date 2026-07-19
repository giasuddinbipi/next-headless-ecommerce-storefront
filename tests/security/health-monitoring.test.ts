import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/* =========================================================
   Hoisted dependency bridge
========================================================= */

type MockLimitResult = {
  success:
    boolean;

  limit:
    number;

  remaining:
    number;

  reset:
    number;

  reason?:
    string;
};

const monitoringBridge =
  vi.hoisted(() => ({
    redisClient: {
      type:
        "mock-health-redis",
    },

    limit:
      vi.fn(),

    slidingWindow:
      vi.fn(),
  }));

vi.mock(
  "@/lib/redis",
  () => ({
    getRedisClient:
      () =>
        monitoringBridge
          .redisClient,
  }),
);

vi.mock(
  "@upstash/ratelimit",
  () => {
    class MockRatelimit {
      static slidingWindow =
        monitoringBridge
          .slidingWindow;

      limit =
        monitoringBridge
          .limit;

      constructor(
        _config:
          Record<
            string,
            unknown
          >,
      ) {}
    }

    return {
      Ratelimit:
        MockRatelimit,
    };
  },
);

/*
 * Mocks-এর পরে module import।
 */
import {
  checkHealthReadinessRateLimit,
  createHealthAuditContext,
  getHealthAuditHeaders,
  getHealthRateLimitHeaders,
  healthAuditError,
  healthAuditInfo,
  healthAuditWarn,
} from "@/lib/health-monitoring";

/* =========================================================
   Helpers
========================================================= */

function createRequest({
  requestId,
  forwardedFor =
    "203.0.113.25, 10.0.0.1",
}: {
  requestId?: string;
  forwardedFor?: string;
} = {}): Request {
  const headers =
    new Headers({
      "x-forwarded-for":
        forwardedFor,
    });

  if (requestId) {
    headers.set(
      "x-request-id",
      requestId,
    );
  }

  return new Request(
    "https://store.example/api/health/checkout",
    {
      method:
        "GET",

      headers,
    },
  );
}

function createAllowedResult():
  MockLimitResult {
  return {
    success:
      true,

    limit:
      30,

    remaining:
      29,

    reset:
      Date.now() +
      60_000,

    reason:
      "success",
  };
}

/* =========================================================
   Setup
========================================================= */

beforeEach(() => {
  monitoringBridge
    .limit
    .mockReset()
    .mockResolvedValue(
      createAllowedResult(),
    );

  monitoringBridge
    .slidingWindow
    .mockReset()
    .mockReturnValue({
      type:
        "sliding-window",

      limit:
        30,

      window:
        "1 m",
    });

  vi.stubEnv(
    "HEALTH_RATE_LIMIT_HASH_SECRET",
    "health-monitoring-test-secret-at-least-32-characters",
  );

  vi.stubEnv(
    "AUDIT_LOG_HASH_SECRET",
    "",
  );

  vi.stubEnv(
    "AUTH_SECRET",
    "",
  );

  vi.stubEnv(
    "NEXTAUTH_SECRET",
    "",
  );

  vi.stubEnv(
    "HEALTH_CHECK_TOKEN",
    "",
  );
});

/* =========================================================
   Audit context
========================================================= */

describe(
  "health audit context",
  () => {
    it(
      "accepts a valid incoming request ID",
      () => {
        const context =
          createHealthAuditContext(
            createRequest({
              requestId:
                "health-request-123456",
            }),
          );

        expect(
          context.requestId,
        ).toBe(
          "health-request-123456",
        );

        expect(
          context.route,
        ).toBe(
          "/api/health/checkout",
        );

        expect(
          context.method,
        ).toBe(
          "GET",
        );

        expect(
          context.clientReference,
        ).toMatch(
          /^[a-f0-9]{64}$/,
        );

        expect(
          context.clientReference,
        ).not.toContain(
          "203.0.113.25",
        );
      },
    );

    it(
      "generates a request ID when the incoming value is invalid",
      () => {
        const context =
          createHealthAuditContext(
            createRequest({
              requestId:
                "invalid request id",
            }),
          );

        expect(
          context.requestId,
        ).toMatch(
          /^[0-9a-f-]{36}$/i,
        );
      },
    );

    it(
      "returns the request ID response header",
      () => {
        const context =
          createHealthAuditContext(
            createRequest({
              requestId:
                "health-header-request-123",
            }),
          );

        expect(
          getHealthAuditHeaders(
            context,
          ),
        ).toEqual({
          "X-Request-Id":
            "health-header-request-123",
        });
      },
    );
  },
);

/* =========================================================
   Rate limiting
========================================================= */

describe(
  "health readiness rate limiting",
  () => {
    it(
      "allows a request and uses a hashed identifier",
      async () => {
        const result =
          await checkHealthReadinessRateLimit(
            createRequest(),
          );

        expect(
          result,
        ).toMatchObject({
          allowed:
            true,

          degraded:
            false,

          limit:
            30,

          remaining:
            29,

          retryAfterSeconds:
            0,
        });

        expect(
          monitoringBridge
            .limit,
        ).toHaveBeenCalledTimes(
          1,
        );

        const identifier =
          monitoringBridge
            .limit
            .mock
            .calls[0]?.[0];

        expect(
          identifier,
        ).toMatch(
          /^[a-f0-9]{64}$/,
        );

        expect(
          String(
            identifier,
          ),
        ).not.toContain(
          "203.0.113.25",
        );
      },
    );

    it(
      "returns a blocked response with Retry-After",
      async () => {
        vi.useFakeTimers();

        vi.setSystemTime(
          new Date(
            "2026-07-19T12:00:00.000Z",
          ),
        );

        const reset =
          Date.now() +
          10_001;

        monitoringBridge
          .limit
          .mockResolvedValue({
            success:
              false,

            limit:
              30,

            remaining:
              0,

            reset,

            reason:
              "success",
          });

        const result =
          await checkHealthReadinessRateLimit(
            createRequest(),
          );

        expect(
          result,
        ).toMatchObject({
          allowed:
            false,

          degraded:
            false,

          limit:
            30,

          remaining:
            0,

          retryAfterSeconds:
            11,
        });

        expect(
          getHealthRateLimitHeaders(
            result,
          ),
        ).toEqual({
          "X-RateLimit-Degraded":
            "false",

          "RateLimit-Limit":
            "30",

          "RateLimit-Remaining":
            "0",

          "RateLimit-Reset":
            String(
              Math.ceil(
                reset /
                  1_000,
              ),
            ),

          "Retry-After":
            "11",
        });
      },
    );

    it(
      "fails open when the hash secret is unavailable",
      async () => {
        vi.stubEnv(
          "HEALTH_RATE_LIMIT_HASH_SECRET",
          "",
        );

        const result =
          await checkHealthReadinessRateLimit(
            createRequest(),
          );

        expect(
          result,
        ).toMatchObject({
          allowed:
            true,

          degraded:
            true,

          limit:
            0,

          remaining:
            0,
        });

        expect(
          monitoringBridge
            .limit,
        ).not.toHaveBeenCalled();

        expect(
          getHealthRateLimitHeaders(
            result,
          ),
        ).toEqual({
          "X-RateLimit-Degraded":
            "true",
        });
      },
    );

    it(
      "fails open when Redis rate limiting throws",
      async () => {
        const consoleErrorSpy =
          vi
            .spyOn(
              console,
              "error",
            )
            .mockImplementation(
              () => undefined,
            );

        monitoringBridge
          .limit
          .mockRejectedValue(
            new Error(
              "Redis unavailable.",
            ),
          );

        const result =
          await checkHealthReadinessRateLimit(
            createRequest(),
          );

        expect(
          result,
        ).toMatchObject({
          allowed:
            true,

          degraded:
            true,
        });

        expect(
          consoleErrorSpy,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );
  },
);

/* =========================================================
   Structured logging
========================================================= */

describe(
  "health structured audit logs",
  () => {
    it(
      "writes privacy-safe informational logs",
      () => {
        const infoSpy =
          vi
            .spyOn(
              console,
              "info",
            )
            .mockImplementation(
              () => undefined,
            );

        const context =
          createHealthAuditContext(
            createRequest({
              requestId:
                "health-info-request-123",
            }),
          );

        healthAuditInfo(
          context,
          "health.completed",
          {
            statusCode:
              200,

            overallStatus:
              "healthy",

            durationMs:
              250,

            dependencies: [
              {
                name:
                  "redis",

                status:
                  "healthy",

                latencyMs:
                  50,

                code:
                  "redis_available",
              },
            ],
          },
        );

        expect(
          infoSpy,
        ).toHaveBeenCalledTimes(
          1,
        );

        const serialized =
          String(
            infoSpy.mock
              .calls[0]?.[0] ??
              "",
          );

        const entry =
          JSON.parse(
            serialized,
          ) as Record<
            string,
            unknown
          >;

        expect(
          entry,
        ).toMatchObject({
          level:
            "info",

          event:
            "health.completed",

          requestId:
            "health-info-request-123",

          operation:
            "checkout-health-readiness",
        });

        expect(
          serialized,
        ).not.toContain(
          "203.0.113.25",
        );

        expect(
          serialized,
        ).not.toContain(
          "Authorization",
        );
      },
    );

    it(
      "uses console.warn for rejected requests",
      () => {
        const warnSpy =
          vi
            .spyOn(
              console,
              "warn",
            )
            .mockImplementation(
              () => undefined,
            );

        const context =
          createHealthAuditContext(
            createRequest(),
          );

        healthAuditWarn(
          context,
          "health.unauthorized",
          {
            statusCode:
              401,

            code:
              "health_check_unauthorized",
          },
        );

        expect(
          warnSpy,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "does not log raw error messages",
      () => {
        const errorSpy =
          vi
            .spyOn(
              console,
              "error",
            )
            .mockImplementation(
              () => undefined,
            );

        const context =
          createHealthAuditContext(
            createRequest(),
          );

        healthAuditError(
          context,
          "health.execution_failed",

          new Error(
            "Secret provider token was rejected.",
          ),

          {
            statusCode:
              503,

            code:
              "health_check_execution_failed",
          },
        );

        expect(
          errorSpy,
        ).toHaveBeenCalledTimes(
          1,
        );

        const serialized =
          String(
            errorSpy.mock
              .calls[0]?.[0] ??
              "",
          );

        expect(
          serialized,
        ).toContain(
          '"errorName":"Error"',
        );

        expect(
          serialized,
        ).not.toContain(
          "Secret provider token",
        );
      },
    );
  },
);