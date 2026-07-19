import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  auditError,
  auditInfo,
  auditWarn,
  createRequestAuditContext,
  getRequestAuditHeaders,
  hashAuditIdentifier,
} from "@/lib/request-audit";

type ParsedAuditEntry = {
  timestamp: string;

  level: string;
  event: string;

  requestId: string;
  operation: string;

  route: string;
  method: string;

  durationMs: number;

  metadata?: Record<
    string,
    unknown
  >;

  error?: {
    name: string;
    message: string;

    code?: string;
    status?: number;
    stack?: string;
  };
};

function createOrderRequest(
  headers: HeadersInit = {},
): Request {
  return new Request(
    "https://store.example/api/orders",
    {
      method:
        "POST",

      headers,
    },
  );
}

function createAuditContext(
  headers: HeadersInit = {},
) {
  return createRequestAuditContext({
    request:
      createOrderRequest(
        headers,
      ),

    operation:
      "order-create",

    route:
      "/api/orders",
  });
}

function readLoggedEntry(
  call:
    | unknown[]
    | undefined,
): ParsedAuditEntry {
  const serialized =
    call?.[0];

  if (
    typeof serialized !==
    "string"
  ) {
    throw new Error(
      "Expected a serialized audit log entry.",
    );
  }

  const parsed:
    unknown =
    JSON.parse(
      serialized,
    );

  if (
    typeof parsed !==
      "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      "The audit log entry is invalid.",
    );
  }

  return parsed as
    ParsedAuditEntry;
}

beforeEach(() => {
  /*
   * Production secret নয়।
   * Test-only deterministic secret।
   */
  vi.stubEnv(
    "AUDIT_LOG_HASH_SECRET",
    "test-audit-secret-32-characters-minimum-value",
  );
});

/* =========================================================
   Correlation ID tests
========================================================= */

describe(
  "request audit correlation ID",
  () => {
    it(
      "accepts a valid incoming X-Request-Id",
      () => {
        const context =
          createAuditContext({
            "x-request-id":
              "checkout-request_1234",
          });

        expect(
          context.requestId,
        ).toBe(
          "checkout-request_1234",
        );

        expect(
          context.operation,
        ).toBe(
          "order-create",
        );

        expect(
          context.route,
        ).toBe(
          "/api/orders",
        );

        expect(
          context.method,
        ).toBe(
          "POST",
        );

        expect(
          context.startedAt,
        ).toMatch(
          /^\d{4}-\d{2}-\d{2}T/,
        );

        expect(
          context
            .startedAtMilliseconds,
        ).toBeTypeOf(
          "number",
        );
      },
    );

    it(
      "uses a valid correlation ID when X-Request-Id is invalid",
      () => {
        const context =
          createAuditContext({
            /*
             * Space allowed নয়।
             */
            "x-request-id":
              "invalid request id",

            "x-correlation-id":
              "correlation-id-9876",
          });

        expect(
          context.requestId,
        ).toBe(
          "correlation-id-9876",
        );
      },
    );

    it(
      "generates a UUID when no valid request ID exists",
      () => {
        const context =
          createAuditContext({
            /*
             * Minimum length-এর চেয়ে ছোট।
             */
            "x-request-id":
              "short",
          });

        expect(
          context.requestId,
        ).not.toBe(
          "short",
        );

        expect(
          context.requestId,
        ).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
      },
    );

    it(
      "creates the X-Request-Id response header",
      () => {
        const context =
          createAuditContext({
            "x-request-id":
              "response-header-request-123",
          });

        expect(
          getRequestAuditHeaders(
            context,
          ),
        ).toEqual({
          "X-Request-Id":
            "response-header-request-123",
        });
      },
    );
  },
);

/* =========================================================
   Identifier hashing tests
========================================================= */

describe(
  "privacy-safe audit identifier hashing",
  () => {
    it(
      "creates deterministic and namespaced HMAC identifiers",
      () => {
        const firstEmailHash =
          hashAuditIdentifier({
            type:
              "email",

            value:
              " Customer@Example.com ",
          });

        const secondEmailHash =
          hashAuditIdentifier({
            type:
              "email",

            value:
              "customer@example.com",
          });

        const otherTypeHash =
          hashAuditIdentifier({
            type:
              "other",

            value:
              "customer@example.com",
          });

        expect(
          firstEmailHash,
        ).toMatch(
          /^[a-f0-9]{64}$/,
        );

        /*
         * Normalization-এর কারণে একই email
         * একই reference তৈরি করবে।
         */
        expect(
          secondEmailHash,
        ).toBe(
          firstEmailHash,
        );

        /*
         * Identifier type namespace আলাদা হলে
         * একই raw value-এর hash আলাদা হবে।
         */
        expect(
          otherTypeHash,
        ).not.toBe(
          firstEmailHash,
        );

        expect(
          firstEmailHash,
        ).not.toContain(
          "customer",
        );

        expect(
          firstEmailHash,
        ).not.toContain(
          "example.com",
        );
      },
    );

    it(
      "returns null for empty identifiers",
      () => {
        expect(
          hashAuditIdentifier({
            type:
              "email",

            value:
              "",
          }),
        ).toBeNull();

        expect(
          hashAuditIdentifier({
            type:
              "customer",

            value:
              null,
          }),
        ).toBeNull();

        expect(
          hashAuditIdentifier({
            type:
              "other",

            value:
              undefined,
          }),
        ).toBeNull();
      },
    );
  },
);

/* =========================================================
   Metadata security tests
========================================================= */

describe(
  "structured audit metadata protection",
  () => {
    it(
      "redacts sensitive top-level and nested metadata values",
      () => {
        const infoSpy =
          vi
            .spyOn(
              console,
              "info",
            )
            .mockImplementation(
              () => undefined,
            );

        const context =
          createAuditContext({
            "x-request-id":
              "redaction-test-request-123",
          });

        auditInfo(
          context,
          "request.received",
          {
            orderId:
              542,

            outcome:
              "accepted",

            email:
              "customer@example.com",

            phone:
              "01700000000",

            authorization:
              "Bearer private-token",

            cookie:
              "session=private-session",

            apiKey:
              "private-api-key",

            idempotencyKey:
              "private-idempotency-key",

            billing: {
              firstName:
                "Private",

              address1:
                "Private address",
            },

            context: {
              safeValue:
                "preserved",

              token:
                "private-nested-token",

              rawBody:
                "private-request-body",
            },
          },
        );

        expect(
          infoSpy,
        ).toHaveBeenCalledTimes(
          1,
        );

        const serialized =
          String(
            infoSpy.mock
              .calls[0]?.[0] ??
              "",
          );

        const entry =
          readLoggedEntry(
            infoSpy.mock
              .calls[0],
          );

        expect(
          entry.level,
        ).toBe(
          "info",
        );

        expect(
          entry.event,
        ).toBe(
          "request.received",
        );

        expect(
          entry.requestId,
        ).toBe(
          "redaction-test-request-123",
        );

        expect(
          entry.metadata
            ?.orderId,
        ).toBe(
          542,
        );

        expect(
          entry.metadata
            ?.outcome,
        ).toBe(
          "accepted",
        );

        expect(
          entry.metadata
            ?.email,
        ).toBe(
          "[redacted]",
        );

        expect(
          entry.metadata
            ?.phone,
        ).toBe(
          "[redacted]",
        );

        expect(
          entry.metadata
            ?.authorization,
        ).toBe(
          "[redacted]",
        );

        expect(
          entry.metadata
            ?.cookie,
        ).toBe(
          "[redacted]",
        );

        expect(
          entry.metadata
            ?.apiKey,
        ).toBe(
          "[redacted]",
        );

        expect(
          entry.metadata
            ?.idempotencyKey,
        ).toBe(
          "[redacted]",
        );

        /*
         * billing key sensitive হওয়ায় পুরো
         * billing object redacted হবে।
         */
        expect(
          entry.metadata
            ?.billing,
        ).toBe(
          "[redacted]",
        );

        const nestedContext =
          entry.metadata
            ?.context as
            | Record<
                string,
                unknown
              >
            | undefined;

        expect(
          nestedContext
            ?.safeValue,
        ).toBe(
          "preserved",
        );

        expect(
          nestedContext
            ?.token,
        ).toBe(
          "[redacted]",
        );

        expect(
          nestedContext
            ?.rawBody,
        ).toBe(
          "[redacted]",
        );

        /*
         * Raw sensitive values serialized output-এ
         * কোনোভাবেই থাকা উচিত নয়।
         */
        expect(
          serialized,
        ).not.toContain(
          "customer@example.com",
        );

        expect(
          serialized,
        ).not.toContain(
          "01700000000",
        );

        expect(
          serialized,
        ).not.toContain(
          "private-token",
        );

        expect(
          serialized,
        ).not.toContain(
          "private-session",
        );

        expect(
          serialized,
        ).not.toContain(
          "private-api-key",
        );

        expect(
          serialized,
        ).not.toContain(
          "private-idempotency-key",
        );

        expect(
          serialized,
        ).not.toContain(
          "Private address",
        );

        expect(
          serialized,
        ).not.toContain(
          "private-request-body",
        );
      },
    );

    it(
      "truncates oversized metadata strings",
      () => {
        const infoSpy =
          vi
            .spyOn(
              console,
              "info",
            )
            .mockImplementation(
              () => undefined,
            );

        const context =
          createAuditContext();

        auditInfo(
          context,
          "request.completed",
          {
            status:
              201,

            /*
             * Sensitive key নয়, তাই value
             * redaction নয়—truncation হবে।
             */
            summary:
              "x".repeat(
                800,
              ),
          },
        );

        const entry =
          readLoggedEntry(
            infoSpy.mock
              .calls[0],
          );

        const summary =
          entry.metadata
            ?.summary;

        expect(
          typeof summary,
        ).toBe(
          "string",
        );

        expect(
          String(
            summary,
          ).length,
        ).toBe(
          501,
        );

        expect(
          String(
            summary,
          ).endsWith(
            "…",
          ),
        ).toBe(
          true,
        );
      },
    );

    it(
      "writes warning events through console.warn",
      () => {
        const warnSpy =
          vi
            .spyOn(
              console,
              "warn",
            )
            .mockImplementation(
              () => undefined,
            );

        const context =
          createAuditContext();

        auditWarn(
          context,
          "request.rejected",
          {
            status:
              403,

            code:
              "invalid_origin",
          },
        );

        expect(
          warnSpy,
        ).toHaveBeenCalledTimes(
          1,
        );

        const entry =
          readLoggedEntry(
            warnSpy.mock
              .calls[0],
          );

        expect(
          entry.level,
        ).toBe(
          "warn",
        );

        expect(
          entry.event,
        ).toBe(
          "request.rejected",
        );

        expect(
          entry.metadata,
        ).toMatchObject({
          status:
            403,

          code:
            "invalid_origin",
        });
      },
    );

    it(
      "normalizes structured errors through console.error",
      () => {
        const errorSpy =
          vi
            .spyOn(
              console,
              "error",
            )
            .mockImplementation(
              () => undefined,
            );

        const context =
          createAuditContext({
            "x-request-id":
              "error-test-request-12345",
          });

        const checkoutError =
          Object.assign(
            new Error(
              "WooCommerce request failed.",
            ),
            {
              code:
                "woocommerce_error",

              status:
                502,
            },
          );

        auditError(
          context,
          "order.failed",
          checkoutError,
          {
            stage:
              "order_creation",

            orderId:
              542,

            email:
              "private@example.com",
          },
        );

        expect(
          errorSpy,
        ).toHaveBeenCalledTimes(
          1,
        );

        const serialized =
          String(
            errorSpy.mock
              .calls[0]?.[0] ??
              "",
          );

        const entry =
          readLoggedEntry(
            errorSpy.mock
              .calls[0],
          );

        expect(
          entry.level,
        ).toBe(
          "error",
        );

        expect(
          entry.event,
        ).toBe(
          "order.failed",
        );

        expect(
          entry.requestId,
        ).toBe(
          "error-test-request-12345",
        );

        expect(
          entry.error,
        ).toMatchObject({
          name:
            "Error",

          message:
            "WooCommerce request failed.",

          code:
            "woocommerce_error",

          status:
            502,
        });

        expect(
          entry.metadata,
        ).toMatchObject({
          stage:
            "order_creation",

          orderId:
            542,

          email:
            "[redacted]",
        });

        expect(
          serialized,
        ).not.toContain(
          "private@example.com",
        );
      },
    );
  },
);