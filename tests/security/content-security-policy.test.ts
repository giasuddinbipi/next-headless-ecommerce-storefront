import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createContentSecurityPolicy,
  DEFAULT_CSP_REPORT_URI,
  getContentSecurityPolicyReportOnlyHeader,
} from "@/lib/content-security-policy";

/* =========================================================
   Helpers
========================================================= */

function parsePolicy(
  policy:
    string,
): Map<
  string,
  string[]
> {
  const directives =
    policy
      .split(
        ";",
      )
      .map(
        (
          directive,
        ) =>
          directive.trim(),
      )
      .filter(
        Boolean,
      );

  return new Map(
    directives.map(
      (
        directive,
      ) => {
        const [
          name,
          ...values
        ] =
          directive.split(
            /\s+/,
          );

        return [
          name,
          values,
        ];
      },
    ),
  );
}

/* =========================================================
   Base policy
========================================================= */

describe(
  "createContentSecurityPolicy base policy",
  () => {
    it(
      "creates restrictive fallback and document directives",
      () => {
        const directives =
          parsePolicy(
            createContentSecurityPolicy({
              isProduction:
                true,
            }),
          );

        expect(
          directives.get(
            "default-src",
          ),
        ).toEqual([
          "'self'",
        ]);

        expect(
          directives.get(
            "base-uri",
          ),
        ).toEqual([
          "'self'",
        ]);

        expect(
          directives.get(
            "object-src",
          ),
        ).toEqual([
          "'none'",
        ]);

        expect(
          directives.get(
            "frame-ancestors",
          ),
        ).toEqual([
          "'none'",
        ]);

        expect(
          directives.get(
            "form-action",
          ),
        ).toEqual([
          "'self'",
        ]);
      },
    );

    it(
      "allows required WooCommerce CMS connections and images",
      () => {
        const directives =
          parsePolicy(
            createContentSecurityPolicy({
              isProduction:
                true,
            }),
          );

        expect(
          directives.get(
            "connect-src",
          ),
        ).toEqual(
          expect.arrayContaining([
            "'self'",
            "https://cms.globalizedhost.com",
          ]),
        );

        expect(
          directives.get(
            "img-src",
          ),
        ).toEqual(
          expect.arrayContaining([
            "'self'",
            "data:",
            "blob:",
            "https://cms.globalizedhost.com",
          ]),
        );
      },
    );

    it(
      "allows inline styles required by the current application",
      () => {
        const directives =
          parsePolicy(
            createContentSecurityPolicy({
              isProduction:
                true,
            }),
          );

        expect(
          directives.get(
            "style-src",
          ),
        ).toEqual([
          "'self'",
          "'unsafe-inline'",
        ]);
      },
    );
  },
);

/* =========================================================
   Environment separation
========================================================= */

describe(
  "createContentSecurityPolicy environment behavior",
  () => {
    it(
      "allows development eval and WebSocket connections",
      () => {
        const directives =
          parsePolicy(
            createContentSecurityPolicy({
              isProduction:
                false,
            }),
          );

        expect(
          directives.get(
            "script-src",
          ),
        ).toContain(
          "'unsafe-eval'",
        );

        expect(
          directives.get(
            "connect-src",
          ),
        ).toContain(
          "ws:",
        );

        expect(
          directives.has(
            "upgrade-insecure-requests",
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "removes development exceptions in production",
      () => {
        const directives =
          parsePolicy(
            createContentSecurityPolicy({
              isProduction:
                true,
            }),
          );

        expect(
          directives.get(
            "script-src",
          ),
        ).not.toContain(
          "'unsafe-eval'",
        );

        expect(
          directives.get(
            "connect-src",
          ),
        ).not.toContain(
          "ws:",
        );

        expect(
          directives.has(
            "upgrade-insecure-requests",
          ),
        ).toBe(
          true,
        );
      },
    );
  },
);

/* =========================================================
   Reporting behavior
========================================================= */

describe(
  "createContentSecurityPolicy reporting",
  () => {
    it(
      "adds the default same-origin report URI",
      () => {
        const directives =
          parsePolicy(
            createContentSecurityPolicy({
              isProduction:
                true,
            }),
          );

        expect(
          directives.get(
            "report-uri",
          ),
        ).toEqual([
          DEFAULT_CSP_REPORT_URI,
        ]);
      },
    );

    it(
      "allows reporting to be explicitly disabled",
      () => {
        const directives =
          parsePolicy(
            createContentSecurityPolicy({
              isProduction:
                true,

              reportUri:
                null,
            }),
          );

        expect(
          directives.has(
            "report-uri",
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "rejects unsafe report URI values",
      () => {
        expect(
          () =>
            createContentSecurityPolicy({
              isProduction:
                true,

              reportUri:
                "/api/security/report;\r\nX-Test: injected",
            }),
        ).toThrow(
          "CSP report URI must be a safe same-origin relative path.",
        );
      },
    );
  },
);

/* =========================================================
   Header integrity
========================================================= */

describe(
  "CSP report-only header integrity",
  () => {
    it(
      "returns the correct report-only header without control characters",
      () => {
        const header =
          getContentSecurityPolicyReportOnlyHeader({
            isProduction:
              true,
          });

        expect(
          header.key,
        ).toBe(
          "Content-Security-Policy-Report-Only",
        );

        expect(
          header.value,
        ).toContain(
          "default-src 'self'",
        );

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
      },
    );

    it(
      "does not create duplicate source values inside a directive",
      () => {
        const directives =
          parsePolicy(
            createContentSecurityPolicy({
              isProduction:
                true,
            }),
          );

        for (
          const values of
          directives.values()
        ) {
          expect(
            new Set(
              values,
            ).size,
          ).toBe(
            values.length,
          );
        }
      },
    );
  },
);