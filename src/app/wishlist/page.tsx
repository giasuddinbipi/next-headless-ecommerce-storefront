"use client";

import Image from "next/image";
import Link from "next/link";

import {
  useHasMounted,
} from "@/hooks/use-has-mounted";

import { useWishlistStore } from "@/store/wishlist-store";

function formatPrice(
  value: string,
): string {
  const price = Number(value);

  if (!Number.isFinite(price)) {
    return "View product";
  }

  return new Intl.NumberFormat(
    "en-BD",
    {
      style: "currency",
      currency: "BDT",
      maximumFractionDigits: 0,
    },
  ).format(price);
}

export default function WishlistPage() {
  const mounted =
  useHasMounted();
  const items = useWishlistStore(
    (state) => state.items,
  );

  const removeItem =
    useWishlistStore(
      (state) => state.removeItem,
    );

  const clearWishlist =
    useWishlistStore(
      (state) => state.clearWishlist,
    );

  if (!mounted) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="h-48 animate-pulse rounded-2xl bg-gray-200" />
        </div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-gray-50 px-4 py-16">
        <div className="max-w-lg text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-50 text-red-600">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              className="h-10 w-10"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"
              />
            </svg>
          </div>

          <h1 className="mt-6 text-3xl font-bold text-gray-900">
            Your wishlist is empty
          </h1>

          <p className="mt-3 text-gray-600">
            Save products you are
            interested in and return to
            them later.
          </p>

          <Link
            href="/shop"
            className="mt-7 inline-block rounded-xl bg-gray-900 px-7 py-4 font-semibold text-white transition hover:bg-gray-700"
          >
            Explore products
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-red-600">
              Saved products
            </p>

            <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">
              My wishlist
            </h1>

            <p className="mt-3 text-gray-600">
              {items.length}{" "}
              {items.length === 1
                ? "product"
                : "products"}{" "}
              saved.
            </p>
          </div>

          <button
            type="button"
            onClick={clearWishlist}
            className="rounded-lg border border-red-200 bg-white px-5 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            Clear wishlist
          </button>
        </header>

        <section className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((product) => (
            <article
              key={product.productId}
              className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
            >
              <Link
                href={`/products/${product.slug}`}
                className="relative block aspect-square overflow-hidden bg-gray-100"
              >
                {product.image ? (
                  <Image
                    src={product.image}
                    alt={product.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition duration-300 hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-gray-500">
                    No image
                  </div>
                )}
              </Link>

              <div className="p-5">
                <Link
                  href={`/products/${product.slug}`}
                >
                  <h2 className="line-clamp-2 text-lg font-semibold text-gray-900 transition hover:text-blue-700">
                    {product.name}
                  </h2>
                </Link>

                <p className="mt-3 text-lg font-bold text-gray-900">
                  {product.price
                    ? formatPrice(
                        product.price,
                      )
                    : "View options"}
                </p>

                {product.stockStatus ===
                  "instock" && (
                  <p className="mt-2 text-sm font-medium text-green-700">
                    In stock
                  </p>
                )}

                {product.stockStatus ===
                  "onbackorder" && (
                  <p className="mt-2 text-sm font-medium text-yellow-700">
                    Available on backorder
                  </p>
                )}

                {product.stockStatus ===
                  "outofstock" && (
                  <p className="mt-2 text-sm font-medium text-red-700">
                    Out of stock
                  </p>
                )}

                <div className="mt-5 grid gap-3">
                  <Link
                    href={`/products/${product.slug}`}
                    className="rounded-xl bg-gray-900 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-gray-700"
                  >
                    {product.productType ===
                    "variable"
                      ? "Choose options"
                      : "View product"}
                  </Link>

                  <button
                    type="button"
                    onClick={() =>
                      removeItem(
                        product.productId,
                      )
                    }
                    className="rounded-xl border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}
        </section>

        <div className="mt-10 text-center">
          <Link
            href="/shop"
            className="inline-flex rounded-xl border border-gray-300 bg-white px-7 py-4 font-semibold text-gray-800 transition hover:bg-gray-100"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    </main>
  );
}