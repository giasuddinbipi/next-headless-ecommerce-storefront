import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createStrictContentSecurityPolicy,
  DEFAULT_COMMERCE_ORIGIN,
} from "../../src/lib/strict-content-security-policy";

/* =========================================================
   Test fixtures
========================================================= */

const nonce =
  "123e4567e89b42d3a456426614174000";

function getDirective(
  policy: string,
  directiveName: string,
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
  "production strict content security policy",
  () => {
    it(
      "creates a nonce-based production policy",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce,
            isProduction:
              true,
          });

        const scriptDirective =
          getDirective(
            policy,
            "script-src",
          );

        const styleDirective =
          getDirective(
            policy,
            "style-src",
          );

        expect(
          scriptDirective,
        ).toContain(
          `'nonce-${nonce}'`,
        );

        expect(
          scriptDirective,
        ).toContain(
          "'strict-dynamic'",
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

        expect(
          styleDirective,
        ).toContain(
          `'nonce-${nonce}'`,
        );

        expect(
          styleDirective,
        ).not.toContain(
          "'unsafe-inline'",
        );
      },
    );

    it(
      "includes production transport hardening",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce,
            isProduction:
              true,
          });

        expect(
          policy,
        ).toContain(
          "upgrade-insecure-requests",
        );
      },
    );

    it(
      "includes restrictive document directives",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce,
            isProduction:
              true,
          });

        expect(
          policy,
        ).toContain(
          "default-src 'self'",
        );

        expect(
          policy,
        ).toContain(
          "object-src 'none'",
        );

        expect(
          policy,
        ).toContain(
          "base-uri 'self'",
        );

        expect(
          policy,
        ).toContain(
          "form-action 'self'",
        );

        expect(
          policy,
        ).toContain(
          "frame-src 'none'",
        );

        expect(
          policy,
        ).toContain(
          "frame-ancestors 'none'",
        );
      },
    );

    it(
      "allows the configured commerce origin",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce,
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

        expect(
          getDirective(
            policy,
            "media-src",
          ),
        ).toContain(
          DEFAULT_COMMERCE_ORIGIN,
        );
      },
    );

    it(
      "includes legacy and modern reporting directives",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce,
            isProduction:
              true,
          });

        expect(
          policy,
        ).toContain(
          "report-uri /api/security/csp-report",
        );

        expect(
          policy,
        ).toContain(
          "report-to csp-endpoint",
        );
      },
    );
  },
);

/* =========================================================
   Development policy
========================================================= */

describe(
  "development strict content security policy",
  () => {
    it(
      "allows development-only evaluation and inline styles",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce,
            isProduction:
              false,
          });

        const scriptDirective =
          getDirective(
            policy,
            "script-src",
          );

        const styleDirective =
          getDirective(
            policy,
            "style-src",
          );

        expect(
          scriptDirective,
        ).toContain(
          "'unsafe-eval'",
        );

        expect(
          scriptDirective,
        ).not.toContain(
          "'unsafe-inline'",
        );

        expect(
          styleDirective,
        ).toContain(
          "'unsafe-inline'",
        );

        expect(
          policy,
        ).not.toContain(
          "upgrade-insecure-requests",
        );
      },
    );
  },
);

/* =========================================================
   Custom configuration
========================================================= */

describe(
  "strict CSP custom configuration",
  () => {
    it(
      "supports a custom commerce origin",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce,
            isProduction:
              true,
            commerceOrigin:
              "https://commerce.example.com/",
          });

        expect(
          policy,
        ).toContain(
          "https://commerce.example.com",
        );
      },
    );

    it(
      "supports custom reporting configuration",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce,
            isProduction:
              true,
            reportUri:
              "/api/security/custom-report",
            reportTo:
              "strict-csp",
          });

        expect(
          policy,
        ).toContain(
          "report-uri /api/security/custom-report",
        );

        expect(
          policy,
        ).toContain(
          "report-to strict-csp",
        );
      },
    );

    it(
      "allows reporting directives to be disabled",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce,
            isProduction:
              true,
            reportUri:
              null,
            reportTo:
              null,
          });

        expect(
          policy,
        ).not.toContain(
          "report-uri",
        );

        expect(
          policy,
        ).not.toContain(
          "report-to",
        );
      },
    );
  },
);

/* =========================================================
   Security validation
========================================================= */

describe(
  "strict CSP input validation",
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
        ).toThrow(
          "CSP nonce contains an invalid value.",
        );
      },
    );

    it(
      "rejects unsafe commerce origins",
      () => {
        expect(
          () =>
            createStrictContentSecurityPolicy({
              nonce,
              commerceOrigin:
                "http://commerce.example.com",
            }),
        ).toThrow(
          "Strict CSP commerce origin must be a valid HTTPS origin.",
        );

        expect(
          () =>
            createStrictContentSecurityPolicy({
              nonce,
              commerceOrigin:
                "https://commerce.example.com/path",
            }),
        ).toThrow(
          "Strict CSP commerce origin must be a valid HTTPS origin.",
        );
      },
    );

    it(
      "rejects unsafe reporting values",
      () => {
        expect(
          () =>
            createStrictContentSecurityPolicy({
              nonce,
              reportUri:
                "/api/report\r\nInjected: value",
            }),
        ).toThrow(
          "Strict CSP report URI must be a safe relative path.",
        );

        expect(
          () =>
            createStrictContentSecurityPolicy({
              nonce,
              reportTo:
                "invalid group",
            }),
        ).toThrow(
          "Strict CSP report-to group contains an invalid value.",
        );
      },
    );

    it(
      "generates a single-line policy",
      () => {
        const policy =
          createStrictContentSecurityPolicy({
            nonce,
            isProduction:
              true,
          });

        expect(
          policy,
        ).not.toMatch(
          /[\r\n]/,
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
      "produces a different policy for a different nonce",
      () => {
        const firstPolicy =
          createStrictContentSecurityPolicy({
            nonce:
              "123e4567e89b42d3a456426614174000",
            isProduction:
              true,
          });

        const secondPolicy =
          createStrictContentSecurityPolicy({
            nonce:
              "223e4567e89b42d3a456426614174001",
            isProduction:
              true,
          });

        expect(
          firstPolicy,
        ).not.toBe(
          secondPolicy,
        );
      },
    );
  },
);