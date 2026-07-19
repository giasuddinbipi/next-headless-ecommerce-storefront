import {
  NextRequest,
  NextResponse,
} from "next/server";

import { auth } from "@/auth";

import {
  createOrderIdempotencyScope,
  getOrderIdempotencyStatus,
  OrderIdempotencyError,
  readOrderIdempotencyKey,
} from "@/lib/order-idempotency";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

/* =========================================================
   Configuration
========================================================= */

const MAX_STATUS_BODY_SIZE =
  5_000;

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

    this.status = status;
    this.code = code;
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
  value: unknown,
): string {
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
    return String(value).trim();
  }

  return "";
}

function normalizeEmail(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

function isValidEmail(
  value: string,
): boolean {
  return (
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
   Same-origin protection
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
     * Invalid configured URL ignored.
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

  let requestOrigin: string;
  let submittedOrigin: string;

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
   Request body parsing
========================================================= */

async function parseStatusBody(
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
      MAX_STATUS_BODY_SIZE
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
    MAX_STATUS_BODY_SIZE
  ) {
    throw new StatusRequestError(
      "The status request is too large.",
      413,
      "request_too_large",
    );
  }

  if (!rawBody.trim()) {
    return {};
  }

  let parsed: unknown;

  try {
    parsed =
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

  if (!isObject(parsed)) {
    throw new StatusRequestError(
      "The status request must contain a JSON object.",
      400,
      "invalid_status_request",
    );
  }

  return parsed;
}

/* =========================================================
   Guest billing email extraction
========================================================= */

function extractBillingEmail(
  body: UnknownRecord,
): string {
  const directEmail =
    normalizeEmail(
      readString(
        body.billingEmail ??
          body.billing_email ??
          body.email,
      ),
    );

  if (directEmail) {
    return directEmail;
  }

  if (
    isObject(
      body.customer,
    )
  ) {
    const customerEmail =
      normalizeEmail(
        readString(
          body.customer.email,
        ),
      );

    if (customerEmail) {
      return customerEmail;
    }
  }

  if (
    isObject(
      body.billing,
    )
  ) {
    const billingEmail =
      normalizeEmail(
        readString(
          body.billing.email,
        ),
      );

    if (billingEmail) {
      return billingEmail;
    }
  }

  return "";
}

/* =========================================================
   POST /api/orders/idempotency-status
========================================================= */

export async function POST(
  request: NextRequest,
) {
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

    const body =
      await parseStatusBody(
        request,
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

    const billingEmail =
      extractBillingEmail(
        body,
      );

    /*
     * Logged-in customer-এর scope customer ID
     * দিয়ে তৈরি হবে।
     *
     * Guest checkout-এর ক্ষেত্রে একই billing
     * email প্রয়োজন, যেটি original order
     * request-এ ব্যবহার হয়েছিল।
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

    const scope =
      createOrderIdempotencyScope({
        customerId,

        billingEmail,
      });

    /*
     * Client-side payload fingerprint এখানে পাঠানো
     * হচ্ছে না, কারণ সেটি server normalized
     * fingerprint-এর সমান নয়।
     */
    const status =
      await getOrderIdempotencyStatus({
        idempotencyKey,
        scope,
      });

    if (
      status.kind ===
      "not_found"
    ) {
      return NextResponse.json(
        {
          success: false,

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
            getStatusResponseHeaders(),
        },
      );
    }

    if (
      status.kind ===
      "in_progress"
    ) {
      return NextResponse.json(
        {
          success: true,

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
            ...getStatusResponseHeaders(),

            "Retry-After":
              "2",
          },
        },
      );
    }

    /*
     * Completed response recovery।
     *
     * নতুন WooCommerce order তৈরি হবে না।
     */
    return NextResponse.json(
      {
        ...status.response
          .body,

        idempotencyRecovered:
          true,

        idempotencyReplayed:
          true,

        recoveryStatus:
          "completed",

        recoveredAt:
          new Date().toISOString(),

        originalResponseStatus:
          status.response.status,

        completedAt:
          status.completedAt,
      },

      {
        status: 200,

        headers:
          getStatusResponseHeaders({
            replayed: true,
          }),
      },
    );
  } catch (error) {
    if (
      error instanceof
      OrderIdempotencyError
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            error.message,

          code:
            error.code,
        },

        {
          status:
            error.status,

          headers:
            getStatusResponseHeaders(),
        },
      );
    }

    if (
      error instanceof
      StatusRequestError
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            error.message,

          code:
            error.code,
        },

        {
          status:
            error.status,

          headers:
            getStatusResponseHeaders(),
        },
      );
    }

    console.error(
      "Order idempotency status request failed:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "The order status could not be checked. Please try again.",

        code:
          "order_status_check_failed",
      },

      {
        status: 500,

        headers:
          getStatusResponseHeaders(),
      },
    );
  }
}