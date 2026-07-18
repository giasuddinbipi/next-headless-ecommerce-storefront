"use client";

import Image from "next/image";
import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import { useRecentlyViewedStore } from "@/store/recently-viewed-store";

type RecentlyViewedProductsProps = {
  excludeProductId?: number;
  maximumProducts?: number;
};

function formatPrice(
  value: string,
): string {
  const price = Number(value);

  if (
    !value ||
    !Number.isFinite(price)
  ) {
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

function formatRating(
  value: string,
): string {
  const rating = Number(value);

  return Number.isFinite(rating)
    ? rating.toFixed(1)
    : "0.0";
}

export default function RecentlyViewedProducts({
  excludeProductId,
  maximumProducts = 4,
}: RecentlyViewedProductsProps) {
  const [mounted, setMounted] =
    useState(false);

  const items =
    useRecentlyViewedStore(
      (state) => state.items,
    );

  const clearRecentlyViewed =
    useRecentlyViewedStore(
      (state) =>
        state.clearRecentlyViewed,
    );

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const visibleProducts = items
    .filter(
      (product) =>
        product.productId !==
        excludeProductId,
    )
    .slice(0, maximumProducts);

  if (visibleProducts.length === 0) {
    return null;
  }

  return (
    <section className="mt-12 border-t border-gray-200 pt-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-purple-700">
            Continue browsing
          </p>

          <h2 className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">
            Recently viewed
          </h2>

          <p className="mt-2 text-gray-600">
            Products you recently
            visited on this device.
          </p>
        </div>

        <button
          type="button"
          onClick={clearRecentlyViewed}
          className="text-sm font-semibold text-gray-600 transition hover:text-red-600"
        >
          Clear history
        </button>
      </div>

      <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {visibleProducts.map(
          (product) => (
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
                  <h3 className="line-clamp-2 font-semibold text-gray-900 transition hover:text-blue-700">
                    {product.name}
                  </h3>
                </Link>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-gray-900">
                    {product.price
                      ? formatPrice(
                          product.price,
                        )
                      : "View options"}
                  </p>

                  {product.ratingCount >
                    0 && (
                    <div
                      aria-label={`${formatRating(
                        product.averageRating,
                      )} out of 5 stars`}
                      className="flex items-center gap-1 text-sm"
                    >
                      <span className="text-yellow-500">
                        ★
                      </span>

                      <span className="font-semibold text-gray-700">
                        {formatRating(
                          product.averageRating,
                        )}
                      </span>

                      <span className="text-gray-400">
                        (
                        {
                          product.ratingCount
                        }
                        )
                      </span>
                    </div>
                  )}
                </div>

                {product.stockStatus ===
                  "instock" && (
                  <p className="mt-2 text-sm font-medium text-green-700">
                    In stock
                  </p>
                )}

                {product.stockStatus ===
                  "onbackorder" && (
                  <p className="mt-2 text-sm font-medium text-yellow-700">
                    Available on
                    backorder
                  </p>
                )}

                {product.stockStatus ===
                  "outofstock" && (
                  <p className="mt-2 text-sm font-medium text-red-700">
                    Out of stock
                  </p>
                )}

                <Link
                  href={`/products/${product.slug}`}
                  className="mt-5 block rounded-xl bg-gray-900 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-gray-700"
                >
                  {product.productType ===
                  "variable"
                    ? "Choose options"
                    : "View product"}
                </Link>
              </div>
            </article>
          ),
        )}
      </div>
    </section>
  );
}