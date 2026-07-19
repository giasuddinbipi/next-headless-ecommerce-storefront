import {
  NextRequest,
} from "next/server";

import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  POST,
} from "@/app/api/security/csp-report/route";

/* =========================================================
   Types and helpers
========================================================= */

type UnknownRecord =
  Record<string, unknown>;

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

afterEach(() => {
  vi.restoreAllMocks();
});

/* =========================================================
   Legacy CSP reports
========================================================= */

describe(
  "POST /api/security/csp-report legacy reports",
  () => {
    it(
      "accepts and safely logs a legacy CSP report",
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
                      `https://cdn.example/script.js?secret=${sensitiveValue}`,

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
          '"event":"security.csp_violation"',
        );

        expect(
          serialized,
        ).toContain(
          "https://store.example",
        );

        expect(
          serialized,
        ).toContain(
          "https://cdn.example",
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
          "/script.js",
        );
      },
    );
  },
);

/* =========================================================
   Modern reporting payloads
========================================================= */

describe(
  "POST /api/security/csp-report modern reports",
  () => {
    it(
      "accepts an array of modern CSP reports",
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
                        "https://store.example/shop",

                      blockedURL:
                        "https://images.example/product.jpg",

                      effectiveDirective:
                        "img-src",

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
          warnSpy,
        ).toHaveBeenCalledTimes(
          2,
        );
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
          warnSpy,
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
      },
    );
  },
);