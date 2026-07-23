import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/* =========================================================
   next/server mock
========================================================= */

const {
  nextMock,
} = vi.hoisted(
  () => ({
    nextMock:
      vi.fn(),
  }),
);

vi.mock(
  "next/server",
  () => ({
    NextResponse: {
      next:
        nextMock,
    },
  }),
);

/*
 * Import after next/server has been mocked.
 */
import {
  proxy,
} from "../../src/proxy";

/* =========================================================
   Types
========================================================= */

type MockProxyResponse =
  Readonly<{
    headers:
      Headers;

    options?:
      unknown;
  }>;

type ProxyRequestOptions =
  Readonly<{
    request:
      Readonly<{
        headers:
          Headers;
      }>;
  }>;

/* =========================================================
   Helpers
========================================================= */

function createRequest(
  pathname:
    string,
  headers:
    HeadersInit = {},
): Parameters<
  typeof proxy
>[0] {
  return {
    nextUrl: {
      pathname,
    },

    headers:
      new Headers(
        headers,
      ),
  } as Parameters<
    typeof proxy
  >[0];
}

function getMockResponse(
  response:
    ReturnType<
      typeof proxy
    >,
): MockProxyResponse {
  return response as unknown as
    MockProxyResponse;
}

function getForwardedRequestHeaders():
  Headers {
  const firstCall =
    nextMock.mock.calls[
      0
    ];

  const options =
    firstCall?.[
      0
    ] as
      | ProxyRequestOptions
      | undefined;

  if (
    !options?.request
      ?.headers
  ) {
    throw new Error(
      "Proxy did not forward modified request headers.",
    );
  }

  return options
    .request
    .headers;
}

/* =========================================================
   Test lifecycle
========================================================= */

beforeEach(
  () => {
    vi.stubEnv(
      "NODE_ENV",
      "production",
    );

    vi.stubEnv(
      "CSP_DEPLOYMENT_MODE",
      "report-only",
    );

    vi.stubEnv(
      "STRICT_CSP_RUNTIME_MODE",
      "disabled",
    );

    nextMock.mockReset();

    nextMock.mockImplementation(
      (
        options?:
          unknown,
      ) => ({
        headers:
          new Headers(),

        options,
      }),
    );
  },
);

afterEach(
  () => {
    vi.unstubAllEnvs();
  },
);

/* =========================================================
   Disabled runtime
========================================================= */

describe(
  "strict CSP Proxy with disabled runtime",
  () => {
    it(
      "passes application requests through without strict CSP headers",
      () => {
        const response =
          getMockResponse(
            proxy(
              createRequest(
                "/shop",
              ),
            ),
          );

        expect(
          nextMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          nextMock.mock
            .calls[0],
        ).toEqual(
          [],
        );

        expect(
          response.headers.has(
            "Content-Security-Policy",
          ),
        ).toBe(
          false,
        );

        expect(
          response.headers.has(
            "Content-Security-Policy-Report-Only",
          ),
        ).toBe(
          false,
        );

        expect(
          response.headers.has(
            "Reporting-Endpoints",
          ),
        ).toBe(
          false,
        );
      },
    );
  },
);

/* =========================================================
   Route exclusions
========================================================= */

describe(
  "strict CSP Proxy route exclusions",
  () => {
    it(
      "does not process API requests",
      () => {
        vi.stubEnv(
          "STRICT_CSP_RUNTIME_MODE",
          "report-only",
        );

        const response =
          getMockResponse(
            proxy(
              createRequest(
                "/api/products",
              ),
            ),
          );

        expect(
          nextMock.mock
            .calls[0],
        ).toEqual(
          [],
        );

        expect(
          response.headers.has(
            "Content-Security-Policy-Report-Only",
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "does not process static asset requests",
      () => {
        vi.stubEnv(
          "STRICT_CSP_RUNTIME_MODE",
          "report-only",
        );

        const response =
          getMockResponse(
            proxy(
              createRequest(
                "/images/logo.png",
              ),
            ),
          );

        expect(
          nextMock.mock
            .calls[0],
        ).toEqual(
          [],
        );

        expect(
          response.headers.has(
            "Content-Security-Policy-Report-Only",
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "does not process prefetch requests",
      () => {
        vi.stubEnv(
          "STRICT_CSP_RUNTIME_MODE",
          "report-only",
        );

        const response =
          getMockResponse(
            proxy(
              createRequest(
                "/shop",
                {
                  purpose:
                    "prefetch",
                },
              ),
            ),
          );

        expect(
          nextMock.mock
            .calls[0],
        ).toEqual(
          [],
        );

        expect(
          response.headers.has(
            "Content-Security-Policy-Report-Only",
          ),
        ).toBe(
          false,
        );
      },
    );
  },
);

/* =========================================================
   Strict report-only runtime
========================================================= */

describe(
  "strict CSP Proxy in report-only mode",
  () => {
    it(
      "forwards a nonce-aware request policy and returns report-only CSP",
      () => {
        vi.stubEnv(
          "STRICT_CSP_RUNTIME_MODE",
          "report-only",
        );

        const response =
          getMockResponse(
            proxy(
              createRequest(
                "/checkout",
                {
                  Accept:
                    "text/html",
                },
              ),
            ),
          );

        const requestHeaders =
          getForwardedRequestHeaders();

        const nonce =
          requestHeaders.get(
            "x-nonce",
          );

        const internalPolicy =
          requestHeaders.get(
            "Content-Security-Policy",
          );

        const responsePolicy =
          response.headers.get(
            "Content-Security-Policy-Report-Only",
          );

        expect(
          nonce,
        ).toMatch(
          /^[A-Za-z0-9_-]{22,128}$/,
        );

        expect(
          internalPolicy,
        ).toContain(
          `'nonce-${nonce}'`,
        );

        expect(
          internalPolicy,
        ).toContain(
          "'strict-dynamic'",
        );

        expect(
          internalPolicy,
        ).not.toContain(
          "'unsafe-inline'",
        );

        expect(
          internalPolicy,
        ).not.toContain(
          "'unsafe-eval'",
        );

        expect(
          responsePolicy,
        ).toBe(
          internalPolicy,
        );

        expect(
          response.headers.has(
            "Content-Security-Policy",
          ),
        ).toBe(
          false,
        );

        expect(
          response.headers.get(
            "Reporting-Endpoints",
          ),
        ).toBe(
          'csp-endpoint="/api/security/csp-report"',
        );
      },
    );

    it(
      "overwrites client-supplied nonce and CSP headers",
      () => {
        vi.stubEnv(
          "STRICT_CSP_RUNTIME_MODE",
          "report-only",
        );

        proxy(
          createRequest(
            "/account",
            {
              "x-nonce":
                "attacker-controlled-nonce",

              "Content-Security-Policy":
                "default-src *",

              "Content-Security-Policy-Report-Only":
                "default-src *",
            },
          ),
        );

        const requestHeaders =
          getForwardedRequestHeaders();

        expect(
          requestHeaders.get(
            "x-nonce",
          ),
        ).not.toBe(
          "attacker-controlled-nonce",
        );

        expect(
          requestHeaders.get(
            "Content-Security-Policy",
          ),
        ).not.toBe(
          "default-src *",
        );

        expect(
          requestHeaders.has(
            "Content-Security-Policy-Report-Only",
          ),
        ).toBe(
          false,
        );
      },
    );
  },
);

/* =========================================================
   Strict enforcement runtime
========================================================= */

describe(
  "strict CSP Proxy in enforce mode",
  () => {
    it(
      "returns the enforced CSP header without report-only CSP",
      () => {
        vi.stubEnv(
          "STRICT_CSP_RUNTIME_MODE",
          "enforce",
        );

        const response =
          getMockResponse(
            proxy(
              createRequest(
                "/",
              ),
            ),
          );

        const enforcedPolicy =
          response.headers.get(
            "Content-Security-Policy",
          );

        expect(
          enforcedPolicy,
        ).toContain(
          "'strict-dynamic'",
        );

        expect(
          enforcedPolicy,
        ).toMatch(
          /'nonce-[A-Za-z0-9_-]{22,128}'/,
        );

        expect(
          enforcedPolicy,
        ).not.toContain(
          "'unsafe-inline'",
        );

        expect(
          enforcedPolicy,
        ).not.toContain(
          "'unsafe-eval'",
        );

        expect(
          response.headers.has(
            "Content-Security-Policy-Report-Only",
          ),
        ).toBe(
          false,
        );

        expect(
          response.headers.get(
            "Reporting-Endpoints",
          ),
        ).toBe(
          'csp-endpoint="/api/security/csp-report"',
        );
      },
    );
  },
);