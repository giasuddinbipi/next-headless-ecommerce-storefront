import "server-only";

import {
  buildCartKey,
  type CartKeyAttribute,
} from "@/lib/cart-key";

import {
  CartValidationError,
  validateCartItems,
  type CartValidationInputItem,
  type CartValidationRemovedItem,
  type ValidatedCartItem,
} from "@/lib/cart-validation";

import {
  calculateCheckoutTotals,
  CheckoutTotalsError,
  type CheckoutShippingArea,
  type CheckoutTotalsResult,
} from "@/lib/checkout-totals";

const MAX_CHECKOUT_ITEMS = 50;
const MAX_ITEM_QUANTITY = 99;
const MAX_ATTRIBUTES_PER_ITEM = 20;

export type SecureCheckoutInputItem = {
  productId: number;
  variationId?: number;

  quantity: number;

  attributes:
    CartKeyAttribute[];
};

export type SecureCheckoutInput = {
  items:
    SecureCheckoutInputItem[];

  shippingArea:
    CheckoutShippingArea;

  /*
   * Trusted server configuration থেকে
   * shipping amount পাঠানো হবে।
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
   * শুধু server-side coupon validator
   * থেকে পাওয়া discount এখানে দেওয়া যাবে।
   */
  discountAmount?:
    | string
    | number
    | null;

  /*
   * শুধু server-side coupon validator
   * free shipping অনুমোদন করলে true হবে।
   */
  freeShipping?: boolean;
};

export type SecureCheckoutResult = {
  items:
    ValidatedCartItem[];

  totals:
    CheckoutTotalsResult;
};

export type SecureCheckoutQuantityChange = {
  cartKey: string;

  productId: number;
  variationId?: number;

  name: string;

  previousQuantity: number;
  currentQuantity: number;

  message: string;
};

export type SecureCheckoutConflictDetails = {
  removedItems:
    CartValidationRemovedItem[];

  quantityChanges:
    SecureCheckoutQuantityChange[];
};

export class SecureCheckoutError extends Error {
  status: number;
  code: string;

  details?:
    SecureCheckoutConflictDetails;

  constructor(
    message: string,
    status = 400,
    code =
      "secure_checkout_failed",
    details?:
      SecureCheckoutConflictDetails,
  ) {
    super(message);

    this.name =
      "SecureCheckoutError";

    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/* =========================================================
   Text normalization
========================================================= */

function normalizeText(
  value: string,
): string {
  return value
    .replace(/\s+/g, " ")
    .trim();
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

/* =========================================================
   Attribute normalization
========================================================= */

function normalizeAttributes(
  attributes:
    CartKeyAttribute[],
): CartKeyAttribute[] {
  if (
    !Array.isArray(attributes)
  ) {
    throw new SecureCheckoutError(
      "Product options are invalid.",
      400,
      "invalid_checkout_attributes",
    );
  }

  if (
    attributes.length >
    MAX_ATTRIBUTES_PER_ITEM
  ) {
    throw new SecureCheckoutError(
      "A checkout product contains too many options.",
      400,
      "too_many_checkout_attributes",
    );
  }

  const normalizedAttributes =
    new Map<
      string,
      CartKeyAttribute
    >();

  for (
    const attribute of
    attributes
  ) {
    if (
      typeof attribute !==
        "object" ||
      attribute === null ||
      typeof attribute.name !==
        "string" ||
      typeof attribute.option !==
        "string"
    ) {
      throw new SecureCheckoutError(
        "A checkout product option is invalid.",
        400,
        "invalid_checkout_attribute",
      );
    }

    const name =
      normalizeText(
        attribute.name,
      );

    const option =
      normalizeText(
        attribute.option,
      );

    if (!name || !option) {
      throw new SecureCheckoutError(
        "A checkout product option is incomplete.",
        400,
        "incomplete_checkout_attribute",
      );
    }

    const identity =
      normalizeAttributeName(
        name,
      );

    if (!identity) {
      throw new SecureCheckoutError(
        "A checkout product option name is invalid.",
        400,
        "invalid_checkout_attribute_name",
      );
    }

    /*
     * একই attribute একাধিকবার এলে
     * শেষ valid value রাখা হবে।
     */
    normalizedAttributes.set(
      identity,
      {
        name:
          name.slice(0, 150),

        option:
          option.slice(0, 250),
      },
    );
  }

  return Array.from(
    normalizedAttributes.values(),
  );
}

/* =========================================================
   Checkout item validation
========================================================= */

function normalizeCheckoutItem(
  item:
    SecureCheckoutInputItem,
): SecureCheckoutInputItem {
  if (
    typeof item !==
      "object" ||
    item === null
  ) {
    throw new SecureCheckoutError(
      "A checkout product is invalid.",
      400,
      "invalid_checkout_item",
    );
  }

  if (
    typeof item.productId !==
      "number" ||
    !Number.isInteger(
      item.productId,
    ) ||
    item.productId < 1
  ) {
    throw new SecureCheckoutError(
      "A checkout product ID is invalid.",
      400,
      "invalid_checkout_product",
    );
  }

  let variationId:
    number | undefined;

  if (
    item.variationId !==
      undefined &&
    item.variationId !== null
  ) {
    if (
      typeof item.variationId !==
        "number" ||
      !Number.isInteger(
        item.variationId,
      ) ||
      item.variationId < 1
    ) {
      throw new SecureCheckoutError(
        "A checkout variation ID is invalid.",
        400,
        "invalid_checkout_variation",
      );
    }

    variationId =
      item.variationId;
  }

  if (
    typeof item.quantity !==
      "number" ||
    !Number.isInteger(
      item.quantity,
    ) ||
    item.quantity < 1 ||
    item.quantity >
      MAX_ITEM_QUANTITY
  ) {
    throw new SecureCheckoutError(
      "A checkout quantity is invalid.",
      400,
      "invalid_checkout_quantity",
    );
  }

  const attributes =
    normalizeAttributes(
      item.attributes ?? [],
    );

  return {
    productId:
      item.productId,

    ...(variationId
      ? {
          variationId,
        }
      : {}),

    quantity:
      item.quantity,

    attributes,
  };
}

function normalizeCheckoutItems(
  items:
    SecureCheckoutInputItem[],
): SecureCheckoutInputItem[] {
  if (!Array.isArray(items)) {
    throw new SecureCheckoutError(
      "Checkout products are required.",
      400,
      "missing_checkout_items",
    );
  }

  if (items.length === 0) {
    throw new SecureCheckoutError(
      "The checkout cart is empty.",
      400,
      "empty_checkout_cart",
    );
  }

  if (
    items.length >
    MAX_CHECKOUT_ITEMS
  ) {
    throw new SecureCheckoutError(
      `The checkout cannot contain more than ${MAX_CHECKOUT_ITEMS} distinct products.`,
      400,
      "checkout_cart_too_large",
    );
  }

  return items.map(
    normalizeCheckoutItem,
  );
}

/* =========================================================
   Cart validation input
========================================================= */

function createValidationInput(
  item:
    SecureCheckoutInputItem,
): CartValidationInputItem {
  const cartKey =
    buildCartKey({
      productId:
        item.productId,

      variationId:
        item.variationId,

      attributes:
        item.attributes,
    });

  /*
   * নিচের catalogue fields placeholder।
   *
   * এগুলো browser-provided price বা
   * product information নয়।
   *
   * validateCartItems() WooCommerce থেকে
   * current trusted data দিয়ে এগুলো replace করবে।
   */
  return {
    cartKey,

    productId:
      item.productId,

    ...(item.variationId
      ? {
          variationId:
            item.variationId,
        }
      : {}),

    name:
      "Checkout product",

    slug:
      "checkout-product",

    price:
      "0.00",

    stockStatus:
      "instock",

    attributes:
      item.attributes,

    quantity:
      item.quantity,
  };
}

/* =========================================================
   Checkout conflict detection
========================================================= */

function getConflictDetails(
  validationResult:
    Awaited<
      ReturnType<
        typeof validateCartItems
      >
    >,
): SecureCheckoutConflictDetails {
  const quantityChanges:
    SecureCheckoutQuantityChange[] =
      validationResult.changes
        .filter(
          (change) =>
            change.type ===
              "quantity_adjusted" &&
            typeof change.previousQuantity ===
              "number" &&
            typeof change.currentQuantity ===
              "number",
        )
        .map((change) => ({
          cartKey:
            change.cartKey,

          productId:
            change.productId,

          ...(change.variationId
            ? {
                variationId:
                  change.variationId,
              }
            : {}),

          name:
            change.name,

          previousQuantity:
            change.previousQuantity as number,

          currentQuantity:
            change.currentQuantity as number,

          message:
            change.message,
        }));

  return {
    removedItems:
      validationResult.removedItems,

    quantityChanges,
  };
}

function hasCheckoutConflict(
  details:
    SecureCheckoutConflictDetails,
): boolean {
  return (
    details.removedItems.length >
      0 ||
    details.quantityChanges.length >
      0
  );
}

/* =========================================================
   Main secure checkout pipeline
========================================================= */

export async function prepareSecureCheckout({
  items,
  shippingArea,
  shippingAmount,
  shippingLabel,
  discountAmount,
  freeShipping = false,
}: SecureCheckoutInput): Promise<SecureCheckoutResult> {
  const normalizedItems =
    normalizeCheckoutItems(
      items,
    );

  const validationInputs =
    normalizedItems.map(
      createValidationInput,
    );

  let validationResult:
    Awaited<
      ReturnType<
        typeof validateCartItems
      >
    >;

  try {
    validationResult =
      await validateCartItems(
        validationInputs,
      );
  } catch (error) {
    if (
      error instanceof
      CartValidationError
    ) {
      throw new SecureCheckoutError(
        error.message,
        error.status,
        error.code,
      );
    }

    throw error;
  }

  const conflictDetails =
    getConflictDetails(
      validationResult,
    );

  /*
   * Checkout submit-এর সময় unavailable item
   * silently remove করা হবে না।
   *
   * একইভাবে stock কমে গেলে quantity silently
   * কমিয়ে order তৈরি করা হবে না।
   *
   * Customer-কে cart page-এ ফেরত পাঠানো হবে।
   */
  if (
    hasCheckoutConflict(
      conflictDetails,
    )
  ) {
    throw new SecureCheckoutError(
      "Your cart changed before the order could be placed. Return to the cart and review the updated products.",
      409,
      "checkout_cart_changed",
      conflictDetails,
    );
  }

  if (
    validationResult.items.length ===
    0
  ) {
    throw new SecureCheckoutError(
      "No purchasable products remain in the cart.",
      409,
      "checkout_cart_empty",
    );
  }

  let totals:
    CheckoutTotalsResult;

  try {
    totals =
      calculateCheckoutTotals({
        /*
         * WooCommerce থেকে পাওয়া current
         * validated product information।
         */
        items:
          validationResult.items,

        shippingArea,

        /*
         * Server environment/configuration
         * থেকে পাওয়া shipping information।
         */
        shippingAmount,

        shippingLabel,

        /*
         * Server-side coupon validation
         * result ছাড়া discount দেওয়া যাবে না।
         */
        discountAmount,

        freeShipping,
      });
  } catch (error) {
    if (
      error instanceof
      CheckoutTotalsError
    ) {
      throw new SecureCheckoutError(
        error.message,
        error.status,
        error.code,
      );
    }

    throw error;
  }

  return {
    items:
      validationResult.items,

    totals,
  };
}