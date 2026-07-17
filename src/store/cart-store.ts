"use client";

import { create } from "zustand";
import {
  createJSONStorage,
  persist,
} from "zustand/middleware";

export type CartProduct = {
  id: number;
  name: string;
  slug: string;
  price: string;
  image?: string;
  stockStatus: "instock" | "outofstock" | "onbackorder";
};

export type CartItem = CartProduct & {
  quantity: number;
};

type CartState = {
  items: CartItem[];

  addItem: (product: CartProduct) => void;
  increaseQuantity: (productId: number) => void;
  decreaseQuantity: (productId: number) => void;
  removeItem: (productId: number) => void;
  clearCart: () => void;
};

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      items: [],

      addItem: (product) => {
        set((state) => {
          const existingItem = state.items.find(
            (item) => item.id === product.id,
          );

          if (existingItem) {
            return {
              items: state.items.map((item) =>
                item.id === product.id
                  ? {
                      ...item,
                      quantity: item.quantity + 1,
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

      increaseQuantity: (productId) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === productId
              ? {
                  ...item,
                  quantity: item.quantity + 1,
                }
              : item,
          ),
        }));
      },

      decreaseQuantity: (productId) => {
        set((state) => ({
          items: state.items
            .map((item) =>
              item.id === productId
                ? {
                    ...item,
                    quantity: item.quantity - 1,
                  }
                : item,
            )
            .filter((item) => item.quantity > 0),
        }));
      },

      removeItem: (productId) => {
        set((state) => ({
          items: state.items.filter(
            (item) => item.id !== productId,
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
      name: "next-woo-cart",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);