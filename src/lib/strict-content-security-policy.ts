import {
  createQuotedCspNonceSource,
} from "./csp-nonce";

import {
  DEFAULT_CSP_REPORT_TO_GROUP,
  DEFAULT_CSP_REPORT_URI,
} from "./content-security-policy";

/* =========================================================
   Types
========================================================= */

export type StrictContentSecurityPolicyOptions =
  Readonly<{
    nonce: string;
    isProduction?: boolean;
    commerceOrigin?: string;
    reportUri?: string | null;
    reportTo?: string | null;
  }>;

/* =========================================================
   Constants
========================================================= */

export const DEFAULT_COMMERCE_ORIGIN =
  "https://cms.globalizedhost.com";

const REPORT_URI_PATTERN =
  /^\/[A-Za-z0-9/_\-.]{0,511}$/;

const REPORT_TO_GROUP_PATTERN =
  /^[a-z][a-z0-9_-]{0,63}$/;

/* =========================================================
   Internal validation
========================================================= */

function normalizeHttpsOrigin(
  value: string,
): string {
  const trimmed =
    value.trim();

  let parsedUrl: URL;

  try {
    parsedUrl =
      new URL(
        trimmed,
      );
  } catch {
    throw new Error(
      "Strict CSP commerce origin must be a valid HTTPS origin.",
    );
  }

  if (
    parsedUrl.protocol !==
      "https:" ||
    parsedUrl.username ||
    parsedUrl.password ||
    parsedUrl.pathname !==
      "/" ||
    parsedUrl.search ||
    parsedUrl.hash
  ) {
    throw new Error(
      "Strict CSP commerce origin must be a valid HTTPS origin.",
    );
  }

  return parsedUrl.origin;
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

  if (
    !REPORT_URI_PATTERN.test(
      normalized,
    ) ||
    /[\r\n]/.test(
      normalized,
    )
  ) {
    throw new Error(
      "Strict CSP report URI must be a safe relative path.",
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
    )
      .trim()
      .toLowerCase();

  if (
    !REPORT_TO_GROUP_PATTERN.test(
      normalized,
    )
  ) {
    throw new Error(
      "Strict CSP report-to group contains an invalid value.",
    );
  }

  return normalized;
}

function createDirective(
  name: string,
  sources: readonly string[],
): string {
  if (
    sources.length ===
    0
  ) {
    return name;
  }

  return `${name} ${sources.join(" ")}`;
}

/* =========================================================
   Strict policy builder
========================================================= */

export function createStrictContentSecurityPolicy(
  options:
    StrictContentSecurityPolicyOptions,
): string {
  const isProduction =
    options.isProduction ??
    process.env.NODE_ENV ===
      "production";

  const nonceSource =
    createQuotedCspNonceSource(
      options.nonce,
    );

  const commerceOrigin =
    normalizeHttpsOrigin(
      options.commerceOrigin ??
        DEFAULT_COMMERCE_ORIGIN,
    );

  const reportUri =
    normalizeReportUri(
      options.reportUri,
    );

  const reportToGroup =
    normalizeReportToGroup(
      options.reportTo,
    );

  const scriptSources: string[] = [
    "'self'",
    nonceSource,
    "'strict-dynamic'",
  ];

  /*
   * React and Next.js development tooling may require eval
   * for debugging. It must never appear in production.
   */
  if (
    !isProduction
  ) {
    scriptSources.push(
      "'unsafe-eval'",
    );
  }

  /*
   * This HTTPS fallback helps browsers that do not apply
   * strict-dynamic. Modern supporting browsers rely on the
   * nonce trust chain.
   */
  scriptSources.push(
    "https:",
  );

  const styleSources: string[] = [
    "'self'",
    nonceSource,
  ];

  /*
   * Development tooling may inject styles without a nonce.
   * Production remains nonce-based.
   */
  if (
    !isProduction
  ) {
    styleSources.push(
      "'unsafe-inline'",
    );
  }

  const directives: string[] = [
    createDirective(
      "default-src",
      [
        "'self'",
      ],
    ),

    createDirective(
      "script-src",
      scriptSources,
    ),

    createDirective(
      "style-src",
      styleSources,
    ),

    createDirective(
      "img-src",
      [
        "'self'",
        "blob:",
        "data:",
        commerceOrigin,
      ],
    ),

    createDirective(
      "font-src",
      [
        "'self'",
        "data:",
      ],
    ),

    createDirective(
      "connect-src",
      [
        "'self'",
        commerceOrigin,
      ],
    ),

    createDirective(
      "media-src",
      [
        "'self'",
        commerceOrigin,
      ],
    ),

    createDirective(
      "worker-src",
      [
        "'self'",
        "blob:",
      ],
    ),

    createDirective(
      "manifest-src",
      [
        "'self'",
      ],
    ),

    createDirective(
      "object-src",
      [
        "'none'",
      ],
    ),

    createDirective(
      "base-uri",
      [
        "'self'",
      ],
    ),

    createDirective(
      "form-action",
      [
        "'self'",
      ],
    ),

    createDirective(
      "frame-src",
      [
        "'none'",
      ],
    ),

    createDirective(
      "frame-ancestors",
      [
        "'none'",
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

  if (
    reportUri
  ) {
    directives.push(
      createDirective(
        "report-uri",
        [
          reportUri,
        ],
      ),
    );
  }

  if (
    reportToGroup
  ) {
    directives.push(
      createDirective(
        "report-to",
        [
          reportToGroup,
        ],
      ),
    );
  }

  const policy =
    `${directives.join("; ")};`;

  if (
    /[\r\n]/.test(
      policy,
    )
  ) {
    throw new Error(
      "Generated strict CSP contains invalid control characters.",
    );
  }

  return policy;
}