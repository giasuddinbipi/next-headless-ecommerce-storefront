import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createCspRuntimePlan,
} from "../../src/lib/csp-runtime-coordination";

/* =========================================================
   Helpers
========================================================= */

function getHeaderValue(
  headers:
    readonly Readonly<{
      key: string;
      value: string;
    }>[],
  name:
    string,
): string | null {
  const header =
    headers.find(
      (
        candidate,
      ) =>
        candidate.key
          .toLowerCase() ===
        name.toLowerCase(),
    );

  return (
    header?.value ??
    null
  );
}

/* =========================================================
   Compatibility ownership
========================================================= */

describe(
  "compatibility CSP ownership",
  () => {
    it(
      "uses next.config headers when strict CSP is disabled",
      () => {
        const plan =
          createCspRuntimePlan({
            strictMode:
              "disabled",

            compatibilityMode:
              "report-only",

            isProduction:
              true,
          });

        expect(
          plan.headerOwner,
        ).toBe(
          "next-config",
        );

        expect(
          plan.strictCspEnabled,
        ).toBe(
          false,
        );

        expect(
          plan.compatibilityCspEnabled,
        ).toBe(
          true,
        );

        expect(
          getHeaderValue(
            plan.staticHeaders,
            "Content-Security-Policy-Report-Only",
          ),
        ).toContain(
          "default-src 'self'",
        );

        expect(
          getHeaderValue(
            plan.staticHeaders,
            "Reporting-Endpoints",
          ),
        ).toBe(
          'csp-endpoint="/api/security/csp-report"',
        );
      },
    );

    it(
      "supports compatibility enforcement when strict CSP is disabled",
      () => {
        const plan =
          createCspRuntimePlan({
            strictMode:
              "disabled",

            compatibilityMode:
              "enforce",

            isProduction:
              true,
          });

        expect(
          plan.headerOwner,
        ).toBe(
          "next-config",
        );

        expect(
          getHeaderValue(
            plan.staticHeaders,
            "Content-Security-Policy",
          ),
        ).toContain(
          "default-src 'self'",
        );

        expect(
          getHeaderValue(
            plan.staticHeaders,
            "Content-Security-Policy-Report-Only",
          ),
        ).toBeNull();
      },
    );
  },
);

/* =========================================================
   Strict Proxy ownership
========================================================= */

describe(
  "strict CSP Proxy ownership",
  () => {
    it(
      "removes static CSP headers in strict report-only mode",
      () => {
        const plan =
          createCspRuntimePlan({
            strictMode:
              "report-only",

            compatibilityMode:
              "report-only",

            isProduction:
              true,
          });

        expect(
          plan.headerOwner,
        ).toBe(
          "proxy",
        );

        expect(
          plan.strictCspEnabled,
        ).toBe(
          true,
        );

        expect(
          plan.compatibilityCspEnabled,
        ).toBe(
          false,
        );

        expect(
          plan.staticHeaders,
        ).toEqual(
          [],
        );
      },
    );

    it(
      "removes static CSP headers in strict enforcement mode",
      () => {
        const plan =
          createCspRuntimePlan({
            strictMode:
              "enforce",

            compatibilityMode:
              "report-only",

            isProduction:
              true,
          });

        expect(
          plan.headerOwner,
        ).toBe(
          "proxy",
        );

        expect(
          plan.staticHeaders,
        ).toEqual(
          [],
        );
      },
    );
  },
);

/* =========================================================
   Configuration validation
========================================================= */

describe(
  "CSP runtime coordination validation",
  () => {
    it(
      "rejects an invalid strict CSP mode",
      () => {
        expect(
          () =>
            createCspRuntimePlan({
              strictMode:
                "enabled",

              compatibilityMode:
                "report-only",
            }),
        ).toThrow(
          'STRICT_CSP_RUNTIME_MODE must be "disabled", "report-only", or "enforce".',
        );
      },
    );

    it(
      "rejects an invalid compatibility mode",
      () => {
        expect(
          () =>
            createCspRuntimePlan({
              strictMode:
                "disabled",

              compatibilityMode:
                "enabled",
            }),
        ).toThrow(
          'CSP_DEPLOYMENT_MODE must be either "report-only" or "enforce".',
        );
      },
    );

    it(
      "validates compatibility configuration even when Proxy owns CSP",
      () => {
        expect(
          () =>
            createCspRuntimePlan({
              strictMode:
                "report-only",

              compatibilityMode:
                "invalid-mode",
            }),
        ).toThrow(
          'CSP_DEPLOYMENT_MODE must be either "report-only" or "enforce".',
        );
      },
    );
  },
);