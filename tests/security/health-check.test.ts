import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  calculateOverallHealthStatus,
  createHealthCheckSummary,
  HealthCheckError,
  runDependencyHealthCheck,
  type DependencyHealthResult,
  type HealthDependencyName,
  type HealthStatus,
} from "@/lib/health-check";

/* =========================================================
   Shared helpers
========================================================= */

function createDependencyResult({
  name = "redis",
  status = "healthy",
  critical = true,
  latencyMs = 10,
  code,
  message = "Test dependency result.",
}: {
  name?: HealthDependencyName;
  status?: HealthStatus;
  critical?: boolean;
  latencyMs?: number;
  code?: string;
  message?: string;
} = {}): DependencyHealthResult {
  return {
    name,
    status,
    critical,
    latencyMs,

    checkedAt:
      "2026-07-19T12:00:00.000Z",

    code,
    message,
  };
}

/* =========================================================
   Test environment
========================================================= */

beforeEach(() => {
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

/* =========================================================
   Dependency runner success tests
========================================================= */

describe(
  "runDependencyHealthCheck success handling",
  () => {
    it(
      "returns a healthy dependency result",
      async () => {
        const result =
          await runDependencyHealthCheck({
            name: "redis",
            critical: true,

            check:
              async (
                signal,
              ) => {
                expect(
                  signal.aborted,
                ).toBe(false);

                return {
                  status:
                    "healthy",

                  code:
                    "redis_available",

                  message:
                    "Redis is available.",
                };
              },
          });

        expect(
          result,
        ).toMatchObject({
          name:
            "redis",

          status:
            "healthy",

          critical:
            true,

          code:
            "redis_available",

          message:
            "Redis is available.",
        });

        expect(
          result.checkedAt,
        ).toMatch(
          /^\d{4}-\d{2}-\d{2}T/,
        );

        expect(
          result.latencyMs,
        ).toBeGreaterThanOrEqual(
          0,
        );
      },
    );

    it(
      "uses healthy status and a default message when omitted",
      async () => {
        const result =
          await runDependencyHealthCheck({
            name:
              "application",

            critical:
              true,

            check:
              async () => ({}),
          });

        expect(
          result,
        ).toMatchObject({
          name:
            "application",

          status:
            "healthy",

          critical:
            true,

          message:
            "Dependency is available.",
        });

        expect(
          result.code,
        ).toBeUndefined();
      },
    );

    it(
      "normalizes whitespace in public dependency messages",
      async () => {
        const result =
          await runDependencyHealthCheck({
            name:
              "woocommerce",

            critical:
              true,

            check:
              async () => ({
                status:
                  "healthy",

                code:
                  "woocommerce_available",

                message:
                  "  WooCommerce\n\t is   available.  ",
              }),
          });

        expect(
          result.message,
        ).toBe(
          "WooCommerce is available.",
        );
      },
    );

    it(
      "truncates oversized public dependency messages",
      async () => {
        const result =
          await runDependencyHealthCheck({
            name:
              "application",

            critical:
              false,

            check:
              async () => ({
                status:
                  "degraded",

                code:
                  "application_warning",

                message:
                  "x".repeat(500),
              }),
          });

        expect(
          result.status,
        ).toBe(
          "degraded",
        );

        expect(
          result.message,
        ).toHaveLength(
          240,
        );

        expect(
          result.message,
        ).toBe(
          "x".repeat(240),
        );
      },
    );
  },
);

/* =========================================================
   Dependency runner failure tests
========================================================= */

describe(
  "runDependencyHealthCheck failure handling",
  () => {
    it(
      "returns a safe typed failure message",
      async () => {
        const result =
          await runDependencyHealthCheck({
            name:
              "woocommerce",

            critical:
              true,

            check:
              async () => {
                throw new HealthCheckError({
                  message:
                    "Provider returned private internal details.",

                  code:
                    "woocommerce_unavailable",

                  publicMessage:
                    "WooCommerce is unavailable.",
                });
              },
          });

        expect(
          result,
        ).toMatchObject({
          name:
            "woocommerce",

          status:
            "unhealthy",

          critical:
            true,

          code:
            "woocommerce_unavailable",

          message:
            "WooCommerce is unavailable.",
        });

        expect(
          result.message,
        ).not.toContain(
          "private internal details",
        );
      },
    );

    it(
      "sanitizes a typed public failure message",
      async () => {
        const result =
          await runDependencyHealthCheck({
            name:
              "redis",

            critical:
              true,

            check:
              async () => {
                throw new HealthCheckError({
                  message:
                    "Private Redis failure details.",

                  code:
                    "redis_unavailable",

                  publicMessage:
                    "  Redis\n\t is   unavailable.  ",
                });
              },
          });

        expect(
          result,
        ).toMatchObject({
          status:
            "unhealthy",

          code:
            "redis_unavailable",

          message:
            "Redis is unavailable.",
        });
      },
    );

    it(
      "does not expose unknown error messages",
      async () => {
        const result =
          await runDependencyHealthCheck({
            name:
              "redis",

            critical:
              true,

            check:
              async () => {
                throw new Error(
                  "Redis token secret-token-123 was rejected.",
                );
              },
          });

        expect(
          result,
        ).toMatchObject({
          name:
            "redis",

          status:
            "unhealthy",

          code:
            "health_check_failed",

          message:
            "Dependency check failed.",
        });

        expect(
          result.message,
        ).not.toContain(
          "secret-token-123",
        );

        expect(
          JSON.stringify(
            result,
          ),
        ).not.toContain(
          "Redis token",
        );
      },
    );

    it(
      "times out and aborts a slow dependency check",
      async () => {
        vi.useFakeTimers();

        let receivedSignal:
          AbortSignal | null =
          null;

        const resultPromise =
          runDependencyHealthCheck({
            name:
              "redis",

            critical:
              true,

            timeoutMs:
              100,

            check:
              async (
                signal,
              ) => {
                receivedSignal =
                  signal;

                return new Promise(
                  () => undefined,
                );
              },
          });

        await vi.advanceTimersByTimeAsync(
          101,
        );

        const result =
          await resultPromise;

        expect(
          result,
        ).toMatchObject({
          name:
            "redis",

          status:
            "unhealthy",

          critical:
            true,

          code:
            "health_check_timeout",

          message:
            "Dependency check timed out.",
        });

        expect(
          receivedSignal,
        ).not.toBeNull();

        expect(
          receivedSignal
            ?.aborted,
        ).toBe(true);
      },
    );

    it(
      "applies the minimum timeout boundary",
      async () => {
        vi.useFakeTimers();

        const resultPromise =
          runDependencyHealthCheck({
            name:
              "woocommerce",

            critical:
              true,

            /*
             * Production implementation এটিকে
             * minimum 100ms হিসেবে normalize করবে।
             */
            timeoutMs:
              1,

            check:
              async () =>
                new Promise(
                  () => undefined,
                ),
          });

        await vi.advanceTimersByTimeAsync(
          99,
        );

        let settled =
          false;

        void resultPromise.then(
          () => {
            settled = true;
          },
        );

        await Promise.resolve();

        expect(
          settled,
        ).toBe(false);

        await vi.advanceTimersByTimeAsync(
          1,
        );

        const result =
          await resultPromise;

        expect(
          result,
        ).toMatchObject({
          status:
            "unhealthy",

          code:
            "health_check_timeout",
        });
      },
    );
  },
);

/* =========================================================
   Overall status tests
========================================================= */

describe(
  "calculateOverallHealthStatus",
  () => {
    it(
      "returns healthy when every dependency is healthy",
      () => {
        const result =
          calculateOverallHealthStatus([
            createDependencyResult({
              name:
                "application",
            }),

            createDependencyResult({
              name:
                "redis",
            }),

            createDependencyResult({
              name:
                "woocommerce",
            }),
          ]);

        expect(
          result,
        ).toBe(
          "healthy",
        );
      },
    );

    it(
      "returns degraded for a non-critical unhealthy dependency",
      () => {
        const result =
          calculateOverallHealthStatus([
            createDependencyResult({
              name:
                "application",
            }),

            createDependencyResult({
              name:
                "redis",
            }),

            createDependencyResult({
              name:
                "woocommerce",

              status:
                "unhealthy",

              critical:
                false,
            }),
          ]);

        expect(
          result,
        ).toBe(
          "degraded",
        );
      },
    );

    it(
      "returns degraded when a critical dependency is degraded",
      () => {
        const result =
          calculateOverallHealthStatus([
            createDependencyResult({
              name:
                "application",
            }),

            createDependencyResult({
              name:
                "redis",

              status:
                "degraded",

              critical:
                true,
            }),
          ]);

        /*
         * শুধু critical + unhealthy combination
         * overall unhealthy তৈরি করে।
         */
        expect(
          result,
        ).toBe(
          "degraded",
        );
      },
    );

    it(
      "returns unhealthy for a critical unhealthy dependency",
      () => {
        const result =
          calculateOverallHealthStatus([
            createDependencyResult({
              name:
                "application",
            }),

            createDependencyResult({
              name:
                "redis",

              status:
                "unhealthy",

              critical:
                true,
            }),

            createDependencyResult({
              name:
                "woocommerce",
            }),
          ]);

        expect(
          result,
        ).toBe(
          "unhealthy",
        );
      },
    );

    it(
      "returns healthy for an empty dependency collection",
      () => {
        expect(
          calculateOverallHealthStatus(
            [],
          ),
        ).toBe(
          "healthy",
        );
      },
    );
  },
);

/* =========================================================
   Health summary tests
========================================================= */

describe(
  "createHealthCheckSummary",
  () => {
    it(
      "creates a safe deployment summary",
      () => {
        const dependencies = [
          createDependencyResult({
            name:
              "application",

            code:
              "application_available",

            message:
              "Application runtime is available.",
          }),

          createDependencyResult({
            name:
              "redis",

            code:
              "redis_available",

            message:
              "Redis is available.",
          }),
        ];

        const summary =
          createHealthCheckSummary({
            dependencies,

            startedAt:
              performance.now(),
          });

        expect(
          summary,
        ).toMatchObject({
          status:
            "healthy",

          environment:
            "test",

          /*
           * Full release string নয়,
           * প্রথম 12 characters।
           */
          release:
            "abcdef123456",

          dependencies,
        });

        expect(
          summary.checkedAt,
        ).toMatch(
          /^\d{4}-\d{2}-\d{2}T/,
        );

        expect(
          summary.durationMs,
        ).toBeGreaterThanOrEqual(
          0,
        );
      },
    );

    it(
      "prefers Vercel environment over NODE_ENV",
      () => {
        vi.stubEnv(
          "VERCEL_ENV",
          "preview",
        );

        vi.stubEnv(
          "NODE_ENV",
          "production",
        );

        const summary =
          createHealthCheckSummary({
            dependencies: [],

            startedAt:
              performance.now(),
          });

        expect(
          summary.environment,
        ).toBe(
          "preview",
        );
      },
    );

    it(
      "uses the Vercel commit SHA when APP_RELEASE is empty",
      () => {
        vi.stubEnv(
          "APP_RELEASE",
          "",
        );

        vi.stubEnv(
          "VERCEL_GIT_COMMIT_SHA",
          "1234567890abcdef1234567890",
        );

        const summary =
          createHealthCheckSummary({
            dependencies: [],

            startedAt:
              performance.now(),
          });

        expect(
          summary.release,
        ).toBe(
          "1234567890ab",
        );
      },
    );

    it(
      "returns null when no release identifier exists",
      () => {
        vi.stubEnv(
          "APP_RELEASE",
          "",
        );

        vi.stubEnv(
          "VERCEL_GIT_COMMIT_SHA",
          "",
        );

        const summary =
          createHealthCheckSummary({
            dependencies: [],

            startedAt:
              performance.now(),
          });

        expect(
          summary.release,
        ).toBeNull();
      },
    );

    it(
      "reflects an unhealthy critical dependency in the summary",
      () => {
        const dependencies = [
          createDependencyResult({
            name:
              "application",
          }),

          createDependencyResult({
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
        ];

        const summary =
          createHealthCheckSummary({
            dependencies,

            startedAt:
              performance.now(),
          });

        expect(
          summary.status,
        ).toBe(
          "unhealthy",
        );

        expect(
          summary.dependencies,
        ).toEqual(
          dependencies,
        );
      },
    );
  },
);