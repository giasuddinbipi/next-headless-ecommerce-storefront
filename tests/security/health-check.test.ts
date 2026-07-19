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
} from "@/lib/health-check";

function createDependencyResult({
  name =
    "redis",

  status =
    "healthy",

  critical =
    true,
}: {
  name?:
    "application" |
    "redis" |
    "woocommerce";

  status?:
    "healthy" |
    "degraded" |
    "unhealthy";

  critical?:
    boolean;
} = {}): DependencyHealthResult {
  return {
    name,
    status,
    critical,

    latencyMs:
      10,

    checkedAt:
      "2026-07-19T12:00:00.000Z",

    message:
      "Test result.",
  };
}

beforeEach(() => {
  vi.stubEnv(
    "NODE_ENV",
    "test",
  );

  vi.stubEnv(
    "APP_RELEASE",
    "abcdef1234567890",
  );
});

describe(
  "runDependencyHealthCheck",
  () => {
    it(
      "returns a healthy dependency result",
      async () => {
        const result =
          await runDependencyHealthCheck({
            name:
              "redis",

            critical:
              true,

            check:
              async (
                signal,
              ) => {
                expect(
                  signal.aborted,
                ).toBe(
                  false,
                );

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
          result.latencyMs,
        ).toBeGreaterThanOrEqual(
          0,
        );
      },
    );

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
      },
    );

    it(
      "times out a slow dependency check",
      async () => {
        vi.useFakeTimers();

        const resultPromise =
          runDependencyHealthCheck({
            name:
              "redis",

            critical:
              true,

            timeoutMs:
              100,

            check:
              async () =>
                new Promise(
                  () => undefined,
                ),
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

          code:
            "health_check_timeout",

          message:
            "Dependency check timed out.",
        });
      },
    );
  },
);

describe(
  "calculateOverallHealthStatus",
  () => {
    it(
      "returns healthy when every dependency is healthy",
      () => {
        expect(
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
          ]),
        ).toBe(
          "healthy",
        );
      },
    );

    it(
      "returns degraded for a non-critical failure",
      () => {
        expect(
          calculateOverallHealthStatus([
            createDependencyResult(),

            createDependencyResult({
              name:
                "woocommerce",

              status:
                "unhealthy",

              critical:
                false,
            }),
          ]),
        ).toBe(
          "degraded",
        );
      },
    );

    it(
      "returns unhealthy for a critical failure",
      () => {
        expect(
          calculateOverallHealthStatus([
            createDependencyResult(),

            createDependencyResult({
              name:
                "woocommerce",

              status:
                "unhealthy",

              critical:
                true,
            }),
          ]),
        ).toBe(
          "unhealthy",
        );
      },
    );
  },
);

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
          }),

          createDependencyResult({
            name:
              "redis",
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
  },
);