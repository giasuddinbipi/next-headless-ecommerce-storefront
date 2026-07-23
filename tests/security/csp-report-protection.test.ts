import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/* =========================================================
   Hoisted dependency bridge
========================================================= */

type MockRateLimitResult = {
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

const protectionBridge =
  vi.hoisted(() => ({
    redisClient: {
      set:
        vi.fn(),
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
        protectionBridge
          .redisClient,
  }),
);

vi.mock(
  "@upstash/ratelimit",
  () => {
    class MockRatelimit {
      static slidingWindow =
        protectionBridge
          .slidingWindow;

      limit =
        protectionBridge
          .limit;

      constructor() {}
    }

    return {
      Ratelimit:
        MockRatelimit,
    };
  },
);

/*
 * Import after mocks.
 */
import {
  checkCspReportDuplicate,
  checkCspReportRateLimit,
  getCspReportRateLimitHeaders,
} from "@/lib/csp-report-protection";

/* =========================================================
   Helpers
========================================================= */

function createRequest({
  forwardedFor =
    "203.0.113.45, 10.0.0.1",
}: {
  forwardedFor?:
    string;
} = {}): Request {
  return new Request(
    "https://store.example/api/security/csp-report",
    {
      method:
        "POST",

      headers: {
        "x-forwarded-for":
          forwardedFor,
      },
    },
  );
}

function createAllowedRateLimitResult():
  MockRateLimitResult {
  return {
    success:
      true,

    limit:
      60,

    remaining:
      59,

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
  protectionBridge
    .limit
    .mockReset()
    .mockResolvedValue(
      createAllowedRateLimitResult(),
    );

  protectionBridge
    .redisClient
    .set
    .mockReset()
    .mockResolvedValue(
      "OK",
    );

  protectionBridge
    .slidingWindow
    .mockReset()
    .mockReturnValue({
      type:
        "sliding-window",

      limit:
        60,

      window:
        "1 m",
    });

  vi.stubEnv(
    "CSP_REPORT_HASH_SECRET",
    "csp-report-protection-test-secret-at-least-32-characters",
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

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* =========================================================
   Rate limiting
========================================================= */

describe(
  "CSP report rate limiting",
  () => {
    it(
      "allows a report and hashes the client identifier",
      async () => {
        const result =
          await checkCspReportRateLimit(
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
            60,

          remaining:
            59,

          retryAfterSeconds:
            0,
        });

        expect(
          protectionBridge
            .limit,
        ).toHaveBeenCalledTimes(
          1,
        );

        const identifier =
          protectionBridge
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
          "203.0.113.45",
        );
      },
    );

    it(
      "returns HTTP-compatible headers for an allowed report",
      async () => {
        const result =
          await checkCspReportRateLimit(
            createRequest(),
          );

        const headers =
          getCspReportRateLimitHeaders(
            result,
          );

        expect(
          headers,
        ).toMatchObject({
          "X-CSP-RateLimit-Degraded":
            "false",

          "RateLimit-Limit":
            "60",

          "RateLimit-Remaining":
            "59",
        });

        expect(
          headers[
            "Retry-After"
          ],
        ).toBeUndefined();
      },
    );

    it(
      "returns blocked status and Retry-After",
      async () => {
        vi.useFakeTimers();

        vi.setSystemTime(
          new Date(
            "2026-07-19T12:00:00.000Z",
          ),
        );

        const reset =
          Date.now() +
          15_001;

        protectionBridge
          .limit
          .mockResolvedValue({
            success:
              false,

            limit:
              60,

            remaining:
              0,

            reset,

            reason:
              "success",
          });

        const result =
          await checkCspReportRateLimit(
            createRequest(),
          );

        expect(
          result,
        ).toMatchObject({
          allowed:
            false,

          degraded:
            false,

          remaining:
            0,

          retryAfterSeconds:
            16,
        });

        expect(
          getCspReportRateLimitHeaders(
            result,
          ),
        ).toEqual({
          "X-CSP-RateLimit-Degraded":
            "false",

          "RateLimit-Limit":
            "60",

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
            "16",
        });
      },
    );

    it(
      "fails open when no hashing secret is configured",
      async () => {
        vi.stubEnv(
          "CSP_REPORT_HASH_SECRET",
          "",
        );

        const result =
          await checkCspReportRateLimit(
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
          protectionBridge
            .limit,
        ).not.toHaveBeenCalled();

        expect(
          getCspReportRateLimitHeaders(
            result,
          ),
        ).toEqual({
          "X-CSP-RateLimit-Degraded":
            "true",
        });
      },
    );

    it(
      "fails open when the rate limiter throws",
      async () => {
        const errorSpy =
          vi
            .spyOn(
              console,
              "error",
            )
            .mockImplementation(
              () => undefined,
            );

        protectionBridge
          .limit
          .mockRejectedValue(
            new Error(
              "Redis connection failed.",
            ),
          );

        const result =
          await checkCspReportRateLimit(
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
          '"operation":"rate_limit"',
        );

        expect(
          serialized,
        ).not.toContain(
          "Redis connection failed",
        );
      },
    );
  },
);

/* =========================================================
   Duplicate suppression
========================================================= */

describe(
  "CSP report duplicate suppression",
  () => {
    const fingerprint =
      "1234567890abcdef12345678";

    it(
      "marks a newly seen fingerprint as first seen",
      async () => {
        protectionBridge
          .redisClient
          .set
          .mockResolvedValue(
            "OK",
          );

        const result =
          await checkCspReportDuplicate(
            fingerprint,
          );

        expect(
          result,
        ).toEqual({
          duplicate:
            false,

          degraded:
            false,

          reason:
            "first_seen",
        });

        expect(
          protectionBridge
            .redisClient
            .set,
        ).toHaveBeenCalledWith(
          `storefront:csp-report-dedupe:v1:${fingerprint}`,

          "1",

          {
            nx:
              true,

            ex:
              600,
          },
        );
      },
    );

    it(
      "marks an existing fingerprint as duplicate",
      async () => {
        protectionBridge
          .redisClient
          .set
          .mockResolvedValue(
            null,
          );

        const result =
          await checkCspReportDuplicate(
            fingerprint,
          );

        expect(
          result,
        ).toEqual({
          duplicate:
            true,

          degraded:
            false,

          reason:
            "duplicate",
        });
      },
    );

    it(
      "fails open for an invalid fingerprint",
      async () => {
        const result =
          await checkCspReportDuplicate(
            "invalid-fingerprint",
          );

        expect(
          result,
        ).toEqual({
          duplicate:
            false,

          degraded:
            true,

          reason:
            "invalid_fingerprint",
        });

        expect(
          protectionBridge
            .redisClient
            .set,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "fails open when duplicate protection throws",
      async () => {
        const errorSpy =
          vi
            .spyOn(
              console,
              "error",
            )
            .mockImplementation(
              () => undefined,
            );

        protectionBridge
          .redisClient
          .set
          .mockRejectedValue(
            new Error(
              "Private Redis failure detail.",
            ),
          );

        const result =
          await checkCspReportDuplicate(
            fingerprint,
          );

        expect(
          result,
        ).toEqual({
          duplicate:
            false,

          degraded:
            true,

          reason:
            "protection_degraded",
        });

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
          '"operation":"duplicate_check"',
        );

        expect(
          serialized,
        ).not.toContain(
          "Private Redis failure detail",
        );
      },
    );
  },
);