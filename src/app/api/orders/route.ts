import {
  NextRequest,
  NextResponse,
} from "next/server";

import { auth } from "@/auth";

import {
  createWooCommerceOrder,
  getProductById,
  getProductVariations,
  type CreateOrderInput,
  type WooCommerceOrderAddress,
  type WooCommerceProduct,
  type WooCommerceStockStatus,
  type WooCommerceVariation,
} from "@/lib/woocommerce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* =========================================================
   Configuration
========================================================= */

const MAX_REQUEST_BODY_SIZE = 100_000;
const MAX_DISTINCT_CART_ITEMS = 50;
const MAX_QUANTITY_PER_ITEM = 99;
const MAX_TOTAL_QUANTITY = 250;
const MAX_CUSTOMER_NOTE_LENGTH = 1_000;

type UnknownRecord =
  Record<string, unknown>;

type CartAttribute = {
  name: string;
  option: string;
};

type NormalizedCartItem = {
  productId: number;
  variationId?: number;
  quantity: number;
  attributes: CartAttribute[];
};

type NormalizedOrderRequest = {
  billing: WooCommerceOrderAddress;
  shipping: WooCommerceOrderAddress;
  items: NormalizedCartItem[];
  customerNote: string;
};

type PurchasableItemSnapshot = {
  name?: string;
  price: string;
  purchasable: boolean;

  stock_status:
    WooCommerceStockStatus;

  manage_stock: boolean;
  stock_quantity: number | null;
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

    this.name = "OrderRequestError";
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
  value: string | undefined,
) {
  const normalized =
    value?.trim();

  if (!normalized) {
    return;
  }

  try {
    const url = normalized.includes(
      "://",
    )
      ? new URL(normalized)
      : new URL(
          `https://${normalized}`,
        );

    origins.add(url.origin);
  } catch {
    // Invalid environment URL is ignored.
  }
}

function isSameOrigin(
  request: NextRequest,
): boolean {
  const originHeader =
    request.headers.get("origin");

  if (!originHeader) {
    return false;
  }

  let requestOrigin: string;
  let submittedOrigin: string;

  try {
    requestOrigin =
      new URL(request.url).origin;

    submittedOrigin =
      new URL(originHeader).origin;
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
    process.env.NEXT_PUBLIC_SITE_URL,
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
    Number.isFinite(contentLength) &&
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
    return JSON.parse(rawBody);
  } catch {
    throw new OrderRequestError(
      "The order request contains invalid JSON.",
      400,
      "invalid_json",
    );
  }
}

/* =========================================================
   Address normalization and validation
========================================================= */

function normalizeAddress(
  source: UnknownRecord,
  fallback?: WooCommerceOrderAddress,
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
            "district",
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
) {
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
  address: WooCommerceOrderAddress,
  type: "billing" | "shipping",
) {
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
      `${label} city or district is required.`,
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
    250,
  );

  validateTextLength(
    address.address_2 ?? "",
    `${label} secondary address`,
    250,
  );

  validateTextLength(
    address.city,
    `${label} city`,
    100,
  );

  validateTextLength(
    address.state,
    `${label} state`,
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
      const entry of value.slice(
        0,
        30,
      )
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
        name: name.slice(0, 150),
        option:
          option.slice(0, 250),
      });
    }
  } else if (isObject(value)) {
    for (
      const [
        nameValue,
        optionValue,
      ] of Object.entries(value)
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
            ? String(optionValue)
            : "",
        );

      if (
        name &&
        option
      ) {
        attributes.push({
          name: name.slice(0, 150),
          option:
            option.slice(0, 250),
        });
      }
    }
  }

  const uniqueAttributes =
    new Map<string, CartAttribute>();

  for (
    const attribute of attributes
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
    productId: productIdValue,
    variationId,
    quantity: quantityValue,
    attributes:
      normalizeCartAttributes(
        rawAttributes,
      ),
  };
}

function getCartItemKey(
  item: NormalizedCartItem,
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
      .sort((first, second) =>
        first.name.localeCompare(
          second.name,
        ),
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
  items: NormalizedCartItem[],
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

  const billingSource =
    getRecord(body.billing) ??
    getRecord(body.customer) ??
    body;

  const billing =
    normalizeAddress(
      billingSource,
    );

  const shippingSource =
    getRecord(body.shipping);

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

  if (!Array.isArray(rawItems)) {
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
      (item) => item === null,
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
        total + item.quantity,
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
        body,
        [
          "customerNote",
          "customer_note",
          "orderNotes",
          "order_notes",
          "notes",
        ],
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
    items,
    customerNote,
  };
}

/* =========================================================
   Product validation
========================================================= */

function validatePurchasableItem(
  item: PurchasableItemSnapshot,
  requestedQuantity: number,
): string | null {
  const productName =
    item.name?.trim() ||
    "This product";

  if (!item.purchasable) {
    return `${productName} is not currently purchasable.`;
  }

  const price =
    Number(item.price);

  if (
    item.price === "" ||
    !Number.isFinite(price) ||
    price < 0
  ) {
    return `${productName} does not have a valid price.`;
  }

  if (
    item.stock_status ===
    "outofstock"
  ) {
    return `${productName} is out of stock.`;
  }

  /*
   * onbackorder items may have zero physical
   * quantity but can still be ordered.
   */
  if (
    item.manage_stock &&
    item.stock_status !==
      "onbackorder" &&
    item.stock_quantity !== null &&
    requestedQuantity >
      item.stock_quantity
  ) {
    return `Only ${item.stock_quantity} unit(s) of ${productName} are currently available.`;
  }

  return null;
}

function findRequestedAttribute(
  attributes: CartAttribute[],
  name: string,
): CartAttribute | undefined {
  const normalizedName =
    normalizeAttributeName(name);

  return attributes.find(
    (attribute) =>
      normalizeAttributeName(
        attribute.name,
      ) === normalizedName,
  );
}

function validateVariationAttributes(
  variation: WooCommerceVariation,
  requestedAttributes:
    CartAttribute[],
) {
  for (
    const variationAttribute of
    variation.attributes
  ) {
    /*
     * Empty variation option means WooCommerce
     * accepts any value for this attribute.
     */
    if (
      !variationAttribute.option
        .trim()
    ) {
      continue;
    }

    const requestedAttribute =
      findRequestedAttribute(
        requestedAttributes,
        variationAttribute.name,
      );

    /*
     * The variation ID remains authoritative.
     * When the client also sends attributes,
     * they must agree with that variation.
     */
    if (
      requestedAttribute &&
      normalizeAttributeOption(
        requestedAttribute.option,
      ) !==
        normalizeAttributeOption(
          variationAttribute.option,
        )
    ) {
      throw new OrderRequestError(
        "The selected product options do not match the requested variation.",
        409,
        "variation_mismatch",
      );
    }
  }
}

function getWildcardVariationMetadata(
  variation: WooCommerceVariation,
  requestedAttributes:
    CartAttribute[],
): Array<{
  key: string;
  value: unknown;
}> {
  const metadata: Array<{
    key: string;
    value: unknown;
  }> = [];

  for (
    const variationAttribute of
    variation.attributes
  ) {
    /*
     * Non-empty attributes are already attached
     * to the WooCommerce variation itself.
     */
    if (
      variationAttribute.option
        .trim()
    ) {
      continue;
    }

    const requestedAttribute =
      findRequestedAttribute(
        requestedAttributes,
        variationAttribute.name,
      );

    if (
      !requestedAttribute
    ) {
      continue;
    }

    metadata.push({
      key:
        requestedAttribute.name,

      value:
        requestedAttribute.option,
    });
  }

  return metadata;
}

function validateProductAvailability(
  product: WooCommerceProduct,
) {
  if (
    product.status &&
    product.status !== "publish"
  ) {
    throw new OrderRequestError(
      `${product.name} is not currently available.`,
      409,
      "product_unavailable",
    );
  }

  if (
    ![
      "simple",
      "variable",
    ].includes(product.type)
  ) {
    throw new OrderRequestError(
      `${product.name} cannot be ordered through this checkout.`,
      409,
      "unsupported_product_type",
    );
  }
}

/* =========================================================
   Server-side cart validation
========================================================= */

async function buildValidatedOrderLines(
  cartItems: NormalizedCartItem[],
): Promise<ValidatedOrderLine[]> {
  const productCache =
    new Map<
      number,
      WooCommerceProduct | null
    >();

  const variationCache =
    new Map<
      number,
      WooCommerceVariation[]
    >();

  const orderLines:
    ValidatedOrderLine[] = [];

  for (
    const cartItem of cartItems
  ) {
    let product =
      productCache.get(
        cartItem.productId,
      );

    if (
      product === undefined
    ) {
      product =
        await getProductById(
          cartItem.productId,
        );

      productCache.set(
        cartItem.productId,
        product,
      );
    }

    if (!product) {
      throw new OrderRequestError(
        "One of the products in your cart no longer exists.",
        409,
        "product_not_found",
      );
    }

    validateProductAvailability(
      product,
    );

    if (
      product.type ===
      "variable"
    ) {
      if (
        !cartItem.variationId
      ) {
        throw new OrderRequestError(
          `Select the required options for ${product.name}.`,
          409,
          "variation_required",
        );
      }

      let variations =
        variationCache.get(
          product.id,
        );

      if (!variations) {
        variations =
          await getProductVariations(
            product.id,
          );

        variationCache.set(
          product.id,
          variations,
        );
      }

      const variation =
        variations.find(
          (item) =>
            item.id ===
            cartItem.variationId,
        );

      if (!variation) {
        throw new OrderRequestError(
          `The selected option for ${product.name} is no longer available.`,
          409,
          "variation_not_found",
        );
      }

      validateVariationAttributes(
        variation,
        cartItem.attributes,
      );

      const variationUsesOwnStock =
        variation.manage_stock ===
        true;

      const variationUsesParentStock =
        variation.manage_stock ===
        "parent";

      const effectiveManageStock =
        variationUsesOwnStock ||
        (variationUsesParentStock &&
          product.manage_stock ===
            true);

      const effectiveStockQuantity =
        variationUsesOwnStock
          ? variation.stock_quantity ??
            null
          : variationUsesParentStock
            ? product.stock_quantity ??
              null
            : null;

      const validationError =
        validatePurchasableItem(
          {
            name: product.name,

            price:
              variation.price,

            /*
             * Exact fix for the previous
             * TypeScript build error.
             */
            purchasable:
              variation.purchasable ??
              false,

            stock_status:
              variation.stock_status,

            manage_stock:
              effectiveManageStock,

            stock_quantity:
              effectiveStockQuantity,
          },

          cartItem.quantity,
        );

      if (validationError) {
        throw new OrderRequestError(
          validationError,
          409,
          "product_unavailable",
        );
      }

      const wildcardMetadata =
        getWildcardVariationMetadata(
          variation,
          cartItem.attributes,
        );

      orderLines.push({
        product_id:
          product.id,

        variation_id:
          variation.id,

        quantity:
          cartItem.quantity,

        ...(wildcardMetadata.length >
        0
          ? {
              meta_data:
                wildcardMetadata,
            }
          : {}),
      });

      continue;
    }

    if (
      cartItem.variationId
    ) {
      throw new OrderRequestError(
        `${product.name} does not support the selected variation.`,
        409,
        "invalid_variation",
      );
    }

    const validationError =
      validatePurchasableItem(
        {
          name: product.name,
          price: product.price,

          /*
           * These fallback values fix the
           * optional-property TypeScript error.
           */
          purchasable:
            product.purchasable ??
            false,

          stock_status:
            product.stock_status,

          manage_stock:
            product.manage_stock ??
            false,

          stock_quantity:
            product.stock_quantity ??
            null,
        },

        cartItem.quantity,
      );

    if (validationError) {
      throw new OrderRequestError(
        validationError,
        409,
        "product_unavailable",
      );
    }

    orderLines.push({
      product_id:
        product.id,

      quantity:
        cartItem.quantity,
    });
  }

  return orderLines;
}

/* =========================================================
   Shipping configuration
========================================================= */

function getShippingConfiguration(): {
  methodId: string;
  methodTitle: string;
  total: string;
} {
  const rawShippingFee =
    process.env
      .STORE_SHIPPING_FEE ??
    process.env
      .WOOCOMMERCE_SHIPPING_FEE ??
    "0";

  const parsedShippingFee =
    Number(rawShippingFee);

  const shippingFee =
    Number.isFinite(
      parsedShippingFee,
    ) &&
    parsedShippingFee >= 0
      ? parsedShippingFee
      : 0;

  const methodId =
    process.env
      .STORE_SHIPPING_METHOD_ID
      ?.trim() ||
    "flat_rate";

  const methodTitle =
    process.env
      .STORE_SHIPPING_METHOD_TITLE
      ?.trim() ||
    (shippingFee > 0
      ? "Standard delivery"
      : "Free delivery");

  return {
    methodId,
    methodTitle,
    total:
      formatMoney(shippingFee),
  };
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
     * Product names, prices, stock status and
     * purchasable values are loaded again from
     * WooCommerce. Client-side price values are
     * never trusted.
     */
    const validatedLines =
      await buildValidatedOrderLines(
        normalizedRequest.items,
      );

    if (
      validatedLines.length === 0
    ) {
      throw new OrderRequestError(
        "No valid products were found in the cart.",
        400,
        "empty_cart",
      );
    }

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

    const shipping =
      getShippingConfiguration();

    const orderInput:
      CreateOrderInput = {
      ...(customerId > 0
        ? {
            customer_id:
              customerId,
          }
        : {}),

      payment_method: "cod",

      payment_method_title:
        "Cash on delivery",

      set_paid: false,

      billing:
        normalizedRequest.billing,

      shipping:
        normalizedRequest.shipping,

      line_items:
        validatedLines,

      shipping_lines: [
        {
          method_id:
            shipping.methodId,

          method_title:
            shipping.methodTitle,

          total:
            shipping.total,
        },
      ],

      customer_note:
        normalizedRequest
          .customerNote,

      meta_data: [
        {
          key:
            "_headless_storefront_order",

          value: "yes",
        },

        {
          key:
            "_headless_order_source",

          value:
            "nextjs-storefront",
        },
      ],
    };

    const order =
      await createWooCommerceOrder(
        orderInput,
      );

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

        order: {
          id: order.id,
          number:
            order.number,
          status:
            order.status,
          total:
            order.total,
          currency:
            order.currency,
        },
      },

      {
        status: 201,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof
      OrderRequestError
    ) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
        },

        {
          status: error.status,

          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    console.error(
      "WooCommerce order creation failed:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "Your order could not be placed. Please review your cart and try again.",

        code:
          "order_creation_failed",
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