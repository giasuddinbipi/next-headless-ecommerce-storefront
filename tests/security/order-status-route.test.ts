import {
  NextRequest,
} from "next/server";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/* =========================================================
   Shared mock bridge
========================================================= */

const routeBridge =
  vi.hoisted(() => ({
    auth:
      vi.fn(),

    checkOrderStatusRateLimit:
      vi.fn(),

    getCheckoutRateLimitHeaders:
      vi.fn(),

    createOrderIdempotencyScope:
      vi.fn(),

    getOrderIdempotencyStatus:
      vi.fn(),

    readOrderIdempotencyKey:
      vi.fn(),

    auditError:
      vi.fn(),

    auditInfo:
      vi.fn(),

    auditWarn:
      vi.fn(),

    createRequestAuditContext:
      vi.fn(),

    getRequestAuditHeaders:
      vi.fn(),

    hashAuditIdentifier:
      vi.fn(),
  }));

/* =========================================================
   Module mocks
========================================================= */

vi.mock(
  "@/auth",
  () => ({
    auth:
      routeBridge.auth,
  }),
);

vi.mock(
  "@/lib/checkout-rate-limit",
  () => ({
    checkOrderStatusRateLimit:
      routeBridge
        .checkOrderStatusRateLimit,

    getCheckoutRateLimitHeaders:
      routeBridge
        .getCheckoutRateLimitHeaders,
  }),
);

vi.mock(
  "@/lib/order-idempotency",
  () => {
    class OrderIdempotencyError extends Error {
      status: number;
      code: string;

      constructor(
        message: string,
        status = 400,
        code =
          "idempotency_error",
      ) {
        super(message);

        this.name =
          "OrderIdempotencyError";

        this.status =
          status;

        this.code =
          code;
      }
    }

    return {
      createOrderIdempotencyScope:
        routeBridge
          .createOrderIdempotencyScope,

      getOrderIdempotencyStatus:
        routeBridge
          .getOrderIdempotencyStatus,

      OrderIdempotencyError,

      readOrderIdempotencyKey:
        routeBridge
          .readOrderIdempotencyKey,
    };
  },
);

vi.mock(
  "@/lib/request-audit",
  () => ({
    auditError:
      routeBridge.auditError,

    auditInfo:
      routeBridge.auditInfo,

    auditWarn:
      routeBridge.auditWarn,

    createRequestAuditContext:
      routeBridge
        .createRequestAuditContext,

    getRequestAuditHeaders:
      routeBridge
        .getRequestAuditHeaders,

    hashAuditIdentifier:
      routeBridge
        .hashAuditIdentifier,
  }),
);

/*
 * সব mock declaration-এর পরে route import।
 */
import {
  POST,
} from "@/app/api/orders/idempotency-status/route";

import {
  OrderIdempotencyError,
} from "@/lib/order-idempotency";

/* =========================================================
   Types and constants
========================================================= */

type UnknownRecord =
  Record<string, unknown>;

type MockRateLimitResult = {
  allowed: boolean;
  degraded: boolean;

  blockedScope:
    | "subject"
    | "ip"
    | null;

  limit: number;
  remaining: number;
  reset: number;

  retryAfterSeconds:
    number;
};

const REQUEST_ID =
  "status-route-request-123456";

const ORIGINAL_ORDER_REQUEST_ID =
  "original-order-request-987654";

const IDEMPOTENCY_KEY =
  "status-route-idempotency-key-123456";

const IDEMPOTENCY_SCOPE =
  "customer-status-scope";

/* =========================================================
   Helpers
========================================================= */

function isObject(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

async function readJsonResponse(
  response: Response,
): Promise<UnknownRecord> {
  const data:
    unknown =
    await response.json();

  if (
    !isObject(data)
  ) {
    throw new Error(
      "Expected a JSON object response.",
    );
  }

  return data;
}

function createStatusRequest({
  origin =
    "https://store.example",

  body = {
    billingEmail:
      "customer@example.com",
  } as UnknownRecord,

  idempotencyKey =
    IDEMPOTENCY_KEY,
}: {
  origin?: string;

  body?: UnknownRecord;

  idempotencyKey?: string;
} = {}): NextRequest {
  return new NextRequest(
    "https://store.example/api/orders/idempotency-status",
    {
      method:
        "POST",

      headers: {
        Accept:
          "application/json",

        "Content-Type":
          "application/json",

        Origin:
          origin,

        "Idempotency-Key":
          idempotencyKey,
      },

      body:
        JSON.stringify(
          body,
        ),
    },
  );
}

function createAllowedRateLimitResult():
  MockRateLimitResult {
  return {
    allowed:
      true,

    degraded:
      false,

    blockedScope:
      null,

    limit:
      30,

    remaining:
      29,

    reset:
      Date.now() +
      60_000,

    retryAfterSeconds:
      0,
  };
}

/* =========================================================
   Default mocks
========================================================= */

beforeEach(() => {
  routeBridge.auth
    .mockReset();

  routeBridge
    .checkOrderStatusRateLimit
    .mockReset();

  routeBridge
    .getCheckoutRateLimitHeaders
    .mockReset();

  routeBridge
    .createOrderIdempotencyScope
    .mockReset();

  routeBridge
    .getOrderIdempotencyStatus
    .mockReset();

  routeBridge
    .readOrderIdempotencyKey
    .mockReset();

  routeBridge.auditError
    .mockReset();

  routeBridge.auditInfo
    .mockReset();

  routeBridge.auditWarn
    .mockReset();

  routeBridge
    .createRequestAuditContext
    .mockReset();

  routeBridge
    .getRequestAuditHeaders
    .mockReset();

  routeBridge
    .hashAuditIdentifier
    .mockReset();

  routeBridge.auth
    .mockResolvedValue({
      user: {
        customerId:
          42,

        email:
          "customer@example.com",
      },
    });

  routeBridge
    .createRequestAuditContext
    .mockReturnValue({
      requestId:
        REQUEST_ID,

      operation:
        "order-status",

      route:
        "/api/orders/idempotency-status",

      method:
        "POST",

      startedAt:
        "2026-07-19T12:00:00.000Z",

      startedAtMilliseconds:
        Date.now(),
    });

  routeBridge
    .getRequestAuditHeaders
    .mockReturnValue({
      "X-Request-Id":
        REQUEST_ID,
    });

  routeBridge
    .hashAuditIdentifier
    .mockReturnValue(
      "privacy-safe-reference",
    );

  routeBridge
    .readOrderIdempotencyKey
    .mockImplementation(
      (
        request:
          Request,
      ) =>
        request.headers.get(
          "idempotency-key",
        ) ??
        "",
    );

  routeBridge
    .createOrderIdempotencyScope
    .mockReturnValue(
      IDEMPOTENCY_SCOPE,
    );

  routeBridge
    .checkOrderStatusRateLimit
    .mockResolvedValue(
      createAllowedRateLimitResult(),
    );

  routeBridge
    .getCheckoutRateLimitHeaders
    .mockImplementation(
      (
        result:
          MockRateLimitResult,
      ) => {
        const headers:
          Record<string, string> = {
          "X-RateLimit-Degraded":
            result.degraded
              ? "true"
              : "false",
        };

        if (
          !result.degraded
        ) {
          headers[
            "RateLimit-Limit"
          ] =
            String(
              result.limit,
            );

          headers[
            "RateLimit-Remaining"
          ] =
            String(
              result.remaining,
            );

          headers[
            "RateLimit-Reset"
          ] =
            String(
              Math.ceil(
                result.reset /
                  1_000,
              ),
            );
        }

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
      },
    );

  routeBridge
    .getOrderIdempotencyStatus
    .mockResolvedValue({
      kind:
        "not_found",
    });
});

/* =========================================================
   Request security tests
========================================================= */

describe(
  "POST /api/orders/idempotency-status request protection",
  () => {
    it(
      "rejects a cross-origin status request",
      async () => {
        const response =
          await POST(
            createStatusRequest({
              origin:
                "https://attacker.example",
            }),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          403,
        );

        expect(
          data,
        ).toMatchObject({
          success:
            false,

          requestId:
            REQUEST_ID,

          code:
            "invalid_origin",
        });

        expect(
          response.headers.get(
            "x-request-id",
          ),
        ).toBe(
          REQUEST_ID,
        );

        expect(
          routeBridge
            .readOrderIdempotencyKey,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge
            .checkOrderStatusRateLimit,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge
            .getOrderIdempotencyStatus,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "requires a billing email for guest recovery",
      async () => {
        routeBridge.auth
          .mockResolvedValue(
            null,
          );

        const response =
          await POST(
            createStatusRequest({
              body: {},
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
          success:
            false,

          requestId:
            REQUEST_ID,

          code:
            "billing_email_required",
        });

        expect(
          routeBridge
            .checkOrderStatusRateLimit,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge
            .getOrderIdempotencyStatus,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "rejects an invalid guest billing email",
      async () => {
        routeBridge.auth
          .mockResolvedValue(
            null,
          );

        const response =
          await POST(
            createStatusRequest({
              body: {
                billingEmail:
                  "invalid-email",
              },
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
          success:
            false,

          requestId:
            REQUEST_ID,

          code:
            "invalid_billing_email",
        });

        expect(
          routeBridge
            .checkOrderStatusRateLimit,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "allows an authenticated customer to omit billing email",
      async () => {
        routeBridge
          .getOrderIdempotencyStatus
          .mockResolvedValue({
            kind:
              "not_found",
          });

        const response =
          await POST(
            createStatusRequest({
              body: {},
            }),
          );

        expect(
          response.status,
        ).toBe(
          404,
        );

        expect(
          routeBridge
            .createOrderIdempotencyScope,
        ).toHaveBeenCalledWith({
          customerId:
            42,

          billingEmail:
            undefined,
        });

        expect(
          routeBridge
            .checkOrderStatusRateLimit,
        ).toHaveBeenCalledWith({
          request:
            expect.any(
              NextRequest,
            ),

          customerId:
            42,

          billingEmail:
            "",
        });
      },
    );
  },
);

/* =========================================================
   Rate-limit tests
========================================================= */

describe(
  "POST /api/orders/idempotency-status rate limiting",
  () => {
    it(
      "returns HTTP 429 before the Redis status lookup",
      async () => {
        const reset =
          Date.now() +
          45_000;

        routeBridge
          .checkOrderStatusRateLimit
          .mockResolvedValue({
            allowed:
              false,

            degraded:
              false,

            blockedScope:
              "subject",

            limit:
              30,

            remaining:
              0,

            reset,

            retryAfterSeconds:
              45,
          });

        const response =
          await POST(
            createStatusRequest(),
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
          success:
            false,

          requestId:
            REQUEST_ID,

          status:
            "rate_limited",

          code:
            "order_status_rate_limited",

          retryAfter:
            45,
        });

        expect(
          response.headers.get(
            "retry-after",
          ),
        ).toBe(
          "45",
        );

        expect(
          response.headers.get(
            "ratelimit-remaining",
          ),
        ).toBe(
          "0",
        );

        expect(
          response.headers.get(
            "x-request-id",
          ),
        ).toBe(
          REQUEST_ID,
        );

        expect(
          routeBridge
            .getOrderIdempotencyStatus,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge.auditWarn,
        ).toHaveBeenCalledWith(
          expect.anything(),
          "order_status.rate_limited",
          expect.objectContaining({
            blockedScope:
              "subject",

            retryAfterSeconds:
              45,
          }),
        );
      },
    );
  },
);

/* =========================================================
   Status-result tests
========================================================= */

describe(
  "POST /api/orders/idempotency-status results",
  () => {
    it(
      "returns HTTP 404 for an unknown attempt",
      async () => {
        routeBridge
          .getOrderIdempotencyStatus
          .mockResolvedValue({
            kind:
              "not_found",
          });

        const response =
          await POST(
            createStatusRequest(),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          404,
        );

        expect(
          data,
        ).toMatchObject({
          success:
            false,

          requestId:
            REQUEST_ID,

          status:
            "not_found",

          code:
            "order_attempt_not_found",
        });

        expect(
          response.headers.get(
            "x-request-id",
          ),
        ).toBe(
          REQUEST_ID,
        );

        expect(
          response.headers.get(
            "idempotency-replayed",
          ),
        ).toBe(
          "false",
        );

        expect(
          routeBridge
            .getOrderIdempotencyStatus,
        ).toHaveBeenCalledWith({
          idempotencyKey:
            IDEMPOTENCY_KEY,

          scope:
            IDEMPOTENCY_SCOPE,
        });

        expect(
          routeBridge.auditWarn,
        ).toHaveBeenCalledWith(
          expect.anything(),
          "order_status.not_found",
          expect.anything(),
        );
      },
    );

    it(
      "returns HTTP 202 while the order is processing",
      async () => {
        routeBridge
          .getOrderIdempotencyStatus
          .mockResolvedValue({
            kind:
              "in_progress",

            createdAt:
              "2026-07-19T12:00:00.000Z",
          });

        const response =
          await POST(
            createStatusRequest(),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          202,
        );

        expect(
          data,
        ).toMatchObject({
          success:
            true,

          requestId:
            REQUEST_ID,

          status:
            "in_progress",

          createdAt:
            "2026-07-19T12:00:00.000Z",
        });

        expect(
          response.headers.get(
            "retry-after",
          ),
        ).toBe(
          "2",
        );

        expect(
          response.headers.get(
            "idempotency-replayed",
          ),
        ).toBe(
          "false",
        );

        expect(
          routeBridge.auditInfo,
        ).toHaveBeenCalledWith(
          expect.anything(),
          "order_status.in_progress",
          expect.objectContaining({
            createdAt:
              "2026-07-19T12:00:00.000Z",
          }),
        );
      },
    );

    it(
      "recovers a completed order response",
      async () => {
        routeBridge
          .getOrderIdempotencyStatus
          .mockResolvedValue({
            kind:
              "completed",

            completedAt:
              "2026-07-19T12:00:08.000Z",

            response: {
              status:
                201,

              body: {
                success:
                  true,

                requestId:
                  ORIGINAL_ORDER_REQUEST_ID,

                orderId:
                  501,

                orderNumber:
                  "501",

                status:
                  "processing",

                currency:
                  "BDT",

                total:
                  "1080.00",

                emailSent:
                  true,

                idempotencyStored:
                  true,
              },
            },
          });

        const response =
          await POST(
            createStatusRequest(),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          200,
        );

        expect(
          data,
        ).toMatchObject({
          success:
            true,

          /*
           * Current status-request correlation ID।
           */
          requestId:
            REQUEST_ID,

          /*
           * Original order-creation correlation ID।
           */
          originalOrderRequestId:
            ORIGINAL_ORDER_REQUEST_ID,

          orderId:
            501,

          orderNumber:
            "501",

          status:
            "processing",

          currency:
            "BDT",

          total:
            "1080.00",

          idempotencyRecovered:
            true,

          idempotencyReplayed:
            true,

          recoveryStatus:
            "completed",

          originalResponseStatus:
            201,

          completedAt:
            "2026-07-19T12:00:08.000Z",
        });

        expect(
          typeof data.recoveredAt,
        ).toBe(
          "string",
        );

        expect(
          response.headers.get(
            "x-request-id",
          ),
        ).toBe(
          REQUEST_ID,
        );

        expect(
          response.headers.get(
            "idempotency-replayed",
          ),
        ).toBe(
          "true",
        );

        expect(
          routeBridge.auditInfo,
        ).toHaveBeenCalledWith(
          expect.anything(),
          "order_status.completed",
          expect.objectContaining({
            orderId:
              501,

            originalResponseStatus:
              201,

            originalOrderRequestId:
              ORIGINAL_ORDER_REQUEST_ID,
          }),
        );
      },
    );

    it(
      "recovers older cached responses without an original request ID",
      async () => {
        routeBridge
          .getOrderIdempotencyStatus
          .mockResolvedValue({
            kind:
              "completed",

            completedAt:
              "2026-07-19T12:00:08.000Z",

            response: {
              status:
                201,

              body: {
                success:
                  true,

                orderId:
                  450,

                orderNumber:
                  "450",

                status:
                  "processing",

                currency:
                  "BDT",

                total:
                  "980.00",
              },
            },
          });

        const response =
          await POST(
            createStatusRequest(),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          200,
        );

        expect(
          data,
        ).toMatchObject({
          requestId:
            REQUEST_ID,

          orderId:
            450,

          idempotencyRecovered:
            true,
        });

        expect(
          data
            .originalOrderRequestId,
        ).toBeUndefined();
      },
    );
  },
);

/* =========================================================
   Error handling tests
========================================================= */

describe(
  "POST /api/orders/idempotency-status error handling",
  () => {
    it(
      "returns a typed idempotency error safely",
      async () => {
        routeBridge
          .getOrderIdempotencyStatus
          .mockRejectedValue(
            new OrderIdempotencyError(
              "This idempotency key cannot be used for this order.",
              409,
              "idempotency_key_reused",
            ),
          );

        const response =
          await POST(
            createStatusRequest(),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          409,
        );

        expect(
          data,
        ).toMatchObject({
          success:
            false,

          requestId:
            REQUEST_ID,

          code:
            "idempotency_key_reused",
        });

        expect(
          response.headers.get(
            "x-request-id",
          ),
        ).toBe(
          REQUEST_ID,
        );

        expect(
          routeBridge.auditWarn,
        ).toHaveBeenCalledWith(
          expect.anything(),
          "order_status.failed",
          expect.objectContaining({
            status:
              409,

            code:
              "idempotency_key_reused",
          }),
        );
      },
    );

    it(
      "returns HTTP 500 for an unexpected status lookup failure",
      async () => {
        const consoleErrorSpy =
          vi
            .spyOn(
              console,
              "error",
            )
            .mockImplementation(
              () => undefined,
            );

        routeBridge
          .getOrderIdempotencyStatus
          .mockRejectedValue(
            new Error(
              "Redis connection failed.",
            ),
          );

        const response =
          await POST(
            createStatusRequest(),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          500,
        );

        expect(
          data,
        ).toMatchObject({
          success:
            false,

          requestId:
            REQUEST_ID,

          code:
            "order_status_check_failed",
        });

        expect(
          response.headers.get(
            "x-request-id",
          ),
        ).toBe(
          REQUEST_ID,
        );

        expect(
          routeBridge.auditError,
        ).toHaveBeenCalledWith(
          expect.anything(),
          "order_status.failed",
          expect.any(Error),
          expect.objectContaining({
            stage:
              "unexpected_failure",
          }),
        );

        expect(
          consoleErrorSpy,
        ).toHaveBeenCalled();
      },
    );
  },
);