import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
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
   Environment setup
========================================================= */

beforeEach(() => {
  /*
   * Every test starts from the safe deployment mode.
   */
  vi.stubEnv(
    "CSP_DEPLOYMENT_MODE",
    "report-only",
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
});

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
   Global browser security headers
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

        const normalizedNames =
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
            normalizedNames,
          ).size,
        ).toBe(
          normalizedNames.length,
        );
      },
    );
  },
);

/* =========================================================
   Report-only deployment
========================================================= */

describe(
  "Next.js CSP report-only deployment",
  () => {
    it(
      "uses report-only CSP by default",
      async () => {
        const headers =
          await getGlobalHeaders();

        const reportOnlyPolicy =
          headers[
            "content-security-policy-report-only"
          ];

        expect(
          reportOnlyPolicy,
        ).toContain(
          "default-src 'self'",
        );

        expect(
          reportOnlyPolicy,
        ).toContain(
          "report-uri /api/security/csp-report",
        );

        expect(
          reportOnlyPolicy,
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

    it(
      "keeps report-only mode when the environment value is empty",
      async () => {
        vi.stubEnv(
          "CSP_DEPLOYMENT_MODE",
          "",
        );

        const headers =
          await getGlobalHeaders();

        expect(
          headers[
            "content-security-policy-report-only"
          ],
        ).toContain(
          "default-src 'self'",
        );

        expect(
          headers[
            "content-security-policy"
          ],
        ).toBeUndefined();
      },
    );
  },
);

/* =========================================================
   Enforced deployment switch
========================================================= */

describe(
  "Next.js CSP enforcement deployment switch",
  () => {
    it(
      "switches to enforced CSP only when explicitly configured",
      async () => {
        vi.stubEnv(
          "CSP_DEPLOYMENT_MODE",
          "enforce",
        );

        const headers =
          await getGlobalHeaders();

        const enforcedPolicy =
          headers[
            "content-security-policy"
          ];

        expect(
          enforcedPolicy,
        ).toContain(
          "default-src 'self'",
        );

        expect(
          enforcedPolicy,
        ).toContain(
          "report-uri /api/security/csp-report",
        );

        expect(
          enforcedPolicy,
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
      "rejects an invalid CSP deployment mode",
      async () => {
        vi.stubEnv(
          "CSP_DEPLOYMENT_MODE",
          "enabled",
        );

        await expect(
          getConfiguredHeaderRules(),
        ).rejects.toThrow(
          'CSP_DEPLOYMENT_MODE must be either "report-only" or "enforce".',
        );
      },
    );
  },
);