import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

type MockLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;

  reason?:
    | "success"
    | "timeout";
};

type MockRatelimitInstance = {
  config:
    Record<string, unknown>;

  limit:
    ReturnType<
      typeof vi.fn
    >;
};

/*
 * Mock factory এবং imported module-এর মধ্যে
 * shared state রাখতে hoisted bridge ব্যবহার হচ্ছে।
 */
const ratelimitBridge =
  vi.hoisted(() => ({
    instances:
      [] as MockRatelimitInstance[],

    queuedResults:
      [] as Array<
        MockLimitResult | Error
      >,

    defaultResult: {
      success: true,
      limit: 100,
      remaining: 99,
      reset:
        Date.now() + 60_000,
      reason:
        "success",
    } as MockLimitResult,

    redisClient: {
      type:
        "mock-redis-client",
    },

    slidingWindow:
      vi.fn(),
  }));

/* =========================================================
   External dependency mocks
========================================================= */

vi.mock(
  "@upstash/ratelimit",
  () => {
    class MockRatelimit {
      static slidingWindow =
        ratelimitBridge
          .slidingWindow;

      config:
        Record<string, unknown>;

      limit:
        ReturnType<
          typeof vi.fn
        >;

      constructor(
        config:
          Record<string, unknown>,
      ) {
        this.config =
          config;

        this.limit =
  vi.fn(
    async () => {
              const queuedResult =
                ratelimitBridge
                  .queuedResults
                  .shift();

              if (
                queuedResult instanceof
                Error
              ) {
                throw queuedResult;
              }

              return (
                queuedResult ??
                ratelimitBridge
                  .defaultResult
              );
            },
          );

        ratelimitBridge
          .instances
          .push(
            this,
          );
      }
    }

    return {
      Ratelimit:
        MockRatelimit,
    };
  },
);

vi.mock(
  "@/lib/redis",
  () => ({
    getRedisClient:
      () =>
        ratelimitBridge
          .redisClient,
  }),
);

/* =========================================================
   Shared helpers
========================================================= */

function createRequest({
  forwardedFor =
    "203.0.113.25, 10.0.0.1",
}: {
  forwardedFor?: string;
} = {}): Request {
  return new Request(
    "https://store.example/api/orders",
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

function createLimitResult({
  success = true,
  limit = 10,
  remaining = 9,
  reset =
    Date.now() + 60_000,
  reason =
    "success",
}: Partial<
  MockLimitResult
> = {}): MockLimitResult {
  return {
    success,
    limit,
    remaining,
    reset,
    reason,
  };
}

function queueLimitResults(
  ...results:
    Array<
      MockLimitResult | Error
    >
): void {
  ratelimitBridge
    .queuedResults
    .push(
      ...results,
    );
}

async function loadRateLimitModule() {
  return import(
    "@/lib/checkout-rate-limit"
  );
}

beforeEach(() => {
  /*
   * Module reset করলে checkout-rate-limit.ts-এর
   * singleton limiter collection প্রতিটি test-এ
   * নতুনভাবে তৈরি হবে।
   */
  vi.resetModules();

  ratelimitBridge
    .instances
    .length = 0;

  ratelimitBridge
    .queuedResults
    .length = 0;

  ratelimitBridge
    .slidingWindow
    .mockReset();

  ratelimitBridge
    .slidingWindow
    .mockImplementation(
      (
        limit:
          number,
        window:
          string,
      ) => ({
        type:
          "sliding-window",

        limit,
        window,
      }),
    );

  ratelimitBridge
    .defaultResult = {
    success: true,
    limit: 100,
    remaining: 99,
    reset:
      Date.now() +
      60_000,
    reason:
      "success",
  };
});

/* =========================================================
   Limiter configuration tests
========================================================= */

describe(
  "checkout rate-limit configuration",
  () => {
    it(
      "creates the expected order and status limiters",
      async () => {
        queueLimitResults(
          createLimitResult({
            limit: 6,
            remaining: 5,
          }),

          createLimitResult({
            limit: 30,
            remaining: 29,
          }),
        );

        const {
          checkOrderCreationRateLimit,
        } =
          await loadRateLimitModule();

        await checkOrderCreationRateLimit({
          request:
            createRequest(),

          customerId:
            42,

          billingEmail:
            "customer@example.com",
        });

        expect(
          ratelimitBridge
            .slidingWindow
            .mock.calls,
        ).toEqual([
          [
            6,
            "10 m",
          ],

          [
            30,
            "10 m",
          ],

          [
            30,
            "1 m",
          ],

          [
            120,
            "1 m",
          ],
        ]);

        expect(
          ratelimitBridge
            .instances,
        ).toHaveLength(
          4,
        );

        expect(
          ratelimitBridge
            .instances.map(
              (instance) =>
                instance
                  .config
                  .prefix,
            ),
        ).toEqual([
          "storefront:ratelimit:v1:order-create:subject",

          "storefront:ratelimit:v1:order-create:ip",

          "storefront:ratelimit:v1:order-status:subject",

          "storefront:ratelimit:v1:order-status:ip",
        ]);

        for (
          const instance of
          ratelimitBridge
            .instances
        ) {
          expect(
            instance
              .config
              .redis,
          ).toBe(
            ratelimitBridge
              .redisClient,
          );

          expect(
            instance
              .config
              .analytics,
          ).toBe(
            false,
          );

          expect(
            instance
              .config
              .timeout,
          ).toBe(
            1_500,
          );
        }
      },
    );
  },
);

/* =========================================================
   Identifier privacy tests
========================================================= */

describe(
  "checkout rate-limit identifiers",
  () => {
    it(
      "hashes customer and client-IP identifiers",
      async () => {
        const {
          checkOrderCreationRateLimit,
        } =
          await loadRateLimitModule();

        await checkOrderCreationRateLimit({
          request:
            createRequest({
              forwardedFor:
                "203.0.113.99, 10.0.0.1",
            }),

          customerId:
            42,

          billingEmail:
            "private@example.com",
        });

        const subjectLimiter =
          ratelimitBridge
            .instances[0];

        const ipLimiter =
          ratelimitBridge
            .instances[1];

        const subjectIdentifier =
          subjectLimiter
            ?.limit
            .mock
            .calls[0]?.[0];

        const ipIdentifier =
          ipLimiter
            ?.limit
            .mock
            .calls[0]?.[0];

        expect(
          subjectIdentifier,
        ).toMatch(
          /^[a-f0-9]{64}$/,
        );

        expect(
          ipIdentifier,
        ).toMatch(
          /^[a-f0-9]{64}$/,
        );

        expect(
          subjectIdentifier,
        ).not.toContain(
          "42",
        );

        expect(
          subjectIdentifier,
        ).not.toContain(
          "private@example.com",
        );

        expect(
          ipIdentifier,
        ).not.toContain(
          "203.0.113.99",
        );

        expect(
          subjectIdentifier,
        ).not.toBe(
          ipIdentifier,
        );
      },
    );

    it(
      "normalizes guest emails before creating the identifier",
      async () => {
        const {
          checkOrderCreationRateLimit,
        } =
          await loadRateLimitModule();

        const request =
          createRequest();

        await checkOrderCreationRateLimit({
          request,

          customerId:
            0,

          billingEmail:
            " Guest@Example.com ",
        });

        await checkOrderCreationRateLimit({
          request,

          customerId:
            0,

          billingEmail:
            "guest@example.com",
        });

        const subjectLimiter =
          ratelimitBridge
            .instances[0];

        const firstIdentifier =
          subjectLimiter
            ?.limit
            .mock
            .calls[0]?.[0];

        const secondIdentifier =
          subjectLimiter
            ?.limit
            .mock
            .calls[1]?.[0];

        expect(
          firstIdentifier,
        ).toMatch(
          /^[a-f0-9]{64}$/,
        );

        expect(
          secondIdentifier,
        ).toBe(
          firstIdentifier,
        );

        expect(
          String(
            firstIdentifier,
          ),
        ).not.toContain(
          "guest@example.com",
        );
      },
    );

    it(
      "uses different subject identifiers for customers and guests",
      async () => {
        const {
          checkOrderCreationRateLimit,
        } =
          await loadRateLimitModule();

        const request =
          createRequest();

        await checkOrderCreationRateLimit({
          request,

          customerId:
            42,

          billingEmail:
            "customer@example.com",
        });

        await checkOrderCreationRateLimit({
          request,

          customerId:
            0,

          billingEmail:
            "customer@example.com",
        });

        const subjectLimiter =
          ratelimitBridge
            .instances[0];

        const customerIdentifier =
          subjectLimiter
            ?.limit
            .mock
            .calls[0]?.[0];

        const guestIdentifier =
          subjectLimiter
            ?.limit
            .mock
            .calls[1]?.[0];

        expect(
          customerIdentifier,
        ).not.toBe(
          guestIdentifier,
        );
      },
    );
  },
);

/* =========================================================
   Allowed request tests
========================================================= */

describe(
  "allowed checkout requests",
  () => {
    it(
      "returns the stricter remaining allowance",
      async () => {
        const subjectReset =
          Date.now() +
          30_000;

        const ipReset =
          Date.now() +
          60_000;

        queueLimitResults(
          createLimitResult({
            success: true,
            limit: 6,
            remaining: 4,
            reset:
              subjectReset,
          }),

          createLimitResult({
            success: true,
            limit: 30,
            remaining: 20,
            reset:
              ipReset,
          }),
        );

        const {
          checkOrderCreationRateLimit,
        } =
          await loadRateLimitModule();

        const result =
          await checkOrderCreationRateLimit({
            request:
              createRequest(),

            customerId:
              42,

            billingEmail:
              "customer@example.com",
          });

        expect(
          result,
        ).toEqual({
          allowed: true,
          degraded: false,

          blockedScope:
            null,

          /*
           * Subject limiter-এর remaining
           * allowance stricter।
           */
          limit: 6,
          remaining: 4,

          /*
           * Safest reset time হিসেবে later
           * reset value return হয়।
           */
          reset:
            ipReset,

          retryAfterSeconds:
            0,
        });
      },
    );

    it(
      "uses the status-specific limiter pair",
      async () => {
        queueLimitResults(
          createLimitResult({
            limit: 30,
            remaining: 25,
          }),

          createLimitResult({
            limit: 120,
            remaining: 100,
          }),
        );

        const {
          checkOrderStatusRateLimit,
        } =
          await loadRateLimitModule();

        const result =
          await checkOrderStatusRateLimit({
            request:
              createRequest(),

            customerId:
              42,

            billingEmail:
              "customer@example.com",
          });

        expect(
          result.allowed,
        ).toBe(
          true,
        );

        expect(
          ratelimitBridge
            .instances[0]
            ?.limit,
        ).not.toHaveBeenCalled();

        expect(
          ratelimitBridge
            .instances[1]
            ?.limit,
        ).not.toHaveBeenCalled();

        expect(
          ratelimitBridge
            .instances[2]
            ?.limit,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          ratelimitBridge
            .instances[3]
            ?.limit,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );
  },
);

/* =========================================================
   Blocked request tests
========================================================= */

describe(
  "blocked checkout requests",
  () => {
    it(
      "blocks the subject scope and calculates Retry-After",
      async () => {
        vi.useFakeTimers();

        vi.setSystemTime(
          new Date(
            "2026-07-19T12:00:00.000Z",
          ),
        );

        const reset =
          Date.now() +
          4_001;

        queueLimitResults(
          createLimitResult({
            success: false,
            limit: 6,
            remaining: 0,
            reset,
          }),

          createLimitResult({
            success: true,
            limit: 30,
            remaining: 20,
            reset:
              Date.now() +
              2_000,
          }),
        );

        const {
          checkOrderCreationRateLimit,
          getCheckoutRateLimitHeaders,
        } =
          await loadRateLimitModule();

        const result =
          await checkOrderCreationRateLimit({
            request:
              createRequest(),

            customerId:
              42,

            billingEmail:
              "customer@example.com",
          });

        expect(
          result,
        ).toMatchObject({
          allowed: false,
          degraded: false,

          blockedScope:
            "subject",

          limit: 6,
          remaining: 0,
          reset,

          retryAfterSeconds:
            5,
        });

        expect(
          getCheckoutRateLimitHeaders(
            result,
          ),
        ).toEqual({
          "X-RateLimit-Degraded":
            "false",

          "RateLimit-Limit":
            "6",

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
            "5",
        });
      },
    );

    it(
      "blocks the IP scope when its allowance is exhausted",
      async () => {
        vi.useFakeTimers();

        vi.setSystemTime(
          new Date(
            "2026-07-19T12:00:00.000Z",
          ),
        );

        const ipReset =
          Date.now() +
          15_000;

        queueLimitResults(
          createLimitResult({
            success: true,
            limit: 6,
            remaining: 3,
          }),

          createLimitResult({
            success: false,
            limit: 30,
            remaining: 0,
            reset:
              ipReset,
          }),
        );

        const {
          checkOrderCreationRateLimit,
        } =
          await loadRateLimitModule();

        const result =
          await checkOrderCreationRateLimit({
            request:
              createRequest(),

            customerId:
              42,

            billingEmail:
              "customer@example.com",
          });

        expect(
          result,
        ).toMatchObject({
          allowed: false,

          blockedScope:
            "ip",

          limit: 30,
          remaining: 0,

          retryAfterSeconds:
            15,
        });
      },
    );

    it(
      "uses the later reset when both scopes are blocked",
      async () => {
        vi.useFakeTimers();

        vi.setSystemTime(
          new Date(
            "2026-07-19T12:00:00.000Z",
          ),
        );

        const subjectReset =
          Date.now() +
          10_000;

        const ipReset =
          Date.now() +
          20_000;

        queueLimitResults(
          createLimitResult({
            success: false,
            limit: 6,
            remaining: 0,
            reset:
              subjectReset,
          }),

          createLimitResult({
            success: false,
            limit: 30,
            remaining: 0,
            reset:
              ipReset,
          }),
        );

        const {
          checkOrderCreationRateLimit,
        } =
          await loadRateLimitModule();

        const result =
          await checkOrderCreationRateLimit({
            request:
              createRequest(),

            customerId:
              42,

            billingEmail:
              "customer@example.com",
          });

        expect(
          result.blockedScope,
        ).toBe(
          "ip",
        );

        expect(
          result.reset,
        ).toBe(
          ipReset,
        );

        expect(
          result.retryAfterSeconds,
        ).toBe(
          20,
        );
      },
    );
  },
);

/* =========================================================
   Degraded and fail-open tests
========================================================= */

describe(
  "rate-limit degraded mode",
  () => {
    it(
      "marks timeout results as degraded but allows the request",
      async () => {
        queueLimitResults(
          createLimitResult({
            success: true,
            limit: 6,
            remaining: 5,
            reason:
              "timeout",
          }),

          createLimitResult({
            success: true,
            limit: 30,
            remaining: 29,
            reason:
              "success",
          }),
        );

        const {
          checkOrderCreationRateLimit,
          getCheckoutRateLimitHeaders,
        } =
          await loadRateLimitModule();

        const result =
          await checkOrderCreationRateLimit({
            request:
              createRequest(),

            customerId:
              42,

            billingEmail:
              "customer@example.com",
          });

        expect(
          result.allowed,
        ).toBe(
          true,
        );

        expect(
          result.degraded,
        ).toBe(
          true,
        );

        /*
         * Degraded mode-এ inaccurate limit
         * metadata প্রকাশ করা হবে না।
         */
        expect(
          getCheckoutRateLimitHeaders(
            result,
          ),
        ).toEqual({
          "X-RateLimit-Degraded":
            "true",
        });
      },
    );

    it(
      "fails open when the rate-limit service throws",
      async () => {
        vi.useFakeTimers();

        vi.setSystemTime(
          new Date(
            "2026-07-19T12:00:00.000Z",
          ),
        );

        const consoleErrorSpy =
          vi
            .spyOn(
              console,
              "error",
            )
            .mockImplementation(
              () => undefined,
            );

        queueLimitResults(
          new Error(
            "Redis is unavailable.",
          ),

          createLimitResult(),
        );

        const {
          checkOrderCreationRateLimit,
          getCheckoutRateLimitHeaders,
        } =
          await loadRateLimitModule();

        const result =
          await checkOrderCreationRateLimit({
            request:
              createRequest(),

            customerId:
              42,

            billingEmail:
              "customer@example.com",
          });

        expect(
          result,
        ).toEqual({
          allowed: true,
          degraded: true,

          blockedScope:
            null,

          limit: 0,
          remaining: 0,

          reset:
            Date.now(),

          retryAfterSeconds:
            0,
        });

        expect(
          getCheckoutRateLimitHeaders(
            result,
          ),
        ).toEqual({
          "X-RateLimit-Degraded":
            "true",
        });

        expect(
          consoleErrorSpy,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          String(
            consoleErrorSpy
              .mock
              .calls[0]?.[0] ??
              "",
          ),
        ).toContain(
          "Checkout rate-limit check failed",
        );
      },
    );
  },
);