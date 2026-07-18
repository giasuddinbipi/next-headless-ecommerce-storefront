"use client";

import { create } from "zustand";

import {
  createJSONStorage,
  persist,
} from "zustand/middleware";

export type RecentlyViewedProduct = {
  productId: number;
  name: string;
  slug: string;
  price: string;
  image?: string;

  stockStatus:
    | "instock"
    | "outofstock"
    | "onbackorder";

  productType: string;
  averageRating: string;
  ratingCount: number;
};

type RecentlyViewedState = {
  items: RecentlyViewedProduct[];

  addProduct: (
    product: RecentlyViewedProduct,
  ) => void;

  clearRecentlyViewed: () => void;
};

const maximumRecentlyViewedProducts = 12;

export const useRecentlyViewedStore =
  create<RecentlyViewedState>()(
    persist(
      (set) => ({
        items: [],

        addProduct: (product) =>
          set((state) => ({
            items: [
              product,

              ...state.items.filter(
                (item) =>
                  item.productId !==
                  product.productId,
              ),
            ].slice(
              0,
              maximumRecentlyViewedProducts,
            ),
          })),

        clearRecentlyViewed: () =>
          set({
            items: [],
          }),
      }),

      {
        name:
          "next-woo-recently-viewed-v1",

        storage:
          createJSONStorage(
            () => localStorage,
          ),
      },
    ),
  );