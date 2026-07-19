import {
  createContentSecurityPolicy,
  DEFAULT_CSP_REPORT_TO_GROUP,
  DEFAULT_CSP_REPORT_URI,
  getReportingEndpointsHeader,
  type ContentSecurityPolicyHeader,
} from "./content-security-policy";
/* =========================================================
   Public types
========================================================= */

export type CspDeploymentMode =
  | "report-only"
  | "enforce";

export type CspDeploymentOptions =
  Readonly<{
    /*
     * Undefined or empty value safely defaults to report-only.
     */
    mode?:
      string | null;

    isProduction?:
      boolean;

    reportUri?:
      string;

    reportToGroup?:
      string;
  }>;

/* =========================================================
   Constants
========================================================= */

export const DEFAULT_CSP_DEPLOYMENT_MODE:
  CspDeploymentMode =
  "report-only";

const REPORT_ONLY_HEADER_NAME =
  "Content-Security-Policy-Report-Only";

const ENFORCED_HEADER_NAME =
  "Content-Security-Policy";

/* =========================================================
   Deployment mode resolution
========================================================= */

export function resolveCspDeploymentMode(
  value:
    string | null | undefined =
      process.env
        .CSP_DEPLOYMENT_MODE,
): CspDeploymentMode {
  const normalized =
    (
      value ??
      DEFAULT_CSP_DEPLOYMENT_MODE
    )
      .trim()
      .toLowerCase();

  if (!normalized) {
    return DEFAULT_CSP_DEPLOYMENT_MODE;
  }

  if (
    normalized ===
      "report-only" ||
    normalized ===
      "enforce"
  ) {
    return normalized;
  }

  /*
   * An invalid deployment value must fail the build rather
   * than silently enabling an unexpected CSP configuration.
   */
  throw new Error(
    'CSP_DEPLOYMENT_MODE must be either "report-only" or "enforce".',
  );
}

export function isCspEnforcementEnabled(
  value?:
    string | null,
): boolean {
  return (
    resolveCspDeploymentMode(
      value,
    ) ===
    "enforce"
  );
}

/* =========================================================
   Policy header selection
========================================================= */

export function getCspPolicyHeaderName(
  mode:
    CspDeploymentMode,
): typeof REPORT_ONLY_HEADER_NAME |
  typeof ENFORCED_HEADER_NAME {
  return (
    mode ===
    "enforce"
      ? ENFORCED_HEADER_NAME
      : REPORT_ONLY_HEADER_NAME
  );
}

/* =========================================================
   Deployment headers
========================================================= */

export function getCspDeploymentHeaders(
  options:
    CspDeploymentOptions = {},
): ContentSecurityPolicyHeader[] {
  const mode =
    resolveCspDeploymentMode(
      options.mode,
    );

  const reportUri =
    options.reportUri ??
    DEFAULT_CSP_REPORT_URI;

  const reportToGroup =
    options.reportToGroup ??
    DEFAULT_CSP_REPORT_TO_GROUP;

  const policy =
    createContentSecurityPolicy({
      isProduction:
        options.isProduction,

      reportUri,

      reportTo:
        reportToGroup,
    });

  return [
    {
      key:
        getCspPolicyHeaderName(
          mode,
        ),

      value:
        policy,
    },

    getReportingEndpointsHeader({
      group:
        reportToGroup,

      endpoint:
        reportUri,
    }),
  ];
}