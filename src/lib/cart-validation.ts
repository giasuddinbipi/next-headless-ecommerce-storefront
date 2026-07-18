import "server-only";

import {
  buildCartKey,
  type CartKeyAttribute,
} from "@/lib/cart-key";

import {
  getProductById,
  getProductVariations,
  type WooCommerceProduct,
  type WooCommerceStockStatus,
  type WooCommerceVariation,
} from "@/lib/woocommerce";

const MAX_CART_ITEMS = 50;
const MAX_CART_QUANTITY = 99;

export type CartValidationInputItem = {
  cartKey: string;

  productId: number;
  variationId?: number;

  name: string;
  slug: string;
  price: string;
  image?: string;

  stockStatus:
    WooCommerceStockStatus;

  attributes:
    CartKeyAttribute[];

  quantity: number;
};

export type ValidatedCartItem = {
  cartKey: string;

  productId: number;
  variationId?: number;

  name: string;
  slug: string;
  price: string;
  image?: string;

  stockStatus:
    WooCommerceStockStatus;

  attributes:
    CartKeyAttribute[];

  quantity: number;
};

export type CartValidationRemovedItem = {
  cartKey: string;

  productId: number;
  variationId?: number;

  name: string;

  code: string;
  reason: string;
};

export type CartValidationChange = {
  type:
    | "price_changed"
    | "quantity_adjusted"
    | "details_updated";

  cartKey: string;

  productId: number;
  variationId?: number;

  name: string;
  message: string;

  previousPrice?: string;
  currentPrice?: string;

  previousQuantity?: number;
  currentQuantity?: number;
};

export type CartValidationResult = {
  items: ValidatedCartItem[];

  removedItems:
    CartValidationRemovedItem[];

  changes:
    CartValidationChange[];

  originalItemCount: number;
  validatedItemCount: number;
  removedItemCount: number;
  changedItemCount: number;
};

type ValidationSuccess = {
  item: ValidatedCartItem;
  changes: CartValidationChange[];
};

type ValidationFailure = {
  removed:
    CartValidationRemovedItem;
};

type ItemValidationResult =
  | ValidationSuccess
  | ValidationFailure;

type ResolvedVariationAttributes =
  | {
      success: true;
      attributes:
        CartKeyAttribute[];
    }
  | {
      success: false;
      reason: string;
    };

export class CartValidationError extends Error {
  status: number;
  code: string;

  constructor(
    message: string,
    status = 400,
    code = "cart_validation_failed",
  ) {
    super(message);

    this.name =
      "CartValidationError";

    this.status = status;
    this.code = code;
  }
}

/* =========================================================
   Text and number helpers
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

function normalizeAttributeOption(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeAttributes(
  attributes:
    CartKeyAttribute[],
): CartKeyAttribute[] {
  const uniqueAttributes =
    new Map<
      string,
      CartKeyAttribute
    >();

  for (
    const attribute of attributes
  ) {
    const name =
      normalizeText(
        attribute.name,
      );

    const option =
      normalizeText(
        attribute.option,
      );

    if (!name || !option) {
      continue;
    }

    const identity =
      normalizeAttributeName(
        name,
      );

    if (!identity) {
      continue;
    }

    uniqueAttributes.set(
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
    uniqueAttributes.values(),
  ).slice(0, 20);
}

function getAttributeSignature(
  attributes:
    CartKeyAttribute[],
): string {
  return normalizeAttributes(
    attributes,
  )
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
    .sort((first, second) => {
      const nameResult =
        first.name.localeCompare(
          second.name,
        );

      if (nameResult !== 0) {
        return nameResult;
      }

      return first.option.localeCompare(
        second.option,
      );
    })
    .map(
      (attribute) =>
        `${attribute.name}:${attribute.option}`,
    )
    .join("|");
}

function findAttribute(
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

function normalizeQuantity(
  quantity: number,
): number {
  if (
    !Number.isFinite(quantity)
  ) {
    return 1;
  }

  return Math.min(
    MAX_CART_QUANTITY,
    Math.max(
      1,
      Math.floor(quantity),
    ),
  );
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
  value: string | number,
): string {
  const price = Number(value);

  return (
    Number.isFinite(price)
      ? price
      : 0
  ).toFixed(2);
}

function pricesAreDifferent(
  first: string,
  second: string,
): boolean {
  const firstPrice =
    Number(first);

  const secondPrice =
    Number(second);

  if (
    !Number.isFinite(firstPrice) ||
    !Number.isFinite(secondPrice)
  ) {
    return true;
  }

  return (
    Math.abs(
      firstPrice -
        secondPrice,
    ) > 0.005
  );
}

/* =========================================================
   Image helpers
========================================================= */

function getImageSource(
  value: unknown,
): string | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return undefined;
  }

  const record =
    value as Record<
      string,
      unknown
    >;

  if (
    typeof record.src !== "string"
  ) {
    return undefined;
  }

  const source =
    record.src.trim();

  return source || undefined;
}

function getCurrentImage(
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

  const firstProductImage =
    Array.isArray(
      product.images,
    )
      ? product.images[0]
      : undefined;

  return getImageSource(
    firstProductImage,
  );
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

  stockStatus:
    WooCommerceStockStatus;

  manageStock: boolean;

  stockQuantity:
    number | null;
}): number {
  if (
    stockStatus ===
    "outofstock"
  ) {
    return 0;
  }

  const safeRequestedQuantity =
    normalizeQuantity(
      requestedQuantity,
    );

  if (
    stockStatus ===
    "onbackorder"
  ) {
    return safeRequestedQuantity;
  }

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
   Variation attribute validation
========================================================= */

function resolveVariationAttributes({
  variation,
  inputAttributes,
}: {
  variation:
    WooCommerceVariation;

  inputAttributes:
    CartKeyAttribute[];
}): ResolvedVariationAttributes {
  const normalizedInputAttributes =
    normalizeAttributes(
      inputAttributes,
    );

  const resolvedAttributes:
    CartKeyAttribute[] = [];

  for (
    const variationAttribute of
    variation.attributes ?? []
  ) {
    const attributeName =
      normalizeText(
        variationAttribute.name,
      );

    if (!attributeName) {
      continue;
    }

    const currentOption =
      normalizeText(
        variationAttribute.option,
      );

    const selectedAttribute =
      findAttribute(
        normalizedInputAttributes,
        attributeName,
      );

    /*
     * Fixed variation option।
     */
    if (currentOption) {
      if (
        selectedAttribute &&
        normalizeAttributeOption(
          selectedAttribute.option,
        ) !==
          normalizeAttributeOption(
            currentOption,
          )
      ) {
        return {
          success: false,

          reason:
            `The selected value for "${attributeName}" no longer matches this variation.`,
        };
      }

      resolvedAttributes.push({
        name:
          attributeName,

        option:
          currentOption,
      });

      continue;
    }

    /*
     * Any-option variation-এর জন্য cart-এর
     * selected value প্রয়োজন।
     */
    if (
      !selectedAttribute ||
      !selectedAttribute.option.trim()
    ) {
      return {
        success: false,

        reason:
          `The selected value for "${attributeName}" is missing.`,
      };
    }

    resolvedAttributes.push({
      name:
        attributeName,

      option:
        selectedAttribute.option,
    });
  }

  return {
    success: true,

    attributes:
      normalizeAttributes(
        resolvedAttributes,
      ),
  };
}

/* =========================================================
   Result helpers
========================================================= */

function createRemovedItem({
  input,
  code,
  reason,
  name,
}: {
  input:
    CartValidationInputItem;

  code: string;
  reason: string;
  name?: string;
}): CartValidationRemovedItem {
  return {
    cartKey:
      input.cartKey,

    productId:
      input.productId,

    ...(input.variationId
      ? {
          variationId:
            input.variationId,
        }
      : {}),

    name:
      normalizeText(
        name ??
          input.name,
      ) ||
      "Unavailable product",

    code,
    reason,
  };
}

function buildChanges({
  input,
  currentItem,
}: {
  input:
    CartValidationInputItem;

  currentItem:
    ValidatedCartItem;
}): CartValidationChange[] {
  const changes:
    CartValidationChange[] = [];

  if (
    pricesAreDifferent(
      input.price,
      currentItem.price,
    )
  ) {
    changes.push({
      type:
        "price_changed",

      cartKey:
        currentItem.cartKey,

      productId:
        currentItem.productId,

      ...(currentItem.variationId
        ? {
            variationId:
              currentItem
                .variationId,
          }
        : {}),

      name:
        currentItem.name,

      message:
        "The product price was updated to the current store price.",

      previousPrice:
        formatPrice(
          input.price,
        ),

      currentPrice:
        currentItem.price,
    });
  }

  if (
    input.quantity !==
    currentItem.quantity
  ) {
    changes.push({
      type:
        "quantity_adjusted",

      cartKey:
        currentItem.cartKey,

      productId:
        currentItem.productId,

      ...(currentItem.variationId
        ? {
            variationId:
              currentItem
                .variationId,
          }
        : {}),

      name:
        currentItem.name,

      message:
        "The quantity was adjusted to match current stock availability.",

      previousQuantity:
        input.quantity,

      currentQuantity:
        currentItem.quantity,
    });
  }

  const inputImage =
    input.image?.trim() ?? "";

  const currentImage =
    currentItem.image?.trim() ??
    "";

  const detailsChanged =
    normalizeText(input.name) !==
      normalizeText(
        currentItem.name,
      ) ||
    input.slug.trim() !==
      currentItem.slug.trim() ||
    input.stockStatus !==
      currentItem.stockStatus ||
    inputImage !==
      currentImage ||
    getAttributeSignature(
      input.attributes,
    ) !==
      getAttributeSignature(
        currentItem.attributes,
      );

  if (detailsChanged) {
    changes.push({
      type:
        "details_updated",

      cartKey:
        currentItem.cartKey,

      productId:
        currentItem.productId,

      ...(currentItem.variationId
        ? {
            variationId:
              currentItem
                .variationId,
          }
        : {}),

      name:
        currentItem.name,

      message:
        "The product information was refreshed using the current catalogue.",
    });
  }

  return changes;
}

/* =========================================================
   Duplicate input merging
========================================================= */

function mergeDuplicateInputs(
  items:
    CartValidationInputItem[],
): CartValidationInputItem[] {
  const mergedItems =
    new Map<
      string,
      CartValidationInputItem
    >();

  for (const item of items) {
    const normalizedAttributes =
      normalizeAttributes(
        item.attributes,
      );

    const identityKey =
      buildCartKey({
        productId:
          item.productId,

        variationId:
          item.variationId,

        attributes:
          normalizedAttributes,
      });

    const existingItem =
      mergedItems.get(
        identityKey,
      );

    if (existingItem) {
      existingItem.quantity =
        Math.min(
          MAX_CART_QUANTITY,

          existingItem.quantity +
            item.quantity,
        );

      continue;
    }

    mergedItems.set(
      identityKey,
      {
        ...item,

        attributes:
          normalizedAttributes,

        quantity:
          normalizeQuantity(
            item.quantity,
          ),
      },
    );
  }

  return Array.from(
    mergedItems.values(),
  );
}

/* =========================================================
   Simple product validation
========================================================= */

function validateSimpleProduct({
  input,
  product,
}: {
  input:
    CartValidationInputItem;

  product:
    WooCommerceProduct;
}): ItemValidationResult {
  if (input.variationId) {
    return {
      removed:
        createRemovedItem({
          input,

          name:
            product.name,

          code:
            "invalid_variation",

          reason:
            "This product no longer supports the selected variation.",
        }),
    };
  }

  if (
    product.purchasable !==
    true
  ) {
    return {
      removed:
        createRemovedItem({
          input,

          name:
            product.name,

          code:
            "not_purchasable",

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
      removed:
        createRemovedItem({
          input,

          name:
            product.name,

          code:
            "invalid_price",

          reason:
            "This product does not currently have a valid price.",
        }),
    };
  }

  const quantity =
    resolveAvailableQuantity({
      requestedQuantity:
        input.quantity,

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
      removed:
        createRemovedItem({
          input,

          name:
            product.name,

          code:
            "out_of_stock",

          reason:
            "This product is currently out of stock.",
        }),
    };
  }

  const image =
    getCurrentImage(
      product,
    );

  const item:
    ValidatedCartItem = {
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

  return {
    item,

    changes:
      buildChanges({
        input,
        currentItem:
          item,
      }),
  };
}

/* =========================================================
   Variable product validation
========================================================= */

function validateVariableProduct({
  input,
  product,
  variation,
}: {
  input:
    CartValidationInputItem;

  product:
    WooCommerceProduct;

  variation:
    WooCommerceVariation;
}): ItemValidationResult {
  if (
    variation.purchasable !==
    true
  ) {
    return {
      removed:
        createRemovedItem({
          input,

          name:
            product.name,

          code:
            "variation_not_purchasable",

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
      removed:
        createRemovedItem({
          input,

          name:
            product.name,

          code:
            "variation_invalid_price",

          reason:
            "The selected variation does not currently have a valid price.",
        }),
    };
  }

  const resolvedAttributes =
    resolveVariationAttributes({
      variation,

      inputAttributes:
        input.attributes,
    });

  if (
    !resolvedAttributes.success
  ) {
    return {
      removed:
        createRemovedItem({
          input,

          name:
            product.name,

          code:
            "variation_mismatch",

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

  const quantity =
    resolveAvailableQuantity({
      requestedQuantity:
        input.quantity,

      stockStatus:
        variation.stock_status,

      manageStock:
        effectiveManageStock,

      stockQuantity:
        effectiveStockQuantity,
    });

  if (quantity < 1) {
    return {
      removed:
        createRemovedItem({
          input,

          name:
            product.name,

          code:
            "variation_out_of_stock",

          reason:
            "The selected variation is currently out of stock.",
        }),
    };
  }

  const image =
    getCurrentImage(
      product,
      variation,
    );

  const item:
    ValidatedCartItem = {
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

  return {
    item,

    changes:
      buildChanges({
        input,

        currentItem:
          item,
      }),
  };
}

/* =========================================================
   Main validation
========================================================= */

export async function validateCartItems(
  inputItems:
    CartValidationInputItem[],
): Promise<CartValidationResult> {
  if (
    inputItems.length >
    MAX_CART_ITEMS
  ) {
    throw new CartValidationError(
      `The cart cannot contain more than ${MAX_CART_ITEMS} distinct products.`,
      400,
      "cart_too_large",
    );
  }

  if (
    inputItems.length === 0
  ) {
    return {
      items: [],
      removedItems: [],
      changes: [],

      originalItemCount: 0,
      validatedItemCount: 0,
      removedItemCount: 0,
      changedItemCount: 0,
    };
  }

  const mergedInputItems =
    mergeDuplicateInputs(
      inputItems,
    );

  const productCache =
    new Map<
      number,
      Promise<
        WooCommerceProduct | null
      >
    >();

  const variationCache =
    new Map<
      number,
      Promise<
        WooCommerceVariation[]
      >
    >();

  function loadProduct(
    productId: number,
  ): Promise<
    WooCommerceProduct | null
  > {
    const cached =
      productCache.get(
        productId,
      );

    if (cached) {
      return cached;
    }

    const request =
      getProductById(
        productId,
      );

    productCache.set(
      productId,
      request,
    );

    return request;
  }

  function loadVariations(
    productId: number,
  ): Promise<
    WooCommerceVariation[]
  > {
    const cached =
      variationCache.get(
        productId,
      );

    if (cached) {
      return cached;
    }

    const request =
      getProductVariations(
        productId,
      );

    variationCache.set(
      productId,
      request,
    );

    return request;
  }

  let validationResults:
    ItemValidationResult[];

  try {
    validationResults =
      await Promise.all(
        mergedInputItems.map(
          async (
            input,
          ): Promise<ItemValidationResult> => {
            const product =
              await loadProduct(
                input.productId,
              );

            if (!product) {
              return {
                removed:
                  createRemovedItem({
                    input,

                    code:
                      "product_not_found",

                    reason:
                      "This product no longer exists.",
                  }),
              };
            }

            if (
              product.status !==
              "publish"
            ) {
              return {
                removed:
                  createRemovedItem({
                    input,

                    name:
                      product.name,

                    code:
                      "product_unavailable",

                    reason:
                      "This product is no longer published.",
                  }),
              };
            }

            if (
              product.type ===
              "simple"
            ) {
              return validateSimpleProduct(
                {
                  input,
                  product,
                },
              );
            }

            if (
              product.type ===
              "variable"
            ) {
              if (
                !input.variationId
              ) {
                return {
                  removed:
                    createRemovedItem({
                      input,

                      name:
                        product.name,

                      code:
                        "variation_required",

                      reason:
                        "The selected product options are incomplete.",
                    }),
                };
              }

              const variations =
                await loadVariations(
                  product.id,
                );

              const variation =
                variations.find(
                  (candidate) =>
                    candidate.id ===
                    input.variationId,
                );

              if (!variation) {
                return {
                  removed:
                    createRemovedItem({
                      input,

                      name:
                        product.name,

                      code:
                        "variation_not_found",

                      reason:
                        "The selected variation is no longer available.",
                    }),
                };
              }

              return validateVariableProduct(
                {
                  input,
                  product,
                  variation,
                },
              );
            }

            return {
              removed:
                createRemovedItem({
                  input,

                  name:
                    product.name,

                  code:
                    "unsupported_product_type",

                  reason:
                    "This product type cannot be purchased through the cart.",
                }),
            };
          },
        ),
      );
  } catch (error) {
    console.error(
      "Cart catalogue validation failed:",
      error,
    );

    /*
     * WooCommerce temporarily unavailable হলে
     * client cart replace করা যাবে না।
     */
    throw new CartValidationError(
      "The store catalogue could not be checked right now. Your cart has not been changed.",
      502,
      "catalogue_unavailable",
    );
  }

  const items:
    ValidatedCartItem[] = [];

  const removedItems:
    CartValidationRemovedItem[] =
      [];

  const changes:
    CartValidationChange[] = [];

  for (
    const result of
    validationResults
  ) {
    if ("removed" in result) {
      removedItems.push(
        result.removed,
      );

      continue;
    }

    items.push(result.item);

    changes.push(
      ...result.changes,
    );
  }

  return {
    items,
    removedItems,
    changes,

    originalItemCount:
      mergedInputItems.length,

    validatedItemCount:
      items.length,

    removedItemCount:
      removedItems.length,

    changedItemCount:
      changes.length,
  };
}