import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createStrictContentSecurityPolicy,
  DEFAULT_COMMERCE_ORIGIN,
  DEFAULT_CSP_REPORT_TO_GROUP,
  DEFAULT_CSP_REPORT_URI,
  REQUIRED_STYLE_ATTRIBUTE_HASH,
} from "../../src/lib/strict-content-security-policy";

/* =========================================================
   Fixtures
========================================================= */

const TEST_NONCE =
  "0123456789abcdef0123456789abcdef";

const TEST_NONCE_SOURCE =
  `'nonce-${TEST_NONCE}'`;

/* =========================================================
   Helpers
========================================================= */

function getDirective(
  policy:
    string,
  directiveName:
    string,
): string | undefined {
  return policy
    .split(
      ";",
    )
    .map(
      (
        directive,
      ) =>
        directive.trim(),
    )
    .find(
      (
        directive,
      ) =>
        directive ===
          directiveName ||
        directive.startsWith(
          `${directiveName} `,
        ),
    );
}

/* =========================================================
   Production policy
========================================================= */

describe(
  "createStrictContentSecurityPolicy production policy",
  () => {
    it(
      "creates a compact single-line policy",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              true,
          });

        expect(
          policy,
        ).not.toContain(
          "\n",
        );

        expect(
          policy,
        ).not.toContain(
          "\r",
        );

        expect(
          policy.endsWith(
            ";",
          ),
        ).toBe(
          true,
        );
      },
    );

    it(
      "places the request nonce in script-src",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              true,
          });

        expect(
          getDirective(
            policy,
            "script-src",
          ),
        ).toContain(
          TEST_NONCE_SOURCE,
        );
      },
    );

    it(
      "places the request nonce in style-src",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              true,
          });

        expect(
          getDirective(
            policy,
            "style-src",
          ),
        ).toContain(
          TEST_NONCE_SOURCE,
        );
      },
    );

    it(
      "uses strict-dynamic for production scripts",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              true,
          });

        const scriptDirective =
          getDirective(
            policy,
            "script-src",
          );

        expect(
          scriptDirective,
        ).toContain(
          "'self'",
        );

        expect(
          scriptDirective,
        ).toContain(
          "'strict-dynamic'",
        );

        expect(
          scriptDirective,
        ).toContain(
          "https:",
        );
      },
    );

    it(
      "does not allow unsafe script execution in production",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              true,
          });

        const scriptDirective =
          getDirective(
            policy,
            "script-src",
          );

        expect(
          scriptDirective,
        ).not.toContain(
          "'unsafe-inline'",
        );

        expect(
          scriptDirective,
        ).not.toContain(
          "'unsafe-eval'",
        );
      },
    );

    it(
      "does not allow unsafe-inline style elements in production",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              true,
          });

        const styleDirective =
          getDirective(
            policy,
            "style-src",
          );

        expect(
          styleDirective,
        ).toBe(
          `style-src 'self' ${TEST_NONCE_SOURCE}`,
        );

        expect(
          styleDirective,
        ).not.toContain(
          "'unsafe-inline'",
        );
      },
    );

    it(
      "allows only the required hashed style attribute in production",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              true,
          });

        const styleAttributeDirective =
          getDirective(
            policy,
            "style-src-attr",
          );

        expect(
          styleAttributeDirective,
        ).toBe(
          `style-src-attr 'unsafe-hashes' '${REQUIRED_STYLE_ATTRIBUTE_HASH}'`,
        );

        expect(
          styleAttributeDirective,
        ).not.toContain(
          "'unsafe-inline'",
        );
      },
    );

    it(
      "contains the required strict structural restrictions",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              true,
          });

        expect(
          getDirective(
            policy,
            "object-src",
          ),
        ).toBe(
          "object-src 'none'",
        );

        expect(
          getDirective(
            policy,
            "frame-src",
          ),
        ).toBe(
          "frame-src 'none'",
        );

        expect(
          getDirective(
            policy,
            "frame-ancestors",
          ),
        ).toBe(
          "frame-ancestors 'none'",
        );

        expect(
          getDirective(
            policy,
            "base-uri",
          ),
        ).toBe(
          "base-uri 'self'",
        );

        expect(
          getDirective(
            policy,
            "form-action",
          ),
        ).toBe(
          "form-action 'self'",
        );
      },
    );

    it(
      "allows the configured commerce origin for images and connections",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              true,
          });

        expect(
          getDirective(
            policy,
            "img-src",
          ),
        ).toContain(
          DEFAULT_COMMERCE_ORIGIN,
        );

        expect(
          getDirective(
            policy,
            "connect-src",
          ),
        ).toContain(
          DEFAULT_COMMERCE_ORIGIN,
        );
      },
    );

    it(
      "configures CSP reporting",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              true,
          });

        expect(
          getDirective(
            policy,
            "report-uri",
          ),
        ).toBe(
          `report-uri ${DEFAULT_CSP_REPORT_URI}`,
        );

        expect(
          getDirective(
            policy,
            "report-to",
          ),
        ).toBe(
          `report-to ${DEFAULT_CSP_REPORT_TO_GROUP}`,
        );
      },
    );

    it(
      "upgrades insecure requests in production",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              true,
          });

        expect(
          getDirective(
            policy,
            "upgrade-insecure-requests",
          ),
        ).toBe(
          "upgrade-insecure-requests",
        );
      },
    );
  },
);

/* =========================================================
   Development policy
========================================================= */

describe(
  "createStrictContentSecurityPolicy development policy",
  () => {
    it(
      "allows unsafe-eval only for development scripts",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              false,
          });

        expect(
          getDirective(
            policy,
            "script-src",
          ),
        ).toContain(
          "'unsafe-eval'",
        );
      },
    );

    it(
      "allows inline development style elements",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              false,
          });

        expect(
          getDirective(
            policy,
            "style-src",
          ),
        ).toContain(
          "'unsafe-inline'",
        );
      },
    );

    it(
      "allows inline development style attributes",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              false,
          });

        expect(
          getDirective(
            policy,
            "style-src-attr",
          ),
        ).toBe(
          "style-src-attr 'unsafe-inline'",
        );
      },
    );

    it(
      "does not upgrade insecure requests in development",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              false,
          });

        expect(
          getDirective(
            policy,
            "upgrade-insecure-requests",
          ),
        ).toBeUndefined();
      },
    );

    it(
      "supports local HTTP and WebSocket development connections",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              false,
          });

        const connectDirective =
          getDirective(
            policy,
            "connect-src",
          );

        expect(
          connectDirective,
        ).toContain(
          "http:",
        );

        expect(
          connectDirective,
        ).toContain(
          "https:",
        );

        expect(
          connectDirective,
        ).toContain(
          "ws:",
        );

        expect(
          connectDirective,
        ).toContain(
          "wss:",
        );
      },
    );
  },
);

/* =========================================================
   Custom configuration
========================================================= */

describe(
  "createStrictContentSecurityPolicy custom values",
  () => {
    it(
      "supports a custom secure commerce origin and reporting values",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              true,

            commerceOrigin:
              "https://commerce.example.com",

            reportUri:
              "/api/custom-csp-report",

            reportToGroup:
              "custom-csp-group",
          });

        expect(
          getDirective(
            policy,
            "img-src",
          ),
        ).toContain(
          "https://commerce.example.com",
        );

        expect(
          getDirective(
            policy,
            "connect-src",
          ),
        ).toContain(
          "https://commerce.example.com",
        );

        expect(
          getDirective(
            policy,
            "report-uri",
          ),
        ).toBe(
          "report-uri /api/custom-csp-report",
        );

        expect(
          getDirective(
            policy,
            "report-to",
          ),
        ).toBe(
          "report-to custom-csp-group",
        );
      },
    );

    it(
      "supports compatibility option aliases",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce:
              TEST_NONCE,

            isProduction:
              true,

            wooCommerceOrigin:
              "https://shop.example.com",

            reportingEndpoint:
              "/api/compatibility-csp-report",

            reportTo:
              "compatibility-group",
          });

        expect(
          getDirective(
            policy,
            "connect-src",
          ),
        ).toContain(
          "https://shop.example.com",
        );

        expect(
          getDirective(
            policy,
            "report-uri",
          ),
        ).toBe(
          "report-uri /api/compatibility-csp-report",
        );

        expect(
          getDirective(
            policy,
            "report-to",
          ),
        ).toBe(
          "report-to compatibility-group",
        );
      },
    );
  },
);

/* =========================================================
   Validation
========================================================= */

describe(
  "createStrictContentSecurityPolicy validation",
  () => {
    it(
      "rejects an invalid nonce",
      () => {
        expect(
          () =>
            createStrictContentSecurityPolicy({
              nonce:
                "invalid nonce",

              isProduction:
                true,
            }),
        ).toThrow();
      },
    );

    it(
      "rejects an insecure commerce origin",
      () => {
        expect(
          () =>
            createStrictContentSecurityPolicy({
              nonce:
                TEST_NONCE,

              isProduction:
                true,

              commerceOrigin:
                "http://commerce.example.com",
            }),
        ).toThrow(
          /HTTPS/i,
        );
      },
    );

    it(
      "rejects a commerce origin containing a path",
      () => {
        expect(
          () =>
            createStrictContentSecurityPolicy({
              nonce:
                TEST_NONCE,

              isProduction:
                true,

              commerceOrigin:
                "https://commerce.example.com/store",
            }),
        ).toThrow(
          /origin/i,
        );
      },
    );

    it(
      "rejects an external report URI",
      () => {
        expect(
          () =>
            createStrictContentSecurityPolicy({
              nonce:
                TEST_NONCE,

              isProduction:
                true,

              reportUri:
                "https://attacker.example.com/report",
            }),
        ).toThrow(
          /same-origin/i,
        );
      },
    );

    it(
      "rejects unsafe reporting group characters",
      () => {
        expect(
          () =>
            createStrictContentSecurityPolicy({
              nonce:
                TEST_NONCE,

              isProduction:
                true,

              reportToGroup:
                "group; script-src *",
            }),
        ).toThrow(
          /unsafe/i,
        );
      },
    );
  },
);