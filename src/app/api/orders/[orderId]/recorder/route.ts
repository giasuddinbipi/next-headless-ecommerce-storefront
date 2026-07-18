import {
  NextRequest,
  NextResponse,
} from "next/server";

import { auth } from "@/auth";

import {
  buildCustomerReorder,
  ReorderError,
} from "@/lib/reorder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReorderRouteProps = {
  params: Promise<{
    orderId: string;
  }>;
};

/* =========================================================
   Route parameter
========================================================= */

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

/* =========================================================
   Same-origin request protection
========================================================= */

function addAllowedOrigin(
  origins: Set<string>,
  value:
    | string
    | undefined,
): void {
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

    origins.add(
      url.origin,
    );
  } catch {
    /*
     * Invalid environment URL is ignored.
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

  /*
   * Current request origin.
   */
  allowedOrigins.add(
    requestOrigin,
  );

  /*
   * Local and production environment URLs.
   */
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
   POST /api/orders/[orderId]/reorder
========================================================= */

export async function POST(
  request: NextRequest,
  {
    params,
  }: ReorderRouteProps,
) {
  try {
    /*
     * Reject requests originating outside
     * the storefront.
     */
    if (
      !isSameOrigin(request)
    ) {
      throw new ReorderError(
        "The reorder request was rejected.",
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
      throw new ReorderError(
        "A valid order ID is required.",
        400,
        "invalid_order_id",
      );
    }

    /*
     * Customer must have a valid authenticated
     * WooCommerce customer session.
     */
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
      throw new ReorderError(
        "You must sign in before reordering.",
        401,
        "authentication_required",
      );
    }

    /*
     * buildCustomerReorder performs:
     *
     * - Order ownership verification
     * - Current product lookup
     * - Current variation lookup
     * - Current price validation
     * - Current stock validation
     * - Quantity adjustment
     * - Unavailable item reporting
     */
    const result =
      await buildCustomerReorder({
        orderId,
        customerId,
      });

    const skippedCount =
      result.skippedItems.length;

    const adjustedCount =
      result.adjustedItems.length;

    let message =
      "All available products are ready to be added to your cart.";

    if (
      skippedCount > 0 &&
      adjustedCount > 0
    ) {
      message =
        "Available products were prepared using their current prices. Some unavailable products were skipped and some quantities were adjusted to current stock.";
    } else if (
      skippedCount > 0
    ) {
      message =
        "Available products were prepared using their current prices. Some unavailable products were skipped.";
    } else if (
      adjustedCount > 0
    ) {
      message =
        "Products were prepared using their current prices. Some quantities were adjusted to current stock.";
    }

    return NextResponse.json(
      {
        success: true,

        message,

        orderId:
          result.orderId,

        orderNumber:
          result.orderNumber,

        addedItemCount:
          result.items.length,

        skippedItemCount:
          skippedCount,

        adjustedItemCount:
          adjustedCount,

        items:
          result.items,

        skippedItems:
          result.skippedItems,

        adjustedItems:
          result.adjustedItems,
      },

      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store, max-age=0",

          "X-Content-Type-Options":
            "nosniff",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof
      ReorderError
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
              "no-store, max-age=0",

            "X-Content-Type-Options":
              "nosniff",
          },
        },
      );
    }

    console.error(
      "Customer reorder failed:",
      {
        error:
          error instanceof Error
            ? error.message
            : error,
      },
    );

    return NextResponse.json(
      {
        success: false,

        error:
          process.env.NODE_ENV ===
          "development"
            ? error instanceof Error
              ? error.message
              : "Unknown reorder error."
            : "The products could not be prepared for reorder. Please try again.",

        code:
          "reorder_failed",
      },

      {
        status: 502,

        headers: {
          "Cache-Control":
            "no-store, max-age=0",

          "X-Content-Type-Options":
            "nosniff",
        },
      },
    );
  }
}