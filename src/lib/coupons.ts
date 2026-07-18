import "server-only";

import {
  getProductById,
  getProductVariations,
  getWooCommerceCredentials,
  wooCommerceRequest,
  type WooCommerceProduct,
  type WooCommerceVariation,
} from "@/lib/woocommerce";

export type CouponDiscountType =
  | "percent"
  | "fixed_cart"
  | "fixed_product";

export type CouponCartItemInput = {
  productId: number;
  variationId?: number;
  quantity: number;
};

export type ValidateCouponInput = {
  code: string;
  email?: string;
  customerId?: number;
  items: CouponCartItemInput[];
};

export type ValidatedCouponResult = {
  code: string;
  discountType: CouponDiscountType;
  amount: number;

  subtotal: number;
  eligibleSubtotal: number;
  discount: number;
  totalAfterDiscount: number;

  freeShipping: boolean;
  message: string;
};

type WooCommerceCoupon = {
  id: number;
  code: string;
  amount: string;

  discount_type:
    | CouponDiscountType
    | string;

  description?: string;

  date_expires?: string | null;
  date_expires_gmt?: string | null;

  usage_count: number;
  usage_limit?: number | null;
  usage_limit_per_user?: number | null;

  individual_use?: boolean;

  product_ids?: number[];
  excluded_product_ids?: number[];

  product_categories?: number[];
  excluded_product_categories?: number[];

  exclude_sale_items?: boolean;

  limit_usage_to_x_items?: number | null;

  free_shipping?: boolean;

  minimum_amount?: string;
  maximum_amount?: string;

  email_restrictions?: string[];

  used_by?: Array<
    string | number
  >;
};

type PricedCartLine = {
  productId: number;
  variationId?: number;

  quantity: number;
  unitPrice: number;
  subtotal: number;

  onSale: boolean;
  categoryIds: number[];
};

export class CouponValidationError
  extends Error {
  status: number;
  code: string;

  constructor(
    message: string,
    status = 400,
    code = "invalid_coupon",
  ) {
    super(message);

    this.name =
      "CouponValidationError";

    this.status = status;
    this.code = code;
  }
}

function isObject(
  value: unknown,
): value is Record<
  string,
  unknown
> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function createCouponEndpoint(): URL {
  const { storeUrl } =
    getWooCommerceCredentials();

  return new URL(
    `${storeUrl}/wp-json/wc/v3/coupons`,
  );
}

function normalizeCouponCode(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .slice(0, 100);
}

function normalizeEmail(
  value: string | undefined,
): string {
  return (
    value
      ?.trim()
      .toLowerCase() ?? ""
  );
}

function parseAmount(
  value: string | undefined,
): number {
  if (!value) {
    return 0;
  }

  const amount = Number(value);

  return Number.isFinite(amount)
    ? amount
    : 0;
}

function roundMoney(
  value: number,
): number {
  return (
    Math.round(
      (value +
        Number.EPSILON) *
        100,
    ) / 100
  );
}

function normalizeIdArray(
  value: number[] | undefined,
): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item) =>
      Number.isInteger(item) &&
      item > 0,
  );
}

function parseExpirationDate(
  coupon: WooCommerceCoupon,
): number | null {
  const gmtValue =
    coupon.date_expires_gmt?.trim();

  if (gmtValue) {
    const normalizedGmt =
      /(?:Z|[+-]\d{2}:\d{2})$/i.test(
        gmtValue,
      )
        ? gmtValue
        : `${gmtValue}Z`;

    const timestamp =
      new Date(
        normalizedGmt,
      ).getTime();

    return Number.isNaN(timestamp)
      ? null
      : timestamp;
  }

  const localValue =
    coupon.date_expires?.trim();

  if (!localValue) {
    return null;
  }

  const timestamp =
    new Date(localValue).getTime();

  return Number.isNaN(timestamp)
    ? null
    : timestamp;
}

function emailMatchesRestriction(
  email: string,
  restriction: string,
): boolean {
  const normalizedRestriction =
    restriction
      .trim()
      .toLowerCase();

  if (!normalizedRestriction) {
    return false;
  }

  if (
    normalizedRestriction.startsWith(
      "*@",
    )
  ) {
    return email.endsWith(
      normalizedRestriction.slice(1),
    );
  }

  return (
    email ===
    normalizedRestriction
  );
}

function getCouponErrorMessage(
  data: unknown,
): string {
  if (
    isObject(data) &&
    typeof data.message ===
      "string" &&
    data.message.trim()
  ) {
    return data.message;
  }

  return "The coupon could not be checked.";
}

export async function getCouponByCode(
  code: string,
): Promise<WooCommerceCoupon | null> {
  const normalizedCode =
    normalizeCouponCode(code);

  if (!normalizedCode) {
    return null;
  }

  const endpoint =
    createCouponEndpoint();

  endpoint.searchParams.set(
    "code",
    normalizedCode,
  );

  endpoint.searchParams.set(
    "per_page",
    "1",
  );

  const response =
    await wooCommerceRequest(
      endpoint,
    );

  const data: unknown =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    throw new CouponValidationError(
      getCouponErrorMessage(data),
      502,
      "coupon_lookup_failed",
    );
  }

  if (!Array.isArray(data)) {
    throw new CouponValidationError(
      "WooCommerce returned an invalid coupon response.",
      502,
      "invalid_coupon_response",
    );
  }

  const coupon = data[0];

  if (
    !coupon ||
    !isObject(coupon) ||
    typeof coupon.id !==
      "number" ||
    typeof coupon.code !==
      "string" ||
    typeof coupon.amount !==
      "string" ||
    typeof coupon.discount_type !==
      "string"
  ) {
    return null;
  }

  return coupon as WooCommerceCoupon;
}

function validateCouponGeneralRules(
  coupon: WooCommerceCoupon,
  input: ValidateCouponInput,
) {
  const expirationTime =
    parseExpirationDate(coupon);

  if (
    expirationTime !== null &&
    expirationTime <= Date.now()
  ) {
    throw new CouponValidationError(
      "This coupon has expired.",
      409,
      "coupon_expired",
    );
  }

  const usageLimit =
    coupon.usage_limit ?? 0;

  if (
    usageLimit > 0 &&
    coupon.usage_count >=
      usageLimit
  ) {
    throw new CouponValidationError(
      "This coupon has reached its usage limit.",
      409,
      "coupon_usage_limit_reached",
    );
  }

  const email =
    normalizeEmail(input.email);

  const emailRestrictions =
    (
      coupon.email_restrictions ??
      []
    )
      .map((item) =>
        item.trim(),
      )
      .filter(Boolean);

  if (
    emailRestrictions.length > 0
  ) {
    if (!email) {
      throw new CouponValidationError(
        "Enter your billing email before applying this coupon.",
        400,
        "coupon_email_required",
      );
    }

    const emailAllowed =
      emailRestrictions.some(
        (restriction) =>
          emailMatchesRestriction(
            email,
            restriction,
          ),
      );

    if (!emailAllowed) {
      throw new CouponValidationError(
        "This coupon is not available for your email address.",
        409,
        "coupon_email_restricted",
      );
    }
  }

  const usageLimitPerUser =
    coupon.usage_limit_per_user ??
    0;

  if (usageLimitPerUser > 0) {
    const identifiers =
      new Set<string>();

    if (email) {
      identifiers.add(email);
    }

    if (
      input.customerId &&
      input.customerId > 0
    ) {
      identifiers.add(
        String(
          input.customerId,
        ),
      );
    }

    if (identifiers.size === 0) {
      throw new CouponValidationError(
        "Enter your billing email before applying this coupon.",
        400,
        "coupon_identity_required",
      );
    }

    const usageCountForUser =
      (
        coupon.used_by ?? []
      ).filter((value) =>
        identifiers.has(
          String(value)
            .trim()
            .toLowerCase(),
        ),
      ).length;

    if (
      usageCountForUser >=
      usageLimitPerUser
    ) {
      throw new CouponValidationError(
        "You have already used this coupon the maximum allowed number of times.",
        409,
        "coupon_user_limit_reached",
      );
    }
  }
}

async function getVariation(
  product: WooCommerceProduct,
  variationId: number,
  variationCache: Map<
    number,
    WooCommerceVariation[]
  >,
): Promise<WooCommerceVariation> {
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
        item.id === variationId,
    );

  if (!variation) {
    throw new CouponValidationError(
      `A selected option for ${product.name} is no longer available.`,
      409,
      "variation_not_found",
    );
  }

  return variation;
}

async function loadPricedCartLines(
  items: CouponCartItemInput[],
): Promise<PricedCartLine[]> {
  if (items.length === 0) {
    throw new CouponValidationError(
      "Your cart is empty.",
      400,
      "empty_cart",
    );
  }

  if (items.length > 50) {
    throw new CouponValidationError(
      "The cart contains too many items.",
      400,
      "cart_too_large",
    );
  }

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

  const lines:
    PricedCartLine[] = [];

  for (const item of items) {
    if (
      !Number.isInteger(
        item.productId,
      ) ||
      item.productId < 1
    ) {
      throw new CouponValidationError(
        "The cart contains an invalid product.",
        400,
        "invalid_product",
      );
    }

    if (
      !Number.isInteger(
        item.quantity,
      ) ||
      item.quantity < 1 ||
      item.quantity > 99
    ) {
      throw new CouponValidationError(
        "The cart contains an invalid quantity.",
        400,
        "invalid_quantity",
      );
    }

    let product =
      productCache.get(
        item.productId,
      );

    if (product === undefined) {
      product =
        await getProductById(
          item.productId,
        );

      productCache.set(
        item.productId,
        product,
      );
    }

    if (!product) {
      throw new CouponValidationError(
        "A product in your cart could not be found.",
        409,
        "product_not_found",
      );
    }

    if (
      product.status &&
      product.status !==
        "publish"
    ) {
      throw new CouponValidationError(
        `${product.name} is no longer available.`,
        409,
        "product_unavailable",
      );
    }

    let variation:
      | WooCommerceVariation
      | undefined;

    if (
      product.type ===
      "variable"
    ) {
      if (
        !item.variationId ||
        !Number.isInteger(
          item.variationId,
        ) ||
        item.variationId < 1
      ) {
        throw new CouponValidationError(
          `Select the required options for ${product.name}.`,
          409,
          "variation_required",
        );
      }

      variation =
        await getVariation(
          product,
          item.variationId,
          variationCache,
        );
    } else if (
      item.variationId
    ) {
      throw new CouponValidationError(
        `${product.name} does not support the selected variation.`,
        409,
        "invalid_variation",
      );
    }

    const rawPrice =
      variation?.price ??
      product.price;

    const unitPrice =
      Number(rawPrice);

    if (
      rawPrice === "" ||
      !Number.isFinite(
        unitPrice,
      ) ||
      unitPrice < 0
    ) {
      throw new CouponValidationError(
        `${product.name} does not have a valid price.`,
        409,
        "invalid_product_price",
      );
    }

    const subtotal =
      roundMoney(
        unitPrice *
          item.quantity,
      );

    lines.push({
      productId:
        product.id,

      variationId:
        variation?.id,

      quantity:
        item.quantity,

      unitPrice,

      subtotal,

      onSale:
        variation?.on_sale ??
        product.on_sale ??
        false,

      categoryIds:
        (
          product.categories ??
          []
        ).map(
          (category) =>
            category.id,
        ),
    });
  }

  return lines;
}

function containsAnyId(
  first: number[],
  second: number[],
): boolean {
  const secondSet =
    new Set(second);

  return first.some((id) =>
    secondSet.has(id),
  );
}

function isLineEligible(
  line: PricedCartLine,
  coupon: WooCommerceCoupon,
): boolean {
  const includedProductIds =
    normalizeIdArray(
      coupon.product_ids,
    );

  const excludedProductIds =
    normalizeIdArray(
      coupon.excluded_product_ids,
    );

  const includedCategoryIds =
    normalizeIdArray(
      coupon.product_categories,
    );

  const excludedCategoryIds =
    normalizeIdArray(
      coupon.excluded_product_categories,
    );

  const lineProductIds = [
    line.productId,

    ...(line.variationId
      ? [line.variationId]
      : []),
  ];

  if (
    containsAnyId(
      lineProductIds,
      excludedProductIds,
    )
  ) {
    return false;
  }

  if (
    containsAnyId(
      line.categoryIds,
      excludedCategoryIds,
    )
  ) {
    return false;
  }

  if (
    coupon.exclude_sale_items &&
    line.onSale
  ) {
    return false;
  }

  const hasPositiveRestrictions =
    includedProductIds.length >
      0 ||
    includedCategoryIds.length >
      0;

  if (!hasPositiveRestrictions) {
    return true;
  }

  const productMatches =
    containsAnyId(
      lineProductIds,
      includedProductIds,
    );

  const categoryMatches =
    containsAnyId(
      line.categoryIds,
      includedCategoryIds,
    );

  return (
    productMatches ||
    categoryMatches
  );
}

function getLimitedSubtotal(
  lines: PricedCartLine[],
  itemLimit: number,
): number {
  let remainingItems =
    itemLimit > 0
      ? itemLimit
      : Number.POSITIVE_INFINITY;

  let subtotal = 0;

  for (const line of lines) {
    if (remainingItems <= 0) {
      break;
    }

    const applicableQuantity =
      Math.min(
        line.quantity,
        remainingItems,
      );

    subtotal +=
      line.unitPrice *
      applicableQuantity;

    remainingItems -=
      applicableQuantity;
  }

  return roundMoney(subtotal);
}

function calculateFixedProductDiscount(
  lines: PricedCartLine[],
  amount: number,
  itemLimit: number,
): number {
  let remainingItems =
    itemLimit > 0
      ? itemLimit
      : Number.POSITIVE_INFINITY;

  let discount = 0;

  for (const line of lines) {
    if (remainingItems <= 0) {
      break;
    }

    const applicableQuantity =
      Math.min(
        line.quantity,
        remainingItems,
      );

    const discountPerItem =
      Math.min(
        amount,
        line.unitPrice,
      );

    discount +=
      discountPerItem *
      applicableQuantity;

    remainingItems -=
      applicableQuantity;
  }

  return roundMoney(discount);
}

function calculateCouponDiscount({
  coupon,
  eligibleLines,
}: {
  coupon: WooCommerceCoupon;
  eligibleLines: PricedCartLine[];
}): {
  discount: number;
  eligibleSubtotal: number;
} {
  const amount =
    parseAmount(coupon.amount);

  const itemLimit =
    coupon.limit_usage_to_x_items ??
    0;

  const eligibleSubtotal =
    getLimitedSubtotal(
      eligibleLines,
      itemLimit,
    );

  let discount = 0;

  switch (
    coupon.discount_type
  ) {
    case "percent":
      discount =
        eligibleSubtotal *
        (amount / 100);
      break;

    case "fixed_cart":
      discount = Math.min(
        amount,
        eligibleSubtotal,
      );
      break;

    case "fixed_product":
      discount =
        calculateFixedProductDiscount(
          eligibleLines,
          amount,
          itemLimit,
        );
      break;

    default:
      throw new CouponValidationError(
        "This coupon uses an unsupported discount type.",
        409,
        "unsupported_coupon_type",
      );
  }

  return {
    discount: roundMoney(
      Math.min(
        discount,
        eligibleSubtotal,
      ),
    ),

    eligibleSubtotal:
      roundMoney(
        eligibleSubtotal,
      ),
  };
}

export async function validateCouponForCart(
  input: ValidateCouponInput,
): Promise<ValidatedCouponResult> {
  const code =
    normalizeCouponCode(
      input.code,
    );

  if (!code) {
    throw new CouponValidationError(
      "Enter a coupon code.",
      400,
      "coupon_code_required",
    );
  }

  const coupon =
    await getCouponByCode(code);

  if (!coupon) {
    throw new CouponValidationError(
      "The coupon code is invalid.",
      404,
      "coupon_not_found",
    );
  }

  validateCouponGeneralRules(
    coupon,
    input,
  );

  const lines =
    await loadPricedCartLines(
      input.items,
    );

  const subtotal =
    roundMoney(
      lines.reduce(
        (total, line) =>
          total +
          line.subtotal,
        0,
      ),
    );

  const minimumAmount =
    parseAmount(
      coupon.minimum_amount,
    );

  if (
    minimumAmount > 0 &&
    subtotal < minimumAmount
  ) {
    throw new CouponValidationError(
      `This coupon requires a minimum cart subtotal of ${minimumAmount.toFixed(
        2,
      )}.`,
      409,
      "coupon_minimum_not_met",
    );
  }

  const maximumAmount =
    parseAmount(
      coupon.maximum_amount,
    );

  if (
    maximumAmount > 0 &&
    subtotal > maximumAmount
  ) {
    throw new CouponValidationError(
      `This coupon can only be used when the cart subtotal is ${maximumAmount.toFixed(
        2,
      )} or less.`,
      409,
      "coupon_maximum_exceeded",
    );
  }

  const eligibleLines =
    lines.filter((line) =>
      isLineEligible(
        line,
        coupon,
      ),
    );

  if (
    eligibleLines.length === 0
  ) {
    throw new CouponValidationError(
      "This coupon does not apply to the products in your cart.",
      409,
      "coupon_not_applicable",
    );
  }

  const {
    discount,
    eligibleSubtotal,
  } = calculateCouponDiscount({
    coupon,
    eligibleLines,
  });

  const freeShipping =
    coupon.free_shipping ===
    true;

  if (
    discount <= 0 &&
    !freeShipping
  ) {
    throw new CouponValidationError(
      "This coupon does not provide a discount for the current cart.",
      409,
      "coupon_zero_discount",
    );
  }

  const totalAfterDiscount =
    roundMoney(
      Math.max(
        0,
        subtotal - discount,
      ),
    );

  let message =
    "Coupon applied successfully.";

  if (
    discount > 0 &&
    freeShipping
  ) {
    message =
      "Coupon applied. Your discount and free-shipping benefit are available.";
  } else if (freeShipping) {
    message =
      "Free-shipping coupon applied successfully.";
  }

  return {
    code:
      normalizeCouponCode(
        coupon.code,
      ),

    discountType:
      coupon.discount_type as CouponDiscountType,

    amount:
      parseAmount(
        coupon.amount,
      ),

    subtotal,
    eligibleSubtotal,
    discount,
    totalAfterDiscount,

    freeShipping,
    message,
  };
}