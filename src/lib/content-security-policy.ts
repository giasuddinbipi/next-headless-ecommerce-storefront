/* =========================================================
   Public types
========================================================= */

export type ContentSecurityPolicyOptions =
  Readonly<{
    isProduction?:
      boolean;

    /*
     * null দিলে reporting directive disabled থাকবে।
     */
    reportUri?:
      string | null;
  }>;

export type ContentSecurityPolicyHeader =
  Readonly<{
    key:
      string;

    value:
      string;
  }>;

/* =========================================================
   Constants
========================================================= */

export const DEFAULT_CSP_REPORT_URI =
  "/api/security/csp-report";

const WOOCOMMERCE_CMS_ORIGIN =
  "https://cms.globalizedhost.com";

const REPORT_ONLY_HEADER_NAME =
  "Content-Security-Policy-Report-Only";

const SAFE_RELATIVE_REPORT_URI_PATTERN =
  /^\/[A-Za-z0-9._~/%?=&-]*$/;

/* =========================================================
   Internal types
========================================================= */

type ContentSecurityDirective =
  Readonly<{
    name:
      string;

    values?:
      readonly string[];
  }>;

/* =========================================================
   Environment helpers
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

/* =========================================================
   Directive helpers
========================================================= */

function removeDuplicateValues(
  values:
    readonly string[],
): string[] {
  return [
    ...new Set(
      values,
    ),
  ];
}

function serializeDirective(
  directive:
    ContentSecurityDirective,
): string {
  const values =
    removeDuplicateValues(
      directive.values ??
        [],
    );

  if (
    values.length ===
    0
  ) {
    return directive.name;
  }

  return [
    directive.name,
    ...values,
  ].join(
    " ",
  );
}

function normalizeReportUri(
  value:
    string | null | undefined,
): string | null {
  if (
    value ===
    null
  ) {
    return null;
  }

  const normalized =
    (
      value ??
      DEFAULT_CSP_REPORT_URI
    ).trim();

  if (!normalized) {
    return null;
  }

  /*
   * Report destination same-origin relative path হতে হবে।
   * Control character, whitespace এবং directive separator
   * গ্রহণ করা হবে না।
   */
  if (
    !SAFE_RELATIVE_REPORT_URI_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      "CSP report URI must be a safe same-origin relative path.",
    );
  }

  return normalized;
}

/* =========================================================
   Policy construction
========================================================= */

export function createContentSecurityPolicy(
  options:
    ContentSecurityPolicyOptions = {},
): string {
  const isProduction =
    resolveProductionMode(
      options.isProduction,
    );

  const reportUri =
    normalizeReportUri(
      options.reportUri,
    );

  const scriptSources = [
    "'self'",

    /*
     * Current Next.js application compatibility।
     * Strict nonce-based script policy পরে আলাদা
     * hardening step-এ করা হবে।
     */
    "'unsafe-inline'",

    ...(
      isProduction
        ? []
        : [
            /*
             * Next.js development tooling এবং source maps।
             */
            "'unsafe-eval'",
          ]
    ),
  ];

  const connectSources = [
    "'self'",

    WOOCOMMERCE_CMS_ORIGIN,

    ...(
      isProduction
        ? []
        : [
            /*
             * Development hot-module connection।
             */
            "ws:",
          ]
    ),
  ];

  const directives:
    ContentSecurityDirective[] =
    [
      {
        name:
          "default-src",

        values: [
          "'self'",
        ],
      },

      {
        name:
          "base-uri",

        values: [
          "'self'",
        ],
      },

      {
        name:
          "object-src",

        values: [
          "'none'",
        ],
      },

      {
        name:
          "frame-ancestors",

        values: [
          "'none'",
        ],
      },

      {
        name:
          "frame-src",

        values: [
          "'none'",
        ],
      },

      {
        name:
          "form-action",

        values: [
          "'self'",
        ],
      },

      {
        name:
          "script-src",

        values:
          scriptSources,
      },

      {
        name:
          "style-src",

        values: [
          "'self'",
          "'unsafe-inline'",
        ],
      },

      {
        name:
          "img-src",

        values: [
          "'self'",
          "data:",
          "blob:",
          WOOCOMMERCE_CMS_ORIGIN,
        ],
      },

      {
        name:
          "font-src",

        values: [
          "'self'",
          "data:",
        ],
      },

      {
        name:
          "connect-src",

        values:
          connectSources,
      },

      {
        name:
          "media-src",

        values: [
          "'self'",
          "blob:",
        ],
      },

      {
        name:
          "worker-src",

        values: [
          "'self'",
          "blob:",
        ],
      },

      {
        name:
          "manifest-src",

        values: [
          "'self'",
        ],
      },
    ];

  if (
    isProduction
  ) {
    directives.push({
      name:
        "upgrade-insecure-requests",
    });
  }

  if (
    reportUri
  ) {
    directives.push({
      name:
        "report-uri",

      values: [
        reportUri,
      ],
    });
  }

  return `${directives
    .map(
      serializeDirective,
    )
    .join(
      "; ",
    )};`;
}

/* =========================================================
   Report-only header
========================================================= */

export function getContentSecurityPolicyReportOnlyHeader(
  options:
    ContentSecurityPolicyOptions = {},
): ContentSecurityPolicyHeader {
  return {
    key:
      REPORT_ONLY_HEADER_NAME,

    value:
      createContentSecurityPolicy(
        options,
      ),
  };
}