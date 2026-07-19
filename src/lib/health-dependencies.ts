import "server-only";

import {
  getRedisClient,
} from "@/lib/redis";

import {
  HealthCheckError,
  runDependencyHealthCheck,
  type DependencyCheckResponse,
  type DependencyHealthResult,
} from "@/lib/health-check";

/* =========================================================
   WooCommerce configuration
========================================================= */

type WooCommerceHealthConfig = {
  storeUrl:
    string;

  consumerKey:
    string;

  consumerSecret:
    string;
};

function readFirstEnvironmentValue(
  names:
    string[],
): string {
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

  return "";
}

function normalizeStoreUrl(
  value:
    string,
): string {
  return value
    .trim()
    .replace(
      /\/+$/g,
      "",
    );
}

function getWooCommerceHealthConfig():
  WooCommerceHealthConfig {
  /*
   * Existing storefronts commonly use
   * different WooCommerce environment names.
   *
   * The first configured value is used.
   */
  const storeUrl =
    normalizeStoreUrl(
      readFirstEnvironmentValue([
        "WOOCOMMERCE_URL",
        "WOOCOMMERCE_STORE_URL",
        "WC_STORE_URL",
        "WORDPRESS_URL",
        "NEXT_PUBLIC_WORDPRESS_URL",
        "NEXT_PUBLIC_WOOCOMMERCE_URL",
      ]),
    );

  const consumerKey =
    readFirstEnvironmentValue([
      "WOOCOMMERCE_CONSUMER_KEY",
      "WC_CONSUMER_KEY",
    ]);

  const consumerSecret =
    readFirstEnvironmentValue([
      "WOOCOMMERCE_CONSUMER_SECRET",
      "WC_CONSUMER_SECRET",
    ]);

  if (
    !storeUrl ||
    !consumerKey ||
    !consumerSecret
  ) {
    throw new HealthCheckError({
      message:
        "WooCommerce health-check configuration is incomplete.",

      code:
        "woocommerce_configuration_missing",

      publicMessage:
        "WooCommerce configuration is unavailable.",
    });
  }

  let parsedUrl:
    URL;

  try {
    parsedUrl =
      new URL(
        storeUrl,
      );
  } catch {
    throw new HealthCheckError({
      message:
        "WooCommerce store URL is invalid.",

      code:
        "woocommerce_configuration_invalid",

      publicMessage:
        "WooCommerce configuration is invalid.",
    });
  }

  if (
    parsedUrl.protocol !==
      "https:" &&
    parsedUrl.protocol !==
      "http:"
  ) {
    throw new HealthCheckError({
      message:
        "WooCommerce store URL protocol is unsupported.",

      code:
        "woocommerce_configuration_invalid",

      publicMessage:
        "WooCommerce configuration is invalid.",
    });
  }

  return {
    storeUrl:
      parsedUrl
        .toString()
        .replace(
          /\/+$/g,
          "",
        ),

    consumerKey,
    consumerSecret,
  };
}

function createWooCommerceAuthorization(
  consumerKey:
    string,
  consumerSecret:
    string,
): string {
  const credentials =
    Buffer.from(
      `${consumerKey}:${consumerSecret}`,
      "utf8",
    ).toString(
      "base64",
    );

  return `Basic ${credentials}`;
}

/* =========================================================
   Application probe
========================================================= */

export async function checkApplicationDependency():
  Promise<
    DependencyCheckResponse
  > {
  return {
    status:
      "healthy",

    code:
      "application_available",

    message:
      "Application runtime is available.",
  };
}

/* =========================================================
   Redis probe
========================================================= */

export async function checkRedisDependency(
  _signal:
    AbortSignal,
): Promise<
  DependencyCheckResponse
> {
  let redis:
    ReturnType<
      typeof getRedisClient
    >;

  try {
    redis =
      getRedisClient();
  } catch {
    throw new HealthCheckError({
      message:
        "Redis client configuration is unavailable.",

      code:
        "redis_configuration_missing",

      publicMessage:
        "Redis configuration is unavailable.",
    });
  }

  let response:
    unknown;

  try {
    response =
      await redis.ping();
  } catch {
    throw new HealthCheckError({
      message:
        "Redis ping request failed.",

      code:
        "redis_unavailable",

      publicMessage:
        "Redis is unavailable.",
    });
  }

  const normalizedResponse =
    String(
      response ?? "",
    )
      .trim()
      .toUpperCase();

  if (
    normalizedResponse !==
    "PONG"
  ) {
    throw new HealthCheckError({
      message:
        "Redis returned an unexpected ping response.",

      code:
        "redis_invalid_response",

      publicMessage:
        "Redis returned an invalid response.",
    });
  }

  return {
    status:
      "healthy",

    code:
      "redis_available",

    message:
      "Redis is available.",
  };
}

/* =========================================================
   WooCommerce probe
========================================================= */

export async function checkWooCommerceDependency(
  signal:
    AbortSignal,
): Promise<
  DependencyCheckResponse
> {
  const config =
    getWooCommerceHealthConfig();

  const endpoint =
    new URL(
      "/wp-json/wc/v3/products",
      config.storeUrl,
    );

  /*
   * Minimal read-only request.
   *
   * Only one product ID is requested to keep
   * response size and provider load small.
   */
  endpoint.searchParams.set(
    "per_page",
    "1",
  );

  endpoint.searchParams.set(
    "_fields",
    "id",
  );

  let response:
    Response;

  try {
    response =
      await fetch(
        endpoint,
        {
          method:
            "GET",

          headers: {
            Accept:
              "application/json",

            Authorization:
              createWooCommerceAuthorization(
                config.consumerKey,
                config.consumerSecret,
              ),

            "User-Agent":
              "Storefront-Health-Check/1.0",
          },

          cache:
            "no-store",

          signal,
        },
      );
  } catch (
    error
  ) {
    /*
     * Outer timeout runner AbortController
     * দিয়ে request বাতিল করতে পারে।
     */
    if (
      error instanceof
        DOMException &&
      error.name ===
        "AbortError"
    ) {
      throw error;
    }

    throw new HealthCheckError({
      message:
        "WooCommerce network request failed.",

      code:
        "woocommerce_unavailable",

      publicMessage:
        "WooCommerce is unavailable.",
    });
  }

  if (
    response.ok
  ) {
    return {
      status:
        "healthy",

      code:
        "woocommerce_available",

      message:
        "WooCommerce is available.",
    };
  }

  if (
    response.status ===
      401 ||
    response.status ===
      403
  ) {
    throw new HealthCheckError({
      message:
        `WooCommerce credentials were rejected with HTTP ${response.status}.`,

      code:
        "woocommerce_authentication_failed",

      publicMessage:
        "WooCommerce authentication failed.",
    });
  }

  if (
    response.status ===
      404
  ) {
    throw new HealthCheckError({
      message:
        "WooCommerce REST API endpoint was not found.",

      code:
        "woocommerce_api_not_found",

      publicMessage:
        "WooCommerce REST API is unavailable.",
    });
  }

  if (
    response.status >=
    500
  ) {
    throw new HealthCheckError({
      message:
        `WooCommerce returned HTTP ${response.status}.`,

      code:
        "woocommerce_server_error",

      publicMessage:
        "WooCommerce is temporarily unavailable.",
    });
  }

  throw new HealthCheckError({
    message:
      `WooCommerce health probe returned HTTP ${response.status}.`,

    code:
      "woocommerce_probe_failed",

    publicMessage:
      "WooCommerce health check failed.",
  });
}

/* =========================================================
   Combined checkout dependency probes
========================================================= */

export async function runCheckoutDependencyHealthChecks():
  Promise<
    DependencyHealthResult[]
  > {
  const results =
    await Promise.all([
      runDependencyHealthCheck({
        name:
          "application",

        critical:
          true,

        timeoutMs:
          500,

        check:
          async () =>
            checkApplicationDependency(),
      }),

      runDependencyHealthCheck({
        name:
          "redis",

        critical:
          true,

        timeoutMs:
          1_500,

        check:
          checkRedisDependency,
      }),

      runDependencyHealthCheck({
        name:
          "woocommerce",

        critical:
          true,

        timeoutMs:
          8_000,

        check:
          checkWooCommerceDependency,
      }),
    ]);

  return results;
}