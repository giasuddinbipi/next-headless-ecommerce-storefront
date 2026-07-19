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

    checkOrderCreationRateLimit:
      vi.fn(),

    getCheckoutRateLimitHeaders:
      vi.fn(),

    calculateCheckoutTotals:
      vi.fn(),

    validateCouponForCart:
      vi.fn(),

    getCustomerProfile:
      vi.fn(),

    completeOrderIdempotency:
      vi.fn(),

    createOrderIdempotencyScope:
      vi.fn(),

    createOrderRequestFingerprint:
      vi.fn(),

    readOrderIdempotencyKey:
      vi.fn(),

    releaseOrderIdempotency:
      vi.fn(),

    reserveOrderIdempotency:
      vi.fn(),

    sendWooCommerceOrderDetailsEmail:
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

    prepareSecureCheckout:
      vi.fn(),

    createWooCommerceOrder:
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
    checkOrderCreationRateLimit:
      routeBridge
        .checkOrderCreationRateLimit,

    getCheckoutRateLimitHeaders:
      routeBridge
        .getCheckoutRateLimitHeaders,
  }),
);

vi.mock(
  "@/lib/checkout-totals",
  () => {
    class CheckoutTotalsError extends Error {
      status: number;
      code: string;

      constructor(
        message:
          string,
        status = 400,
        code =
          "checkout_totals_error",
      ) {
        super(message);

        this.name =
          "CheckoutTotalsError";

        this.status =
          status;

        this.code =
          code;
      }
    }

    return {
      calculateCheckoutTotals:
        routeBridge
          .calculateCheckoutTotals,

      CheckoutTotalsError,
    };
  },
);

vi.mock(
  "@/lib/coupons",
  () => {
    class CouponValidationError extends Error {
      status: number;
      code: string;

      constructor(
        message:
          string,
        status = 400,
        code =
          "coupon_validation_error",
      ) {
        super(message);

        this.name =
          "CouponValidationError";

        this.status =
          status;

        this.code =
          code;
      }
    }

    return {
      CouponValidationError,

      validateCouponForCart:
        routeBridge
          .validateCouponForCart,
    };
  },
);

vi.mock(
  "@/lib/customer",
  () => ({
    getCustomerProfile:
      routeBridge
        .getCustomerProfile,
  }),
);

vi.mock(
  "@/lib/order-idempotency",
  () => {
    class OrderIdempotencyError extends Error {
      status: number;
      code: string;

      constructor(
        message:
          string,
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
      completeOrderIdempotency:
        routeBridge
          .completeOrderIdempotency,

      createOrderIdempotencyScope:
        routeBridge
          .createOrderIdempotencyScope,

      createOrderRequestFingerprint:
        routeBridge
          .createOrderRequestFingerprint,

      OrderIdempotencyError,

      readOrderIdempotencyKey:
        routeBridge
          .readOrderIdempotencyKey,

      releaseOrderIdempotency:
        routeBridge
          .releaseOrderIdempotency,

      reserveOrderIdempotency:
        routeBridge
          .reserveOrderIdempotency,
    };
  },
);

vi.mock(
  "@/lib/order-email",
  () => ({
    sendWooCommerceOrderDetailsEmail:
      routeBridge
        .sendWooCommerceOrderDetailsEmail,
  }),
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

vi.mock(
  "@/lib/secure-checkout",
  () => {
    class SecureCheckoutError extends Error {
      status: number;
      code: string;
      details?: unknown;

      constructor(
        message:
          string,
        status = 400,
        code =
          "secure_checkout_error",
        details?:
          unknown,
      ) {
        super(message);

        this.name =
          "SecureCheckoutError";

        this.status =
          status;

        this.code =
          code;

        this.details =
          details;
      }
    }

    return {
      prepareSecureCheckout:
        routeBridge
          .prepareSecureCheckout,

      SecureCheckoutError,
    };
  },
);

vi.mock(
  "@/lib/woocommerce",
  () => ({
    createWooCommerceOrder:
      routeBridge
        .createWooCommerceOrder,
  }),
);

/*
 * সব mock declaration-এর পরে route import।
 */
import {
  POST,
} from "@/app/api/orders/route";

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
  "order-route-test-request-1234";

const IDEMPOTENCY_KEY =
  "order-route-idempotency-key-123456";

const FINGERPRINT =
  "a".repeat(64);

const IDEMPOTENCY_SCOPE =
  "customer-scope-test";

/* =========================================================
   Test helpers
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

function createValidOrderBody():
  UnknownRecord {
  return {
    customer: {
      firstName:
        "Test",

      lastName:
        "Customer",

      phone:
        "01700000000",

      email:
        "customer@example.com",

      address1:
        "House 10, Road 2",

      city:
        "Dhaka",

      district:
        "Dhaka",

      postcode:
        "1200",

      note:
        "Call before delivery.",
    },

    shippingArea:
      "dhaka",

    website:
      "",

    termsAccepted:
      true,

    couponCode:
      "",

    items: [
      {
        productId:
          100,

        quantity:
          2,

        attributes:
          [],
      },
    ],
  };
}

function createOrderRequest({
  origin =
    "https://store.example",

  body =
    createValidOrderBody(),

  idempotencyKey =
    IDEMPOTENCY_KEY,
}: {
  origin?: string;
  body?: UnknownRecord;
  idempotencyKey?: string;
} = {}): NextRequest {
  return new NextRequest(
    "https://store.example/api/orders",
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
      6,

    remaining:
      5,

    reset:
      Date.now() +
      10 * 60 * 1_000,

    retryAfterSeconds:
      0,
  };
}

function createAcquiredDecision() {
  return {
    kind:
      "acquired" as const,

    reservation: {
      key:
        "redis-idempotency-record",

      token:
        "reservation-token",

      fingerprint:
        FINGERPRINT,

      encodedProcessingRecord:
        "encoded-processing-record",
    },
  };
}

/* =========================================================
   Default mock configuration
========================================================= */

beforeEach(() => {
  routeBridge.auth
    .mockReset();

  routeBridge
    .checkOrderCreationRateLimit
    .mockReset();

  routeBridge
    .getCheckoutRateLimitHeaders
    .mockReset();

  routeBridge
    .calculateCheckoutTotals
    .mockReset();

  routeBridge
    .validateCouponForCart
    .mockReset();

  routeBridge
    .getCustomerProfile
    .mockReset();

  routeBridge
    .completeOrderIdempotency
    .mockReset();

  routeBridge
    .createOrderIdempotencyScope
    .mockReset();

  routeBridge
    .createOrderRequestFingerprint
    .mockReset();

  routeBridge
    .readOrderIdempotencyKey
    .mockReset();

  routeBridge
    .releaseOrderIdempotency
    .mockReset();

  routeBridge
    .reserveOrderIdempotency
    .mockReset();

  routeBridge
    .sendWooCommerceOrderDetailsEmail
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

  routeBridge
    .prepareSecureCheckout
    .mockReset();

  routeBridge
    .createWooCommerceOrder
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
        "order-create",

      route:
        "/api/orders",

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
    .createOrderRequestFingerprint
    .mockReturnValue(
      FINGERPRINT,
    );

  routeBridge
    .createOrderIdempotencyScope
    .mockReturnValue(
      IDEMPOTENCY_SCOPE,
    );

  routeBridge
    .checkOrderCreationRateLimit
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
    .prepareSecureCheckout
    .mockResolvedValue({
      items: [
        {
          productId:
            100,

          quantity:
            2,

          attributes:
            [],

          price:
            "500.00",

          lineTotal:
            "1000.00",
        },
      ],
    });

  routeBridge
    .validateCouponForCart
    .mockResolvedValue(
      null,
    );

  routeBridge
    .calculateCheckoutTotals
    .mockReturnValue({
      currency:
        "BDT",

      subtotal:
        "1000.00",

      discount:
        "0.00",

      shipping:
        "80.00",

      total:
        "1080.00",

      freeShipping:
        false,
    });

  routeBridge
    .reserveOrderIdempotency
    .mockResolvedValue(
      createAcquiredDecision(),
    );

  routeBridge
    .createWooCommerceOrder
    .mockResolvedValue({
      id:
        501,

      number:
        "501",

      status:
        "processing",

      currency:
        "BDT",

      total:
        "1080.00",

      discount_total:
        "0.00",

      shipping_total:
        "80.00",
    });

  routeBridge
    .sendWooCommerceOrderDetailsEmail
    .mockResolvedValue(
      undefined,
    );

  routeBridge
    .completeOrderIdempotency
    .mockResolvedValue(
      undefined,
    );

  routeBridge
    .releaseOrderIdempotency
    .mockResolvedValue(
      undefined,
    );
});

/* =========================================================
   Origin and request rejection
========================================================= */

describe(
  "POST /api/orders request protection",
  () => {
    it(
      "rejects a cross-origin order request",
      async () => {
        const response =
          await POST(
            createOrderRequest({
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
            .checkOrderCreationRateLimit,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge
            .reserveOrderIdempotency,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge
            .createWooCommerceOrder,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "returns HTTP 429 before checkout processing",
      async () => {
        const reset =
          Date.now() +
          120_000;

        routeBridge
          .checkOrderCreationRateLimit
          .mockResolvedValue({
            allowed:
              false,

            degraded:
              false,

            blockedScope:
              "subject",

            limit:
              6,

            remaining:
              0,

            reset,

            retryAfterSeconds:
              120,
          });

        const response =
          await POST(
            createOrderRequest(),
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

          code:
            "order_rate_limited",

          retryAfter:
            120,
        });

        expect(
          response.headers.get(
            "retry-after",
          ),
        ).toBe(
          "120",
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
            .prepareSecureCheckout,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge
            .reserveOrderIdempotency,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge
            .createWooCommerceOrder,
        ).not.toHaveBeenCalled();
      },
    );
  },
);

/* =========================================================
   Idempotency decisions
========================================================= */

describe(
  "POST /api/orders idempotency decisions",
  () => {
    it(
      "returns HTTP 409 when the same order is still processing",
      async () => {
        routeBridge
          .reserveOrderIdempotency
          .mockResolvedValue({
            kind:
              "in_progress",

            createdAt:
              "2026-07-19T12:00:00.000Z",
          });

        const response =
          await POST(
            createOrderRequest(),
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

          code:
            "order_request_in_progress",
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
          response.headers.get(
            "x-request-id",
          ),
        ).toBe(
          REQUEST_ID,
        );

        expect(
          routeBridge
            .createWooCommerceOrder,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge
            .completeOrderIdempotency,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "replays a previously completed order without creating another order",
      async () => {
        routeBridge
          .reserveOrderIdempotency
          .mockResolvedValue({
            kind:
              "replay",

            response: {
              status:
                201,

              body: {
                success:
                  true,

                requestId:
                  "original-order-request-1234",

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

                idempotencyStored:
                  true,
              },
            },
          });

        const response =
          await POST(
            createOrderRequest(),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          201,
        );

        expect(
          data,
        ).toMatchObject({
          success:
            true,

          requestId:
            "original-order-request-1234",

          orderId:
            450,

          orderNumber:
            "450",

          idempotencyReplayed:
            true,
        });

        /*
         * Response header current replay request-এর
         * correlation ID বহন করবে।
         */
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
          routeBridge
            .createWooCommerceOrder,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge
            .sendWooCommerceOrderDetailsEmail,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge
            .completeOrderIdempotency,
        ).not.toHaveBeenCalled();
      },
    );
  },
);

/* =========================================================
   Successful order creation
========================================================= */

describe(
  "POST /api/orders successful creation",
  () => {
    it(
      "creates one trusted WooCommerce order and stores the response",
      async () => {
        const response =
          await POST(
            createOrderRequest(),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          201,
        );

        expect(
          data,
        ).toMatchObject({
          success:
            true,

          requestId:
            REQUEST_ID,

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

          totalsVerified:
            true,

          idempotencyReplayed:
            false,

          idempotencyStored:
            true,
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
          response.headers.get(
            "ratelimit-limit",
          ),
        ).toBe(
          "6",
        );

        expect(
          routeBridge
            .createWooCommerceOrder,
        ).toHaveBeenCalledTimes(
          1,
        );

        const orderInput =
          routeBridge
            .createWooCommerceOrder
            .mock
            .calls[0]?.[0] as
            | UnknownRecord
            | undefined;

        expect(
          orderInput,
        ).toMatchObject({
          customer_id:
            42,

          payment_method:
            "cod",

          payment_method_title:
            "Cash on delivery",

          set_paid:
            false,

          customer_note:
            "Call before delivery.",
        });

        const lineItems =
          orderInput
            ?.line_items as
            | UnknownRecord[]
            | undefined;

        expect(
          lineItems,
        ).toEqual([
          {
            product_id:
              100,

            quantity:
              2,
          },
        ]);

        const shippingLines =
          orderInput
            ?.shipping_lines as
            | UnknownRecord[]
            | undefined;

        expect(
          shippingLines,
        ).toEqual([
          {
            method_id:
              "flat_rate",

            method_title:
              "Inside Dhaka delivery",

            total:
              "80.00",
          },
        ]);

        const metadata =
          orderInput
            ?.meta_data as
            | UnknownRecord[]
            | undefined;

        expect(
          metadata,
        ).toEqual(
          expect.arrayContaining([
            {
              key:
                "_headless_request_id",

              value:
                REQUEST_ID,
            },

            {
              key:
                "_headless_order_request_fingerprint",

              value:
                FINGERPRINT,
            },

            {
              key:
                "_headless_server_total",

              value:
                "1080.00",
            },
          ]),
        );

        expect(
          routeBridge
            .sendWooCommerceOrderDetailsEmail,
        ).toHaveBeenCalledWith(
          501,
        );

        expect(
          routeBridge
            .completeOrderIdempotency,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          routeBridge
            .completeOrderIdempotency,
        ).toHaveBeenCalledWith(
          expect.objectContaining({
            response:
              expect.objectContaining({
                status:
                  201,

                body:
                  expect.objectContaining({
                    requestId:
                      REQUEST_ID,

                    orderId:
                      501,

                    idempotencyStored:
                      true,
                  }),
              }),
          }),
        );

        expect(
          routeBridge
            .releaseOrderIdempotency,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      "keeps the order successful when confirmation email sending fails",
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
          .sendWooCommerceOrderDetailsEmail
          .mockRejectedValue(
            new Error(
              "Email provider unavailable.",
            ),
          );

        const response =
          await POST(
            createOrderRequest(),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          201,
        );

        expect(
          data,
        ).toMatchObject({
          success:
            true,

          orderId:
            501,

          emailSent:
            false,

          idempotencyStored:
            true,
        });

        expect(
          routeBridge.auditError,
        ).toHaveBeenCalledWith(
          expect.anything(),
          "order.email_failed",
          expect.any(Error),
          expect.objectContaining({
            orderId:
              501,
          }),
        );

        expect(
          routeBridge
            .completeOrderIdempotency,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          consoleErrorSpy,
        ).toHaveBeenCalled();
      },
    );
  },
);

/* =========================================================
   Uncertain WooCommerce failure
========================================================= */

describe(
  "POST /api/orders WooCommerce failure handling",
  () => {
    it(
      "preserves the reservation after order creation has started",
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
          .createWooCommerceOrder
          .mockRejectedValue(
            new Error(
              "WooCommerce connection failed.",
            ),
          );

        const response =
          await POST(
            createOrderRequest(),
          );

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          502,
        );

        expect(
          data,
        ).toMatchObject({
          success:
            false,

          requestId:
            REQUEST_ID,

          code:
            "order_creation_failed",
        });

        /*
         * WooCommerce request শুরু হওয়ার পরে
         * order তৈরি হয়েছিল কি না নিশ্চিত নয়।
         *
         * তাই reservation release করলে duplicate
         * order ঝুঁকি তৈরি হতে পারে।
         */
        expect(
          routeBridge
            .releaseOrderIdempotency,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge
            .completeOrderIdempotency,
        ).not.toHaveBeenCalled();

        expect(
          routeBridge.auditError,
        ).toHaveBeenCalledWith(
          expect.anything(),
          "order.failed",
          expect.any(Error),
          expect.objectContaining({
            stage:
              "after_creation_started",

            reservationAcquired:
              true,
          }),
        );

        expect(
          response.headers.get(
            "x-request-id",
          ),
        ).toBe(
          REQUEST_ID,
        );

        expect(
          consoleErrorSpy,
        ).toHaveBeenCalled();
      },
    );
  },
);