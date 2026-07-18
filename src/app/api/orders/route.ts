import {
  NextRequest,
  NextResponse,
} from "next/server";

import { auth } from "@/auth";

import {
  getCustomerProfile,
} from "@/lib/customer";

import {
  CouponValidationError,
  validateCouponForCart,
  type ValidatedCouponResult,
} from "@/lib/coupons";

import {
  calculateCheckoutTotals,
  CheckoutTotalsError,
  type CheckoutTotalsResult,
} from "@/lib/checkout-totals";

import type {
  ValidatedCartItem,
} from "@/lib/cart-validation";

import {
  prepareSecureCheckout,
  SecureCheckoutError,
} from "@/lib/secure-checkout";

import {
  sendWooCommerceOrderDetailsEmail,
} from "@/lib/order-email";

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

  /*
   * Logged-in customer হলে WooCommerce
   * customer account-এর email trusted হবে।
   */
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

    const rawBody =
      await parseRequestBody(
        request,
      );

    const normalizedRequest =
      normalizeOrderRequest(
        rawBody,
      );

    /*
     * Authentication এবং customer identity।
     */
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
     * Shipping amount browser থেকে নেওয়া হবে না।
     * Environment/server configuration authoritative।
     */
    const shipping =
      getShippingConfiguration(
        normalizedRequest
          .shippingArea,
      );

    /*
     * Secure cart validation:
     *
     * - Current product
     * - Current variation
     * - Selected attributes
     * - Current stock
     * - Current price
     * - Purchasable state
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
     * Coupon checkout-এর সময় আবার
     * server-side validate হবে।
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

    /*
     * Shipping object-এ billing-only email
     * এবং phone পাঠানো হবে না।
     */
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

    const order =
      await createWooCommerceOrder(
        orderInput,
      );

    /*
     * WooCommerce-created order totals-এর সঙ্গে
     * server calculation compare করা হবে।
     *
     * Order ইতোমধ্যে তৈরি হলে mismatch-এর কারণে
     * failure response দেওয়া হবে না, কারণ এতে
     * customer পুনরায় submit করে duplicate order
     * তৈরি করতে পারে।
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
     * Email ব্যর্থ হলেও successful order
     * response ব্যর্থ করা হবে না।
     *
     * Failure response দিলে customer আবার
     * submit করে duplicate order তৈরি করতে পারে।
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

    return NextResponse.json(
      {
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
      },

      {
        status: 201,

        headers: {
          "Cache-Control":
            "no-store",

          "X-Content-Type-Options":
            "nosniff",
        },
      },
    );
  } catch (error) {
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

          headers: {
            "Cache-Control":
              "no-store",

            "X-Content-Type-Options":
              "nosniff",
          },
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

          headers: {
            "Cache-Control":
              "no-store",

            "X-Content-Type-Options":
              "nosniff",
          },
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

        headers: {
          "Cache-Control":
            "no-store",

          "X-Content-Type-Options":
            "nosniff",
        },
      },
    );
  }
}