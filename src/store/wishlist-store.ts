"use client";

import { create } from "zustand";

import {
  createJSONStorage,
  persist,
} from "zustand/middleware";

export type WishlistStockStatus =
  | "instock"
  | "outofstock"
  | "onbackorder";

export type WishlistProduct = {
  productId: number;
  name: string;
  slug: string;
  price: string;
  image?: string;
  stockStatus: WishlistStockStatus;
  productType?: string;
};

type WishlistState = {
  items: WishlistProduct[];

  addItem: (
    product: WishlistProduct,
  ) => void;

  removeItem: (
    productId: number,
  ) => void;

  toggleItem: (
    product: WishlistProduct,
  ) => void;

  clearWishlist: () => void;
};

export const useWishlistStore =
  create<WishlistState>()(
    persist(
      (set) => ({
        items: [],

        addItem: (product) =>
          set((state) => ({
            /*
             * Existing item remove করে
             * fresh product information
             * দিয়ে আবার যোগ করা হচ্ছে।
             */
            items: [
              product,

              ...state.items.filter(
                (item) =>
                  item.productId !==
                  product.productId,
              ),
            ],
          })),

        removeItem: (productId) =>
          set((state) => ({
            items: state.items.filter(
              (item) =>
                item.productId !==
                productId,
            ),
          })),

        toggleItem: (product) =>
          set((state) => {
            const alreadyExists =
              state.items.some(
                (item) =>
                  item.productId ===
                  product.productId,
              );

            if (alreadyExists) {
              return {
                items:
                  state.items.filter(
                    (item) =>
                      item.productId !==
                      product.productId,
                  ),
              };
            }

            return {
              items: [
                product,
                ...state.items,
              ],
            };
          }),

        clearWishlist: () =>
          set({
            items: [],
          }),
      }),

      {
        name:
          "next-woo-wishlist-v1",

        storage:
          createJSONStorage(
            () => localStorage,
          ),
      },
    ),
  );