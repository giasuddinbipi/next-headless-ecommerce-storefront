"use client";

import { create } from "zustand";

import {
  createJSONStorage,
  persist,
} from "zustand/middleware";

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

export type CartItem = CartProduct & {
  quantity: number;
};

type CartState = {
  items: CartItem[];

  addItem: (
    product: CartProduct,
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

export const useCartStore =
  create<CartState>()(
    persist(
      (set) => ({
        items: [],

        addItem: (product) => {
          set((state) => {
            const existingItem =
              state.items.find(
                (item) =>
                  item.cartKey ===
                  product.cartKey,
              );

            if (existingItem) {
              return {
                items: state.items.map(
                  (item) =>
                    item.cartKey ===
                    product.cartKey
                      ? {
                          ...item,
                          quantity:
                            item.quantity +
                            1,
                        }
                      : item,
                ),
              };
            }

            return {
              items: [
                ...state.items,
                {
                  ...product,
                  quantity: 1,
                },
              ],
            };
          });
        },

        increaseQuantity: (
          cartKey,
        ) => {
          set((state) => ({
            items: state.items.map(
              (item) =>
                item.cartKey ===
                cartKey
                  ? {
                      ...item,
                      quantity:
                        item.quantity +
                        1,
                    }
                  : item,
            ),
          }));
        },

        decreaseQuantity: (
          cartKey,
        ) => {
          set((state) => ({
            items: state.items
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
                  item.quantity > 0,
              ),
          }));
        },

        removeItem: (cartKey) => {
          set((state) => ({
            items: state.items.filter(
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
         * New storage name prevents old,
         * incompatible cart data from
         * causing errors.
         */
        name: "next-woo-cart-v2",

        storage:
          createJSONStorage(
            () => localStorage,
          ),
      },
    ),
  );