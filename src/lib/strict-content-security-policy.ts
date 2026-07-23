import {
  assertValidCspNonce,
  createQuotedCspNonceSource,
} from "./csp-nonce";

/* =========================================================
   Defaults
========================================================= */

export const DEFAULT_COMMERCE_ORIGIN =
  "https://cms.globalizedhost.com";

export const DEFAULT_CSP_REPORT_URI =
  "/api/security/csp-report";

export const DEFAULT_CSP_REPORT_TO_GROUP =
  "csp-endpoint";

/*
 * This exact style attribute was reported by Chromium
 * during the strict-CSP Home → Shop production E2E flow.
 *
 * Keep the raw hash exported for tests and diagnostics.
 */
export const REQUIRED_STYLE_ATTRIBUTE_HASH =
  "sha256-ZDrxqUOB4m/L0JWL/+gS52g1CRH0l/qwMhjTw5Z/Fsc=";

/* =========================================================
   Types
========================================================= */

export type StrictContentSecurityPolicyOptions =
  Readonly<{
    nonce:
      string;

    isProduction?:
      boolean;

    commerceOrigin?:
      string;

    /*
     * Compatibility alias for callers that describe the
     * commerce origin specifically as WooCommerce.
     */
    wooCommerceOrigin?:
      string;

    reportUri?:
      string;

    /*
     * Compatibility alias for reportUri.
     */
    reportingEndpoint?:
      string;

    reportToGroup?:
      string;

    /*
     * Compatibility alias for reportToGroup.
     */
    reportTo?:
      string;
  }>;

export type CreateStrictContentSecurityPolicyOptions =
  StrictContentSecurityPolicyOptions;

/* =========================================================
   Validation
========================================================= */

function resolveCommerceOrigin(
  value:
    string,
): string {
  const trimmedValue =
    value.trim();

  let parsedUrl:
    URL;

  try {
    parsedUrl =
      new URL(
        trimmedValue,
      );
  } catch {
    throw new Error(
      "The strict CSP commerce origin must be a valid absolute URL.",
    );
  }

  if (
    parsedUrl.protocol !==
    "https:"
  ) {
    throw new Error(
      "The strict CSP commerce origin must use HTTPS.",
    );
  }

  if (
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error(
      "The strict CSP commerce origin must not contain credentials.",
    );
  }

  if (
    parsedUrl.pathname !==
      "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      "The strict CSP commerce origin must contain only an origin without a path, query or fragment.",
    );
  }

  return parsedUrl.origin;
}

function resolveReportUri(
  value:
    string,
): string {
  const trimmedValue =
    value.trim();

  if (
    !trimmedValue.startsWith(
      "/",
    ) ||
    trimmedValue.startsWith(
      "//",
    )
  ) {
    throw new Error(
      "The strict CSP report URI must be a same-origin absolute path.",
    );
  }

  if (
    /[\r\n;,\s]/.test(
      trimmedValue,
    )
  ) {
    throw new Error(
      "The strict CSP report URI contains unsafe characters.",
    );
  }

  return trimmedValue;
}

function resolveReportToGroup(
  value:
    string,
): string {
  const trimmedValue =
    value.trim();

  /*
   * Reporting group names are emitted directly into a CSP
   * directive, so restrict them to a conservative token.
   */
  if (
    !/^[A-Za-z0-9_-]{1,64}$/.test(
      trimmedValue,
    )
  ) {
    throw new Error(
      "The strict CSP report-to group contains unsafe characters.",
    );
  }

  return trimmedValue;
}

/* =========================================================
   Directive helpers
========================================================= */

function joinDirective(
  directive:
    string,
  sources:
    readonly string[],
): string {
  return [
    directive,
    ...sources,
  ].join(
    " ",
  );
}

function createScriptSources(
  nonceSource:
    string,
  isProduction:
    boolean,
): readonly string[] {
  const sources:
    string[] =
    [
      "'self'",
      nonceSource,
      "'strict-dynamic'",
      "https:",
    ];

  if (
    !isProduction
  ) {
    /*
     * Next.js development tooling uses eval-based source
     * transforms. Production must never receive this.
     */
    sources.push(
      "'unsafe-eval'",
    );
  }

  return sources;
}

function createStyleElementSources(
  nonceSource:
    string,
  isProduction:
    boolean,
): readonly string[] {
  const sources:
    string[] =
    [
      "'self'",
      nonceSource,
    ];

  if (
    !isProduction
  ) {
    /*
     * Development tooling may inject style elements that
     * do not carry a nonce.
     */
    sources.push(
      "'unsafe-inline'",
    );
  }

  return sources;
}

function createStyleAttributeSources(
  isProduction:
    boolean,
): readonly string[] {
  if (
    !isProduction
  ) {
    return [
      "'unsafe-inline'",
    ];
  }

  /*
   * Do not enable global unsafe-inline in production.
   *
   * unsafe-hashes allows only the explicitly listed style
   * attribute hash below.
   */
  return [
    "'unsafe-hashes'",
    `'${REQUIRED_STYLE_ATTRIBUTE_HASH}'`,
  ];
}

function createConnectSources(
  commerceOrigin:
    string,
  isProduction:
    boolean,
): readonly string[] {
  const sources:
    string[] =
    [
      "'self'",
      commerceOrigin,
    ];

  if (
    !isProduction
  ) {
    sources.push(
      "http:",
      "https:",
      "ws:",
      "wss:",
    );
  }

  return sources;
}

/* =========================================================
   Policy builder
========================================================= */

export function createStrictContentSecurityPolicy(
  options:
    StrictContentSecurityPolicyOptions,
): string {
  assertValidCspNonce(
    options.nonce,
  );

  const nonceSource =
    createQuotedCspNonceSource(
      options.nonce,
    );

  const isProduction =
    options.isProduction ??
    process.env.NODE_ENV ===
      "production";

  const commerceOrigin =
    resolveCommerceOrigin(
      options.commerceOrigin ??
        options.wooCommerceOrigin ??
        DEFAULT_COMMERCE_ORIGIN,
    );

  const reportUri =
    resolveReportUri(
      options.reportUri ??
        options.reportingEndpoint ??
        DEFAULT_CSP_REPORT_URI,
    );

  const reportToGroup =
    resolveReportToGroup(
      options.reportToGroup ??
        options.reportTo ??
        DEFAULT_CSP_REPORT_TO_GROUP,
    );

  const directives:
    string[] =
    [
      joinDirective(
        "default-src",
        [
          "'self'",
        ],
      ),

      joinDirective(
        "script-src",
        createScriptSources(
          nonceSource,
          isProduction,
        ),
      ),

      joinDirective(
        "style-src",
        createStyleElementSources(
          nonceSource,
          isProduction,
        ),
      ),

      joinDirective(
        "style-src-attr",
        createStyleAttributeSources(
          isProduction,
        ),
      ),

      joinDirective(
        "img-src",
        [
          "'self'",
          "data:",
          "blob:",
          commerceOrigin,
        ],
      ),

      joinDirective(
        "font-src",
        [
          "'self'",
          "data:",
        ],
      ),

      joinDirective(
        "connect-src",
        createConnectSources(
          commerceOrigin,
          isProduction,
        ),
      ),

      joinDirective(
        "media-src",
        [
          "'self'",
        ],
      ),

      joinDirective(
        "worker-src",
        [
          "'self'",
          "blob:",
        ],
      ),

      joinDirective(
        "manifest-src",
        [
          "'self'",
        ],
      ),

      joinDirective(
        "frame-src",
        [
          "'none'",
        ],
      ),

      joinDirective(
        "object-src",
        [
          "'none'",
        ],
      ),

      joinDirective(
        "base-uri",
        [
          "'self'",
        ],
      ),

      joinDirective(
        "form-action",
        [
          "'self'",
        ],
      ),

      joinDirective(
        "frame-ancestors",
        [
          "'none'",
        ],
      ),

      joinDirective(
        "report-uri",
        [
          reportUri,
        ],
      ),

      joinDirective(
        "report-to",
        [
          reportToGroup,
        ],
      ),
    ];

  if (
    isProduction
  ) {
    directives.push(
      "upgrade-insecure-requests",
    );
  }

  return `${directives.join(
    "; ",
  )};`;
}
