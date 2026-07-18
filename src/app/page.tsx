import Image from "next/image";
import Link from "next/link";

import {
  getProducts,
  type WooCommerceProduct,
} from "@/lib/woocommerce";

function stripHtml(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPrice(value: string): string {
  const price = Number(value);

  if (!value || !Number.isFinite(price)) {
    return "View options";
  }

  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(price);
}

function formatRating(value: string): string {
  const rating = Number(value);

  if (!Number.isFinite(rating)) {
    return "0.0";
  }

  return rating.toFixed(1);
}

function getStockLabel(
  stockStatus: WooCommerceProduct["stock_status"],
): string {
  switch (stockStatus) {
    case "instock":
      return "In stock";

    case "onbackorder":
      return "Available on backorder";

    case "outofstock":
      return "Out of stock";

    default:
      return "";
  }
}

function getStockClassName(
  stockStatus: WooCommerceProduct["stock_status"],
): string {
  switch (stockStatus) {
    case "instock":
      return "text-green-700";

    case "onbackorder":
      return "text-yellow-700";

    case "outofstock":
      return "text-red-700";

    default:
      return "text-gray-600";
  }
}

export default async function Home() {
  let products: WooCommerceProduct[] = [];
  let productsError = "";

  try {
    const productsResult = await getProducts({
      page: 1,
      perPage: 8,
      orderBy: "date",
      order: "desc",
    });

    /*
     * getProducts() এখন object return করে।
     * Product array পাওয়া যায় result.products থেকে।
     */
    products = productsResult.products;
  } catch (error) {
    console.error(
      "Homepage products loading failed:",
      error,
    );

    productsError =
      "Products could not be loaded right now. Please try again later.";
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Hero section */}
      <section className="bg-gray-950 px-4 py-16 text-white sm:px-6 sm:py-24">
        <div className="mx-auto grid max-w-7xl items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">
              Modern online store
            </p>

            <h1 className="mt-5 max-w-3xl text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              Discover products you will
              love
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-gray-300">
              Browse quality products,
              choose your preferred options
              and place your order through
              a fast and secure shopping
              experience.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/shop"
                className="rounded-xl bg-white px-7 py-4 font-semibold text-gray-950 transition hover:bg-gray-200"
              >
                Shop now
              </Link>

              <Link
                href="/account"
                className="rounded-xl border border-gray-600 px-7 py-4 font-semibold text-white transition hover:border-white hover:bg-white/10"
              >
                My account
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/20 text-2xl">
                ✓
              </div>

              <h2 className="mt-5 text-xl font-bold">
                Quality products
              </h2>

              <p className="mt-2 leading-7 text-gray-400">
                Explore available products,
                variations and customer
                reviews.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-500/20 text-2xl">
                ⚡
              </div>

              <h2 className="mt-5 text-xl font-bold">
                Easy checkout
              </h2>

              <p className="mt-2 leading-7 text-gray-400">
                Add products to your cart
                and complete your order
                quickly.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:col-span-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/20 text-2xl">
                ♡
              </div>

              <h2 className="mt-5 text-xl font-bold">
                Save your favourites
              </h2>

              <p className="mt-2 leading-7 text-gray-400">
                Create a wishlist and
                return to your favourite
                products whenever you need.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Featured/latest products */}
      <section className="px-4 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                Latest collection
              </p>

              <h2 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">
                Featured products
              </h2>

              <p className="mt-3 max-w-2xl leading-7 text-gray-600">
                Browse some of the latest
                products available in our
                store.
              </p>
            </div>

            <Link
              href="/shop"
              className="rounded-xl border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-800 transition hover:border-gray-900 hover:bg-gray-900 hover:text-white"
            >
              View all products
            </Link>
          </div>

          {productsError && (
            <div
              role="alert"
              className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-6 text-red-700"
            >
              <p className="font-semibold">
                Products unavailable
              </p>

              <p className="mt-2 text-sm leading-6">
                {productsError}
              </p>
            </div>
          )}

          {!productsError &&
            products.length === 0 && (
              <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
                <h3 className="text-xl font-bold text-gray-900">
                  No products found
                </h3>

                <p className="mt-2 text-gray-600">
                  Products will appear here
                  after they are published
                  in WooCommerce.
                </p>
              </div>
            )}

          {!productsError &&
            products.length > 0 && (
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {products.map(
                  (product) => {
                    const productImage =
                      product.images?.[0];

                    const description =
                      stripHtml(
                        product.short_description ||
                          product.description ||
                          "",
                      );

                    const ratingCount =
                      product.rating_count ||
                      0;

                    return (
                      <article
                        key={product.id}
                        className="group relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-lg"
                      >
                        {product.on_sale && (
                          <span className="absolute left-3 top-3 z-10 rounded-full bg-red-600 px-3 py-1 text-xs font-bold text-white">
                            Sale
                          </span>
                        )}

                        <Link
                          href={`/products/${product.slug}`}
                          className="relative block aspect-square overflow-hidden bg-gray-100"
                        >
                          {productImage?.src ? (
                            <Image
                              fill
                              src={
                                productImage.src
                              }
                              alt={
                                productImage.alt ||
                                product.name
                              }
                              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                              className="object-contain p-4 transition duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-sm text-gray-500">
                              No product image
                            </div>
                          )}
                        </Link>

                        <div className="p-5">
                          {product.categories
                            ?.length > 0 && (
                            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                              {
                                product
                                  .categories[0]
                                  .name
                              }
                            </p>
                          )}

                          <Link
                            href={`/products/${product.slug}`}
                          >
                            <h3 className="mt-2 line-clamp-2 text-lg font-bold leading-7 text-gray-900 transition hover:text-blue-700">
                              {product.name}
                            </h3>
                          </Link>

                          {description && (
                            <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-600">
                              {description}
                            </p>
                          )}

                          {ratingCount > 0 && (
                            <div className="mt-3 flex items-center gap-2 text-sm">
                              <span
                                aria-hidden="true"
                                className="text-yellow-500"
                              >
                                ★
                              </span>

                              <span className="font-semibold text-gray-800">
                                {formatRating(
                                  product.average_rating,
                                )}
                              </span>

                              <span className="text-gray-500">
                                ({ratingCount})
                              </span>
                            </div>
                          )}

                          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xl font-bold text-gray-900">
                              {formatPrice(
                                product.price,
                              )}
                            </p>

                            <p
                              className={`text-sm font-semibold ${getStockClassName(
                                product.stock_status,
                              )}`}
                            >
                              {getStockLabel(
                                product.stock_status,
                              )}
                            </p>
                          </div>

                          <Link
                            href={`/products/${product.slug}`}
                            className="mt-5 block rounded-xl bg-gray-900 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-gray-700"
                          >
                            {product.type ===
                            "variable"
                              ? "Choose options"
                              : "View product"}
                          </Link>
                        </div>
                      </article>
                    );
                  },
                )}
              </div>
            )}
        </div>
      </section>

      {/* Benefits */}
      <section className="border-t border-gray-200 bg-white px-4 py-14 sm:px-6">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900">
              Secure customer account
            </h2>

            <p className="mt-2 leading-7 text-gray-600">
              Manage your profile,
              addresses and order history
              from one place.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900">
              Order tracking
            </h2>

            <p className="mt-2 leading-7 text-gray-600">
              Follow the current status of
              your WooCommerce orders.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 p-6">
            <h2 className="text-lg font-bold text-gray-900">
              Customer reviews
            </h2>

            <p className="mt-2 leading-7 text-gray-600">
              Read approved reviews and
              share your product
              experience.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}