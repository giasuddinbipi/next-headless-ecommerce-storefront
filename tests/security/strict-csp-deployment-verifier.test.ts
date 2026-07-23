import {
  describe,
  expect,
  it,
} from "vitest";

import {
  EXPECTED_REPORTING_ENDPOINTS_VALUE,
  extractStrictCspNonce,
  extractStrictCspNonces,
  hasMatchingScriptNonce,
  resolveExpectedStrictCspMode,
  validateStrictCspDeployment,
} from "../../scripts/lib/strict-csp-deployment-verifier.mjs";

/* =========================================================
   Fixtures
========================================================= */

const nonce =
  "123e4567e89b42d3a456426614174000";

const secondNonce =
  "223e4567e89b42d3b456426614174001";

const strictPolicy = [
  "default-src 'self'",
  `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:`,
  `style-src 'self' 'nonce-${nonce}'`,
  "img-src 'self' blob: data: https://cms.globalizedhost.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
  "report-uri /api/security/csp-report",
  "report-to csp-endpoint",
].join(
  "; ",
);

const renderedHtml =
  `<!doctype html><html><body><script nonce="${nonce}" src="/_next/static/chunk.js"></script></body></html>`;

function createReportOnlyHeaders() {
  return {
    "Content-Security-Policy-Report-Only":
      strictPolicy,

    "Reporting-Endpoints":
      EXPECTED_REPORTING_ENDPOINTS_VALUE,
  };
}

function createEnforcedHeaders() {
  return {
    "Content-Security-Policy":
      strictPolicy,

    "Reporting-Endpoints":
      EXPECTED_REPORTING_ENDPOINTS_VALUE,
  };
}

/* =========================================================
   Expected-mode resolution
========================================================= */

describe(
  "resolveExpectedStrictCspMode",
  () => {
    it(
      "defaults to report-only",
      () => {
        expect(
          resolveExpectedStrictCspMode(),
        ).toBe(
          "report-only",
        );

        expect(
          resolveExpectedStrictCspMode(
            "",
          ),
        ).toBe(
          "report-only",
        );
      },
    );

    it(
      "normalizes enforcement mode",
      () => {
        expect(
          resolveExpectedStrictCspMode(
            " ENFORCE ",
          ),
        ).toBe(
          "enforce",
        );
      },
    );

    it(
      "rejects unsupported modes",
      () => {
        expect(
          () =>
            resolveExpectedStrictCspMode(
              "disabled",
            ),
        ).toThrow(
          'Expected strict CSP mode must be either "report-only" or "enforce".',
        );
      },
    );
  },
);

/* =========================================================
   Nonce extraction
========================================================= */

describe(
  "strict CSP nonce extraction",
  () => {
    it(
      "extracts one nonce from a strict policy",
      () => {
        expect(
          extractStrictCspNonce(
            strictPolicy,
          ),
        ).toBe(
          nonce,
        );

        expect(
          extractStrictCspNonces(
            strictPolicy,
          ),
        ).toEqual([
          nonce,
        ]);
      },
    );

    it(
      "returns null when multiple unique nonces exist",
      () => {
        const policy =
          `${strictPolicy}; script-src-elem 'nonce-${secondNonce}'`;

        expect(
          extractStrictCspNonce(
            policy,
          ),
        ).toBeNull();

        expect(
          extractStrictCspNonces(
            policy,
          ),
        ).toEqual([
          nonce,
          secondNonce,
        ]);
      },
    );
  },
);

/* =========================================================
   HTML nonce validation
========================================================= */

describe(
  "rendered script nonce validation",
  () => {
    it(
      "finds matching quoted and unquoted script nonces",
      () => {
        expect(
          hasMatchingScriptNonce(
            renderedHtml,
            nonce,
          ),
        ).toBe(
          true,
        );

        expect(
          hasMatchingScriptNonce(
            `<script nonce='${nonce}'></script>`,
            nonce,
          ),
        ).toBe(
          true,
        );

        expect(
          hasMatchingScriptNonce(
            `<script nonce=${nonce}></script>`,
            nonce,
          ),
        ).toBe(
          true,
        );
      },
    );

    it(
      "rejects a missing or different nonce",
      () => {
        expect(
          hasMatchingScriptNonce(
            "<script></script>",
            nonce,
          ),
        ).toBe(
          false,
        );

        expect(
          hasMatchingScriptNonce(
            renderedHtml,
            secondNonce,
          ),
        ).toBe(
          false,
        );
      },
    );
  },
);

/* =========================================================
   Deployment validation
========================================================= */

describe(
  "strict CSP deployment validation",
  () => {
    it(
      "accepts a valid strict report-only response",
      () => {
        const result =
          validateStrictCspDeployment({
            headers:
              createReportOnlyHeaders(),

            html:
              renderedHtml,

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
          result.nonce,
        ).toBe(
          nonce,
        );

        expect(
          result.failures,
        ).toEqual(
          [],
        );
      },
    );

    it(
      "accepts a valid enforced response",
      () => {
        const result =
          validateStrictCspDeployment({
            headers:
              createEnforcedHeaders(),

            html:
              renderedHtml,

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
          result.warnings,
        ).toEqual(
          [],
        );
      },
    );

    it(
      "rejects the opposite CSP header",
      () => {
        const result =
          validateStrictCspDeployment({
            headers: {
              ...createReportOnlyHeaders(),

              "Content-Security-Policy":
                strictPolicy,
            },

            html:
              renderedHtml,

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

    it(
      "rejects unsafe-inline and unsafe-eval",
      () => {
        const unsafePolicy =
          `${strictPolicy}; script-src 'unsafe-inline' 'unsafe-eval'`;

        const result =
          validateStrictCspDeployment({
            headers: {
              "Content-Security-Policy":
                unsafePolicy,

              "Reporting-Endpoints":
                EXPECTED_REPORTING_ENDPOINTS_VALUE,
            },

            html:
              renderedHtml,

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
        ).toEqual(
          expect.arrayContaining([
            "Strict CSP policy contains 'unsafe-inline'.",
            "Production strict CSP policy contains 'unsafe-eval'.",
          ]),
        );
      },
    );

    it(
      "rejects HTML without the matching script nonce",
      () => {
        const result =
          validateStrictCspDeployment({
            headers:
              createReportOnlyHeaders(),

            html:
              "<html><body><script></script></body></html>",

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
          "Rendered HTML does not contain a script using the CSP nonce.",
        );
      },
    );

    it(
      "rejects a missing reporting endpoint",
      () => {
        const result =
          validateStrictCspDeployment({
            headers: {
              "Content-Security-Policy-Report-Only":
                strictPolicy,
            },

            html:
              renderedHtml,

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
  },
);