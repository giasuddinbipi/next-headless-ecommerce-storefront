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
   Hoisted protection bridge
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

import {
  POST,
} from "@/app/api/security/csp-report/route";

/* =========================================================
   Helpers
========================================================= */

type UnknownRecord =
  Record<string, unknown>;

function isRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function createRequest(
  body: unknown,
): NextRequest {
  return new NextRequest(
    "https://store.example/api/security/csp-report",
    {
      method:
        "POST",

      headers: {
        "Content-Type":
          "application/csp-report",

        "X-Forwarded-For":
          "203.0.113.20",
      },

      body:
        JSON.stringify(body),
    },
  );
}

function createInlineReport() {
  return {
    "csp-report": {
      "document-uri":
        "https://store.example/checkout",

      "blocked-uri":
        "inline",

      "effective-directive":
        "script-src-elem",

      "violated-directive":
        "script-src 'self'",

      disposition:
        "report",

      "status-code":
        200,
    },
  };
}

async function readJsonResponse(
  response: Response,
): Promise<UnknownRecord> {
  const payload: unknown =
    await response.json();

  if (!isRecord(payload)) {
    throw new Error(
      "Expected a JSON object response.",
    );
  }

  return payload;
}

/* =========================================================
   Setup
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
      (
        result: {
          allowed: boolean;
          degraded: boolean;
          limit: number;
          remaining: number;
          reset: number;
          retryAfterSeconds: number;
        },
      ) => {
        if (result.degraded) {
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

        if (!result.allowed) {
          headers["Retry-After"] =
            String(
              result
                .retryAfterSeconds,
            );
        }

        return headers;
      },
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
   Rate limiting
========================================================= */

describe(
  "CSP report route rate limiting",
  () => {
    it(
      "returns 429 before parsing a blocked request",
      async () => {
        const reset =
          Date.now() +
          20_000;

        protectionBridge
          .checkRateLimit
          .mockResolvedValue({
            allowed:
              false,

            degraded:
              false,

            limit:
              60,

            remaining:
              0,

            reset,

            retryAfterSeconds:
              20,
          });

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
            createRequest(
              createInlineReport(),
            ),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          429,
        );

        expect(
          data,
        ).toMatchObject({
          error: {
            code:
              "csp_report_rate_limited",
          },
        });

        expect(
          response.headers.get(
            "retry-after",
          ),
        ).toBe(
          "20",
        );

        expect(
          response.headers.get(
            "ratelimit-remaining",
          ),
        ).toBe(
          "0",
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
      "exposes degraded rate-limit mode while accepting reports",
      async () => {
        protectionBridge
          .checkRateLimit
          .mockResolvedValue({
            allowed:
              true,

            degraded:
              true,

            limit:
              0,

            remaining:
              0,

            reset:
              Date.now(),

            retryAfterSeconds:
              0,
          });

        vi
          .spyOn(
            console,
            "warn",
          )
          .mockImplementation(
            () => undefined,
          );

        const response =
          await POST(
            createRequest(
              createInlineReport(),
            ),
          );

        expect(
          response.status,
        ).toBe(
          204,
        );

        expect(
          response.headers.get(
            "x-csp-ratelimit-degraded",
          ),
        ).toBe(
          "true",
        );
      },
    );
  },
);

/* =========================================================
   Duplicate suppression
========================================================= */

describe(
  "CSP report route duplicate suppression",
  () => {
    it(
      "suppresses an already-seen fingerprint",
      async () => {
        protectionBridge
          .checkDuplicate
          .mockResolvedValue({
            duplicate:
              true,

            degraded:
              false,

            reason:
              "duplicate",
          });

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
            createRequest(
              createInlineReport(),
            ),
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
            "x-csp-duplicate-reports",
          ),
        ).toBe(
          "1",
        );

        expect(
          response.headers.get(
            "x-csp-logged-reports",
          ),
        ).toBe(
          "0",
        );

        expect(
          warnSpy,
        ).not.toHaveBeenCalled();

        expect(
          infoSpy,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "logs the report when duplicate protection is degraded",
      async () => {
        protectionBridge
          .checkDuplicate
          .mockResolvedValue({
            duplicate:
              false,

            degraded:
              true,

            reason:
              "protection_degraded",
          });

        const warnSpy =
          vi
            .spyOn(
              console,
              "warn",
            )
            .mockImplementation(
              () => undefined,
            );

        const response =
          await POST(
            createRequest(
              createInlineReport(),
            ),
          );

        expect(
          response.status,
        ).toBe(
          204,
        );

        expect(
          response.headers.get(
            "x-csp-duplicate-protection-degraded",
          ),
        ).toBe(
          "true",
        );

        expect(
          response.headers.get(
            "x-csp-logged-reports",
          ),
        ).toBe(
          "1",
        );

        expect(
          warnSpy,
        ).toHaveBeenCalledTimes(
          1,
        );

        const serialized =
          String(
            warnSpy.mock
              .calls[0]?.[0] ??
              "",
          );

        expect(
          serialized,
        ).toContain(
          '"duplicateCheckDegraded":true',
        );

        expect(
          serialized,
        ).toContain(
          '"duplicateReason":"protection_degraded"',
        );
      },
    );

    it(
      "counts mixed first-seen and duplicate reports",
      async () => {
        protectionBridge
          .checkDuplicate
          .mockResolvedValueOnce({
            duplicate:
              false,

            degraded:
              false,

            reason:
              "first_seen",
          })
          .mockResolvedValueOnce({
            duplicate:
              true,

            degraded:
              false,

            reason:
              "duplicate",
          });

        const warnSpy =
          vi
            .spyOn(
              console,
              "warn",
            )
            .mockImplementation(
              () => undefined,
            );

        const response =
          await POST(
            createRequest([
              {
                type:
                  "csp-violation",

                body: {
                  documentURL:
                    "https://store.example/",

                  blockedURL:
                    "inline",

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
                    "inline",

                  effectiveDirective:
                    "script-src-elem",

                  disposition:
                    "report",

                  statusCode:
                    200,
                },
              },
            ]),
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
          "1",
        );

        expect(
          response.headers.get(
            "x-csp-logged-reports",
          ),
        ).toBe(
          "1",
        );

        expect(
          warnSpy,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );
  },
);