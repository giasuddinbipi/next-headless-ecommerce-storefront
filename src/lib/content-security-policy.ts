/* =========================================================
   Public types
========================================================= */

export type ContentSecurityPolicyOptions =
  Readonly<{
    isProduction?:
      boolean;

    /*
     * null disables the legacy report-uri directive.
     */
    reportUri?:
      string | null;

    /*
     * null disables the modern report-to directive.
     */
    reportTo?:
      string | null;
  }>;

export type ReportingEndpointsHeaderOptions =
  Readonly<{
    group?:
      string;

    endpoint?:
      string;
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

export const DEFAULT_CSP_REPORT_TO_GROUP =
  "csp-endpoint";

const WOOCOMMERCE_CMS_ORIGIN =
  "https://cms.globalizedhost.com";

const REPORT_ONLY_HEADER_NAME =
  "Content-Security-Policy-Report-Only";

const REPORTING_ENDPOINTS_HEADER_NAME =
  "Reporting-Endpoints";

const SAFE_RELATIVE_REPORT_URI_PATTERN =
  /^\/[A-Za-z0-9._~/%?=&-]*$/;

const SAFE_REPORT_TO_GROUP_PATTERN =
  /^[a-z][a-z0-9_-]{0,63}$/;

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
   Validation helpers
========================================================= */

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

function normalizeReportToGroup(
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
      DEFAULT_CSP_REPORT_TO_GROUP
    ).trim();

  if (!normalized) {
    return null;
  }

  if (
    !SAFE_REPORT_TO_GROUP_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      "CSP report-to group must contain only safe lowercase token characters.",
    );
  }

  return normalized;
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

  const reportTo =
    normalizeReportToGroup(
      options.reportTo,
    );

  const scriptSources = [
    "'self'",
    "'unsafe-inline'",

    ...(
      isProduction
        ? []
        : [
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
            "ws:",
          ]
    ),
  ];

  const directives:
    ContentSecurityDirective[] = [
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

  /*
   * Legacy browser compatibility.
   */
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

  /*
   * Modern Reporting API destination group.
   */
  if (
    reportTo
  ) {
    directives.push({
      name:
        "report-to",

      values: [
        reportTo,
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
   CSP report-only header
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

/* =========================================================
   Reporting-Endpoints header
========================================================= */

export function getReportingEndpointsHeader(
  options:
    ReportingEndpointsHeaderOptions = {},
): ContentSecurityPolicyHeader {
  const group =
    normalizeReportToGroup(
      options.group,
    );

  const endpoint =
    normalizeReportUri(
      options.endpoint,
    );

  if (
    !group ||
    !endpoint
  ) {
    throw new Error(
      "Reporting endpoint group and destination are required.",
    );
  }

  /*
   * Reporting-Endpoints is a Structured Fields dictionary:
   *
   * csp-endpoint="/api/security/csp-report"
   */
  return {
    key:
      REPORTING_ENDPOINTS_HEADER_NAME,

    value:
      `${group}="${endpoint}"`,
  };
}