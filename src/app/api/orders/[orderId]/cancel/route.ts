import {
  NextRequest,
  NextResponse,
} from "next/server";

import { auth } from "@/auth";

import {
  cancelCustomerWooCommerceOrder,
  OrderCancellationError,
} from "@/lib/order-cancellation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_BODY_SIZE =
  10_000;

type CancelOrderRouteProps = {
  params: Promise<{
    orderId: string;
  }>;
};

type UnknownRecord =
  Record<string, unknown>;

function isObject(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseOrderId(
  value: string,
): number | null {
  const orderId =
    Number(value);

  if (
    !Number.isInteger(orderId) ||
    orderId < 1
  ) {
    return null;
  }

  return orderId;
}

function addAllowedOrigin(
  origins: Set<string>,
  value:
    | string
    | undefined,
) {
  const normalizedValue =
    value?.trim();

  if (!normalizedValue) {
    return;
  }

  try {
    const url =
      normalizedValue.includes(
        "://",
      )
        ? new URL(
            normalizedValue,
          )
        : new URL(
            `https://${normalizedValue}`,
          );

    origins.add(url.origin);
  } catch {
    // Invalid environment URL ignored.
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
    throw new OrderCancellationError(
      "The cancellation request must use JSON.",
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
    throw new OrderCancellationError(
      "The cancellation request is too large.",
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
    throw new OrderCancellationError(
      "The cancellation request is too large.",
      413,
      "request_too_large",
    );
  }

  let data: unknown;

  try {
    data =
      JSON.parse(
        rawBody || "{}",
      );
  } catch {
    throw new OrderCancellationError(
      "The cancellation request contains invalid JSON.",
      400,
      "invalid_json",
    );
  }

  if (!isObject(data)) {
    throw new OrderCancellationError(
      "Invalid cancellation request.",
      400,
      "invalid_request",
    );
  }

  return data;
}

function normalizeReason(
  value: unknown,
): string {
  if (
    typeof value !== "string"
  ) {
    return "";
  }

  return value
    .replace(
      /[\u0000-\u001F\u007F]/g,
      " ",
    )
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(
  request: NextRequest,
  {
    params,
  }: CancelOrderRouteProps,
) {
  try {
    if (
      !isSameOrigin(request)
    ) {
      throw new OrderCancellationError(
        "The cancellation request was rejected.",
        403,
        "invalid_origin",
      );
    }

    const {
      orderId: rawOrderId,
    } = await params;

    const orderId =
      parseOrderId(
        rawOrderId,
      );

    if (!orderId) {
      throw new OrderCancellationError(
        "A valid order ID is required.",
        400,
        "invalid_order_id",
      );
    }

    const session =
      await auth();

    const customerId =
      session?.user
        ?.customerId;

    if (
      !session?.user ||
      typeof customerId !==
        "number" ||
      !Number.isInteger(
        customerId,
      ) ||
      customerId < 1
    ) {
      throw new OrderCancellationError(
        "You must sign in before cancelling an order.",
        401,
        "authentication_required",
      );
    }

    const body =
      await parseRequestBody(
        request,
      );

    /*
     * Honeypot field।
     */
    if (
      typeof body.website ===
        "string" &&
      body.website.trim()
    ) {
      throw new OrderCancellationError(
        "The cancellation request was rejected.",
        400,
        "invalid_request",
      );
    }

    const reason =
      normalizeReason(
        body.reason,
      );

    if (
      reason.length < 10
    ) {
      throw new OrderCancellationError(
        "Please provide a cancellation reason of at least 10 characters.",
        400,
        "cancellation_reason_too_short",
      );
    }

    if (
      reason.length > 500
    ) {
      throw new OrderCancellationError(
        "The cancellation reason cannot exceed 500 characters.",
        400,
        "cancellation_reason_too_long",
      );
    }

    const result =
      await cancelCustomerWooCommerceOrder(
        {
          orderId,
          customerId,
          reason,
        },
      );

    return NextResponse.json(
      {
        success: true,

        message:
          "Your order has been cancelled successfully.",

        orderId:
          result.orderId,

        orderNumber:
          result.orderNumber,

        status:
          result.status,

        noteAdded:
          result.noteAdded,
      },

      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof
      OrderCancellationError
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

          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    console.error(
      "Customer order cancellation failed:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error:
          process.env.NODE_ENV ===
          "development"
            ? error instanceof Error
              ? error.message
              : "Unknown cancellation error."
            : "The order could not be cancelled. Please try again or contact customer support.",

        code:
          "order_cancellation_failed",
      },

      {
        status: 502,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }
}