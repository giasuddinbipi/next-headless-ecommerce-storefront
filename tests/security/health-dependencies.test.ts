import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/* =========================================================
   Redis mock bridge
========================================================= */

const dependencyBridge =
  vi.hoisted(() => ({
    redisClient: {
      ping:
        vi.fn(),
    },
  }));

vi.mock(
  "@/lib/redis",
  () => ({
    getRedisClient:
      () =>
        dependencyBridge
          .redisClient,
  }),
);

/*
 * Mock declaration-এর পরে imports।
 */
import {
  checkApplicationDependency,
  checkRedisDependency,
  checkWooCommerceDependency,
  runCheckoutDependencyHealthChecks,
} from "@/lib/health-dependencies";

import {
  HealthCheckError,
} from "@/lib/health-check";

/* =========================================================
   Shared mocks and helpers
========================================================= */

const fetchMock =
  vi.fn();

function createSignal():
  AbortSignal {
  return new AbortController()
    .signal;
}

function createJsonResponse(
  body:
    unknown,
  status =
    200,
): Response {
  return new Response(
    JSON.stringify(
      body,
    ),
    {
      status,

      headers: {
        "Content-Type":
          "application/json",
      },
    },
  );
}

beforeEach(() => {
  dependencyBridge
    .redisClient
    .ping
    .mockReset()
    .mockResolvedValue(
      "PONG",
    );

  fetchMock
    .mockReset()
    .mockResolvedValue(
      createJsonResponse(
        [
          {
            id:
              100,
          },
        ],
        200,
      ),
    );

  vi.stubGlobal(
    "fetch",
    fetchMock,
  );

  /*
   * Test-only WooCommerce values।
   */
  vi.stubEnv(
    "WOOCOMMERCE_URL",
    "https://shop.example.com",
  );

  vi.stubEnv(
    "WOOCOMMERCE_CONSUMER_KEY",
    "ck_test_consumer_key",
  );

  vi.stubEnv(
    "WOOCOMMERCE_CONSUMER_SECRET",
    "cs_test_consumer_secret",
  );
});

/* =========================================================
   Application probe tests
========================================================= */

describe(
  "application dependency probe",
  () => {
    it(
      "reports the application runtime as healthy",
      async () => {
        const result =
          await checkApplicationDependency();

        expect(
          result,
        ).toEqual({
          status:
            "healthy",

          code:
            "application_available",

          message:
            "Application runtime is available.",
        });
      },
    );
  },
);

/* =========================================================
   Redis probe tests
========================================================= */

describe(
  "Redis dependency probe",
  () => {
    it(
      "reports Redis as healthy after PONG",
      async () => {
        const result =
          await checkRedisDependency(
            createSignal(),
          );

        expect(
          dependencyBridge
            .redisClient
            .ping,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          result,
        ).toEqual({
          status:
            "healthy",

          code:
            "redis_available",

          message:
            "Redis is available.",
        });
      },
    );

    it(
      "rejects an unexpected Redis response",
      async () => {
        dependencyBridge
          .redisClient
          .ping
          .mockResolvedValue(
            "UNKNOWN",
          );

        await expect(
          checkRedisDependency(
            createSignal(),
          ),
        ).rejects.toMatchObject({
          name:
            "HealthCheckError",

          code:
            "redis_invalid_response",

          publicMessage:
            "Redis returned an invalid response.",
        });
      },
    );

    it(
      "returns a safe error when Redis is unavailable",
      async () => {
        dependencyBridge
          .redisClient
          .ping
          .mockRejectedValue(
            new Error(
              "Upstash token private-token was rejected.",
            ),
          );

        await expect(
          checkRedisDependency(
            createSignal(),
          ),
        ).rejects.toMatchObject({
          name:
            "HealthCheckError",

          code:
            "redis_unavailable",

          publicMessage:
            "Redis is unavailable.",
        });
      },
    );
  },
);

/* =========================================================
   WooCommerce probe tests
========================================================= */

describe(
  "WooCommerce dependency probe",
  () => {
    it(
      "performs a minimal authenticated read-only request",
      async () => {
        const signal =
          createSignal();

        const result =
          await checkWooCommerceDependency(
            signal,
          );

        expect(
          result,
        ).toEqual({
          status:
            "healthy",

          code:
            "woocommerce_available",

          message:
            "WooCommerce is available.",
        });

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        const requestUrl =
          fetchMock.mock
            .calls[0]?.[0];

        const requestOptions =
          fetchMock.mock
            .calls[0]?.[1] as
            | RequestInit
            | undefined;

        expect(
          String(
            requestUrl,
          ),
        ).toContain(
          "/wp-json/wc/v3/products",
        );

        expect(
          String(
            requestUrl,
          ),
        ).toContain(
          "per_page=1",
        );

        expect(
          String(
            requestUrl,
          ),
        ).toContain(
          "_fields=id",
        );

        expect(
          requestOptions,
        ).toMatchObject({
          method:
            "GET",

          cache:
            "no-store",

          signal,
        });

        const headers =
          new Headers(
            requestOptions
              ?.headers,
          );

        expect(
          headers.get(
            "accept",
          ),
        ).toBe(
          "application/json",
        );

        expect(
          headers.get(
            "authorization",
          ),
        ).toMatch(
          /^Basic\s+[A-Za-z0-9+/=]+$/,
        );

        /*
         * Credentials URL query string-এ
         * পাঠানো হচ্ছে না।
         */
        expect(
          String(
            requestUrl,
          ),
        ).not.toContain(
          "ck_test_consumer_key",
        );

        expect(
          String(
            requestUrl,
          ),
        ).not.toContain(
          "cs_test_consumer_secret",
        );
      },
    );

    it(
      "reports rejected WooCommerce credentials safely",
      async () => {
        fetchMock
          .mockResolvedValue(
            createJsonResponse(
              {
                code:
                  "woocommerce_rest_cannot_view",
              },
              401,
            ),
          );

        await expect(
          checkWooCommerceDependency(
            createSignal(),
          ),
        ).rejects.toMatchObject({
          name:
            "HealthCheckError",

          code:
            "woocommerce_authentication_failed",

          publicMessage:
            "WooCommerce authentication failed.",
        });
      },
    );

    it(
      "reports a missing REST API endpoint",
      async () => {
        fetchMock
          .mockResolvedValue(
            createJsonResponse(
              {
                code:
                  "rest_no_route",
              },
              404,
            ),
          );

        await expect(
          checkWooCommerceDependency(
            createSignal(),
          ),
        ).rejects.toMatchObject({
          name:
            "HealthCheckError",

          code:
            "woocommerce_api_not_found",

          publicMessage:
            "WooCommerce REST API is unavailable.",
        });
      },
    );

    it(
      "reports WooCommerce server failures safely",
      async () => {
        fetchMock
          .mockResolvedValue(
            createJsonResponse(
              {
                message:
                  "Private provider error details.",
              },
              503,
            ),
          );

        await expect(
          checkWooCommerceDependency(
            createSignal(),
          ),
        ).rejects.toMatchObject({
          name:
            "HealthCheckError",

          code:
            "woocommerce_server_error",

          publicMessage:
            "WooCommerce is temporarily unavailable.",
        });
      },
    );

    it(
      "does not expose network error details",
      async () => {
        fetchMock
          .mockRejectedValue(
            new Error(
              "Connection failed for secret internal hostname.",
            ),
          );

        await expect(
          checkWooCommerceDependency(
            createSignal(),
          ),
        ).rejects.toMatchObject({
          name:
            "HealthCheckError",

          code:
            "woocommerce_unavailable",

          publicMessage:
            "WooCommerce is unavailable.",
        });
      },
    );

    it(
      "fails safely when WooCommerce configuration is missing",
      async () => {
        vi.stubEnv(
          "WOOCOMMERCE_URL",
          "",
        );

        vi.stubEnv(
          "WOOCOMMERCE_CONSUMER_KEY",
          "",
        );

        vi.stubEnv(
          "WOOCOMMERCE_CONSUMER_SECRET",
          "",
        );

        await expect(
          checkWooCommerceDependency(
            createSignal(),
          ),
        ).rejects.toMatchObject({
          name:
            "HealthCheckError",

          code:
            "woocommerce_configuration_missing",

          publicMessage:
            "WooCommerce configuration is unavailable.",
        });

        expect(
          fetchMock,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "throws typed HealthCheckError instances",
      async () => {
        fetchMock
          .mockResolvedValue(
            createJsonResponse(
              {},
              403,
            ),
          );

        try {
          await checkWooCommerceDependency(
            createSignal(),
          );

          throw new Error(
            "Expected the health probe to fail.",
          );
        } catch (
          error
        ) {
          expect(
            error,
          ).toBeInstanceOf(
            HealthCheckError,
          );
        }
      },
    );
  },
);

/* =========================================================
   Combined dependency tests
========================================================= */

describe(
  "checkout dependency health checks",
  () => {
    it(
      "runs application, Redis and WooCommerce checks",
      async () => {
        const results =
          await runCheckoutDependencyHealthChecks();

        expect(
          results,
        ).toHaveLength(
          3,
        );

        expect(
          results.map(
            (
              result,
            ) =>
              result.name,
          ),
        ).toEqual([
          "application",
          "redis",
          "woocommerce",
        ]);

        expect(
          results.every(
            (
              result,
            ) =>
              result.status ===
              "healthy",
          ),
        ).toBe(
          true,
        );

        expect(
          dependencyBridge
            .redisClient
            .ping,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );

    it(
      "marks the WooCommerce dependency unhealthy without throwing the summary",
      async () => {
        fetchMock
          .mockResolvedValue(
            createJsonResponse(
              {},
              503,
            ),
          );

        const results =
          await runCheckoutDependencyHealthChecks();

        const wooCommerceResult =
          results.find(
            (
              result,
            ) =>
              result.name ===
              "woocommerce",
          );

        expect(
          wooCommerceResult,
        ).toMatchObject({
          name:
            "woocommerce",

          status:
            "unhealthy",

          critical:
            true,

          code:
            "woocommerce_server_error",

          message:
            "WooCommerce is temporarily unavailable.",
        });
      },
    );
  },
);