"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useCartStore } from "@/store/cart-store";

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(price);
}

export default function CartPage() {
  const [mounted, setMounted] = useState(false);

  const items = useCartStore((state) => state.items);

  const increaseQuantity = useCartStore(
    (state) => state.increaseQuantity,
  );

  const decreaseQuantity = useCartStore(
    (state) => state.decreaseQuantity,
  );

  const removeItem = useCartStore(
    (state) => state.removeItem,
  );

  const clearCart = useCartStore(
    (state) => state.clearCart,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const subtotal = items.reduce((total, item) => {
    const itemPrice = Number(item.price || 0);

    return total + itemPrice * item.quantity;
  }, 0);

  const totalItems = items.reduce(
    (total, item) => total + item.quantity,
    0,
  );

  if (!mounted) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="h-40 animate-pulse rounded-2xl bg-gray-200" />
        </div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-gray-50 px-4 py-16">
        <div className="max-w-lg text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gray-200">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              className="h-10 w-10 text-gray-700"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 3h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 7H6"
              />

              <path
                strokeLinecap="round"
                d="M10 20h.01M18 20h.01"
              />
            </svg>
          </div>

          <h1 className="mt-6 text-3xl font-bold text-gray-900">
            Your cart is empty
          </h1>

          <p className="mt-3 text-gray-600">
            Browse the store and add products to your cart.
          </p>

          <Link
            href="/shop"
            className="mt-7 inline-block rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white transition hover:bg-gray-700"
          >
            Continue shopping
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Shopping cart
            </h1>

            <p className="mt-2 text-gray-600">
              {totalItems}{" "}
              {totalItems === 1 ? "item" : "items"} in your cart
            </p>
          </div>

          <button
            type="button"
            onClick={clearCart}
            className="text-sm font-semibold text-red-600 transition hover:text-red-800"
          >
            Clear cart
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <section className="space-y-4">
            {items.map((item) => {
              const itemPrice = Number(item.price || 0);
              const lineTotal = itemPrice * item.quantity;

              return (
                <article
                  key={item.cartKey}
                  className="grid gap-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-[140px_1fr]"
                >
                  <Link
                    href={`/products/${item.slug}`}
                    className="relative aspect-square overflow-hidden rounded-xl bg-gray-100"
                  >
                    {item.image ? (
                      <Image
                        src={item.image}
                        alt={item.name}
                        fill
                        sizes="140px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-gray-500">
                        No image
                      </div>
                    )}
                  </Link>

                  <div className="flex flex-col justify-between">
                    <div>
                      <Link href={`/products/${item.slug}`}>
                        <h2 className="text-lg font-semibold text-gray-900 transition hover:text-blue-700">
                          {item.name}
                        </h2>
                      </Link>

                      {item.attributes?.length > 0 && (
                        <p className="mt-2 text-sm text-gray-600">
                          {item.attributes
                            .map(
                              (attribute) =>
                                `${attribute.name}: ${attribute.option}`,
                            )
                            .join(" · ")}
                        </p>
                      )}

                      <p className="mt-2 text-sm text-gray-600">
                        Unit price: {formatPrice(itemPrice)}
                      </p>

                      <p className="mt-2 font-bold text-gray-900">
                        Total: {formatPrice(lineTotal)}
                      </p>

                      {item.stockStatus === "instock" && (
                        <p className="mt-2 text-sm font-medium text-green-700">
                          In stock
                        </p>
                      )}

                      {item.stockStatus === "onbackorder" && (
                        <p className="mt-2 text-sm font-medium text-yellow-700">
                          Available on backorder
                        </p>
                      )}

                      {item.stockStatus === "outofstock" && (
                        <p className="mt-2 text-sm font-medium text-red-700">
                          Currently out of stock
                        </p>
                      )}
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center overflow-hidden rounded-lg border border-gray-300">
                        <button
                          type="button"
                          aria-label={`Decrease ${item.name} quantity`}
                          onClick={() =>
                            decreaseQuantity(item.cartKey)
                          }
                          className="h-10 w-10 text-lg font-semibold transition hover:bg-gray-100"
                        >
                          −
                        </button>

                        <span className="flex h-10 min-w-10 items-center justify-center border-x border-gray-300 px-3 font-semibold">
                          {item.quantity}
                        </span>

                        <button
                          type="button"
                          aria-label={`Increase ${item.name} quantity`}
                          onClick={() =>
                            increaseQuantity(item.cartKey)
                          }
                          className="h-10 w-10 text-lg font-semibold transition hover:bg-gray-100"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          removeItem(item.cartKey)
                        }
                        className="text-sm font-semibold text-red-600 transition hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:sticky lg:top-24">
            <h2 className="text-xl font-bold text-gray-900">
              Order summary
            </h2>

            <div className="mt-6 space-y-4 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Items</span>
                <span>{totalItems}</span>
              </div>

              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>

              <div className="flex justify-between text-gray-600">
                <span>Delivery</span>
                <span>Calculated at checkout</span>
              </div>
            </div>

            <div className="mt-6 flex justify-between border-t border-gray-200 pt-5 text-lg font-bold text-gray-900">
              <span>Total</span>
              <span>{formatPrice(subtotal)}</span>
            </div>

            <Link
              href="/checkout"
              className="mt-6 block w-full rounded-xl bg-gray-900 px-5 py-4 text-center font-semibold text-white transition hover:bg-gray-700"
            >
              Proceed to checkout
            </Link>

            <Link
              href="/shop"
              className="mt-4 block text-center text-sm font-semibold text-gray-700 transition hover:text-gray-950"
            >
              Continue shopping
            </Link>
          </aside>
        </div>
      </div>
    </main>
  );
}