import type { Metadata } from "next";

import Image from "next/image";
import Link from "next/link";

import { notFound } from "next/navigation";

import AddToCartButton from "@/components/cart/AddToCartButton";

import {
  getProductBySlug,
  type WooCommerceProduct,
} from "@/lib/woocommerce";

import { htmlToPlainText } from "@/lib/text";

type ProductPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

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

async function loadProduct(
  slug: string,
): Promise<WooCommerceProduct | null> {
  try {
    return await getProductBySlug(slug);
  } catch (error) {
    console.error("Product loading failed:", error);

    throw error;
  }
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;

  const product = await loadProduct(slug);

  if (!product) {
    return {
      title: "Product not found",
      description: "The requested product could not be found.",
    };
  }

  const productDescription =
    htmlToPlainText(product.short_description) ||
    htmlToPlainText(product.description) ||
    `View ${product.name} in our online store.`;

  return {
    title: product.name,
    description: productDescription.slice(0, 160),
    openGraph: {
      title: product.name,
      description: productDescription.slice(0, 160),
      images: product.images?.[0]?.src
        ? [
            {
              url: product.images[0].src,
              alt:
                product.images[0].alt ||
                product.name,
            },
          ]
        : [],
    },
  };
}

export default async function ProductPage({
  params,
}: ProductPageProps) {
  const { slug } = await params;

  const product = await loadProduct(slug);

  if (!product) {
    notFound();
  }

  const mainImage = product.images?.[0];

  const description =
    htmlToPlainText(product.description) ||
    htmlToPlainText(product.short_description) ||
    "No detailed description is currently available.";

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/"
          className="mb-8 inline-flex text-sm font-medium text-gray-600 transition hover:text-gray-900"
        >
          ← Back to products
        </Link>

        <div className="grid gap-10 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:grid-cols-2 md:p-8">
          {/* Product images */}
          <section>
            <div className="relative aspect-square overflow-hidden rounded-xl bg-gray-100">
              {mainImage ? (
                <Image
                  src={mainImage.src}
                  alt={mainImage.alt || product.name}
                  fill
                  priority
                  sizes="(max-width: 768px) 100vw, 50vw"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-gray-500">
                  No product image
                </div>
              )}

              {product.on_sale && (
                <span className="absolute left-4 top-4 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white">
                  Sale
                </span>
              )}
            </div>

            {product.images &&
              product.images.length > 1 && (
                <div className="mt-4 grid grid-cols-4 gap-3">
                  {product.images
                    .slice(1, 5)
                    .map((image) => (
                      <div
                        key={image.id}
                        className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100"
                      >
                        <Image
                          src={image.src}
                          alt={
                            image.alt ||
                            product.name
                          }
                          fill
                          sizes="120px"
                          className="object-cover"
                        />
                      </div>
                    ))}
                </div>
              )}
          </section>

          {/* Product information */}
          <section className="flex flex-col justify-center">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
              Product
            </p>

            <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">
              {product.name}
            </h1>

            {/* Price */}
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <span className="text-3xl font-bold text-gray-900">
                {formatPrice(product.price)}
              </span>

              {product.on_sale &&
                product.regular_price && (
                  <span className="text-lg text-gray-500 line-through">
                    {formatPrice(
                      product.regular_price,
                    )}
                  </span>
                )}
            </div>

            {/* Stock status */}
            <div className="mt-5">
              {product.stock_status ===
              "instock" ? (
                <span className="inline-flex rounded-full bg-green-100 px-4 py-2 text-sm font-semibold text-green-800">
                  In stock
                </span>
              ) : product.stock_status ===
                "onbackorder" ? (
                <span className="inline-flex rounded-full bg-yellow-100 px-4 py-2 text-sm font-semibold text-yellow-800">
                  Available on backorder
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-red-100 px-4 py-2 text-sm font-semibold text-red-800">
                  Out of stock
                </span>
              )}
            </div>

            {/* Description */}
            <p className="mt-7 whitespace-pre-line leading-8 text-gray-700">
              {description}
            </p>

            {/* Functional cart button */}
            <AddToCartButton
              product={{
                id: product.id,
                name: product.name,
                slug: product.slug,
                price: product.price,
                image: mainImage?.src,
                stockStatus:
                  product.stock_status,
              }}
            />

            <p className="mt-4 text-xs text-gray-500">
              Product ID: {product.id}
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}