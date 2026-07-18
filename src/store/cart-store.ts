"use client";

import { create } from "zustand";

import {
  createJSONStorage,
  persist,
} from "zustand/middleware";

export const MAX_CART_ITEM_QUANTITY =
  99;

export type CartAttribute = {
  name: string;
  option: string;
};

export type CartProduct = {
  cartKey: string;

  productId: number;
  variationId?: number;

  name: string;
  slug: string;
  price: string;
  image?: string;

  stockStatus:
    | "instock"
    | "outofstock"
    | "onbackorder";

  attributes: CartAttribute[];
};

export type CartItem =
  CartProduct & {
    quantity: number;
  };

type CartState = {
  items: CartItem[];

  addItem: (
    product: CartProduct,
    quantity?: number,
  ) => void;

  addItems: (
    products: CartItem[],
  ) => void;

  increaseQuantity: (
    cartKey: string,
  ) => void;

  decreaseQuantity: (
    cartKey: string,
  ) => void;

  removeItem: (
    cartKey: string,
  ) => void;

  clearCart: () => void;
};

/* =========================================================
   Quantity helpers
========================================================= */

function normalizeQuantity(
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(
    MAX_CART_ITEM_QUANTITY,
    Math.max(
      1,
      Math.floor(value),
    ),
  );
}

function mergeQuantity(
  currentQuantity: number,
  additionalQuantity: number,
): number {
  return Math.min(
    MAX_CART_ITEM_QUANTITY,
    normalizeQuantity(
      currentQuantity,
    ) +
      normalizeQuantity(
        additionalQuantity,
      ),
  );
}

/* =========================================================
   Product validation and normalization
========================================================= */

function isValidCartProduct(
  product: CartProduct,
): boolean {
  if (
    typeof product.cartKey !==
      "string" ||
    !product.cartKey.trim()
  ) {
    return false;
  }

  if (
    !Number.isInteger(
      product.productId,
    ) ||
    product.productId < 1
  ) {
    return false;
  }

  if (
    product.variationId !==
      undefined &&
    (
      !Number.isInteger(
        product.variationId,
      ) ||
      product.variationId < 1
    )
  ) {
    return false;
  }

  const price =
    Number(product.price);

  if (
    product.price === "" ||
    !Number.isFinite(price) ||
    price < 0
  ) {
    return false;
  }

  if (
    ![
      "instock",
      "outofstock",
      "onbackorder",
    ].includes(
      product.stockStatus,
    )
  ) {
    return false;
  }

  return true;
}

function normalizeAttributes(
  attributes: CartAttribute[],
): CartAttribute[] {
  const uniqueAttributes =
    new Map<
      string,
      CartAttribute
    >();

  for (
    const attribute of
    attributes
  ) {
    const name =
      attribute.name
        .replace(/\s+/g, " ")
        .trim();

    const option =
      attribute.option
        .replace(/\s+/g, " ")
        .trim();

    if (!name || !option) {
      continue;
    }

    const key =
      name
        .toLowerCase()
        .replace(
          /^attribute_/,
          "",
        )
        .replace(/^pa_/, "")
        .replace(
          /[\s_-]+/g,
          "",
        );

    if (!key) {
      continue;
    }

    uniqueAttributes.set(
      key,
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

function normalizeCartProduct(
  product: CartProduct,
): CartProduct {
  const normalizedPrice =
    Number(product.price);

  const image =
    product.image?.trim();

  return {
    cartKey:
      product.cartKey.trim(),

    productId:
      product.productId,

    ...(product.variationId
      ? {
          variationId:
            product.variationId,
        }
      : {}),

    name:
      product.name
        .replace(/\s+/g, " ")
        .trim(),

    slug:
      product.slug.trim(),

    price:
      normalizedPrice.toFixed(2),

    ...(image
      ? {
          image,
        }
      : {}),

    stockStatus:
      product.stockStatus,

    attributes:
      normalizeAttributes(
        product.attributes,
      ),
  };
}

/* =========================================================
   Product identity helpers

   cartKey ভিন্ন হলেও একই product, variation এবং
   attributes হলে একই cart item হিসেবে বিবেচিত হবে।
========================================================= */

function normalizeIdentityValue(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^attribute_/, "")
    .replace(/^pa_/, "")
    .replace(/[\s_-]+/g, "");
}

function normalizeIdentityOption(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getCartIdentityKey(
  product: CartProduct,
): string {
  const attributesKey =
    product.attributes
      .map((attribute) => ({
        name:
          normalizeIdentityValue(
            attribute.name,
          ),

        option:
          normalizeIdentityOption(
            attribute.option,
          ),
      }))
      .filter(
        (attribute) =>
          attribute.name &&
          attribute.option,
      )
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
    product.productId,
    product.variationId ?? 0,
    attributesKey,
  ].join("::");
}

/* =========================================================
   Cart store
========================================================= */

export const useCartStore =
  create<CartState>()(
    persist(
      (set) => ({
        items: [],

        addItem: (
          product,
          quantity = 1,
        ) => {
          set((state) => {
            if (
              !isValidCartProduct(
                product,
              ) ||
              product.stockStatus ===
                "outofstock"
            ) {
              return {
                items:
                  state.items,
              };
            }

            const normalizedProduct =
              normalizeCartProduct(
                product,
              );

            const safeQuantity =
              normalizeQuantity(
                quantity,
              );

            const identityKey =
              getCartIdentityKey(
                normalizedProduct,
              );

            const existingItem =
              state.items.find(
                (item) =>
                  getCartIdentityKey(
                    item,
                  ) === identityKey,
              );

            if (existingItem) {
              return {
                items:
                  state.items.map(
                    (item) => {
                      if (
                        getCartIdentityKey(
                          item,
                        ) !==
                        identityKey
                      ) {
                        return item;
                      }

                      return {
                        ...item,
                        ...normalizedProduct,

                        /*
                         * Existing cartKey রাখা হচ্ছে,
                         * যাতে cart controls-এর reference
                         * পরিবর্তন না হয়।
                         */
                        cartKey:
                          item.cartKey,

                        quantity:
                          mergeQuantity(
                            item.quantity,
                            safeQuantity,
                          ),
                      };
                    },
                  ),
              };
            }

            return {
              items: [
                ...state.items,

                {
                  ...normalizedProduct,
                  quantity:
                    safeQuantity,
                },
              ],
            };
          });
        },

        addItems: (
          products,
        ) => {
          set((state) => {
            const mergedItems =
              new Map<
                string,
                CartItem
              >();

            /*
             * Existing cart items প্রথমে
             * identity key অনুযায়ী map-এ রাখা হয়।
             */
            for (
              const item of
              state.items
            ) {
              if (
                !isValidCartProduct(
                  item,
                )
              ) {
                continue;
              }

              const normalizedItem =
                normalizeCartProduct(
                  item,
                );

              const identityKey =
                getCartIdentityKey(
                  normalizedItem,
                );

              const existingItem =
                mergedItems.get(
                  identityKey,
                );

              if (existingItem) {
                mergedItems.set(
                  identityKey,
                  {
                    ...existingItem,
                    ...normalizedItem,

                    cartKey:
                      existingItem
                        .cartKey,

                    quantity:
                      mergeQuantity(
                        existingItem
                          .quantity,
                        item.quantity,
                      ),
                  },
                );

                continue;
              }

              mergedItems.set(
                identityKey,
                {
                  ...normalizedItem,

                  quantity:
                    normalizeQuantity(
                      item.quantity,
                    ),
                },
              );
            }

            /*
             * Reorder API থেকে আসা validated
             * products existing cart-এর সঙ্গে
             * merge করা হয়।
             */
            for (
              const product of
              products
            ) {
              if (
                !isValidCartProduct(
                  product,
                ) ||
                product.stockStatus ===
                  "outofstock"
              ) {
                continue;
              }

              const normalizedProduct =
                normalizeCartProduct(
                  product,
                );

              const identityKey =
                getCartIdentityKey(
                  normalizedProduct,
                );

              const safeQuantity =
                normalizeQuantity(
                  product.quantity,
                );

              const existingItem =
                mergedItems.get(
                  identityKey,
                );

              if (existingItem) {
                mergedItems.set(
                  identityKey,
                  {
                    /*
                     * Current validated name, price,
                     * image এবং stock information
                     * পুরোনো data update করবে।
                     */
                    ...existingItem,
                    ...normalizedProduct,

                    /*
                     * Existing key রাখা হচ্ছে,
                     * যাতে current cart controls
                     * ঠিকভাবে কাজ করে।
                     */
                    cartKey:
                      existingItem
                        .cartKey,

                    quantity:
                      mergeQuantity(
                        existingItem
                          .quantity,
                        safeQuantity,
                      ),
                  },
                );

                continue;
              }

              mergedItems.set(
                identityKey,
                {
                  ...normalizedProduct,

                  quantity:
                    safeQuantity,
                },
              );
            }

            return {
              items:
                Array.from(
                  mergedItems.values(),
                ),
            };
          });
        },

        increaseQuantity: (
          cartKey,
        ) => {
          set((state) => ({
            items:
              state.items.map(
                (item) => {
                  if (
                    item.cartKey !==
                    cartKey
                  ) {
                    return item;
                  }

                  if (
                    item.stockStatus ===
                    "outofstock"
                  ) {
                    return item;
                  }

                  return {
                    ...item,

                    quantity:
                      Math.min(
                        MAX_CART_ITEM_QUANTITY,
                        item.quantity +
                          1,
                      ),
                  };
                },
              ),
          }));
        },

        decreaseQuantity: (
          cartKey,
        ) => {
          set((state) => ({
            items:
              state.items
                .map((item) =>
                  item.cartKey ===
                  cartKey
                    ? {
                        ...item,

                        quantity:
                          item.quantity -
                          1,
                      }
                    : item,
                )
                .filter(
                  (item) =>
                    item.quantity >
                    0,
                ),
          }));
        },

        removeItem: (
          cartKey,
        ) => {
          set((state) => ({
            items:
              state.items.filter(
                (item) =>
                  item.cartKey !==
                  cartKey,
              ),
          }));
        },

        clearCart: () => {
          set({
            items: [],
          });
        },
      }),

      {
        /*
         * Existing storage name অপরিবর্তিত রাখা হয়েছে,
         * তাই customer-এর current cart মুছে যাবে না।
         */
        name:
          "next-woo-cart-v2",

        storage:
          createJSONStorage(
            () => localStorage,
          ),

        /*
         * শুধু cart items localStorage-এ
         * সংরক্ষিত হবে।
         */
        partialize: (
          state,
        ) => ({
          items:
            state.items,
        }),
      },
    ),
  );