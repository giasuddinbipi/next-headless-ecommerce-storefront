/* =========================================================
   Public types
========================================================= */

export type BrowserSecurityHeader =
  Readonly<{
    key:
      string;

    value:
      string;
  }>;

export type BrowserSecurityHeaderOptions =
  Readonly<{
    isProduction?:
      boolean;
  }>;

/* =========================================================
   Constants
========================================================= */

const BASE_SECURITY_HEADERS:
  readonly BrowserSecurityHeader[] =
  Object.freeze([
    Object.freeze({
      key:
        "X-Content-Type-Options",

      value:
        "nosniff",
    }),

    Object.freeze({
      key:
        "X-Frame-Options",

      value:
        "DENY",
    }),

    Object.freeze({
      key:
        "Referrer-Policy",

      value:
        "strict-origin-when-cross-origin",
    }),

    Object.freeze({
      key:
        "Permissions-Policy",

      value:
        [
          "camera=()",
          "microphone=()",
          "geolocation=()",
          "usb=()",
          "browsing-topics=()",
        ].join(
          ", ",
        ),
    }),

    /*
     * OAuth or payment popups remain usable while
     * cross-origin opener isolation is strengthened.
     */
    Object.freeze({
      key:
        "Cross-Origin-Opener-Policy",

      value:
        "same-origin-allow-popups",
    }),

    Object.freeze({
      key:
        "X-DNS-Prefetch-Control",

      value:
        "off",
    }),

    Object.freeze({
      key:
        "X-Permitted-Cross-Domain-Policies",

      value:
        "none",
    }),
  ]);

const PRODUCTION_SECURITY_HEADERS:
  readonly BrowserSecurityHeader[] =
  Object.freeze([
    Object.freeze({
      key:
        "Strict-Transport-Security",

      value:
        [
          "max-age=63072000",
          "includeSubDomains",
          "preload",
        ].join(
          "; ",
        ),
    }),
  ]);

/* =========================================================
   Internal helpers
========================================================= */

function resolveProductionMode(
  value:
    boolean | undefined,
): boolean {
  if (
    typeof value ===
    "boolean"
  ) {
    return value;
  }

  return (
    process.env.NODE_ENV ===
    "production"
  );
}

function cloneHeader(
  header:
    BrowserSecurityHeader,
): BrowserSecurityHeader {
  /*
   * Each caller receives an independent object so
   * configuration mutation cannot affect the source policy.
   */
  return {
    key:
      header.key,

    value:
      header.value,
  };
}

/* =========================================================
   Public header policy
========================================================= */

export function getBrowserSecurityHeaders(
  options:
    BrowserSecurityHeaderOptions = {},
): BrowserSecurityHeader[] {
  const headers = [
    ...BASE_SECURITY_HEADERS,

    ...(
      resolveProductionMode(
        options.isProduction,
      )
        ? PRODUCTION_SECURITY_HEADERS
        : []
    ),
  ];

  return headers.map(
    cloneHeader,
  );
}