import Image from "next/image";
import Link from "next/link";

import {
  getProducts,
  type WooCommerceProduct,
} from "@/lib/woocommerce";

import { htmlToPlainText } from "@/lib/text";

function formatPrice(price: string): string {
  const numericPrice = Number(price);

  if (!Number.isFinite(numericPrice)) {
    return "Price unavailable";
  }

  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(numericPrice);
}

export default async function Home() {
  let products: WooCommerceProduct[] = [];
  let errorMessage = "";

  try {
    products = await getProducts();
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Unable to load products.";
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-10">
          <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
            My Ecommerce Store
          </h1>

          <p className="mt-3 text-gray-600">
            Products loaded from WooCommerce
          </p>
        </header>

        {errorMessage && (
          <div className="rounded-xl border border-red-300 bg-red-50 p-5 text-red-700">
            <p className="font-semibold">
              Products could not be loaded
            </p>

            <p className="mt-2 break-words text-sm">
              {errorMessage}
            </p>
          </div>
        )}

        {!errorMessage && products.length === 0 && (
          <div className="rounded-xl border bg-white p-6 text-gray-700">
            No published products were found.
          </div>
        )}

        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => {
            const productImage = product.images?.[0];

            const description =
              htmlToPlainText(product.short_description) ||
              "No product description available.";

            return (
              <article
                key={product.id}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <Link href={`/products/${product.slug}`}>
                  <div className="relative aspect-square overflow-hidden bg-gray-100">
                    {productImage ? (
                      <Image
                        src={productImage.src}
                        alt={
                          productImage.alt ||
                          product.name
                        }
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        className="object-cover transition duration-300 hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-gray-500">
                        No image
                      </div>
                    )}

                    {product.on_sale && (
                      <span className="absolute left-3 top-3 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
                        Sale
                      </span>
                    )}
                  </div>
                </Link>

                <div className="p-5">
                  <Link href={`/products/${product.slug}`}>
                    <h2 className="line-clamp-2 text-lg font-semibold text-gray-900 hover:text-blue-600">
                      {product.name}
                    </h2>
                  </Link>

                  <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-600">
                    {description}
                  </p>

                  <div className="mt-4 flex items-center gap-3">
                    <span className="text-xl font-bold text-gray-900">
                      {formatPrice(product.price)}
                    </span>

                    {product.on_sale &&
                      product.regular_price && (
                        <span className="text-sm text-gray-500 line-through">
                          {formatPrice(
                            product.regular_price,
                          )}
                        </span>
                      )}
                  </div>

                  <p className="mt-3 text-sm">
                    {product.stock_status ===
                    "instock" ? (
                      <span className="font-medium text-green-700">
                        In stock
                      </span>
                    ) : (
                      <span className="font-medium text-red-700">
                        Out of stock
                      </span>
                    )}
                  </p>

                  <Link
                    href={`/products/${product.slug}`}
                    className="mt-5 block rounded-lg bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-gray-700"
                  >
                    View product
                  </Link>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}