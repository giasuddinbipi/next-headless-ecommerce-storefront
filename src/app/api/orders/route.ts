import {
  NextRequest,
  NextResponse,
} from "next/server";

import { auth } from "@/auth";

import {
  calculateCheckoutTotals,
  CheckoutTotalsError,
  type CheckoutTotalsResult,
} from "@/lib/checkout-totals";

import type {
  ValidatedCartItem,
} from "@/lib/cart-validation";

import {
  CouponValidationError,
  validateCouponForCart,
  type ValidatedCouponResult,
} from "@/lib/coupons";

import {
  getCustomerProfile,
} from "@/lib/customer";

import {
  completeOrderIdempotency,
  createOrderIdempotencyScope,
  createOrderRequestFingerprint,
  OrderIdempotencyError,
  readOrderIdempotencyKey,
  releaseOrderIdempotency,
  reserveOrderIdempotency,
  type OrderIdempotencyReservation,
} from "@/lib/order-idempotency";

import {
  sendWooCommerceOrderDetailsEmail,
} from "@/lib/order-email";

import {
  prepareSecureCheckout,
  SecureCheckoutError,
} from "@/lib/secure-checkout";

import {
  createWooCommerceOrder,
  type CreateOrderInput,
  type WooCommerceOrderAddress,
} from "@/lib/woocommerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =========================================================
   Configuration
========================================================= */

const MAX_REQUEST_BODY_SIZE =
  100_000;

const MAX_DISTINCT_CART_ITEMS =
  50;

const MAX_QUANTITY_PER_ITEM =
  99;

const MAX_TOTAL_QUANTITY =
  250;

const MAX_CUSTOMER_NOTE_LENGTH =
  1_000;

type UnknownRecord =
  Record<string, unknown>;

type ShippingArea =
  | "dhaka"
  | "outside";

type CartAttribute = {
  name: string;
  option: string;
};

type NormalizedCartItem = {
  productId: number;
  variationId?: number;

  quantity: number;

  attributes:
    CartAttribute[];
};

type NormalizedOrderRequest = {
  billing:
    WooCommerceOrderAddress;

  shipping:
    WooCommerceOrderAddress;

  shippingArea:
    ShippingArea;

  items:
    NormalizedCartItem[];

  customerNote: string;
  couponCode: string;
};

type ValidatedOrderLine = {
  product_id: number;
  variation_id?: number;

  quantity: number;

  meta_data?: Array<{
    key: string;
    value: unknown;
  }>;
};

class OrderRequestError extends Error {
  status: number;
  code: string;

  constructor(
    message: string,
    status = 400,
    code = "invalid_order",
  ) {
    super(message);

    this.name =
      "OrderRequestError";

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
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getRecord(
  value: unknown,
): UnknownRecord | null {
  return isObject(value)
    ? value
    : null;
}

function getFirstDefinedValue(
  source: UnknownRecord,
  keys: string[],
): unknown {
  for (const key of keys) {
    if (
      Object.prototype.hasOwnProperty.call(
        source,
        key,
      )
    ) {
      return source[key];
    }
  }

  return undefined;
}

function readString(
  source: UnknownRecord,
  keys: string[],
  fallback = "",
): string {
  const value =
    getFirstDefinedValue(
      source,
      keys,
    );

  if (
    typeof value === "string"
  ) {
    return value.trim();
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value).trim();
  }

  return fallback.trim();
}

function readNumber(
  source: UnknownRecord,
  keys: string[],
): number | null {
  const value =
    getFirstDefinedValue(
      source,
      keys,
    );

  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return null;
  }

  const numericValue =
    Number(value);

  return Number.isFinite(
    numericValue,
  )
    ? numericValue
    : null;
}

function readBoolean(
  source: UnknownRecord,
  keys: string[],
): boolean | null {
  const value =
    getFirstDefinedValue(
      source,
      keys,
    );

  if (
    typeof value === "boolean"
  ) {
    return value;
  }

  if (
    typeof value === "number"
  ) {
    if (value === 1) {
      return true;
    }

    if (value === 0) {
      return false;
    }
  }

  if (
    typeof value === "string"
  ) {
    const normalized =
      value
        .trim()
        .toLowerCase();

    if (
      [
        "true",
        "1",
        "yes",
        "on",
      ].includes(normalized)
    ) {
      return true;
    }

    if (
      [
        "false",
        "0",
        "no",
        "off",
      ].includes(normalized)
    ) {
      return false;
    }
  }

  return null;
}

function normalizeWhitespace(
  value: string,
): string {
  return value
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCouponCode(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .slice(0, 100);
}

function normalizeCountry(
  value: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    return "BD";
  }

  if (
    normalized.toLowerCase() ===
    "bangladesh"
  ) {
    return "BD";
  }

  return normalized
    .toUpperCase()
    .slice(0, 2);
}

function normalizeAttributeName(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^attribute_/, "")
    .replace(/^pa_/, "")
    .replace(/[\s_-]+/g, "");
}

function normalizeAttributeOption(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function formatMoney(
  value: number,
): string {
  return value.toFixed(2);
}

/* =========================================================
   Response headers
========================================================= */

function getOrderResponseHeaders({
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
   Request security
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

async function parseRequestBody(
  request: NextRequest,
): Promise<unknown> {
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
    throw new OrderRequestError(
      "The order request must use JSON.",
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
    throw new OrderRequestError(
      "The order request is too large.",
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
    throw new OrderRequestError(
      "The order request is too large.",
      413,
      "request_too_large",
    );
  }

  if (!rawBody.trim()) {
    throw new OrderRequestError(
      "The order request is empty.",
      400,
      "empty_request",
    );
  }

  try {
    return JSON.parse(
      rawBody,
    );
  } catch {
    throw new OrderRequestError(
      "The order request contains invalid JSON.",
      400,
      "invalid_json",
    );
  }
}

/* =========================================================
   Address normalization
========================================================= */

function normalizeAddress(
  source: UnknownRecord,
  fallback?:
    WooCommerceOrderAddress,
): WooCommerceOrderAddress {
  return {
    first_name:
      normalizeWhitespace(
        readString(
          source,
          [
            "first_name",
            "firstName",
            "firstname",
          ],
          fallback?.first_name,
        ),
      ),

    last_name:
      normalizeWhitespace(
        readString(
          source,
          [
            "last_name",
            "lastName",
            "lastname",
          ],
          fallback?.last_name,
        ),
      ),

    company:
      normalizeWhitespace(
        readString(
          source,
          ["company"],
          fallback?.company,
        ),
      ),

    address_1:
      normalizeWhitespace(
        readString(
          source,
          [
            "address_1",
            "address1",
            "addressLine1",
            "streetAddress",
          ],
          fallback?.address_1,
        ),
      ),

    address_2:
      normalizeWhitespace(
        readString(
          source,
          [
            "address_2",
            "address2",
            "addressLine2",
            "apartment",
          ],
          fallback?.address_2,
        ),
      ),

    city:
      normalizeWhitespace(
        readString(
          source,
          [
            "city",
            "town",
            "upazila",
          ],
          fallback?.city,
        ),
      ),

    state:
      normalizeWhitespace(
        readString(
          source,
          [
            "state",
            "division",
            "district",
            "region",
          ],
          fallback?.state,
        ),
      ),

    postcode:
      normalizeWhitespace(
        readString(
          source,
          [
            "postcode",
            "postalCode",
            "postal_code",
            "zip",
            "zipCode",
          ],
          fallback?.postcode,
        ),
      ),

    country:
      normalizeCountry(
        readString(
          source,
          ["country"],
          fallback?.country ||
            "BD",
        ),
      ),

    email:
      readString(
        source,
        ["email"],
        fallback?.email,
      )
        .trim()
        .toLowerCase(),

    phone:
      normalizeWhitespace(
        readString(
          source,
          [
            "phone",
            "mobile",
            "phoneNumber",
          ],
          fallback?.phone,
        ),
      ),
  };
}

function validateTextLength(
  value: string,
  label: string,
  maximumLength: number,
): void {
  if (
    value.length >
    maximumLength
  ) {
    throw new OrderRequestError(
      `${label} is too long.`,
      400,
      "invalid_address",
    );
  }
}

function validateAddress(
  address:
    WooCommerceOrderAddress,
  type:
    | "billing"
    | "shipping",
): void {
  const label =
    type === "billing"
      ? "Billing"
      : "Shipping";

  if (!address.first_name) {
    throw new OrderRequestError(
      `${label} first name is required.`,
      400,
      "invalid_address",
    );
  }

  if (!address.last_name) {
    throw new OrderRequestError(
      `${label} last name is required.`,
      400,
      "invalid_address",
    );
  }

  if (!address.address_1) {
    throw new OrderRequestError(
      `${label} address is required.`,
      400,
      "invalid_address",
    );
  }

  if (!address.city) {
    throw new OrderRequestError(
      `${label} city or upazila is required.`,
      400,
      "invalid_address",
    );
  }

  if (!address.state) {
    throw new OrderRequestError(
      `${label} district is required.`,
      400,
      "invalid_address",
    );
  }

  if (
    !/^[A-Z]{2}$/.test(
      address.country,
    )
  ) {
    throw new OrderRequestError(
      `${label} country must use a two-letter country code.`,
      400,
      "invalid_address",
    );
  }

  validateTextLength(
    address.first_name,
    `${label} first name`,
    100,
  );

  validateTextLength(
    address.last_name,
    `${label} last name`,
    100,
  );

  validateTextLength(
    address.company ?? "",
    `${label} company`,
    150,
  );

  validateTextLength(
    address.address_1,
    `${label} address`,
    300,
  );

  validateTextLength(
    address.address_2 ?? "",
    `${label} secondary address`,
    300,
  );

  validateTextLength(
    address.city,
    `${label} city`,
    100,
  );

  validateTextLength(
    address.state,
    `${label} district`,
    100,
  );

  validateTextLength(
    address.postcode,
    `${label} postcode`,
    30,
  );

  if (
    type === "billing"
  ) {
    const email =
      address.email ?? "";

    const phone =
      address.phone ?? "";

    if (!email) {
      throw new OrderRequestError(
        "Billing email is required.",
        400,
        "invalid_address",
      );
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        email,
      )
    ) {
      throw new OrderRequestError(
        "Enter a valid billing email address.",
        400,
        "invalid_address",
      );
    }

    if (!phone) {
      throw new OrderRequestError(
        "Billing phone number is required.",
        400,
        "invalid_address",
      );
    }

    if (
      !/^[0-9+().\-\s]{6,30}$/.test(
        phone,
      )
    ) {
      throw new OrderRequestError(
        "Enter a valid billing phone number.",
        400,
        "invalid_address",
      );
    }

    validateTextLength(
      email,
      "Billing email",
      200,
    );

    validateTextLength(
      phone,
      "Billing phone",
      30,
    );
  }
}

/* =========================================================
   Cart item normalization
========================================================= */

function normalizeCartAttributes(
  value: unknown,
): CartAttribute[] {
  const attributes:
    CartAttribute[] = [];

  if (Array.isArray(value)) {
    for (
      const entry of
      value.slice(0, 30)
    ) {
      const record =
        getRecord(entry);

      if (!record) {
        continue;
      }

      const name =
        normalizeWhitespace(
          readString(
            record,
            [
              "name",
              "key",
              "attribute",
              "label",
            ],
          ),
        );

      const option =
        normalizeWhitespace(
          readString(
            record,
            [
              "option",
              "value",
              "selected",
            ],
          ),
        );

      if (
        !name ||
        !option
      ) {
        continue;
      }

      attributes.push({
        name:
          name.slice(0, 150),

        option:
          option.slice(0, 250),
      });
    }
  } else if (
    isObject(value)
  ) {
    for (
      const [
        nameValue,
        optionValue,
      ] of Object.entries(
        value,
      )
    ) {
      const name =
        normalizeWhitespace(
          nameValue,
        );

      const option =
        normalizeWhitespace(
          typeof optionValue ===
            "string" ||
          typeof optionValue ===
            "number"
            ? String(
                optionValue,
              )
            : "",
        );

      if (
        name &&
        option
      ) {
        attributes.push({
          name:
            name.slice(0, 150),

          option:
            option.slice(0, 250),
        });
      }
    }
  }

  const uniqueAttributes =
    new Map<
      string,
      CartAttribute
    >();

  for (
    const attribute of
    attributes
  ) {
    const key =
      normalizeAttributeName(
        attribute.name,
      );

    if (!key) {
      continue;
    }

    uniqueAttributes.set(
      key,
      attribute,
    );
  }

  return Array.from(
    uniqueAttributes.values(),
  ).slice(0, 20);
}

function normalizeCartItem(
  value: unknown,
): NormalizedCartItem | null {
  const record =
    getRecord(value);

  if (!record) {
    return null;
  }

  const productIdValue =
    readNumber(
      record,
      [
        "productId",
        "product_id",
        "id",
      ],
    );

  const variationIdValue =
    readNumber(
      record,
      [
        "variationId",
        "variation_id",
      ],
    );

  const quantityValue =
    readNumber(
      record,
      [
        "quantity",
        "qty",
      ],
    );

  if (
    productIdValue === null ||
    !Number.isInteger(
      productIdValue,
    ) ||
    productIdValue < 1
  ) {
    return null;
  }

  if (
    quantityValue === null ||
    !Number.isInteger(
      quantityValue,
    ) ||
    quantityValue < 1 ||
    quantityValue >
      MAX_QUANTITY_PER_ITEM
  ) {
    return null;
  }

  let variationId:
    number | undefined;

  if (
    variationIdValue !== null &&
    variationIdValue !== 0
  ) {
    if (
      !Number.isInteger(
        variationIdValue,
      ) ||
      variationIdValue < 1
    ) {
      return null;
    }

    variationId =
      variationIdValue;
  }

  const rawAttributes =
    getFirstDefinedValue(
      record,
      [
        "attributes",
        "options",
        "selectedOptions",
        "meta_data",
      ],
    );

  return {
    productId:
      productIdValue,

    ...(variationId
      ? {
          variationId,
        }
      : {}),

    quantity:
      quantityValue,

    attributes:
      normalizeCartAttributes(
        rawAttributes,
      ),
  };
}

function getCartItemKey(
  item:
    NormalizedCartItem,
): string {
  const attributesKey =
    item.attributes
      .map((attribute) => ({
        name:
          normalizeAttributeName(
            attribute.name,
          ),

        option:
          normalizeAttributeOption(
            attribute.option,
          ),
      }))
      .sort(
        (
          first,
          second,
        ) => {
          const nameResult =
            first.name.localeCompare(
              second.name,
            );

          if (
            nameResult !== 0
          ) {
            return nameResult;
          }

          return first.option.localeCompare(
            second.option,
          );
        },
      )
      .map(
        (attribute) =>
          `${attribute.name}:${attribute.option}`,
      )
      .join("|");

  return [
    item.productId,
    item.variationId ?? 0,
    attributesKey,
  ].join("::");
}

function mergeDuplicateCartItems(
  items:
    NormalizedCartItem[],
): NormalizedCartItem[] {
  const mergedItems =
    new Map<
      string,
      NormalizedCartItem
    >();

  for (const item of items) {
    const key =
      getCartItemKey(item);

    const existing =
      mergedItems.get(key);

    if (!existing) {
      mergedItems.set(
        key,
        {
          ...item,

          attributes:
            [...item.attributes],
        },
      );

      continue;
    }

    const mergedQuantity =
      existing.quantity +
      item.quantity;

    if (
      mergedQuantity >
      MAX_QUANTITY_PER_ITEM
    ) {
      throw new OrderRequestError(
        "The requested quantity for one of the products is too high.",
        400,
        "invalid_quantity",
      );
    }

    existing.quantity =
      mergedQuantity;
  }

  return Array.from(
    mergedItems.values(),
  );
}

/* =========================================================
   Full order request normalization
========================================================= */

function normalizeShippingArea(
  value: string,
): ShippingArea {
  return value
    .trim()
    .toLowerCase() ===
    "outside"
    ? "outside"
    : "dhaka";
}

function normalizeOrderRequest(
  value: unknown,
): NormalizedOrderRequest {
  const body =
    getRecord(value);

  if (!body) {
    throw new OrderRequestError(
      "Invalid order data.",
      400,
      "invalid_order",
    );
  }

  const website =
    readString(
      body,
      ["website"],
    );

  if (website) {
    throw new OrderRequestError(
      "The order request was rejected.",
      400,
      "invalid_request",
    );
  }

  const termsAccepted =
    readBoolean(
      body,
      [
        "termsAccepted",
        "terms_accepted",
      ],
    );

  if (
    termsAccepted !== true
  ) {
    throw new OrderRequestError(
      "You must agree to the store terms before placing the order.",
      400,
      "terms_not_accepted",
    );
  }

  const billingSource =
    getRecord(
      body.billing,
    ) ??
    getRecord(
      body.customer,
    ) ??
    body;

  const billing =
    normalizeAddress(
      billingSource,
    );

  const shippingSource =
    getRecord(
      body.shipping,
    );

  const sameAsBilling =
    readBoolean(
      body,
      [
        "sameAsBilling",
        "shippingSameAsBilling",
        "useBillingAddress",
      ],
    );

  const shipToDifferentAddress =
    readBoolean(
      body,
      [
        "shipToDifferentAddress",
        "differentShippingAddress",
      ],
    );

  const shouldUseShippingAddress =
    shippingSource !== null &&
    sameAsBilling !== true &&
    shipToDifferentAddress !==
      false;

  const shipping =
    shouldUseShippingAddress &&
    shippingSource
      ? normalizeAddress(
          shippingSource,
          billing,
        )
      : {
          ...billing,
        };

  const shippingArea =
    normalizeShippingArea(
      readString(
        body,
        [
          "shippingArea",
          "shipping_area",
        ],
        "dhaka",
      ),
    );

  const rawItems =
    getFirstDefinedValue(
      body,
      [
        "items",
        "cartItems",
        "cart_items",
        "line_items",
      ],
    );

  if (
    !Array.isArray(
      rawItems,
    )
  ) {
    throw new OrderRequestError(
      "The cart items are missing.",
      400,
      "missing_cart_items",
    );
  }

  if (
    rawItems.length === 0
  ) {
    throw new OrderRequestError(
      "Your cart is empty.",
      400,
      "empty_cart",
    );
  }

  if (
    rawItems.length >
    MAX_DISTINCT_CART_ITEMS
  ) {
    throw new OrderRequestError(
      "The cart contains too many products.",
      400,
      "cart_too_large",
    );
  }

  const normalizedItems =
    rawItems.map(
      normalizeCartItem,
    );

  if (
    normalizedItems.some(
      (item) =>
        item === null,
    )
  ) {
    throw new OrderRequestError(
      "One or more cart items contain invalid product or quantity data.",
      400,
      "invalid_cart_item",
    );
  }

  const items =
    mergeDuplicateCartItems(
      normalizedItems.filter(
        (
          item,
        ): item is NormalizedCartItem =>
          item !== null,
      ),
    );

  const totalQuantity =
    items.reduce(
      (total, item) =>
        total +
        item.quantity,
      0,
    );

  if (
    totalQuantity >
    MAX_TOTAL_QUANTITY
  ) {
    throw new OrderRequestError(
      "The total requested product quantity is too high.",
      400,
      "cart_quantity_too_high",
    );
  }

  const customerNote =
    normalizeWhitespace(
      readString(
        billingSource,
        [
          "note",
          "customerNote",
          "customer_note",
          "orderNotes",
          "order_notes",
          "notes",
        ],
        readString(
          body,
          [
            "customerNote",
            "customer_note",
            "orderNotes",
            "order_notes",
            "notes",
          ],
        ),
      ),
    );

  if (
    customerNote.length >
    MAX_CUSTOMER_NOTE_LENGTH
  ) {
    throw new OrderRequestError(
      `Order notes cannot exceed ${MAX_CUSTOMER_NOTE_LENGTH} characters.`,
      400,
      "invalid_customer_note",
    );
  }

  const couponCode =
    normalizeCouponCode(
      readString(
        body,
        [
          "couponCode",
          "coupon_code",
          "coupon",
        ],
      ),
    );

  validateAddress(
    billing,
    "billing",
  );

  validateAddress(
    shipping,
    "shipping",
  );

  return {
    billing,
    shipping,
    shippingArea,
    items,
    customerNote,
    couponCode,
  };
}

/* =========================================================
   Coupon validation
========================================================= */

async function validateOrderCoupon({
  couponCode,
  billingEmail,
  customerId,
  sessionEmail,
  items,
}: {
  couponCode: string;

  billingEmail?: string;

  customerId: number;

  sessionEmail?:
    | string
    | null;

  items:
    NormalizedCartItem[];
}): Promise<
  ValidatedCouponResult | null
> {
  if (!couponCode) {
    return null;
  }

  let trustedEmail =
    billingEmail
      ?.trim()
      .toLowerCase() || "";

  if (customerId > 0) {
    try {
      const customer =
        await getCustomerProfile(
          customerId,
        );

      if (
        customer?.email
      ) {
        trustedEmail =
          customer.email
            .trim()
            .toLowerCase();
      }
    } catch (error) {
      console.error(
        "Order coupon customer lookup failed:",
        error,
      );

      if (
        typeof sessionEmail ===
          "string" &&
        sessionEmail.trim()
      ) {
        trustedEmail =
          sessionEmail
            .trim()
            .toLowerCase();
      }
    }
  }

  try {
    return await validateCouponForCart({
      code:
        couponCode,

      email:
        trustedEmail ||
        undefined,

      customerId:
        customerId > 0
          ? customerId
          : undefined,

      items:
        items.map(
          (item) => ({
            productId:
              item.productId,

            ...(item.variationId
              ? {
                  variationId:
                    item.variationId,
                }
              : {}),

            quantity:
              item.quantity,
          }),
        ),
    });
  } catch (error) {
    if (
      error instanceof
      CouponValidationError
    ) {
      throw new OrderRequestError(
        error.message,
        error.status,
        error.code,
      );
    }

    throw error;
  }
}

/* =========================================================
   Shipping configuration
========================================================= */

function parseShippingFee(
  value:
    | string
    | undefined,
  fallback: number,
): number {
  const parsed =
    Number(value);

  if (
    !Number.isFinite(
      parsed,
    ) ||
    parsed < 0
  ) {
    return fallback;
  }

  return parsed;
}

function getShippingConfiguration(
  shippingArea:
    ShippingArea,
): {
  methodId: string;
  methodTitle: string;
  total: string;
} {
  const legacyShippingFee =
    process.env
      .STORE_SHIPPING_FEE;

  const shippingFee =
    shippingArea === "dhaka"
      ? parseShippingFee(
          process.env
            .STORE_SHIPPING_FEE_DHAKA ??
            legacyShippingFee,
          80,
        )
      : parseShippingFee(
          process.env
            .STORE_SHIPPING_FEE_OUTSIDE ??
            legacyShippingFee,
          150,
        );

  const methodId =
    process.env
      .STORE_SHIPPING_METHOD_ID
      ?.trim() ||
    "flat_rate";

  const defaultTitle =
    shippingArea === "dhaka"
      ? "Inside Dhaka delivery"
      : "Outside Dhaka delivery";

  const methodTitle =
    process.env
      .STORE_SHIPPING_METHOD_TITLE
      ?.trim() ||
    defaultTitle;

  return {
    methodId,
    methodTitle,

    total:
      formatMoney(
        shippingFee,
      ),
  };
}

/* =========================================================
   Trusted WooCommerce order lines
========================================================= */

function buildTrustedOrderLines(
  items:
    ValidatedCartItem[],
): ValidatedOrderLine[] {
  return items.map(
    (item) => {
      const metadata =
        item.attributes.map(
          (attribute) => ({
            key:
              attribute.name,

            value:
              attribute.option,
          }),
        );

      return {
        product_id:
          item.productId,

        ...(item.variationId
          ? {
              variation_id:
                item.variationId,
            }
          : {}),

        quantity:
          item.quantity,

        ...(metadata.length > 0
          ? {
              meta_data:
                metadata,
            }
          : {}),
      };
    },
  );
}

/* =========================================================
   POST /api/orders
========================================================= */

export async function POST(
  request: NextRequest,
) {
  let idempotencyReservation:
    OrderIdempotencyReservation | null =
      null;

  /*
   * WooCommerce request শুরু হয়ে গেলে
   * reservation release করা হবে না।
   *
   * Error হলেও order তৈরি হয়ে থাকতে পারে।
   */
  let orderCreationStarted =
    false;

  try {
    if (
      !isSameOrigin(request)
    ) {
      throw new OrderRequestError(
        "The order request was rejected.",
        403,
        "invalid_origin",
      );
    }

    const idempotencyKey =
      readOrderIdempotencyKey(
        request,
      );

    const rawBody =
      await parseRequestBody(
        request,
      );

    const normalizedRequest =
      normalizeOrderRequest(
        rawBody,
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
     * Stable server-side request fingerprint।
     *
     * Browser-generated fingerprint trusted নয়।
     */
    const requestFingerprint =
      createOrderRequestFingerprint({
        version: 1,

        paymentMethod:
          "cod",

        customerId,

        billing:
          normalizedRequest.billing,

        shipping:
          normalizedRequest.shipping,

        shippingArea:
          normalizedRequest
            .shippingArea,

        items:
          normalizedRequest.items,

        customerNote:
          normalizedRequest
            .customerNote,

        couponCode:
          normalizedRequest
            .couponCode,
      });

    const idempotencyScope =
      createOrderIdempotencyScope({
        customerId,

        billingEmail:
          normalizedRequest
            .billing.email,
      });

    /*
     * Shipping fee browser থেকে নেওয়া হয় না।
     */
    const shipping =
      getShippingConfiguration(
        normalizedRequest
          .shippingArea,
      );

    /*
     * Current catalogue, variation, stock,
     * quantity এবং price validation।
     */
    const secureCheckout =
      await prepareSecureCheckout({
        items:
          normalizedRequest
            .items,

        shippingArea:
          normalizedRequest
            .shippingArea,

        shippingAmount:
          shipping.total,

        shippingLabel:
          shipping.methodTitle,
      });

    if (
      secureCheckout.items.length ===
      0
    ) {
      throw new OrderRequestError(
        "No valid products were found in the cart.",
        409,
        "checkout_cart_empty",
      );
    }

    /*
     * Coupon order creation-এর সময়
     * আবার server-side validate হবে।
     */
    const validatedCoupon =
      await validateOrderCoupon({
        couponCode:
          normalizedRequest
            .couponCode,

        billingEmail:
          normalizedRequest
            .billing.email,

        customerId,

        sessionEmail:
          session?.user?.email,

        items:
          secureCheckout.items.map(
            (item) => ({
              productId:
                item.productId,

              ...(item.variationId
                ? {
                    variationId:
                      item.variationId,
                  }
                : {}),

              quantity:
                item.quantity,

              attributes:
                item.attributes,
            }),
          ),
      });

    let trustedTotals:
      CheckoutTotalsResult;

    try {
      trustedTotals =
        calculateCheckoutTotals({
          items:
            secureCheckout.items,

          shippingArea:
            normalizedRequest
              .shippingArea,

          shippingAmount:
            shipping.total,

          shippingLabel:
            shipping.methodTitle,

          discountAmount:
            validatedCoupon
              ?.discount ?? 0,

          freeShipping:
            validatedCoupon
              ?.freeShipping ??
            false,
        });
    } catch (error) {
      if (
        error instanceof
        CheckoutTotalsError
      ) {
        throw new OrderRequestError(
          error.message,
          error.status,
          error.code,
        );
      }

      throw error;
    }

    const validatedLines =
      buildTrustedOrderLines(
        secureCheckout.items,
      );

    if (
      validatedLines.length ===
      0
    ) {
      throw new OrderRequestError(
        "No valid products were found in the cart.",
        409,
        "checkout_cart_empty",
      );
    }

    const {
      email:
        _shippingEmail,

      phone:
        _shippingPhone,

      ...safeShippingAddress
    } =
      normalizedRequest.shipping;

    const orderMetaData:
      NonNullable<
        CreateOrderInput["meta_data"]
      > = [
      {
        key:
          "_headless_storefront_order",

        value:
          "yes",
      },

      {
        key:
          "_headless_order_source",

        value:
          "nextjs-storefront",
      },

      {
        key:
          "_headless_shipping_area",

        value:
          normalizedRequest
            .shippingArea,
      },

      {
        key:
          "_headless_server_currency",

        value:
          trustedTotals.currency,
      },

      {
        key:
          "_headless_server_subtotal",

        value:
          trustedTotals.subtotal,
      },

      {
        key:
          "_headless_server_discount",

        value:
          trustedTotals.discount,
      },

      {
        key:
          "_headless_server_shipping",

        value:
          trustedTotals.shipping,
      },

      {
        key:
          "_headless_server_total",

        value:
          trustedTotals.total,
      },

      {
        key:
          "_headless_totals_calculation",

        value:
          "server-v1",
      },

      {
        key:
          "_headless_order_request_fingerprint",

        value:
          requestFingerprint,
      },

      {
        key:
          "_headless_order_idempotency",

        value:
          "redis-v1",
      },

      ...(validatedCoupon
        ? [
            {
              key:
                "_headless_coupon_code",

              value:
                validatedCoupon.code,
            },

            {
              key:
                "_headless_coupon_validated_discount",

              value:
                validatedCoupon
                  .discount
                  .toFixed(2),
            },
          ]
        : []),
    ];

    const orderInput:
      CreateOrderInput = {
      ...(customerId > 0
        ? {
            customer_id:
              customerId,
          }
        : {}),

      payment_method:
        "cod",

      payment_method_title:
        "Cash on delivery",

      set_paid: false,

      billing:
        normalizedRequest
          .billing,

      shipping:
        safeShippingAddress,

      line_items:
        validatedLines,

      shipping_lines: [
        {
          method_id:
            shipping.methodId,

          method_title:
            validatedCoupon
              ?.freeShipping
              ? "Free delivery"
              : shipping
                  .methodTitle,

          total:
            validatedCoupon
              ?.freeShipping
              ? "0.00"
              : shipping.total,
        },
      ],

      ...(validatedCoupon
        ? {
            coupon_lines: [
              {
                code:
                  validatedCoupon
                    .code,
              },
            ],
          }
        : {}),

      customer_note:
        normalizedRequest
          .customerNote,

      meta_data:
        orderMetaData,
    };

    /*
     * সব validation সফল হওয়ার পরে এবং
     * WooCommerce request-এর ঠিক আগে
     * atomic reservation নেওয়া হচ্ছে।
     */
    const idempotencyDecision =
      await reserveOrderIdempotency({
        idempotencyKey,

        scope:
          idempotencyScope,

        fingerprint:
          requestFingerprint,
      });

    if (
      idempotencyDecision.kind ===
      "replay"
    ) {
      return NextResponse.json(
        {
          ...idempotencyDecision
            .response.body,

          idempotencyReplayed:
            true,
        },

        {
          status:
            idempotencyDecision
              .response.status,

          headers:
            getOrderResponseHeaders({
              replayed: true,
            }),
        },
      );
    }

    if (
      idempotencyDecision.kind ===
      "in_progress"
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            "This order request is still being processed. Please wait a moment and try again.",

          code:
            "order_request_in_progress",
        },

        {
          status: 409,

          headers: {
            ...getOrderResponseHeaders(),

            "Retry-After":
              "2",
          },
        },
      );
    }

    const activeReservation =
      idempotencyDecision
        .reservation;

    idempotencyReservation =
      activeReservation;

    /*
     * এই point-এর পরে result uncertain হলে
     * reservation release করা হবে না।
     */
    orderCreationStarted =
      true;

    const order =
      await createWooCommerceOrder(
        orderInput,
      );

    /*
     * WooCommerce-created total এবং
     * server-calculated total compare।
     */
    const expectedTotal =
      Number(
        trustedTotals.total,
      );

    const createdOrderTotal =
      Number(
        order.total,
      );

    const expectedDiscount =
      Number(
        trustedTotals.discount,
      );

    const createdDiscount =
      Number(
        order.discount_total ??
          0,
      );

    const expectedShipping =
      Number(
        trustedTotals.shipping,
      );

    const createdShipping =
      Number(
        order.shipping_total ??
          0,
      );

    const totalsVerified =
      Number.isFinite(
        expectedTotal,
      ) &&
      Number.isFinite(
        createdOrderTotal,
      ) &&
      Number.isFinite(
        expectedDiscount,
      ) &&
      Number.isFinite(
        createdDiscount,
      ) &&
      Number.isFinite(
        expectedShipping,
      ) &&
      Number.isFinite(
        createdShipping,
      ) &&
      Math.abs(
        expectedTotal -
          createdOrderTotal,
      ) <= 0.01 &&
      Math.abs(
        expectedDiscount -
          createdDiscount,
      ) <= 0.01 &&
      Math.abs(
        expectedShipping -
          createdShipping,
      ) <= 0.01;

    if (!totalsVerified) {
      console.error(
        "Created order totals differ from server calculation:",
        {
          orderId:
            order.id,

          orderNumber:
            order.number,

          expected: {
            subtotal:
              trustedTotals
                .subtotal,

            discount:
              trustedTotals
                .discount,

            shipping:
              trustedTotals
                .shipping,

            total:
              trustedTotals
                .total,
          },

          created: {
            discount:
              order
                .discount_total ??
              "0",

            shipping:
              order
                .shipping_total ??
              "0",

            total:
              order.total,
          },
        },
      );
    }

    /*
     * Email failure হলেও successful order
     * response ব্যর্থ করা হবে না।
     */
    let confirmationEmailSent =
      false;

    try {
      await sendWooCommerceOrderDetailsEmail(
        order.id,
      );

      confirmationEmailSent =
        true;
    } catch (emailError) {
      console.error(
        "Order confirmation email failed:",
        {
          orderId:
            order.id,

          orderNumber:
            order.number,

          error:
            emailError instanceof Error
              ? emailError.message
              : emailError,
        },
      );
    }

    const successResponseBody:
      Record<string, unknown> = {
      success: true,

      message:
        "Your order was placed successfully.",

      orderId:
        order.id,

      orderNumber:
        order.number,

      status:
        order.status,

      total:
        order.total,

      currency:
        order.currency,

      emailSent:
        confirmationEmailSent,

      totalsVerified,

      idempotencyReplayed:
        false,

      idempotencyStored:
        true,

      serverCalculatedTotals: {
        currency:
          trustedTotals.currency,

        subtotal:
          trustedTotals.subtotal,

        discount:
          trustedTotals.discount,

        shipping:
          trustedTotals.shipping,

        total:
          trustedTotals.total,

        freeShipping:
          trustedTotals
            .freeShipping,
      },

      discountTotal:
        order.discount_total ??
        "0",

      shippingTotal:
        order.shipping_total ??
        "0",

      coupon:
        validatedCoupon
          ? {
              code:
                validatedCoupon
                  .code,

              discount:
                order
                  .discount_total ??
                validatedCoupon
                  .discount
                  .toFixed(2),

              freeShipping:
                validatedCoupon
                  .freeShipping,
            }
          : null,

      order: {
        id:
          order.id,

        number:
          order.number,

        status:
          order.status,

        total:
          order.total,

        currency:
          order.currency,

        discountTotal:
          order
            .discount_total ??
          "0",

        shippingTotal:
          order
            .shipping_total ??
          "0",
      },
    };

    /*
     * Successful response Redis-এ cache।
     */
    try {
      await completeOrderIdempotency({
        reservation:
          activeReservation,

        response: {
          status: 201,

          body:
            successResponseBody,
        },
      });
    } catch (completionError) {
      /*
       * Order ইতোমধ্যে তৈরি হয়েছে।
       * Redis failure-এর কারণে order failure
       * response দেওয়া হবে না।
       */
      successResponseBody
        .idempotencyStored =
        false;

      console.error(
        "Order idempotency completion failed after order creation:",
        {
          orderId:
            order.id,

          orderNumber:
            order.number,

          error:
            completionError instanceof Error
              ? completionError.message
              : completionError,
        },
      );
    }

    return NextResponse.json(
      successResponseBody,

      {
        status: 201,

        headers:
          getOrderResponseHeaders(),
      },
    );
  } catch (error) {
    /*
     * Reservation acquired হলেও WooCommerce
     * request শুরু না হলে safe release।
     */
    if (
      idempotencyReservation &&
      !orderCreationStarted
    ) {
      try {
        await releaseOrderIdempotency(
          idempotencyReservation,
        );
      } catch (releaseError) {
        console.error(
          "Failed to release order idempotency reservation:",
          releaseError,
        );
      }
    }

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
            getOrderResponseHeaders(),
        },
      );
    }

    if (
      error instanceof
      SecureCheckoutError
    ) {
      return NextResponse.json(
        {
          success: false,

          error:
            error.message,

          code:
            error.code,

          ...(error.details
            ? {
                details:
                  error.details,
              }
            : {}),
        },

        {
          status:
            error.status,

          headers:
            getOrderResponseHeaders(),
        },
      );
    }

    if (
      error instanceof
      OrderRequestError
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
            getOrderResponseHeaders(),
        },
      );
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : "Unknown order creation error.";

    console.error(
      "WooCommerce order creation failed:",
      errorMessage,
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error:
          process.env.NODE_ENV ===
          "development"
            ? errorMessage
            : "Your order could not be placed. Please review your cart and try again.",

        code:
          "order_creation_failed",
      },

      {
        status: 502,

        headers:
          getOrderResponseHeaders(),
      },
    );
  }
}