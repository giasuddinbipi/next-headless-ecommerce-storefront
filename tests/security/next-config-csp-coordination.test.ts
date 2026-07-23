import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import nextConfig from "../../next.config";

/* =========================================================
   Types
========================================================= */

type HeaderEntry =
  Readonly<{
    key: string;
    value: string;
  }>;

type HeaderRule =
  Readonly<{
    source: string;
    headers: HeaderEntry[];
  }>;

/* =========================================================
   Helpers
========================================================= */

async function getGlobalHeaders():
  Promise<HeaderEntry[]> {
  const headersFactory =
    nextConfig.headers;

  if (
    typeof headersFactory !==
    "function"
  ) {
    throw new Error(
      "Next.js headers configuration is missing.",
    );
  }

  const rules =
    await headersFactory();

  const globalRule =
    (
      rules as HeaderRule[]
    ).find(
      (
        rule,
      ) =>
        rule.source ===
        "/:path*",
    );

  if (
    !globalRule
  ) {
    throw new Error(
      "Global Next.js header rule is missing.",
    );
  }

  return globalRule.headers;
}

function getHeaderValue(
  headers:
    readonly HeaderEntry[],
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
   Environment cleanup
========================================================= */

afterEach(
  () => {
    vi.unstubAllEnvs();
  },
);

/* =========================================================
   Coordination integration
========================================================= */

describe(
  "Next.js CSP runtime coordination",
  () => {
    it(
      "keeps compatibility report-only CSP while strict mode is disabled",
      async () => {
        vi.stubEnv(
          "STRICT_CSP_RUNTIME_MODE",
          "disabled",
        );

        vi.stubEnv(
          "CSP_DEPLOYMENT_MODE",
          "report-only",
        );

        const headers =
          await getGlobalHeaders();

        expect(
          getHeaderValue(
            headers,
            "Content-Security-Policy-Report-Only",
          ),
        ).toContain(
          "default-src 'self'",
        );

        expect(
          getHeaderValue(
            headers,
            "Content-Security-Policy",
          ),
        ).toBeNull();

        expect(
          getHeaderValue(
            headers,
            "Reporting-Endpoints",
          ),
        ).toBe(
          'csp-endpoint="/api/security/csp-report"',
        );
      },
    );

    it(
      "removes static CSP headers when strict report-only mode is enabled",
      async () => {
        vi.stubEnv(
          "STRICT_CSP_RUNTIME_MODE",
          "report-only",
        );

        vi.stubEnv(
          "CSP_DEPLOYMENT_MODE",
          "report-only",
        );

        const headers =
          await getGlobalHeaders();

        expect(
          getHeaderValue(
            headers,
            "Content-Security-Policy",
          ),
        ).toBeNull();

        expect(
          getHeaderValue(
            headers,
            "Content-Security-Policy-Report-Only",
          ),
        ).toBeNull();

        expect(
          getHeaderValue(
            headers,
            "Reporting-Endpoints",
          ),
        ).toBeNull();
      },
    );

    it(
      "removes static CSP headers when strict enforcement is enabled",
      async () => {
        vi.stubEnv(
          "STRICT_CSP_RUNTIME_MODE",
          "enforce",
        );

        vi.stubEnv(
          "CSP_DEPLOYMENT_MODE",
          "report-only",
        );

        const headers =
          await getGlobalHeaders();

        expect(
          getHeaderValue(
            headers,
            "Content-Security-Policy",
          ),
        ).toBeNull();

        expect(
          getHeaderValue(
            headers,
            "Content-Security-Policy-Report-Only",
          ),
        ).toBeNull();

        expect(
          getHeaderValue(
            headers,
            "Reporting-Endpoints",
          ),
        ).toBeNull();
      },
    );

    it(
      "preserves browser security headers when Proxy owns CSP",
      async () => {
        vi.stubEnv(
          "STRICT_CSP_RUNTIME_MODE",
          "enforce",
        );

        vi.stubEnv(
          "CSP_DEPLOYMENT_MODE",
          "report-only",
        );

        const headers =
          await getGlobalHeaders();

        expect(
          getHeaderValue(
            headers,
            "X-Content-Type-Options",
          ),
        ).toBe(
          "nosniff",
        );

        expect(
          getHeaderValue(
            headers,
            "X-Frame-Options",
          ),
        ).toBe(
          "DENY",
        );

        expect(
          getHeaderValue(
            headers,
            "Referrer-Policy",
          ),
        ).toBe(
          "strict-origin-when-cross-origin",
        );
      },
    );
  },
);