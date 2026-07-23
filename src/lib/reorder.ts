import "server-only";

import {
  buildCartKey,
  type CartKeyAttribute,
} from "@/lib/cart-key";

import {
  getCustomerOrderById,
  getProductById,
  getProductVariations,
  type WooCommerceProduct,
  type WooCommerceVariation,
} from "@/lib/woocommerce";

const MAX_REORDER_QUANTITY = 99;
const MAX_ORDER_LINE_ITEMS = 100;

type StockStatus =
  | "instock"
  | "outofstock"
  | "onbackorder";

type UnknownRecord =
  Record<string, unknown>;

type ReorderOrderItemMetaData = {
  id?: number;
  key?: string;
  value?: unknown;
  display_key?: string;
  display_value?: unknown;
};

type ReorderOrderItem = {
  id: number;
  product_id: number;
  variation_id: number;
  name: string;
  quantity: number;

  meta_data?:
    ReorderOrderItemMetaData[];
};

export type ReorderCartItem = {
  cartKey: string;

  productId: number;
  variationId?: number;

  name: string;
  slug: string;
  price: string;
  image?: string;

  stockStatus: StockStatus;

  attributes:
    CartKeyAttribute[];

  quantity: number;
};

export type ReorderSkippedItem = {
  orderItemId: number;

  productId: number;
  variationId?: number;

  name: string;
  reason: string;
};

export type ReorderAdjustedItem = {
  productId: number;
  variationId?: number;

  name: string;

  requestedQuantity: number;
  addedQuantity: number;

  reason: string;
};

export type ReorderResult = {
  orderId: number;
  orderNumber: string;

  items:
    ReorderCartItem[];

  skippedItems:
    ReorderSkippedItem[];

  adjustedItems:
    ReorderAdjustedItem[];
};

type ReorderItemBuildResult = {
  item?: ReorderCartItem;
  skipped?: ReorderSkippedItem;
  adjusted?: ReorderAdjustedItem;
};

export class ReorderError extends Error {
  status: number;
  code: string;

  constructor(
    message: string,
    status = 400,
    code = "reorder_failed",
  ) {
    super(message);

    this.name = "ReorderError";
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


function toDisplayString(
  value: unknown,
): string {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return normalizeText(
      String(value),
    );
  }

  return "";
}

function hasValidPrice(
  value: string,
): boolean {
  if (!value.trim()) {
    return false;
  }

  const price = Number(value);

  return (
    Number.isFinite(price) &&
    price >= 0
  );
}

function formatPrice(
  value: string,
): string {
  return Number(value).toFixed(2);
}

function normalizeRequestedQuantity(
  quantity: number,
): number {
  if (
    !Number.isInteger(quantity) ||
    quantity < 1
  ) {
    return 1;
  }

  return Math.min(
    quantity,
    MAX_REORDER_QUANTITY,
  );
}

function getImageSource(
  value: unknown,
): string | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  if (
    typeof value.src !== "string"
  ) {
    return undefined;
  }

  const source =
    value.src.trim();

  return source || undefined;
}

function getProductImage(
  product: WooCommerceProduct,
  variation?: WooCommerceVariation,
): string | undefined {
  const variationImage =
    variation
      ? getImageSource(
          variation.image,
        )
      : undefined;

  if (variationImage) {
    return variationImage;
  }

  const productImages =
    Array.isArray(product.images)
      ? product.images
      : [];

  return getImageSource(
    productImages[0],
  );
}

/* =========================================================
   Order metadata helpers
========================================================= */

function getVisibleOrderAttributes(
  orderItem: ReorderOrderItem,
): CartKeyAttribute[] {
  const uniqueAttributes =
    new Map<
      string,
      CartKeyAttribute
    >();

  for (
    const metadata of
    orderItem.meta_data ?? []
  ) {
    const rawName =
      metadata.display_key ??
      metadata.key ??
      "";

    const name =
      normalizeText(rawName);

    if (
      !name ||
      name.startsWith("_")
    ) {
      continue;
    }

    const option =
      toDisplayString(
        metadata.display_value ??
          metadata.value,
      );

    if (!option) {
      continue;
    }

    const normalizedName =
      normalizeAttributeName(
        name,
      );

    if (!normalizedName) {
      continue;
    }

    uniqueAttributes.set(
      normalizedName,
      {
        name:
          name.slice(0, 150),

        option:
          option.slice(0, 250),
      },
    );
  }

  return Array.from(
    uniqueAttributes.values(),
  ).slice(0, 20);
}

function findOrderAttribute(
  attributes:
    CartKeyAttribute[],
  name: string,
): CartKeyAttribute | undefined {
  const normalizedName =
    normalizeAttributeName(name);

  return attributes.find(
    (attribute) =>
      normalizeAttributeName(
        attribute.name,
      ) === normalizedName,
  );
}

function resolveVariationAttributes({
  variation,
  orderItem,
}: {
  variation: WooCommerceVariation;
  orderItem: ReorderOrderItem;
}):
  | {
      success: true;
      attributes:
        CartKeyAttribute[];
    }
  | {
      success: false;
      reason: string;
    } {
  const orderAttributes =
    getVisibleOrderAttributes(
      orderItem,
    );

  const attributes:
    CartKeyAttribute[] = [];

  for (
    const variationAttribute of
    variation.attributes ?? []
  ) {
    const name =
      normalizeText(
        variationAttribute.name,
      );

    if (!name) {
      continue;
    }

    const currentOption =
      normalizeText(
        variationAttribute.option,
      );

    /*
     * Fixed variation attribute:
     * WooCommerce-এর বর্তমান option ব্যবহার হবে।
     */
    if (currentOption) {
      attributes.push({
        name,
        option:
          currentOption,
      });

      continue;
    }

    /*
     * Any-option variation:
     * পুরোনো order metadata থেকে customer-এর
     * selected option নিতে হবে।
     */
    const previousAttribute =
      findOrderAttribute(
        orderAttributes,
        name,
      );

    if (
      !previousAttribute ||
      !previousAttribute.option.trim()
    ) {
      return {
        success: false,

        reason:
          `The previous value for "${name}" is no longer available.`,
      };
    }

    attributes.push({
      name,

      option:
        previousAttribute
          .option,
    });
  }

  return {
    success: true,
    attributes,
  };
}

/* =========================================================
   Stock helpers
========================================================= */

function resolveAvailableQuantity({
  requestedQuantity,
  stockStatus,
  manageStock,
  stockQuantity,
}: {
  requestedQuantity: number;
  stockStatus: StockStatus;
  manageStock: boolean;
  stockQuantity: number | null;
}): number {
  if (
    stockStatus ===
    "outofstock"
  ) {
    return 0;
  }

  const safeRequestedQuantity =
    normalizeRequestedQuantity(
      requestedQuantity,
    );

  /*
   * Backorders enabled থাকলে previous quantity
   * reorder করা যাবে।
   */
  if (
    stockStatus ===
    "onbackorder"
  ) {
    return safeRequestedQuantity;
  }

  /*
   * Stock quantity explicitly managed না হলে
   * requested quantity ব্যবহার হবে।
   */
  if (
    !manageStock ||
    stockQuantity === null
  ) {
    return safeRequestedQuantity;
  }

  if (
    !Number.isFinite(
      stockQuantity,
    ) ||
    stockQuantity < 1
  ) {
    return 0;
  }

  return Math.min(
    safeRequestedQuantity,
    Math.floor(stockQuantity),
  );
}

/* =========================================================
   Validation helpers
========================================================= */

function validateBaseProduct(
  product: WooCommerceProduct,
): string | null {
  if (
    product.status &&
    product.status !== "publish"
  ) {
    return "This product is no longer published.";
  }

  if (
    product.type !== "simple" &&
    product.type !== "variable"
  ) {
    return "This product type cannot be reordered.";
  }

  if (
    !normalizeText(
      product.name,
    )
  ) {
    return "This product does not have a valid name.";
  }

  if (
    !normalizeText(
      product.slug,
    )
  ) {
    return "This product does not have a valid product page.";
  }

  return null;
}

function createSkippedItem({
  orderItem,
  reason,
}: {
  orderItem: ReorderOrderItem;
  reason: string;
}): ReorderSkippedItem {
  return {
    orderItemId:
      orderItem.id,

    productId:
      orderItem.product_id,

    ...(orderItem.variation_id >
    0
      ? {
          variationId:
            orderItem
              .variation_id,
        }
      : {}),

    name:
      normalizeText(
        orderItem.name,
      ) ||
      "Unavailable product",

    reason,
  };
}

/* =========================================================
   Simple product reorder
========================================================= */

function buildSimpleReorderItem({
  product,
  orderItem,
}: {
  product: WooCommerceProduct;
  orderItem: ReorderOrderItem;
}): ReorderItemBuildResult {
  if (
    orderItem.variation_id > 0
  ) {
    return {
      skipped:
        createSkippedItem({
          orderItem,

          reason:
            "The previous variation is no longer valid for this product.",
        }),
    };
  }

  if (
    product.purchasable ===
    false
  ) {
    return {
      skipped:
        createSkippedItem({
          orderItem,

          reason:
            "This product is not currently purchasable.",
        }),
    };
  }

  if (
    !hasValidPrice(
      product.price,
    )
  ) {
    return {
      skipped:
        createSkippedItem({
          orderItem,

          reason:
            "This product does not currently have a valid price.",
        }),
    };
  }

  const requestedQuantity =
    normalizeRequestedQuantity(
      orderItem.quantity,
    );

  const quantity =
    resolveAvailableQuantity({
      requestedQuantity,

      stockStatus:
        product.stock_status,

      manageStock:
        product.manage_stock ===
        true,

      stockQuantity:
        product.stock_quantity ??
        null,
    });

  if (quantity < 1) {
    return {
      skipped:
        createSkippedItem({
          orderItem,

          reason:
            "This product is currently out of stock.",
        }),
    };
  }

  const image =
    getProductImage(product);

  const item:
    ReorderCartItem = {
    cartKey:
      buildCartKey({
        productId:
          product.id,

        attributes: [],
      }),

    productId:
      product.id,

    name:
      normalizeText(
        product.name,
      ),

    slug:
      product.slug.trim(),

    price:
      formatPrice(
        product.price,
      ),

    ...(image
      ? { image }
      : {}),

    stockStatus:
      product.stock_status,

    attributes: [],

    quantity,
  };

  if (
    quantity <
    requestedQuantity
  ) {
    return {
      item,

      adjusted: {
        productId:
          product.id,

        name:
          product.name,

        requestedQuantity,

        addedQuantity:
          quantity,

        reason:
          "The quantity was reduced to match the currently available stock.",
      },
    };
  }

  return { item };
}

/* =========================================================
   Variable product reorder
========================================================= */

function buildVariableReorderItem({
  product,
  variation,
  orderItem,
}: {
  product: WooCommerceProduct;
  variation: WooCommerceVariation;
  orderItem: ReorderOrderItem;
}): ReorderItemBuildResult {
  if (
    variation.purchasable ===
    false
  ) {
    return {
      skipped:
        createSkippedItem({
          orderItem,

          reason:
            "The selected variation is not currently purchasable.",
        }),
    };
  }

  if (
    !hasValidPrice(
      variation.price,
    )
  ) {
    return {
      skipped:
        createSkippedItem({
          orderItem,

          reason:
            "The selected variation does not currently have a valid price.",
        }),
    };
  }

  const resolvedAttributes =
    resolveVariationAttributes({
      variation,
      orderItem,
    });

  if (
    !resolvedAttributes.success
  ) {
    return {
      skipped:
        createSkippedItem({
          orderItem,

          reason:
            resolvedAttributes.reason,
        }),
    };
  }

  const variationUsesOwnStock =
    variation.manage_stock ===
    true;

  const variationUsesParentStock =
    variation.manage_stock ===
    "parent";

  const effectiveManageStock =
    variationUsesOwnStock ||
    (
      variationUsesParentStock &&
      product.manage_stock ===
        true
    );

  const effectiveStockQuantity =
    variationUsesOwnStock
      ? variation.stock_quantity ??
        null
      : variationUsesParentStock
        ? product.stock_quantity ??
          null
        : null;

  const requestedQuantity =
    normalizeRequestedQuantity(
      orderItem.quantity,
    );

  const quantity =
    resolveAvailableQuantity({
      requestedQuantity,

      stockStatus:
        variation.stock_status,

      manageStock:
        effectiveManageStock,

      stockQuantity:
        effectiveStockQuantity,
    });

  if (quantity < 1) {
    return {
      skipped:
        createSkippedItem({
          orderItem,

          reason:
            "The selected variation is currently out of stock.",
        }),
    };
  }

  const image =
    getProductImage(
      product,
      variation,
    );

  const item:
    ReorderCartItem = {
    cartKey:
      buildCartKey({
        productId:
          product.id,

        variationId:
          variation.id,

        attributes:
          resolvedAttributes
            .attributes,
      }),

    productId:
      product.id,

    variationId:
      variation.id,

    name:
      normalizeText(
        product.name,
      ),

    slug:
      product.slug.trim(),

    price:
      formatPrice(
        variation.price,
      ),

    ...(image
      ? { image }
      : {}),

    stockStatus:
      variation.stock_status,

    attributes:
      resolvedAttributes
        .attributes,

    quantity,
  };

  if (
    quantity <
    requestedQuantity
  ) {
    return {
      item,

      adjusted: {
        productId:
          product.id,

        variationId:
          variation.id,

        name:
          product.name,

        requestedQuantity,

        addedQuantity:
          quantity,

        reason:
          "The quantity was reduced to match the currently available stock.",
      },
    };
  }

  return { item };
}

/* =========================================================
   Main reorder builder
========================================================= */

export async function buildCustomerReorder({
  orderId,
  customerId,
}: {
  orderId: number;
  customerId: number;
}): Promise<ReorderResult> {
  if (
    !Number.isInteger(orderId) ||
    orderId < 1
  ) {
    throw new ReorderError(
      "A valid order ID is required.",
      400,
      "invalid_order_id",
    );
  }

  if (
    !Number.isInteger(customerId) ||
    customerId < 1
  ) {
    throw new ReorderError(
      "You must sign in before reordering.",
      401,
      "authentication_required",
    );
  }

  /*
   * getCustomerOrderById customer ownership
   * যাচাই করে। অন্য customer-এর order হলে
   * null return করবে।
   */
  const order =
    await getCustomerOrderById(
      orderId,
      customerId,
    );

  if (!order) {
    throw new ReorderError(
      "The order could not be found.",
      404,
      "order_not_found",
    );
  }

  const originalOrderItems =
    Array.isArray(
      order.line_items,
    )
      ? order.line_items
      : [];

  if (
    originalOrderItems.length === 0
  ) {
    throw new ReorderError(
      "This order does not contain any products that can be reordered.",
      409,
      "order_has_no_items",
    );
  }

  const orderItems =
    originalOrderItems.slice(
      0,
      MAX_ORDER_LINE_ITEMS,
    ) as ReorderOrderItem[];

  const items:
    ReorderCartItem[] = [];

  const skippedItems:
    ReorderSkippedItem[] = [];

  const adjustedItems:
    ReorderAdjustedItem[] = [];

  /*
   * একই product একাধিক order line-এ থাকলে
   * WooCommerce request বারবার করা হবে না।
   */
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

  for (
    const orderItem of
    orderItems
  ) {
    if (
      !Number.isInteger(
        orderItem.product_id,
      ) ||
      orderItem.product_id < 1
    ) {
      skippedItems.push(
        createSkippedItem({
          orderItem,

          reason:
            "The original product reference is invalid.",
        }),
      );

      continue;
    }

    let product =
      productCache.get(
        orderItem.product_id,
      );

    if (
      product === undefined
    ) {
      try {
        product =
          await getProductById(
            orderItem.product_id,
          );
      } catch (error) {
        console.error(
          "Reorder product lookup failed:",
          {
            productId:
              orderItem.product_id,

            error:
              error instanceof Error
                ? error.message
                : error,
          },
        );

        product = null;
      }

      productCache.set(
        orderItem.product_id,
        product,
      );
    }

    if (!product) {
      skippedItems.push(
        createSkippedItem({
          orderItem,

          reason:
            "This product no longer exists.",
        }),
      );

      continue;
    }

    const productValidationError =
      validateBaseProduct(
        product,
      );

    if (
      productValidationError
    ) {
      skippedItems.push(
        createSkippedItem({
          orderItem,

          reason:
            productValidationError,
        }),
      );

      continue;
    }

    try {
      let result:
        ReorderItemBuildResult;

      if (
        product.type ===
        "variable"
      ) {
        if (
          !Number.isInteger(
            orderItem.variation_id,
          ) ||
          orderItem.variation_id <
            1
        ) {
          skippedItems.push(
            createSkippedItem({
              orderItem,

              reason:
                "The previous product variation is missing.",
            }),
          );

          continue;
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
            (candidate) =>
              candidate.id ===
              orderItem
                .variation_id,
          );

        if (!variation) {
          skippedItems.push(
            createSkippedItem({
              orderItem,

              reason:
                "The previously selected variation is no longer available.",
            }),
          );

          continue;
        }

        result =
          buildVariableReorderItem({
            product,
            variation,
            orderItem,
          });
      } else {
        result =
          buildSimpleReorderItem({
            product,
            orderItem,
          });
      }

      if (result.item) {
        items.push(
          result.item,
        );
      }

      if (result.skipped) {
        skippedItems.push(
          result.skipped,
        );
      }

      if (result.adjusted) {
        adjustedItems.push(
          result.adjusted,
        );
      }
    } catch (error) {
      console.error(
        "Reorder item validation failed:",
        {
          productId:
            orderItem.product_id,

          variationId:
            orderItem.variation_id,

          error:
            error instanceof Error
              ? error.message
              : error,
        },
      );

      skippedItems.push(
        createSkippedItem({
          orderItem,

          reason:
            "This item could not be validated against the current catalogue.",
        }),
      );
    }
  }

  if (items.length === 0) {
    throw new ReorderError(
      "None of the products from this order are currently available for reorder.",
      409,
      "no_reorderable_items",
    );
  }

  return {
    orderId:
      order.id,

    orderNumber:
      order.number,

    items,
    skippedItems,
    adjustedItems,
  };
}