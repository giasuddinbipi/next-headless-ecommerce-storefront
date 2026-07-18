import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  CartValidationError,
  validateCartItems,
  type CartValidationInputItem,
} from "@/lib/cart-validation";

import type {
  WooCommerceStockStatus,
} from "@/lib/woocommerce";

export const runtime = "nodejs";
export const dynamic =
  "force-dynamic";

const MAX_REQUEST_BODY_SIZE =
  100_000;

const MAX_CART_ITEMS = 50;
const MAX_ATTRIBUTES_PER_ITEM = 20;
const MAX_CART_QUANTITY = 99;

type UnknownRecord =
  Record<string, unknown>;

/* =========================================================
   Basic helpers
========================================================= */

function isObject(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizeText(
  value: string,
): string {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

function isStockStatus(
  value: unknown,
): value is WooCommerceStockStatus {
  return (
    value === "instock" ||
    value === "outofstock" ||
    value === "onbackorder"
  );
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
        ? new URL(normalized)
        : new URL(
            `https://${normalized}`,
          );

    origins.add(url.origin);
  } catch {
    // Invalid configured URL ignored.
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
   Request body
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
    throw new CartValidationError(
      "The cart validation request must use JSON.",
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
    throw new CartValidationError(
      "The cart validation request is too large.",
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
    throw new CartValidationError(
      "The cart validation request is too large.",
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
    throw new CartValidationError(
      "The cart validation request contains invalid JSON.",
      400,
      "invalid_json",
    );
  }

  if (!isObject(data)) {
    throw new CartValidationError(
      "Invalid cart validation request.",
      400,
      "invalid_request",
    );
  }

  return data;
}

/* =========================================================
   Cart input normalization
========================================================= */

function normalizeAttributes(
  value: unknown,
): Array<{
  name: string;
  option: string;
}> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  if (
    value.length >
    MAX_ATTRIBUTES_PER_ITEM
  ) {
    return null;
  }

  const attributes: Array<{
    name: string;
    option: string;
  }> = [];

  for (const entry of value) {
    if (!isObject(entry)) {
      return null;
    }

    if (
      typeof entry.name !==
        "string" ||
      typeof entry.option !==
        "string"
    ) {
      return null;
    }

    const name =
      normalizeText(
        entry.name,
      );

    const option =
      normalizeText(
        entry.option,
      );

    if (!name || !option) {
      return null;
    }

    attributes.push({
      name:
        name.slice(0, 150),

      option:
        option.slice(0, 250),
    });
  }

  return attributes;
}

function normalizeCartItem(
  value: unknown,
): CartValidationInputItem | null {
  if (!isObject(value)) {
    return null;
  }

  if (
    typeof value.cartKey !==
      "string" ||
    !value.cartKey.trim() ||
    value.cartKey.length > 1_000
  ) {
    return null;
  }

  if (
    typeof value.productId !==
      "number" ||
    !Number.isInteger(
      value.productId,
    ) ||
    value.productId < 1
  ) {
    return null;
  }

  let variationId:
    number | undefined;

  if (
    value.variationId !==
      undefined &&
    value.variationId !== null
  ) {
    if (
      typeof value.variationId !==
        "number" ||
      !Number.isInteger(
        value.variationId,
      ) ||
      value.variationId < 1
    ) {
      return null;
    }

    variationId =
      value.variationId;
  }

  if (
    typeof value.quantity !==
      "number" ||
    !Number.isInteger(
      value.quantity,
    ) ||
    value.quantity < 1 ||
    value.quantity >
      MAX_CART_QUANTITY
  ) {
    return null;
  }

  if (
    typeof value.name !==
      "string" ||
    typeof value.slug !==
      "string" ||
    typeof value.price !==
      "string"
  ) {
    return null;
  }

  const name =
    normalizeText(
      value.name,
    );

  const slug =
    value.slug.trim();

  const price =
    value.price.trim();

  if (
    !name ||
    !slug ||
    !price ||
    name.length > 300 ||
    slug.length > 300 ||
    price.length > 50
  ) {
    return null;
  }

  const numericPrice =
    Number(price);

  if (
    !Number.isFinite(
      numericPrice,
    ) ||
    numericPrice < 0
  ) {
    return null;
  }

  if (
    !isStockStatus(
      value.stockStatus,
    )
  ) {
    return null;
  }

  const attributes =
    normalizeAttributes(
      value.attributes,
    );

  if (!attributes) {
    return null;
  }

  let image:
    string | undefined;

  if (
    value.image !== undefined &&
    value.image !== null
  ) {
    if (
      typeof value.image !==
        "string" ||
      value.image.length >
        2_000
    ) {
      return null;
    }

    const normalizedImage =
      value.image.trim();

    if (normalizedImage) {
      image =
        normalizedImage;
    }
  }

  return {
    cartKey:
      value.cartKey.trim(),

    productId:
      value.productId,

    ...(variationId
      ? { variationId }
      : {}),

    name,

    slug,

    price,

    ...(image
      ? { image }
      : {}),

    stockStatus:
      value.stockStatus,

    attributes,

    quantity:
      value.quantity,
  };
}

function normalizeCartItems(
  value: unknown,
): CartValidationInputItem[] {
  if (!Array.isArray(value)) {
    throw new CartValidationError(
      "Cart items are required.",
      400,
      "missing_cart_items",
    );
  }

  if (
    value.length >
    MAX_CART_ITEMS
  ) {
    throw new CartValidationError(
      `The cart cannot contain more than ${MAX_CART_ITEMS} products.`,
      400,
      "cart_too_large",
    );
  }

  const items =
    value.map(
      normalizeCartItem,
    );

  if (
    items.some(
      (item) => item === null,
    )
  ) {
    throw new CartValidationError(
      "One or more cart items contain invalid data.",
      400,
      "invalid_cart_item",
    );
  }

  return items.filter(
    (
      item,
    ): item is CartValidationInputItem =>
      item !== null,
  );
}

/* =========================================================
   POST /api/cart/validate
========================================================= */

export async function POST(
  request: NextRequest,
) {
  try {
    if (
      !isSameOrigin(request)
    ) {
      throw new CartValidationError(
        "The cart validation request was rejected.",
        403,
        "invalid_origin",
      );
    }

    const body =
      await parseRequestBody(
        request,
      );

    /*
     * Basic bot honeypot।
     */
    if (
      typeof body.website ===
        "string" &&
      body.website.trim()
    ) {
      throw new CartValidationError(
        "The cart validation request was rejected.",
        400,
        "invalid_request",
      );
    }

    const items =
      normalizeCartItems(
        body.items,
      );

    const result =
      await validateCartItems(
        items,
      );

    let message =
      "Your cart is up to date.";

    if (
      result.removedItemCount >
        0 &&
      result.changedItemCount > 0
    ) {
      message =
        "Your cart was updated. Some unavailable products were removed and some product information changed.";
    } else if (
      result.removedItemCount >
      0
    ) {
      message =
        "Some unavailable products were removed from your cart.";
    } else if (
      result.changedItemCount >
      0
    ) {
      message =
        "Your cart was updated using the current price and stock information.";
    }

    return NextResponse.json(
      {
        success: true,

        message,

        items:
          result.items,

        removedItems:
          result.removedItems,

        changes:
          result.changes,

        originalItemCount:
          result.originalItemCount,

        validatedItemCount:
          result.validatedItemCount,

        removedItemCount:
          result.removedItemCount,

        changedItemCount:
          result.changedItemCount,
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
      CartValidationError
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
      "Cart validation route failed:",
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
              : "Unknown cart validation error."
            : "The cart could not be checked right now. Your existing cart has not been changed.",

        code:
          "cart_validation_failed",
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