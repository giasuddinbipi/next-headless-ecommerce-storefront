import {
  createCspNonce,
  type CspNonceFactory,
} from "./csp-nonce";

import {
  createStrictContentSecurityPolicy,
} from "./strict-content-security-policy";

/* =========================================================
   Types
========================================================= */

export type StrictCspRuntimeMode =
  | "disabled"
  | "report-only"
  | "enforce";

export type EnabledStrictCspRuntimeMode =
  Exclude<
    StrictCspRuntimeMode,
    "disabled"
  >;

export type StrictCspResponseHeaderName =
  | "Content-Security-Policy"
  | "Content-Security-Policy-Report-Only";

export type StrictCspResponseHeader =
  Readonly<{
    key:
      StrictCspResponseHeaderName;

    value:
      string;
  }>;

export type StrictCspRequestOptions =
  Readonly<{
    requestHeaders?:
      HeadersInit;

    mode?:
      string | null;

    isProduction?:
      boolean;

    randomUuid?:
      CspNonceFactory;

    commerceOrigin?:
      string;

    reportUri?:
      string | null;

    reportTo?:
      string | null;
  }>;

export type DisabledStrictCspRequestState =
  Readonly<{
    enabled:
      false;

    mode:
      "disabled";

    nonce:
      null;

    policy:
      null;

    requestHeaders:
      Headers;

    responseHeader:
      null;
  }>;

export type EnabledStrictCspRequestState =
  Readonly<{
    enabled:
      true;

    mode:
      EnabledStrictCspRuntimeMode;

    nonce:
      string;

    policy:
      string;

    requestHeaders:
      Headers;

    responseHeader:
      StrictCspResponseHeader;
  }>;

export type StrictCspRequestState =
  | DisabledStrictCspRequestState
  | EnabledStrictCspRequestState;

export type StrictCspRequestMatchOptions =
  Readonly<{
    pathname:
      string;

    headers?:
      HeadersInit;
  }>;

/* =========================================================
   Constants
========================================================= */

export const DEFAULT_STRICT_CSP_RUNTIME_MODE:
  StrictCspRuntimeMode =
  "disabled";

export const STRICT_CSP_NONCE_HEADER =
  "x-nonce";

export const STRICT_CSP_REQUEST_POLICY_HEADER =
  "Content-Security-Policy";

export const STRICT_CSP_REPORT_ONLY_HEADER =
  "Content-Security-Policy-Report-Only";

export const STRICT_CSP_ENFORCED_HEADER =
  "Content-Security-Policy";

/*
 * These paths do not render application HTML and therefore
 * do not need request-time nonce generation.
 */
const EXCLUDED_PATH_PREFIXES = [
  "/api",
  "/_next/static",
  "/_next/image",
  "/_next/data",
] as const;

const EXCLUDED_EXACT_PATHS =
  new Set([
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/manifest.webmanifest",
    "/site.webmanifest",
  ]);

const STATIC_FILE_EXTENSION_PATTERN =
  /\.(?:avif|bmp|css|csv|gif|ico|jpe?g|js|json|map|mjs|mp3|mp4|pdf|png|svg|txt|webm|webp|woff2?|xml)$/i;

/* =========================================================
   Runtime mode resolution
========================================================= */

export function resolveStrictCspRuntimeMode(
  value:
    string | null | undefined =
      process.env
        .STRICT_CSP_RUNTIME_MODE,
): StrictCspRuntimeMode {
  const normalized =
    (
      value ??
      DEFAULT_STRICT_CSP_RUNTIME_MODE
    )
      .trim()
      .toLowerCase();

  if (!normalized) {
    return DEFAULT_STRICT_CSP_RUNTIME_MODE;
  }

  if (
    normalized ===
      "disabled" ||
    normalized ===
      "report-only" ||
    normalized ===
      "enforce"
  ) {
    return normalized;
  }

  throw new Error(
    'STRICT_CSP_RUNTIME_MODE must be "disabled", "report-only", or "enforce".',
  );
}

/* =========================================================
   Response-header selection
========================================================= */

export function getStrictCspResponseHeaderName(
  mode:
    EnabledStrictCspRuntimeMode,
): StrictCspResponseHeaderName {
  return (
    mode ===
      "enforce"
      ? STRICT_CSP_ENFORCED_HEADER
      : STRICT_CSP_REPORT_ONLY_HEADER
  );
}

/* =========================================================
   Incoming header sanitization
========================================================= */

function createSanitizedRequestHeaders(
  input?:
    HeadersInit,
): Headers {
  const headers =
    new Headers(
      input,
    );

  /*
   * A client must never be allowed to choose its own nonce
   * or inject a CSP policy into the server-rendering flow.
   */
  headers.delete(
    STRICT_CSP_NONCE_HEADER,
  );

  headers.delete(
    STRICT_CSP_REQUEST_POLICY_HEADER,
  );

  headers.delete(
    STRICT_CSP_REPORT_ONLY_HEADER,
  );

  return headers;
}

/* =========================================================
   Request state creation
========================================================= */

export function createStrictCspRequestState(
  options:
    StrictCspRequestOptions = {},
): StrictCspRequestState {
  const mode =
    resolveStrictCspRuntimeMode(
      options.mode,
    );

  const requestHeaders =
    createSanitizedRequestHeaders(
      options.requestHeaders,
    );

  if (
    mode ===
    "disabled"
  ) {
    return {
      enabled:
        false,

      mode,

      nonce:
        null,

      policy:
        null,

      requestHeaders,

      responseHeader:
        null,
    };
  }

  const nonce =
    createCspNonce(
      options.randomUuid,
    );

  const policy =
    createStrictContentSecurityPolicy({
      nonce,

      isProduction:
        options.isProduction,

      commerceOrigin:
        options.commerceOrigin,

      reportUri:
        options.reportUri,

      reportTo:
        options.reportTo,
    });

  /*
   * Next.js reads this request CSP header during rendering
   * and extracts the matching nonce.
   *
   * Even in report-only mode, the internal request header
   * remains Content-Security-Policy so Next.js can discover
   * the nonce. The browser-facing response header is selected
   * separately below.
   */
  requestHeaders.set(
    STRICT_CSP_NONCE_HEADER,
    nonce,
  );

  requestHeaders.set(
    STRICT_CSP_REQUEST_POLICY_HEADER,
    policy,
  );

  return {
    enabled:
      true,

    mode,

    nonce,

    policy,

    requestHeaders,

    responseHeader: {
      key:
        getStrictCspResponseHeaderName(
          mode,
        ),

      value:
        policy,
    },
  };
}

/* =========================================================
   Route matching
========================================================= */

export function shouldApplyStrictCspToPath(
  pathname:
    string,
): boolean {
  const normalizedPathname =
    pathname.trim();

  if (
    !normalizedPathname ||
    !normalizedPathname.startsWith(
      "/",
    )
  ) {
    return false;
  }

  if (
    EXCLUDED_EXACT_PATHS.has(
      normalizedPathname,
    )
  ) {
    return false;
  }

  if (
    EXCLUDED_PATH_PREFIXES.some(
      (
        prefix,
      ) =>
        normalizedPathname ===
          prefix ||
        normalizedPathname.startsWith(
          `${prefix}/`,
        ),
    )
  ) {
    return false;
  }

  if (
    STATIC_FILE_EXTENSION_PATTERN.test(
      normalizedPathname,
    )
  ) {
    return false;
  }

  return true;
}

/* =========================================================
   Prefetch detection
========================================================= */

export function isStrictCspPrefetchRequest(
  input?:
    HeadersInit,
): boolean {
  const headers =
    new Headers(
      input,
    );

  if (
    headers.has(
      "next-router-prefetch",
    )
  ) {
    return true;
  }

  const purpose =
    headers
      .get(
        "purpose",
      )
      ?.toLowerCase();

  if (
    purpose ===
    "prefetch"
  ) {
    return true;
  }

  const secPurpose =
    headers
      .get(
        "sec-purpose",
      )
      ?.toLowerCase();

  return Boolean(
    secPurpose?.includes(
      "prefetch",
    ),
  );
}

/* =========================================================
   Combined request matcher
========================================================= */

export function shouldApplyStrictCspRequest(
  options:
    StrictCspRequestMatchOptions,
): boolean {
  return (
    shouldApplyStrictCspToPath(
      options.pathname,
    ) &&
    !isStrictCspPrefetchRequest(
      options.headers,
    )
  );
}