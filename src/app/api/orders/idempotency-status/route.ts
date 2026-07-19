import {
  NextRequest,
  NextResponse,
} from "next/server";

import { auth } from "@/auth";

import {
  checkOrderStatusRateLimit,
  getCheckoutRateLimitHeaders,
} from "@/lib/checkout-rate-limit";

import {
  createOrderIdempotencyScope,
  getOrderIdempotencyStatus,
  OrderIdempotencyError,
  readOrderIdempotencyKey,
} from "@/lib/order-idempotency";

import {
  auditError,
  auditInfo,
  auditWarn,
  createRequestAuditContext,
  getRequestAuditHeaders,
  hashAuditIdentifier,
} from "@/lib/request-audit";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* =========================================================
   Configuration
========================================================= */

const MAX_REQUEST_BODY_SIZE =
  20_000;

type UnknownRecord =
  Record<string, unknown>;

class StatusRequestError extends Error {
  status: number;
  code: string;

  constructor(
    message: string,
    status = 400,
    code =
      "invalid_status_request",
  ) {
    super(message);

    this.name =
      "StatusRequestError";

    this.status =
      status;

    this.code =
      code;
  }
}

/* =========================================================
   General helpers
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

function readString(
  source: UnknownRecord,
  keys: string[],
): string {
  for (
    const key of keys
  ) {
    const value =
      source[key];

    if (
      typeof value ===
        "string"
    ) {
      return value.trim();
    }

    if (
      typeof value ===
        "number" ||
      typeof value ===
        "boolean"
    ) {
      return String(
        value,
      ).trim();
    }
  }

  return "";
}

function normalizeBillingEmail(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .slice(
      0,
      200,
    );
}

function isValidEmail(
  value: string,
): boolean {
  return (
    value.length <= 200 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      value,
    )
  );
}

/* =========================================================
   Response headers
========================================================= */

function getStatusResponseHeaders({
  replayed = false,
}: {
  replayed?: boolean;
} = {}): Record<string, string> {
  return {
    "Cache-Control":
      "no-store, max-age=0",

    "X-Content-Type-Options":
      "nosniff",

    "Idempotency-Replayed":
      replayed
        ? "true"
        : "false",
  };
}

/* =========================================================
   Origin protection
========================================================= */

function addAllowedOrigin(
  origins: Set<string>,
  value:
    | string
    | undefined,
): void {
  const normalized =
    value?.trim();

  if (!normalized) {
    return;
  }

  try {
    const url =
      normalized.includes(
        "://",
      )
        ? new URL(
            normalized,
          )
        : new URL(
            `https://${normalized}`,
          );

    origins.add(
      url.origin,
    );
  } catch {
    /*
     * Invalid configured origin ignored.
     */
  }
}

function isSameOrigin(
  request: NextRequest,
): boolean {
  const originHeader =
    request.headers.get(
      "origin",
    );

  if (!originHeader) {
    return false;
  }

  let requestOrigin:
    string;

  let submittedOrigin:
    string;

  try {
    requestOrigin =
      new URL(
        request.url,
      ).origin;

    submittedOrigin =
      new URL(
        originHeader,
      ).origin;
  } catch {
    return false;
  }

  const allowedOrigins =
    new Set<string>();

  allowedOrigins.add(
    requestOrigin,
  );

  addAllowedOrigin(
    allowedOrigins,
    process.env.AUTH_URL,
  );

  addAllowedOrigin(
    allowedOrigins,
    process.env.NEXTAUTH_URL,
  );

  addAllowedOrigin(
    allowedOrigins,
    process.env
      .NEXT_PUBLIC_SITE_URL,
  );

  addAllowedOrigin(
    allowedOrigins,
    process.env.VERCEL_URL,
  );

  addAllowedOrigin(
    allowedOrigins,
    process.env
      .VERCEL_PROJECT_PRODUCTION_URL,
  );

  return allowedOrigins.has(
    submittedOrigin,
  );
}

/* =========================================================
   Request parsing
========================================================= */

async function parseRequestBody(
  request: NextRequest,
): Promise<UnknownRecord> {
  const contentType =
    request.headers.get(
      "content-type",
    ) ?? "";

  if (
    !contentType
      .toLowerCase()
      .includes(
        "application/json",
      )
  ) {
    throw new StatusRequestError(
      "The status request must use JSON.",
      415,
      "invalid_content_type",
    );
  }

  const contentLength =
    Number(
      request.headers.get(
        "content-length",
      ) ?? 0,
    );

  if (
    Number.isFinite(
      contentLength,
    ) &&
    contentLength >
      MAX_REQUEST_BODY_SIZE
  ) {
    throw new StatusRequestError(
      "The status request is too large.",
      413,
      "request_too_large",
    );
  }

  const rawBody =
    await request.text();

  if (
    rawBody.length >
    MAX_REQUEST_BODY_SIZE
  ) {
    throw new StatusRequestError(
      "The status request is too large.",
      413,
      "request_too_large",
    );
  }

  /*
   * Authenticated customer-এর recovery
   * request-এ billing email প্রয়োজন নেই।
   * তাই empty JSON body safely {} হবে।
   */
  if (
    !rawBody.trim()
  ) {
    return {};
  }

  let parsedBody:
    unknown;

  try {
    parsedBody =
      JSON.parse(
        rawBody,
      );
  } catch {
    throw new StatusRequestError(
      "The status request contains invalid JSON.",
      400,
      "invalid_json",
    );
  }

  if (
    !isObject(
      parsedBody,
    )
  ) {
    throw new StatusRequestError(
      "Invalid order status request.",
      400,
      "invalid_status_request",
    );
  }

  return parsedBody;
}

/* =========================================================
   POST /api/orders/idempotency-status
========================================================= */

export async function POST(
  request: NextRequest,
) {
  const auditContext =
    createRequestAuditContext({
      request,

      operation:
        "order-status",

      route:
        "/api/orders/idempotency-status",
    });

  auditInfo(
    auditContext,
    "request.received",
    {
      originPresent:
        Boolean(
          request.headers.get(
            "origin",
          ),
        ),

      idempotencyPresent:
        Boolean(
          request.headers.get(
            "idempotency-key",
          ),
        ),

      contentType:
        request.headers
          .get(
            "content-type",
          )
          ?.split(";")[0]
          ?.trim() ??
        "",
    },
  );

  let rateLimitHeaders:
    Record<string, string> = {};

  let subjectReference:
    string | null =
      null;

  let idempotencyReference:
    string | null =
      null;

  const buildStatusResponseHeaders = ({
    replayed = false,
  }: {
    replayed?: boolean;
  } = {}): Record<string, string> => ({
    ...getStatusResponseHeaders({
      replayed,
    }),

    ...getRequestAuditHeaders(
      auditContext,
    ),

    ...rateLimitHeaders,
  });

  try {
    if (
      !isSameOrigin(
        request,
      )
    ) {
      throw new StatusRequestError(
        "The order status request was rejected.",
        403,
        "invalid_origin",
      );
    }

    const idempotencyKey =
      readOrderIdempotencyKey(
        request,
      );

    /*
     * Raw Idempotency-Key log হবে না।
     */
    idempotencyReference =
      hashAuditIdentifier({
        type:
          "idempotency",

        value:
          idempotencyKey,
      });

    const requestBody =
      await parseRequestBody(
        request,
      );

    const billingEmail =
      normalizeBillingEmail(
        readString(
          requestBody,
          [
            "billingEmail",
            "billing_email",
            "email",
          ],
        ),
      );

    const session =
      await auth();

    const sessionCustomerId =
      session?.user
        ?.customerId;

    const customerId =
      typeof sessionCustomerId ===
        "number" &&
      Number.isInteger(
        sessionCustomerId,
      ) &&
      sessionCustomerId > 0
        ? sessionCustomerId
        : 0;

    /*
     * Guest recovery scope তৈরির জন্য
     * billing email প্রয়োজন।
     */
    if (
      customerId === 0
    ) {
      if (!billingEmail) {
        throw new StatusRequestError(
          "Billing email is required to recover a guest order.",
          400,
          "billing_email_required",
        );
      }

      if (
        !isValidEmail(
          billingEmail,
        )
      ) {
        throw new StatusRequestError(
          "Enter a valid billing email address.",
          400,
          "invalid_billing_email",
        );
      }
    }

    /*
     * Raw customer ID বা email-এর বদলে
     * privacy-safe HMAC reference log হবে।
     */
    subjectReference =
      hashAuditIdentifier({
        type:
          customerId > 0
            ? "customer"
            : "email",

        value:
          customerId > 0
            ? customerId
            : billingEmail,
      });

    /*
     * Recovery polling-এর জন্য order creation
     * route থেকে আলাদা rate-limit allowance।
     */
    const rateLimitResult =
      await checkOrderStatusRateLimit({
        request,

        customerId,

        billingEmail,
      });

    rateLimitHeaders =
      getCheckoutRateLimitHeaders(
        rateLimitResult,
      );

    if (
      !rateLimitResult.allowed
    ) {
      auditWarn(
        auditContext,
        "order_status.rate_limited",
        {
          subjectReference,
          idempotencyReference,

          blockedScope:
            rateLimitResult
              .blockedScope,

          retryAfterSeconds:
            rateLimitResult
              .retryAfterSeconds,

          degraded:
            rateLimitResult
              .degraded,
        },
      );

      auditInfo(
        auditContext,
        "request.completed",
        {
          status: 429,

          outcome:
            "order_status_rate_limited",
        },
      );

      return NextResponse.json(
        {
          success: false,

          requestId:
            auditContext
              .requestId,

          status:
            "rate_limited",

          error:
            "Too many order status checks were received. Please wait before checking again.",

          code:
            "order_status_rate_limited",

          retryAfter:
            rateLimitResult
              .retryAfterSeconds,
        },

        {
          status: 429,

          headers:
            buildStatusResponseHeaders(),
        },
      );
    }

    const scope =
      createOrderIdempotencyScope({
        customerId,

        billingEmail:
          billingEmail ||
          undefined,
      });

    const status =
      await getOrderIdempotencyStatus({
        idempotencyKey,
        scope,
      });

    /*
     * No Redis record exists for this scope/key.
     */
    if (
      status.kind ===
      "not_found"
    ) {
      auditWarn(
        auditContext,
        "order_status.not_found",
        {
          subjectReference,
          idempotencyReference,
        },
      );

      auditInfo(
        auditContext,
        "request.completed",
        {
          status: 404,

          outcome:
            "order_attempt_not_found",
        },
      );

      return NextResponse.json(
        {
          success: false,

          requestId:
            auditContext
              .requestId,

          status:
            "not_found",

          error:
            "No matching order attempt was found.",

          code:
            "order_attempt_not_found",
        },

        {
          status: 404,

          headers:
            buildStatusResponseHeaders(),
        },
      );
    }

    /*
     * Order creation request এখনো processing।
     */
    if (
      status.kind ===
      "in_progress"
    ) {
      auditInfo(
        auditContext,
        "order_status.in_progress",
        {
          subjectReference,
          idempotencyReference,

          createdAt:
            status.createdAt,
        },
      );

      auditInfo(
        auditContext,
        "request.completed",
        {
          status: 202,

          outcome:
            "order_still_processing",
        },
      );

      return NextResponse.json(
        {
          success: true,

          requestId:
            auditContext
              .requestId,

          status:
            "in_progress",

          message:
            "Your order request is still being processed.",

          createdAt:
            status.createdAt,
        },

        {
          status: 202,

          headers: {
            ...buildStatusResponseHeaders(),

            "Retry-After":
              "2",
          },
        },
      );
    }

    /*
     * Completed Redis response recovery।
     */
    const cachedResponseBody =
      status.response.body;

    const recoveredOrderId =
      typeof cachedResponseBody
        .orderId === "number"
        ? cachedResponseBody
            .orderId
        : null;

    /*
     * Cached response-এর requestId original
     * order-creation request-এর correlation ID।
     */
    const originalOrderRequestId =
      typeof cachedResponseBody
        .requestId === "string" &&
      cachedResponseBody
        .requestId
        .trim()
        ? cachedResponseBody
            .requestId
            .trim()
        : null;

    auditInfo(
      auditContext,
      "order_status.completed",
      {
        subjectReference,
        idempotencyReference,

        orderId:
          recoveredOrderId,

        originalResponseStatus:
          status.response.status,

        completedAt:
          status.completedAt,

        originalOrderRequestId,
      },
    );

    auditInfo(
      auditContext,
      "request.completed",
      {
        status: 200,

        outcome:
          "order_recovered",

        orderId:
          recoveredOrderId,
      },
    );

    return NextResponse.json(
      {
        ...cachedResponseBody,

        /*
         * Current recovery API request ID।
         */
        requestId:
          auditContext
            .requestId,

        /*
         * Original order-creation request ID।
         */
        ...(originalOrderRequestId
          ? {
              originalOrderRequestId,
            }
          : {}),

        idempotencyRecovered:
          true,

        idempotencyReplayed:
          true,

        recoveryStatus:
          "completed",

        recoveredAt:
          new Date()
            .toISOString(),

        originalResponseStatus:
          status.response.status,

        completedAt:
          status.completedAt,
      },

      {
        status: 200,

        headers:
          buildStatusResponseHeaders({
            replayed: true,
          }),
      },
    );
  } catch (error) {
    if (
      error instanceof
      OrderIdempotencyError
    ) {
      if (
        error.status >= 500
      ) {
        auditError(
          auditContext,
          "order_status.failed",
          error,
          {
            subjectReference,
            idempotencyReference,

            stage:
              "idempotency_lookup",
          },
        );
      } else {
        auditWarn(
          auditContext,
          "order_status.failed",
          {
            subjectReference,
            idempotencyReference,

            status:
              error.status,

            code:
              error.code,
          },
        );
      }

      auditInfo(
        auditContext,
        "request.completed",
        {
          status:
            error.status,

          outcome:
            error.code,
        },
      );

      return NextResponse.json(
        {
          success: false,

          requestId:
            auditContext
              .requestId,

          error:
            error.message,

          code:
            error.code,
        },

        {
          status:
            error.status,

          headers:
            buildStatusResponseHeaders(),
        },
      );
    }

    if (
      error instanceof
      StatusRequestError
    ) {
      auditWarn(
        auditContext,
        "request.rejected",
        {
          subjectReference,
          idempotencyReference,

          status:
            error.status,

          code:
            error.code,
        },
      );

      auditInfo(
        auditContext,
        "request.completed",
        {
          status:
            error.status,

          outcome:
            error.code,
        },
      );

      return NextResponse.json(
        {
          success: false,

          requestId:
            auditContext
              .requestId,

          error:
            error.message,

          code:
            error.code,
        },

        {
          status:
            error.status,

          headers:
            buildStatusResponseHeaders(),
        },
      );
    }

    auditError(
      auditContext,
      "order_status.failed",
      error,
      {
        subjectReference,
        idempotencyReference,

        stage:
          "unexpected_failure",
      },
    );

    auditInfo(
      auditContext,
      "request.completed",
      {
        status: 500,

        outcome:
          "order_status_check_failed",
      },
    );

    console.error(
      "Order idempotency status check failed:",
      {
        requestId:
          auditContext
            .requestId,

        error:
          error instanceof Error
            ? error.message
            : error,
      },
    );

    return NextResponse.json(
      {
        success: false,

        requestId:
          auditContext
            .requestId,

        error:
          "The order status could not be checked. Please try again.",

        code:
          "order_status_check_failed",
      },

      {
        status: 500,

        headers:
          buildStatusResponseHeaders(),
      },
    );
  }
}