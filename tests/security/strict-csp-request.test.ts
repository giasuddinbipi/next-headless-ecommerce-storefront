import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createStrictCspRequestState,
  getStrictCspResponseHeaderName,
  isStrictCspPrefetchRequest,
  resolveStrictCspRuntimeMode,
  shouldApplyStrictCspRequest,
  shouldApplyStrictCspToPath,
  STRICT_CSP_NONCE_HEADER,
  STRICT_CSP_REQUEST_POLICY_HEADER,
} from "../../src/lib/strict-csp-request";

/* =========================================================
   Test fixtures
========================================================= */

const firstUuid =
  "123e4567-e89b-42d3-a456-426614174000";

const secondUuid =
  "223e4567-e89b-42d3-b456-426614174001";

/* =========================================================
   Runtime mode resolution
========================================================= */

describe(
  "resolveStrictCspRuntimeMode",
  () => {
    it(
      "defaults to disabled",
      () => {
        expect(
          resolveStrictCspRuntimeMode(
            undefined,
          ),
        ).toBe(
          "disabled",
        );

        expect(
          resolveStrictCspRuntimeMode(
            "",
          ),
        ).toBe(
          "disabled",
        );
      },
    );

    it(
      "normalizes supported modes",
      () => {
        expect(
          resolveStrictCspRuntimeMode(
            " REPORT-ONLY ",
          ),
        ).toBe(
          "report-only",
        );

        expect(
          resolveStrictCspRuntimeMode(
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
            resolveStrictCspRuntimeMode(
              "enabled",
            ),
        ).toThrow(
          'STRICT_CSP_RUNTIME_MODE must be "disabled", "report-only", or "enforce".',
        );
      },
    );
  },
);

/* =========================================================
   Response-header selection
========================================================= */

describe(
  "getStrictCspResponseHeaderName",
  () => {
    it(
      "selects the report-only header",
      () => {
        expect(
          getStrictCspResponseHeaderName(
            "report-only",
          ),
        ).toBe(
          "Content-Security-Policy-Report-Only",
        );
      },
    );

    it(
      "selects the enforced header",
      () => {
        expect(
          getStrictCspResponseHeaderName(
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
   Disabled request state
========================================================= */

describe(
  "disabled strict CSP request state",
  () => {
    it(
      "does not generate a nonce or policy",
      () => {
        const state =
          createStrictCspRequestState({
            mode:
              "disabled",

            requestHeaders: {
              Accept:
                "text/html",
            },
          });

        expect(
          state.enabled,
        ).toBe(
          false,
        );

        expect(
          state.nonce,
        ).toBeNull();

        expect(
          state.policy,
        ).toBeNull();

        expect(
          state.responseHeader,
        ).toBeNull();

        expect(
          state.requestHeaders.get(
            "accept",
          ),
        ).toBe(
          "text/html",
        );
      },
    );

    it(
      "removes client-supplied nonce and CSP headers",
      () => {
        const state =
          createStrictCspRequestState({
            mode:
              "disabled",

            requestHeaders: {
              "x-nonce":
                "attacker-controlled-nonce",

              "Content-Security-Policy":
                "default-src *",

              "Content-Security-Policy-Report-Only":
                "default-src *",
            },
          });

        expect(
          state.requestHeaders.has(
            STRICT_CSP_NONCE_HEADER,
          ),
        ).toBe(
          false,
        );

        expect(
          state.requestHeaders.has(
            STRICT_CSP_REQUEST_POLICY_HEADER,
          ),
        ).toBe(
          false,
        );

        expect(
          state.requestHeaders.has(
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
   Report-only request state
========================================================= */

describe(
  "report-only strict CSP request state",
  () => {
    it(
      "creates an internal request policy and browser report-only header",
      () => {
        const state =
          createStrictCspRequestState({
            mode:
              "report-only",

            isProduction:
              true,

            randomUuid:
              () =>
                firstUuid,
          });

        expect(
          state.enabled,
        ).toBe(
          true,
        );

        if (
          !state.enabled
        ) {
          throw new Error(
            "Expected strict CSP to be enabled.",
          );
        }

        expect(
          state.nonce,
        ).toBe(
          "123e4567e89b42d3a456426614174000",
        );

        expect(
          state.requestHeaders.get(
            "x-nonce",
          ),
        ).toBe(
          state.nonce,
        );

        expect(
          state.requestHeaders.get(
            "Content-Security-Policy",
          ),
        ).toBe(
          state.policy,
        );

        expect(
          state.responseHeader.key,
        ).toBe(
          "Content-Security-Policy-Report-Only",
        );

        expect(
          state.responseHeader.value,
        ).toBe(
          state.policy,
        );

        expect(
          state.policy,
        ).toContain(
          `'nonce-${state.nonce}'`,
        );
      },
    );

    it(
      "overwrites spoofed incoming security headers",
      () => {
        const state =
          createStrictCspRequestState({
            mode:
              "report-only",

            isProduction:
              true,

            randomUuid:
              () =>
                firstUuid,

            requestHeaders: {
              "x-nonce":
                "attacker-controlled-value",

              "Content-Security-Policy":
                "default-src *",
            },
          });

        expect(
          state.enabled,
        ).toBe(
          true,
        );

        if (
          !state.enabled
        ) {
          throw new Error(
            "Expected strict CSP to be enabled.",
          );
        }

        expect(
          state.requestHeaders.get(
            "x-nonce",
          ),
        ).not.toBe(
          "attacker-controlled-value",
        );

        expect(
          state.requestHeaders.get(
            "Content-Security-Policy",
          ),
        ).not.toBe(
          "default-src *",
        );
      },
    );
  },
);

/* =========================================================
   Enforced request state
========================================================= */

describe(
  "enforced strict CSP request state",
  () => {
    it(
      "creates the enforced browser response header",
      () => {
        const state =
          createStrictCspRequestState({
            mode:
              "enforce",

            isProduction:
              true,

            randomUuid:
              () =>
                firstUuid,
          });

        expect(
          state.enabled,
        ).toBe(
          true,
        );

        if (
          !state.enabled
        ) {
          throw new Error(
            "Expected strict CSP to be enabled.",
          );
        }

        expect(
          state.responseHeader.key,
        ).toBe(
          "Content-Security-Policy",
        );

        expect(
          state.policy,
        ).not.toContain(
          "'unsafe-inline'",
        );

        expect(
          state.policy,
        ).not.toContain(
          "'unsafe-eval'",
        );
      },
    );

    it(
      "creates a different nonce for a different UUID",
      () => {
        const firstState =
          createStrictCspRequestState({
            mode:
              "enforce",

            isProduction:
              true,

            randomUuid:
              () =>
                firstUuid,
          });

        const secondState =
          createStrictCspRequestState({
            mode:
              "enforce",

            isProduction:
              true,

            randomUuid:
              () =>
                secondUuid,
          });

        expect(
          firstState.nonce,
        ).not.toBe(
          secondState.nonce,
        );

        expect(
          firstState.policy,
        ).not.toBe(
          secondState.policy,
        );
      },
    );
  },
);

/* =========================================================
   Route matching
========================================================= */

describe(
  "shouldApplyStrictCspToPath",
  () => {
    it(
      "matches application page routes",
      () => {
        expect(
          shouldApplyStrictCspToPath(
            "/",
          ),
        ).toBe(
          true,
        );

        expect(
          shouldApplyStrictCspToPath(
            "/shop",
          ),
        ).toBe(
          true,
        );

        expect(
          shouldApplyStrictCspToPath(
            "/product/example-product",
          ),
        ).toBe(
          true,
        );

        expect(
          shouldApplyStrictCspToPath(
            "/account/orders",
          ),
        ).toBe(
          true,
        );
      },
    );

    it(
      "excludes API and Next.js internal routes",
      () => {
        expect(
          shouldApplyStrictCspToPath(
            "/api/checkout",
          ),
        ).toBe(
          false,
        );

        expect(
          shouldApplyStrictCspToPath(
            "/_next/static/chunk.js",
          ),
        ).toBe(
          false,
        );

        expect(
          shouldApplyStrictCspToPath(
            "/_next/image",
          ),
        ).toBe(
          false,
        );

        expect(
          shouldApplyStrictCspToPath(
            "/_next/data/build/page.json",
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "excludes metadata and static files",
      () => {
        expect(
          shouldApplyStrictCspToPath(
            "/favicon.ico",
          ),
        ).toBe(
          false,
        );

        expect(
          shouldApplyStrictCspToPath(
            "/robots.txt",
          ),
        ).toBe(
          false,
        );

        expect(
          shouldApplyStrictCspToPath(
            "/images/logo.png",
          ),
        ).toBe(
          false,
        );

        expect(
          shouldApplyStrictCspToPath(
            "/fonts/storefront.woff2",
          ),
        ).toBe(
          false,
        );
      },
    );

    it(
      "rejects malformed paths",
      () => {
        expect(
          shouldApplyStrictCspToPath(
            "",
          ),
        ).toBe(
          false,
        );

        expect(
          shouldApplyStrictCspToPath(
            "shop",
          ),
        ).toBe(
          false,
        );
      },
    );
  },
);

/* =========================================================
   Prefetch detection
========================================================= */

describe(
  "isStrictCspPrefetchRequest",
  () => {
    it(
      "detects Next.js and browser prefetch headers",
      () => {
        expect(
          isStrictCspPrefetchRequest({
            "next-router-prefetch":
              "1",
          }),
        ).toBe(
          true,
        );

        expect(
          isStrictCspPrefetchRequest({
            purpose:
              "prefetch",
          }),
        ).toBe(
          true,
        );

        expect(
          isStrictCspPrefetchRequest({
            "sec-purpose":
              "prefetch;prerender",
          }),
        ).toBe(
          true,
        );
      },
    );

    it(
      "allows ordinary navigation requests",
      () => {
        expect(
          isStrictCspPrefetchRequest({
            Accept:
              "text/html",
          }),
        ).toBe(
          false,
        );
      },
    );
  },
);

/* =========================================================
   Combined request matching
========================================================= */

describe(
  "shouldApplyStrictCspRequest",
  () => {
    it(
      "matches normal page navigation",
      () => {
        expect(
          shouldApplyStrictCspRequest({
            pathname:
              "/checkout",

            headers: {
              Accept:
                "text/html",
            },
          }),
        ).toBe(
          true,
        );
      },
    );

    it(
      "rejects prefetch and non-page requests",
      () => {
        expect(
          shouldApplyStrictCspRequest({
            pathname:
              "/shop",

            headers: {
              purpose:
                "prefetch",
            },
          }),
        ).toBe(
          false,
        );

        expect(
          shouldApplyStrictCspRequest({
            pathname:
              "/api/products",
          }),
        ).toBe(
          false,
        );
      },
    );
  },
);