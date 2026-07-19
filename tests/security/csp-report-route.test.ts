import {
  NextRequest,
} from "next/server";

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/* =========================================================
   Hoisted CSP protection mocks
========================================================= */

const protectionBridge =
  vi.hoisted(() => ({
    checkRateLimit:
      vi.fn(),

    getRateLimitHeaders:
      vi.fn(),

    checkDuplicate:
      vi.fn(),
  }));

vi.mock(
  "@/lib/csp-report-protection",
  () => ({
    checkCspReportRateLimit:
      protectionBridge
        .checkRateLimit,

    getCspReportRateLimitHeaders:
      protectionBridge
        .getRateLimitHeaders,

    checkCspReportDuplicate:
      protectionBridge
        .checkDuplicate,
  }),
);

/*
 * Import the route only after defining the mocked dependency.
 */
import {
  POST,
} from "@/app/api/security/csp-report/route";

/* =========================================================
   Types
========================================================= */

type UnknownRecord =
  Record<string, unknown>;

type MockRateLimitResult = {
  allowed:
    boolean;

  degraded:
    boolean;

  limit:
    number;

  remaining:
    number;

  reset:
    number;

  retryAfterSeconds:
    number;
};

/* =========================================================
   Helpers
========================================================= */

function isRecord(
  value:
    unknown,
): value is UnknownRecord {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value,
    )
  );
}

async function readJsonResponse(
  response:
    Response,
): Promise<UnknownRecord> {
  const payload:
    unknown =
    await response.json();

  if (
    !isRecord(
      payload,
    )
  ) {
    throw new Error(
      "Expected a JSON object response.",
    );
  }

  return payload;
}

function createRequest({
  body,
  contentType =
    "application/csp-report",

  contentLength,
}: {
  body:
    string;

  contentType?:
    string;

  contentLength?:
    string;
}): NextRequest {
  const headers =
    new Headers({
      "Content-Type":
        contentType,

      /*
       * A predictable test IP is used.
       * The mocked protection module prevents Redis access.
       */
      "X-Forwarded-For":
        "203.0.113.45",
    });

  if (
    contentLength
  ) {
    headers.set(
      "Content-Length",
      contentLength,
    );
  }

  return new NextRequest(
    "https://store.example/api/security/csp-report",
    {
      method:
        "POST",

      headers,

      body,
    },
  );
}

function readLoggedObject(
  value:
    unknown,
): UnknownRecord {
  const parsed:
    unknown =
    JSON.parse(
      String(
        value ??
          "",
      ),
    );

  if (
    !isRecord(
      parsed,
    )
  ) {
    throw new Error(
      "Expected a structured CSP audit object.",
    );
  }

  return parsed;
}

function createRateLimitHeaders(
  result:
    MockRateLimitResult,
): Record<
  string,
  string
> {
  if (
    result.degraded
  ) {
    return {
      "X-CSP-RateLimit-Degraded":
        "true",
    };
  }

  const headers:
    Record<string, string> = {
    "X-CSP-RateLimit-Degraded":
      "false",

    "RateLimit-Limit":
      String(
        result.limit,
      ),

    "RateLimit-Remaining":
      String(
        result.remaining,
      ),

    "RateLimit-Reset":
      String(
        Math.ceil(
          result.reset /
            1_000,
        ),
      ),
  };

  if (
    !result.allowed
  ) {
    headers[
      "Retry-After"
    ] =
      String(
        result
          .retryAfterSeconds,
      );
  }

  return headers;
}

/* =========================================================
   Setup and cleanup
========================================================= */

beforeEach(() => {
  protectionBridge
    .checkRateLimit
    .mockReset()
    .mockResolvedValue({
      allowed:
        true,

      degraded:
        false,

      limit:
        60,

      remaining:
        59,

      reset:
        Date.now() +
        60_000,

      retryAfterSeconds:
        0,
    });

  protectionBridge
    .getRateLimitHeaders
    .mockReset()
    .mockImplementation(
      createRateLimitHeaders,
    );

  protectionBridge
    .checkDuplicate
    .mockReset()
    .mockResolvedValue({
      duplicate:
        false,

      degraded:
        false,

      reason:
        "first_seen",
    });
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* =========================================================
   Actionable legacy reports
========================================================= */

describe(
  "POST /api/security/csp-report actionable reports",
  () => {
    it(
      "classifies and safely logs an inline script violation",
      async () => {
        const warnSpy =
          vi
            .spyOn(
              console,
              "warn",
            )
            .mockImplementation(
              () => undefined,
            );

        const infoSpy =
          vi
            .spyOn(
              console,
              "info",
            )
            .mockImplementation(
              () => undefined,
            );

        const sensitiveValue =
          "private-checkout-token";

        const response =
          await POST(
            createRequest({
              body:
                JSON.stringify({
                  "csp-report": {
                    "document-uri":
                      `https://store.example/checkout?token=${sensitiveValue}`,

                    "blocked-uri":
                      "inline",

                    "source-file":
                      `https://store.example/assets/app.js?debug=${sensitiveValue}`,

                    "effective-directive":
                      "script-src-elem",

                    "violated-directive":
                      "script-src 'self'",

                    disposition:
                      "report",

                    "status-code":
                      200,
                  },
                }),
            }),
          );

        expect(
          response.status,
        ).toBe(
          204,
        );

        expect(
          response.headers.get(
            "x-csp-reports-accepted",
          ),
        ).toBe(
          "1",
        );

        expect(
          response.headers.get(
            "x-csp-actionable-reports",
          ),
        ).toBe(
          "1",
        );

        expect(
          response.headers.get(
            "x-csp-noise-reports",
          ),
        ).toBe(
          "0",
        );

        expect(
          response.headers.get(
            "x-csp-duplicate-reports",
          ),
        ).toBe(
          "0",
        );

        expect(
          response.headers.get(
            "x-csp-logged-reports",
          ),
        ).toBe(
          "1",
        );

        expect(
          response.headers.get(
            "x-csp-duplicate-protection-degraded",
          ),
        ).toBe(
          "false",
        );

        expect(
          response.headers.get(
            "x-csp-ratelimit-degraded",
          ),
        ).toBe(
          "false",
        );

        expect(
          response.headers.get(
            "ratelimit-limit",
          ),
        ).toBe(
          "60",
        );

        expect(
          response.headers.get(
            "ratelimit-remaining",
          ),
        ).toBe(
          "59",
        );

        expect(
          response.headers.get(
            "x-request-id",
          ),
        ).toEqual(
          expect.any(
            String,
          ),
        );

        expect(
          response.headers.get(
            "cache-control",
          ),
        ).toContain(
          "no-store",
        );

        expect(
          protectionBridge
            .checkRateLimit,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          protectionBridge
            .checkDuplicate,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          warnSpy,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          infoSpy,
        ).not.toHaveBeenCalled();

        const serialized =
          String(
            warnSpy.mock
              .calls[0]?.[0] ??
              "",
          );

        const entry =
          readLoggedObject(
            serialized,
          );

        expect(
          entry,
        ).toMatchObject({
          level:
            "warn",

          event:
            "security.csp_violation",

          analysis: {
            category:
              "script",

            directive:
              "script-src-elem",

            blockedResourceKind:
              "inline",

            severity:
              "high",

            actionable:
              true,

            reason:
              "inline_script_violation",

            disposition:
              "report",

            statusCode:
              200,
          },

          protection: {
            duplicateCheckDegraded:
              false,

            duplicateReason:
              "first_seen",
          },
        });

        const analysis =
          entry.analysis as
            UnknownRecord;

        expect(
          analysis
            .fingerprint,
        ).toMatch(
          /^[a-f0-9]{24}$/,
        );

        expect(
          serialized,
        ).not.toContain(
          sensitiveValue,
        );

        expect(
          serialized,
        ).not.toContain(
          "/checkout",
        );

        expect(
          serialized,
        ).not.toContain(
          "/assets/app.js",
        );
      },
    );

    it(
      "creates a stable fingerprint for identical reports",
      async () => {
        const warnSpy =
          vi
            .spyOn(
              console,
              "warn",
            )
            .mockImplementation(
              () => undefined,
            );

        const infoSpy =
          vi
            .spyOn(
              console,
              "info",
            )
            .mockImplementation(
              () => undefined,
            );

        const payload =
          JSON.stringify([
            {
              type:
                "csp-violation",

              body: {
                documentURL:
                  "https://store.example/",

                blockedURL:
                  "https://cdn.example",

                effectiveDirective:
                  "script-src-elem",

                disposition:
                  "report",

                statusCode:
                  200,
              },
            },

            {
              type:
                "csp-violation",

              body: {
                documentURL:
                  "https://store.example/",

                blockedURL:
                  "https://cdn.example",

                effectiveDirective:
                  "script-src-elem",

                disposition:
                  "report",

                statusCode:
                  200,
              },
            },
          ]);

        const response =
          await POST(
            createRequest({
              contentType:
                "application/reports+json",

              body:
                payload,
            }),
          );

        expect(
          response.status,
        ).toBe(
          204,
        );

        expect(
          response.headers.get(
            "x-csp-reports-accepted",
          ),
        ).toBe(
          "2",
        );

        expect(
          response.headers.get(
            "x-csp-duplicate-reports",
          ),
        ).toBe(
          "0",
        );

        expect(
          response.headers.get(
            "x-csp-logged-reports",
          ),
        ).toBe(
          "2",
        );

        expect(
          protectionBridge
            .checkDuplicate,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          warnSpy,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          infoSpy,
        ).not.toHaveBeenCalled();

        const firstEntry =
          readLoggedObject(
            warnSpy.mock
              .calls[0]?.[0],
          );

        const secondEntry =
          readLoggedObject(
            warnSpy.mock
              .calls[1]?.[0],
          );

        const firstAnalysis =
          firstEntry.analysis as
            UnknownRecord;

        const secondAnalysis =
          secondEntry.analysis as
            UnknownRecord;

        expect(
          firstAnalysis
            .fingerprint,
        ).toBe(
          secondAnalysis
            .fingerprint,
        );
      },
    );
  },
);

/* =========================================================
   Modern actionable and noise reports
========================================================= */

describe(
  "POST /api/security/csp-report mixed modern reports",
  () => {
    it(
      "separates actionable reports from browser-extension noise",
      async () => {
        const warnSpy =
          vi
            .spyOn(
              console,
              "warn",
            )
            .mockImplementation(
              () => undefined,
            );

        const infoSpy =
          vi
            .spyOn(
              console,
              "info",
            )
            .mockImplementation(
              () => undefined,
            );

        const response =
          await POST(
            createRequest({
              contentType:
                "application/reports+json",

              body:
                JSON.stringify([
                  {
                    type:
                      "csp-violation",

                    body: {
                      documentURL:
                        "https://store.example/",

                      blockedURL:
                        "https://tracking.example",

                      effectiveDirective:
                        "connect-src",

                      disposition:
                        "report",

                      statusCode:
                        200,
                    },
                  },

                  {
                    type:
                      "csp-violation",

                    body: {
                      documentURL:
                        "https://store.example/shop",

                      blockedURL:
                        "chrome-extension://example/script.js",

                      effectiveDirective:
                        "script-src-elem",

                      disposition:
                        "report",

                      statusCode:
                        200,
                    },
                  },
                ]),
            }),
          );

        expect(
          response.status,
        ).toBe(
          204,
        );

        expect(
          response.headers.get(
            "x-csp-reports-accepted",
          ),
        ).toBe(
          "2",
        );

        expect(
          response.headers.get(
            "x-csp-actionable-reports",
          ),
        ).toBe(
          "1",
        );

        expect(
          response.headers.get(
            "x-csp-noise-reports",
          ),
        ).toBe(
          "1",
        );

        expect(
          response.headers.get(
            "x-csp-duplicate-reports",
          ),
        ).toBe(
          "0",
        );

        expect(
          response.headers.get(
            "x-csp-logged-reports",
          ),
        ).toBe(
          "2",
        );

        expect(
          protectionBridge
            .checkDuplicate,
        ).toHaveBeenCalledTimes(
          2,
        );

        expect(
          warnSpy,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          infoSpy,
        ).toHaveBeenCalledTimes(
          1,
        );

        const actionableEntry =
          readLoggedObject(
            warnSpy.mock
              .calls[0]?.[0],
          );

        expect(
          actionableEntry,
        ).toMatchObject({
          level:
            "warn",

          analysis: {
            category:
              "connect",

            blockedResourceKind:
              "external",

            severity:
              "high",

            actionable:
              true,

            reason:
              "external_connection_violation",
          },

          protection: {
            duplicateCheckDegraded:
              false,

            duplicateReason:
              "first_seen",
          },
        });

        const noiseEntry =
          readLoggedObject(
            infoSpy.mock
              .calls[0]?.[0],
          );

        expect(
          noiseEntry,
        ).toMatchObject({
          level:
            "info",

          analysis: {
            blockedResourceKind:
              "browser-extension",

            severity:
              "low",

            actionable:
              false,

            reason:
              "browser_extension_noise",
          },

          protection: {
            duplicateCheckDegraded:
              false,

            duplicateReason:
              "first_seen",
          },
        });
      },
    );
  },
);

/* =========================================================
   Request validation
========================================================= */

describe(
  "POST /api/security/csp-report validation",
  () => {
    it(
      "rejects unsupported content types",
      async () => {
        const warnSpy =
          vi
            .spyOn(
              console,
              "warn",
            )
            .mockImplementation(
              () => undefined,
            );

        const infoSpy =
          vi
            .spyOn(
              console,
              "info",
            )
            .mockImplementation(
              () => undefined,
            );

        const response =
          await POST(
            createRequest({
              contentType:
                "text/plain",

              body:
                "{}",
            }),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          415,
        );

        expect(
          data,
        ).toMatchObject({
          error: {
            code:
              "unsupported_csp_report_media_type",
          },
        });

        expect(
          response.headers.get(
            "x-csp-ratelimit-degraded",
          ),
        ).toBe(
          "false",
        );

        expect(
          protectionBridge
            .checkRateLimit,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          protectionBridge
            .checkDuplicate,
        ).not.toHaveBeenCalled();

        expect(
          warnSpy,
        ).not.toHaveBeenCalled();

        expect(
          infoSpy,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects invalid JSON",
      async () => {
        const response =
          await POST(
            createRequest({
              body:
                "{invalid-json",
            }),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          400,
        );

        expect(
          data,
        ).toMatchObject({
          error: {
            code:
              "csp_report_invalid_json",
          },
        });

        expect(
          protectionBridge
            .checkDuplicate,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects empty reports",
      async () => {
        const response =
          await POST(
            createRequest({
              body:
                "",
            }),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          400,
        );

        expect(
          data,
        ).toMatchObject({
          error: {
            code:
              "csp_report_empty",
          },
        });

        expect(
          protectionBridge
            .checkDuplicate,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects unrecognized report objects",
      async () => {
        const response =
          await POST(
            createRequest({
              contentType:
                "application/json",

              body:
                JSON.stringify({
                  message:
                    "not a CSP report",
                }),
            }),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          400,
        );

        expect(
          data,
        ).toMatchObject({
          error: {
            code:
              "csp_report_invalid",
          },
        });

        expect(
          protectionBridge
            .checkDuplicate,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects an oversized Content-Length value",
      async () => {
        const response =
          await POST(
            createRequest({
              body:
                "{}",

              contentLength:
                String(
                  32 * 1_024 +
                  1,
                ),
            }),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          413,
        );

        expect(
          data,
        ).toMatchObject({
          error: {
            code:
              "csp_report_too_large",
          },
        });

        expect(
          protectionBridge
            .checkDuplicate,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects an oversized actual request body",
      async () => {
        const oversizedText =
          "a".repeat(
            32 * 1_024 +
            1,
          );

        const response =
          await POST(
            createRequest({
              contentType:
                "application/json",

              body:
                JSON.stringify({
                  "csp-report": {
                    "document-uri":
                      "https://store.example/",

                    "violated-directive":
                      oversizedText,
                  },
                }),
            }),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          413,
        );

        expect(
          data,
        ).toMatchObject({
          error: {
            code:
              "csp_report_too_large",
          },
        });

        expect(
          protectionBridge
            .checkDuplicate,
        ).not.toHaveBeenCalled();
      },
    );
  },
);