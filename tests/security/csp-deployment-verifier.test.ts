import {
  describe,
  expect,
  it,
} from "vitest";

import {
  EXPECTED_REPORTING_ENDPOINTS_VALUE,
  resolveExpectedCspMode,
  validateCspDeploymentHeaders,
} from "../../scripts/lib/csp-deployment-verifier.mjs";

/* =========================================================
   Helpers
========================================================= */

const reportOnlyPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self' 'unsafe-inline'",
  "upgrade-insecure-requests",
  "report-uri /api/security/csp-report",
  "report-to csp-endpoint",
].join(
  "; ",
);

function createReportOnlyHeaders() {
  return {
    "Content-Security-Policy-Report-Only":
      reportOnlyPolicy,

    "Reporting-Endpoints":
      EXPECTED_REPORTING_ENDPOINTS_VALUE,
  };
}

function createEnforcedHeaders() {
  return {
    "Content-Security-Policy":
      reportOnlyPolicy,

    "Reporting-Endpoints":
      EXPECTED_REPORTING_ENDPOINTS_VALUE,
  };
}

/* =========================================================
   Mode resolution
========================================================= */

describe(
  "resolveExpectedCspMode",
  () => {
    it(
      "defaults to report-only",
      () => {
        expect(
          resolveExpectedCspMode(),
        ).toBe(
          "report-only",
        );

        expect(
          resolveExpectedCspMode(
            "",
          ),
        ).toBe(
          "report-only",
        );
      },
    );

    it(
      "accepts enforce mode with normalization",
      () => {
        expect(
          resolveExpectedCspMode(
            " ENFORCE ",
          ),
        ).toBe(
          "enforce",
        );
      },
    );

    it(
      "rejects unsupported expected modes",
      () => {
        expect(
          () =>
            resolveExpectedCspMode(
              "enabled",
            ),
        ).toThrow(
          'Expected CSP mode must be either "report-only" or "enforce".',
        );
      },
    );
  },
);

/* =========================================================
   Report-only verification
========================================================= */

describe(
  "report-only CSP deployment verification",
  () => {
    it(
      "accepts a valid report-only deployment",
      () => {
        const result =
          validateCspDeploymentHeaders({
            headers:
              createReportOnlyHeaders(),

            expectedMode:
              "report-only",

            requireProductionPolicy:
              true,
          });

        expect(
          result.valid,
        ).toBe(
          true,
        );

        expect(
          result.failures,
        ).toEqual(
          [],
        );

        expect(
          result.activeHeaderName,
        ).toBe(
          "content-security-policy-report-only",
        );
      },
    );

    it(
      "rejects an unexpected enforced header",
      () => {
        const result =
          validateCspDeploymentHeaders({
            headers: {
              ...createReportOnlyHeaders(),

              "Content-Security-Policy":
                reportOnlyPolicy,
            },

            expectedMode:
              "report-only",
          });

        expect(
          result.valid,
        ).toBe(
          false,
        );

        expect(
          result.failures,
        ).toContain(
          'Unexpected CSP header "content-security-policy" is also present.',
        );
      },
    );
  },
);

/* =========================================================
   Enforcement verification
========================================================= */

describe(
  "enforced CSP deployment verification",
  () => {
    it(
      "accepts a valid enforced deployment",
      () => {
        const result =
          validateCspDeploymentHeaders({
            headers:
              createEnforcedHeaders(),

            expectedMode:
              "enforce",

            requireProductionPolicy:
              true,
          });

        expect(
          result.valid,
        ).toBe(
          true,
        );

        expect(
          result.failures,
        ).toEqual(
          [],
        );

        expect(
          result.activeHeaderName,
        ).toBe(
          "content-security-policy",
        );

        expect(
          result.warnings,
        ).toContain(
          "Enforced compatibility CSP still contains 'unsafe-inline'; strict nonce-based hardening is not active yet.",
        );
      },
    );

    it(
      "rejects report-only mode when enforcement is expected",
      () => {
        const result =
          validateCspDeploymentHeaders({
            headers:
              createReportOnlyHeaders(),

            expectedMode:
              "enforce",
          });

        expect(
          result.valid,
        ).toBe(
          false,
        );

        expect(
          result.failures,
        ).toEqual(
          expect.arrayContaining([
            expect.stringContaining(
              "Expected enforced CSP header",
            ),

            expect.stringContaining(
              "Unexpected CSP header",
            ),
          ]),
        );
      },
    );
  },
);

/* =========================================================
   Reporting and production integrity
========================================================= */

describe(
  "CSP deployment reporting and production integrity",
  () => {
    it(
      "rejects a missing Reporting-Endpoints header",
      () => {
        const result =
          validateCspDeploymentHeaders({
            headers: {
              "Content-Security-Policy-Report-Only":
                reportOnlyPolicy,
            },

            expectedMode:
              "report-only",
          });

        expect(
          result.valid,
        ).toBe(
          false,
        );

        expect(
          result.failures,
        ).toContain(
          `Expected Reporting-Endpoints="${EXPECTED_REPORTING_ENDPOINTS_VALUE}", received "missing".`,
        );
      },
    );

    it(
      "rejects unsafe-eval in a production policy",
      () => {
        const result =
          validateCspDeploymentHeaders({
            headers: {
              "Content-Security-Policy":
                `${reportOnlyPolicy}; script-src 'self' 'unsafe-eval'`,

              "Reporting-Endpoints":
                EXPECTED_REPORTING_ENDPOINTS_VALUE,
            },

            expectedMode:
              "enforce",

            requireProductionPolicy:
              true,
          });

        expect(
          result.valid,
        ).toBe(
          false,
        );

        expect(
          result.failures,
        ).toContain(
          "Production CSP policy contains 'unsafe-eval'.",
        );
      },
    );
  },
);