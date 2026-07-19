import {
  describe,
  expect,
  it,
} from "vitest";

import nextConfig
  from "../../next.config";

/* =========================================================
   Types
========================================================= */

type ConfiguredHeader = {
  key:
    string;

  value:
    string;
};

type ConfiguredHeaderRule = {
  source:
    string;

  headers:
    ConfiguredHeader[];
};

/* =========================================================
   Helpers
========================================================= */

function convertHeadersToRecord(
  headers:
    ConfiguredHeader[],
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

async function getConfiguredHeaderRules():
  Promise<
    ConfiguredHeaderRule[]
  > {
  if (
    typeof nextConfig.headers !==
    "function"
  ) {
    throw new Error(
      "next.config does not define a headers function.",
    );
  }

  const rules =
    await nextConfig.headers();

  return rules as
    ConfiguredHeaderRule[];
}

async function getGlobalRule():
  Promise<
    ConfiguredHeaderRule
  > {
  const rules =
    await getConfiguredHeaderRules();

  const globalRule =
    rules.find(
      (
        rule,
      ) =>
        rule.source ===
        "/:path*",
    );

  if (!globalRule) {
    throw new Error(
      "Global browser security header rule was not found.",
    );
  }

  return globalRule;
}

async function getGlobalHeaders():
  Promise<
    Record<string, string>
  > {
  const globalRule =
    await getGlobalRule();

  return convertHeadersToRecord(
    globalRule.headers,
  );
}

/* =========================================================
   Framework configuration
========================================================= */

describe(
  "Next.js browser security configuration",
  () => {
    it(
      "disables the X-Powered-By header",
      () => {
        expect(
          nextConfig
            .poweredByHeader,
        ).toBe(
          false,
        );
      },
    );

    it(
      "defines a global header rule",
      async () => {
        const rules =
          await getConfiguredHeaderRules();

        expect(
          rules,
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              source:
                "/:path*",
            }),
          ]),
        );
      },
    );
  },
);

/* =========================================================
   Global browser headers
========================================================= */

describe(
  "Next.js global browser security headers",
  () => {
    it(
      "applies MIME-sniffing and framing protection",
      async () => {
        const headers =
          await getGlobalHeaders();

        expect(
          headers,
        ).toMatchObject({
          "x-content-type-options":
            "nosniff",

          "x-frame-options":
            "DENY",
        });
      },
    );

    it(
      "applies referrer and opener policies",
      async () => {
        const headers =
          await getGlobalHeaders();

        expect(
          headers,
        ).toMatchObject({
          "referrer-policy":
            "strict-origin-when-cross-origin",

          "cross-origin-opener-policy":
            "same-origin-allow-popups",
        });
      },
    );

    it(
      "applies the restrictive permissions policy",
      async () => {
        const headers =
          await getGlobalHeaders();

        expect(
          headers[
            "permissions-policy"
          ],
        ).toBe(
          [
            "camera=()",
            "microphone=()",
            "geolocation=()",
            "usb=()",
            "browsing-topics=()",
          ].join(
            ", ",
          ),
        );
      },
    );

    it(
      "does not contain duplicate global header names",
      async () => {
        const globalRule =
          await getGlobalRule();

        const names =
          globalRule
            .headers
            .map(
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
      },
    );
  },
);

/* =========================================================
   CSP report-only integration
========================================================= */

describe(
  "Next.js CSP report-only configuration",
  () => {
    it(
  "adds legacy and modern CSP reporting configuration",
  async () => {
    const headers =
      await getGlobalHeaders();

    const policy =
      headers[
        "content-security-policy-report-only"
      ];

    expect(
      policy,
    ).toContain(
      "default-src 'self'",
    );

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
      "does not enable enforced CSP yet",
      async () => {
        const headers =
          await getGlobalHeaders();

        expect(
          headers[
            "content-security-policy"
          ],
        ).toBeUndefined();
      },
    );
  },
);