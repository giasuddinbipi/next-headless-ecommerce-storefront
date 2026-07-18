import "server-only";

import type {
  ValidatedCartItem,
} from "@/lib/cart-validation";

const MONEY_DECIMAL_PLACES = 2;
const MONEY_MULTIPLIER = 100;

const MAX_CHECKOUT_ITEMS = 50;
const MAX_ITEM_QUANTITY = 99;

/*
 * সর্বোচ্চ অনুমোদিত অর্থ:
 *
 * ৳1,000,000,000.00
 */
const MAX_MONEY_MINOR_UNITS =
  100_000_000_000;

export type CheckoutShippingArea =
  | "dhaka"
  | "outside";

export type CheckoutTotalsLine = {
  cartKey: string;

  productId: number;
  variationId?: number;

  name: string;

  quantity: number;

  unitPrice: string;
  lineSubtotal: string;
};

export type CheckoutTotalsResult = {
  currency: "BDT";

  shippingArea:
    CheckoutShippingArea;

  shippingLabel: string;

  lines:
    CheckoutTotalsLine[];

  subtotal: string;
  discount: string;
  shipping: string;
  total: string;

  freeShipping: boolean;

  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  totalMinor: number;
};

export type CalculateCheckoutTotalsInput = {
  /*
   * শুধুমাত্র server-validated
   * cart items এখানে দেওয়া হবে।
   */
  items:
    ValidatedCartItem[];

  shippingArea:
    CheckoutShippingArea;

  /*
   * Order route-এর trusted shipping
   * configuration থেকে আসবে।
   *
   * Browser-provided shipping amount
   * এখানে ব্যবহার করা যাবে না।
   */
  shippingAmount?:
    | string
    | number
    | null;

  shippingLabel?: string;

  /*
   * শুধুমাত্র server-side coupon
   * validator-এর calculated discount।
   */
  discountAmount?:
    | string
    | number
    | null;

  /*
   * Validated coupon free shipping
   * অনুমোদন করলে true হবে।
   */
  freeShipping?: boolean;
};

export class CheckoutTotalsError extends Error {
  status: number;
  code: string;

  constructor(
    message: string,
    status = 400,
    code =
      "checkout_totals_failed",
  ) {
    super(message);

    this.name =
      "CheckoutTotalsError";

    this.status = status;
    this.code = code;
  }
}

/* =========================================================
   Money normalization
========================================================= */

function normalizeMoneyInput(
  value:
    | string
    | number,
): string {
  if (
    typeof value === "number"
  ) {
    if (
      !Number.isFinite(value)
    ) {
      throw new CheckoutTotalsError(
        "A checkout amount is invalid.",
        400,
        "invalid_checkout_amount",
      );
    }

    return value.toString();
  }

  return value.trim();
}

/* =========================================================
   Money to minor units
========================================================= */

function moneyToMinorUnits(
  value:
    | string
    | number,
): number {
  const normalized =
    normalizeMoneyInput(
      value,
    );

  /*
   * Supported formats:
   *
   * 120
   * 120.5
   * 120.50
   * 120.505
   *
   * দুই decimal-এর বেশি থাকলে
   * third decimal ব্যবহার করে round হবে।
   */
  const match =
    normalized.match(
      /^(\d{1,12})(?:\.(\d{1,8}))?$/,
    );

  if (!match) {
    throw new CheckoutTotalsError(
      "A checkout amount has an invalid format.",
      400,
      "invalid_checkout_amount",
    );
  }

  const wholePart =
    Number(match[1]);

  const decimalPart =
    match[2] ?? "";

  if (
    !Number.isSafeInteger(
      wholePart,
    )
  ) {
    throw new CheckoutTotalsError(
      "A checkout amount is too large.",
      400,
      "checkout_amount_too_large",
    );
  }

  const paddedDecimal =
    decimalPart.padEnd(
      3,
      "0",
    );

  const firstTwoDecimals =
    Number(
      paddedDecimal.slice(
        0,
        MONEY_DECIMAL_PLACES,
      ),
    );

  const roundingDigit =
    Number(
      paddedDecimal.charAt(2) ||
        "0",
    );

  let minorUnits =
    wholePart *
      MONEY_MULTIPLIER +
    firstTwoDecimals;

  if (roundingDigit >= 5) {
    minorUnits += 1;
  }

  if (
    !Number.isSafeInteger(
      minorUnits,
    ) ||
    minorUnits < 0 ||
    minorUnits >
      MAX_MONEY_MINOR_UNITS
  ) {
    throw new CheckoutTotalsError(
      "A checkout amount is outside the allowed range.",
      400,
      "checkout_amount_out_of_range",
    );
  }

  return minorUnits;
}

/* =========================================================
   Minor units to formatted money
========================================================= */

function minorUnitsToMoney(
  minorUnits: number,
): string {
  if (
    !Number.isSafeInteger(
      minorUnits,
    ) ||
    minorUnits < 0 ||
    minorUnits >
      MAX_MONEY_MINOR_UNITS
  ) {
    throw new CheckoutTotalsError(
      "The calculated checkout total is invalid.",
      500,
      "invalid_calculated_total",
    );
  }

  return (
    minorUnits /
    MONEY_MULTIPLIER
  ).toFixed(
    MONEY_DECIMAL_PLACES,
  );
}

/* =========================================================
   Safe arithmetic
========================================================= */

function safeAddMoney(
  first: number,
  second: number,
): number {
  const total =
    first + second;

  if (
    !Number.isSafeInteger(
      total,
    ) ||
    total < 0 ||
    total >
      MAX_MONEY_MINOR_UNITS
  ) {
    throw new CheckoutTotalsError(
      "The calculated checkout total is too large.",
      400,
      "checkout_total_too_large",
    );
  }

  return total;
}

function safeMultiplyMoney(
  amount: number,
  quantity: number,
): number {
  const total =
    amount * quantity;

  if (
    !Number.isSafeInteger(
      total,
    ) ||
    total < 0 ||
    total >
      MAX_MONEY_MINOR_UNITS
  ) {
    throw new CheckoutTotalsError(
      "A checkout line total is too large.",
      400,
      "checkout_line_too_large",
    );
  }

  return total;
}

/* =========================================================
   Shipping
========================================================= */

function getShippingDetails({
  shippingArea,
  shippingAmount,
  shippingLabel,
}: {
  shippingArea:
    CheckoutShippingArea;

  shippingAmount:
    | string
    | number
    | null
    | undefined;

  shippingLabel:
    | string
    | undefined;
}): {
  label: string;
  amountMinor: number;
} {
  let defaultLabel: string;
  let defaultAmount: string;

  switch (shippingArea) {
    case "dhaka":
      defaultLabel =
        "Inside Dhaka";

      defaultAmount =
        "80.00";

      break;

    case "outside":
      defaultLabel =
        "Outside Dhaka";

      defaultAmount =
        "150.00";

      break;

    default:
      throw new CheckoutTotalsError(
        "A valid delivery area is required.",
        400,
        "invalid_shipping_area",
      );
  }

  const hasConfiguredAmount =
    shippingAmount !==
      undefined &&
    shippingAmount !== null &&
    shippingAmount !== "";

  const amountMinor =
    moneyToMinorUnits(
      hasConfiguredAmount
        ? shippingAmount
        : defaultAmount,
    );

  return {
    label:
      shippingLabel?.trim() ||
      defaultLabel,

    amountMinor,
  };
}

/* =========================================================
   Checkout item validation
========================================================= */

function validateCheckoutItem(
  item:
    ValidatedCartItem,
): void {
  if (
    !Number.isInteger(
      item.productId,
    ) ||
    item.productId < 1
  ) {
    throw new CheckoutTotalsError(
      "A checkout product ID is invalid.",
      400,
      "invalid_checkout_product",
    );
  }

  if (
    item.variationId !==
      undefined &&
    (
      !Number.isInteger(
        item.variationId,
      ) ||
      item.variationId < 1
    )
  ) {
    throw new CheckoutTotalsError(
      "A checkout variation ID is invalid.",
      400,
      "invalid_checkout_variation",
    );
  }

  if (
    !Number.isInteger(
      item.quantity,
    ) ||
    item.quantity < 1 ||
    item.quantity >
      MAX_ITEM_QUANTITY
  ) {
    throw new CheckoutTotalsError(
      "A checkout product quantity is invalid.",
      400,
      "invalid_checkout_quantity",
    );
  }

  if (
    typeof item.cartKey !==
      "string" ||
    !item.cartKey.trim()
  ) {
    throw new CheckoutTotalsError(
      "A checkout cart key is invalid.",
      400,
      "invalid_checkout_cart_key",
    );
  }

  if (
    typeof item.name !==
      "string" ||
    !item.name.trim()
  ) {
    throw new CheckoutTotalsError(
      "A checkout product name is invalid.",
      400,
      "invalid_checkout_product_name",
    );
  }

  if (
    typeof item.price !==
      "string"
  ) {
    throw new CheckoutTotalsError(
      "A checkout product price is invalid.",
      400,
      "invalid_checkout_product_price",
    );
  }

  /*
   * Invalid price হলে এই function
   * CheckoutTotalsError throw করবে।
   */
  moneyToMinorUnits(
    item.price,
  );
}

/* =========================================================
   Discount
========================================================= */

function resolveDiscountMinor({
  discountAmount,
  subtotalMinor,
}: {
  discountAmount:
    | string
    | number
    | null
    | undefined;

  subtotalMinor: number;
}): number {
  if (
    discountAmount ===
      undefined ||
    discountAmount === null ||
    discountAmount === ""
  ) {
    return 0;
  }

  const requestedDiscount =
    moneyToMinorUnits(
      discountAmount,
    );

  /*
   * Discount কখনো product subtotal-এর
   * চেয়ে বেশি হতে পারবে না।
   *
   * Shipping charge discount-এর কারণে
   * negative হবে না।
   */
  return Math.min(
    requestedDiscount,
    subtotalMinor,
  );
}

/* =========================================================
   Main checkout calculation
========================================================= */

export function calculateCheckoutTotals({
  items,
  shippingArea,
  shippingAmount,
  shippingLabel,
  discountAmount,
  freeShipping = false,
}: CalculateCheckoutTotalsInput): CheckoutTotalsResult {
  if (!Array.isArray(items)) {
    throw new CheckoutTotalsError(
      "Checkout products are required.",
      400,
      "missing_checkout_items",
    );
  }

  if (items.length === 0) {
    throw new CheckoutTotalsError(
      "The cart is empty.",
      400,
      "empty_checkout_cart",
    );
  }

  if (
    items.length >
    MAX_CHECKOUT_ITEMS
  ) {
    throw new CheckoutTotalsError(
      `The checkout cannot contain more than ${MAX_CHECKOUT_ITEMS} distinct products.`,
      400,
      "checkout_cart_too_large",
    );
  }

  const lines:
    CheckoutTotalsLine[] = [];

  let subtotalMinor = 0;

  for (const item of items) {
    validateCheckoutItem(
      item,
    );

    const unitPriceMinor =
      moneyToMinorUnits(
        item.price,
      );

    const lineSubtotalMinor =
      safeMultiplyMoney(
        unitPriceMinor,
        item.quantity,
      );

    subtotalMinor =
      safeAddMoney(
        subtotalMinor,
        lineSubtotalMinor,
      );

    lines.push({
      cartKey:
        item.cartKey,

      productId:
        item.productId,

      ...(item.variationId
        ? {
            variationId:
              item.variationId,
          }
        : {}),

      name:
        item.name.trim(),

      quantity:
        item.quantity,

      unitPrice:
        minorUnitsToMoney(
          unitPriceMinor,
        ),

      lineSubtotal:
        minorUnitsToMoney(
          lineSubtotalMinor,
        ),
    });
  }

  const shippingDetails =
    getShippingDetails({
      shippingArea,
      shippingAmount,
      shippingLabel,
    });

  /*
   * Validated free-shipping coupon থাকলে
   * shipping charge zero হবে।
   */
  const shippingMinor =
    freeShipping
      ? 0
      : shippingDetails.amountMinor;

  const discountMinor =
    resolveDiscountMinor({
      discountAmount,
      subtotalMinor,
    });

  const discountedSubtotalMinor =
    subtotalMinor -
    discountMinor;

  if (
    discountedSubtotalMinor < 0
  ) {
    throw new CheckoutTotalsError(
      "The calculated discounted subtotal is invalid.",
      500,
      "invalid_discounted_subtotal",
    );
  }

  const totalMinor =
    safeAddMoney(
      discountedSubtotalMinor,
      shippingMinor,
    );

  return {
    currency: "BDT",

    shippingArea,

    shippingLabel:
      shippingDetails.label,

    lines,

    subtotal:
      minorUnitsToMoney(
        subtotalMinor,
      ),

    discount:
      minorUnitsToMoney(
        discountMinor,
      ),

    shipping:
      minorUnitsToMoney(
        shippingMinor,
      ),

    total:
      minorUnitsToMoney(
        totalMinor,
      ),

    freeShipping,

    subtotalMinor,
    discountMinor,
    shippingMinor,
    totalMinor,
  };
}