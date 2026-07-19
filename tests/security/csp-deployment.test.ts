import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  DEFAULT_CSP_DEPLOYMENT_MODE,
  getCspDeploymentHeaders,
  getCspPolicyHeaderName,
  isCspEnforcementEnabled,
  resolveCspDeploymentMode,
} from "@/lib/csp-deployment";

/* =========================================================
   Helpers
========================================================= */

function convertHeadersToRecord(
  headers:
    ReturnType<
      typeof getCspDeploymentHeaders
    >,
): Record<
  string,
  string
> {
  return Object.fromEntries(
    headers.map(
      (
        header,
      ) => [
        header.key
          .toLowerCase(),

        header.value,
      ],
    ),
  );
}

/* =========================================================
   Setup
========================================================= */

beforeEach(() => {
  vi.stubEnv(
    "CSP_DEPLOYMENT_MODE",
    "",
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/* =========================================================
   Mode resolution
========================================================= */

describe(
  "resolveCspDeploymentMode",
  () => {
    it(
      "defaults to report-only when configuration is empty",
      () => {
        expect(
          resolveCspDeploymentMode(
            "",
          ),
        ).toBe(
          DEFAULT_CSP_DEPLOYMENT_MODE,
        );

        expect(
          resolveCspDeploymentMode(
            undefined,
          ),
        ).toBe(
          "report-only",
        );
      },
    );

    it(
      "accepts the explicit report-only mode",
      () => {
        expect(
          resolveCspDeploymentMode(
            "report-only",
          ),
        ).toBe(
          "report-only",
        );

        expect(
          isCspEnforcementEnabled(
            "report-only",
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "accepts enforce mode with safe whitespace and case normalization",
      () => {
        expect(
          resolveCspDeploymentMode(
            "  ENFORCE  ",
          ),
        ).toBe(
          "enforce",
        );

        expect(
          isCspEnforcementEnabled(
            "enforce",
          ),
        ).toBe(
          true,
        );
      },
    );

    it(
      "rejects unsupported deployment modes",
      () => {
        expect(
          () =>
            resolveCspDeploymentMode(
              "enabled",
            ),
        ).toThrow(
          'CSP_DEPLOYMENT_MODE must be either "report-only" or "enforce".',
        );

        expect(
          () =>
            resolveCspDeploymentMode(
              "off",
            ),
        ).toThrow(
          'CSP_DEPLOYMENT_MODE must be either "report-only" or "enforce".',
        );
      },
    );

    it(
      "reads deployment mode from the server environment",
      () => {
        vi.stubEnv(
          "CSP_DEPLOYMENT_MODE",
          "enforce",
        );

        expect(
          resolveCspDeploymentMode(),
        ).toBe(
          "enforce",
        );
      },
    );
  },
);

/* =========================================================
   Header-name selection
========================================================= */

describe(
  "getCspPolicyHeaderName",
  () => {
    it(
      "selects the correct CSP header for each deployment mode",
      () => {
        expect(
          getCspPolicyHeaderName(
            "report-only",
          ),
        ).toBe(
          "Content-Security-Policy-Report-Only",
        );

        expect(
          getCspPolicyHeaderName(
            "enforce",
          ),
        ).toBe(
          "Content-Security-Policy",
        );
      },
    );
  },
);

/* =========================================================
   Report-only deployment
========================================================= */

describe(
  "getCspDeploymentHeaders report-only mode",
  () => {
    it(
      "returns report-only CSP and modern reporting headers",
      () => {
        const headers =
          convertHeadersToRecord(
            getCspDeploymentHeaders({
              mode:
                "report-only",

              isProduction:
                true,
            }),
          );

        expect(
          headers[
            "content-security-policy-report-only"
          ],
        ).toContain(
          "default-src 'self'",
        );

        expect(
          headers[
            "content-security-policy-report-only"
          ],
        ).toContain(
          "report-uri /api/security/csp-report",
        );

        expect(
          headers[
            "content-security-policy-report-only"
          ],
        ).toContain(
          "report-to csp-endpoint",
        );

        expect(
          headers[
            "content-security-policy"
          ],
        ).toBeUndefined();

        expect(
          headers[
            "reporting-endpoints"
          ],
        ).toBe(
          'csp-endpoint="/api/security/csp-report"',
        );
      },
    );
  },
);

/* =========================================================
   Enforced deployment
========================================================= */

describe(
  "getCspDeploymentHeaders enforce mode",
  () => {
    it(
      "returns enforced CSP without a report-only header",
      () => {
        const headers =
          convertHeadersToRecord(
            getCspDeploymentHeaders({
              mode:
                "enforce",

              isProduction:
                true,
            }),
          );

        expect(
          headers[
            "content-security-policy"
          ],
        ).toContain(
          "default-src 'self'",
        );

        expect(
          headers[
            "content-security-policy"
          ],
        ).toContain(
          "report-uri /api/security/csp-report",
        );

        expect(
          headers[
            "content-security-policy"
          ],
        ).toContain(
          "report-to csp-endpoint",
        );

        expect(
          headers[
            "content-security-policy-report-only"
          ],
        ).toBeUndefined();

        expect(
          headers[
            "reporting-endpoints"
          ],
        ).toBe(
          'csp-endpoint="/api/security/csp-report"',
        );
      },
    );

    it(
      "uses production-safe script and transport directives",
      () => {
        const headers =
          convertHeadersToRecord(
            getCspDeploymentHeaders({
              mode:
                "enforce",

              isProduction:
                true,
            }),
          );

        const policy =
          headers[
            "content-security-policy"
          ];

        expect(
          policy,
        ).toContain(
          "upgrade-insecure-requests",
        );

        expect(
          policy,
        ).not.toContain(
          "'unsafe-eval'",
        );
      },
    );
  },
);

/* =========================================================
   Custom reporting configuration
========================================================= */

describe(
  "getCspDeploymentHeaders custom reporting",
  () => {
    it(
      "keeps the policy and Reporting-Endpoints group synchronized",
      () => {
        const headers =
          convertHeadersToRecord(
            getCspDeploymentHeaders({
              mode:
                "report-only",

              isProduction:
                true,

              reportUri:
                "/api/security/custom-csp-report",

              reportToGroup:
                "storefront-csp",
            }),
          );

        expect(
          headers[
            "content-security-policy-report-only"
          ],
        ).toContain(
          "report-uri /api/security/custom-csp-report",
        );

        expect(
          headers[
            "content-security-policy-report-only"
          ],
        ).toContain(
          "report-to storefront-csp",
        );

        expect(
          headers[
            "reporting-endpoints"
          ],
        ).toBe(
          'storefront-csp="/api/security/custom-csp-report"',
        );
      },
    );
  },
);

/* =========================================================
   Header integrity
========================================================= */

describe(
  "CSP deployment header integrity",
  () => {
    it(
      "returns independent arrays and header objects",
      () => {
        const first =
          getCspDeploymentHeaders({
            mode:
              "report-only",

            isProduction:
              true,
          });

        const second =
          getCspDeploymentHeaders({
            mode:
              "report-only",

            isProduction:
              true,
          });

        expect(
          first,
        ).not.toBe(
          second,
        );

        expect(
          first[0],
        ).not.toBe(
          second[0],
        );

        expect(
          first,
        ).toEqual(
          second,
        );
      },
    );

    it(
      "does not return duplicate headers or control characters",
      () => {
        const headers =
          getCspDeploymentHeaders({
            mode:
              "enforce",

            isProduction:
              true,
          });

        const names =
          headers.map(
            (
              header,
            ) =>
              header.key
                .toLowerCase(),
          );

        expect(
          new Set(
            names,
          ).size,
        ).toBe(
          names.length,
        );

        for (
          const header of
          headers
        ) {
          expect(
            header.key,
          ).not.toMatch(
            /[\r\n]/,
          );

          expect(
            header.value,
          ).not.toMatch(
            /[\r\n]/,
          );
        }
      },
    );
  },
);