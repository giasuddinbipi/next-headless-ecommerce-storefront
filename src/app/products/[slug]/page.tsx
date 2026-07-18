import type { Metadata } from "next";

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import ProductPurchasePanel from "@/components/products/ProductPurchasePanel";
import ProductReviews from "@/components/products/ProductReviews";
import ProductViewTracker from "@/components/products/ProductViewTracker";
import RecentlyViewedProducts from "@/components/products/RecentlyViewedProducts";
import RelatedProducts from "@/components/products/RelatedProducts";

import {
  getProductBySlug,
  getProductsByIds,
  getProductVariations,
  type WooCommerceProduct,
  type WooCommerceVariation,
} from "@/lib/woocommerce";

type ProductPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

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

function getMetadataDescription(
  product: WooCommerceProduct,
): string {
  const description = stripHtml(
    product.short_description ||
      product.description ||
      "",
  );

  if (description) {
    return description.slice(0, 160);
  }

  return `View ${product.name}, price, available options, ratings and customer reviews.`;
}

function formatRating(
  value: string,
): string {
  const rating = Number(value);

  return Number.isFinite(rating)
    ? rating.toFixed(1)
    : "0.0";
}

function ProductRating({
  averageRating,
  ratingCount,
}: {
  averageRating: string;
  ratingCount: number;
}) {
  const numericRating =
    Number(averageRating) || 0;

  const roundedRating = Math.round(
    numericRating,
  );

  return (
    <Link
      href="#product-reviews"
      className="inline-flex flex-wrap items-center gap-2 text-sm transition hover:opacity-80"
    >
      <span
        aria-label={`${formatRating(
          averageRating,
        )} out of 5 stars`}
        className="flex items-center gap-0.5"
      >
        {[1, 2, 3, 4, 5].map(
          (star) => (
            <span
              key={star}
              aria-hidden="true"
              className={
                star <= roundedRating
                  ? "text-yellow-500"
                  : "text-gray-300"
              }
            >
              ★
            </span>
          ),
        )}
      </span>

      <span className="font-semibold text-gray-800">
        {formatRating(
          averageRating,
        )}
      </span>

      <span className="text-gray-500">
        ({ratingCount}{" "}
        {ratingCount === 1
          ? "review"
          : "reviews"}
        )
      </span>
    </Link>
  );
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;

  const product =
    await getProductBySlug(slug);

  if (!product) {
    return {
      title: "Product not found",
      description:
        "The requested product could not be found.",
    };
  }

  const productImage =
    product.images?.[0]?.src;

  return {
    title: product.name,

    description:
      getMetadataDescription(product),

    openGraph: {
      title: product.name,

      description:
        getMetadataDescription(product),

      type: "website",

      images: productImage
        ? [
            {
              url: productImage,
              alt: product.name,
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

  const product =
    await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  let variations:
    WooCommerceVariation[] = [];

  let relatedProducts:
    WooCommerceProduct[] = [];

  if (product.type === "variable") {
    try {
      variations =
        await getProductVariations(
          product.id,
        );
    } catch (error) {
      console.error(
        "Product variations loading failed:",
        error,
      );
    }
  }

  try {
    const relatedIds = (
      product.related_ids ?? []
    )
      .filter(
        (productId) =>
          productId !== product.id,
      )
      .slice(0, 4);

    relatedProducts =
      await getProductsByIds(
        relatedIds,
      );
  } catch (error) {
    console.error(
      "Related products loading failed:",
      error,
    );
  }

  const productImages =
    product.images ?? [];

  const mainImage =
    productImages[0]?.src;

  const averageRating =
    product.average_rating || "0";

  const ratingCount =
    product.rating_count || 0;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <ProductViewTracker
          product={{
            productId: product.id,
            name: product.name,
            slug: product.slug,
            price: product.price,
            image: mainImage,
            stockStatus:
              product.stock_status,
            productType:
              product.type,
            averageRating,
            ratingCount,
          }}
        />

        <nav
          aria-label="Breadcrumb"
          className="mb-7 flex flex-wrap items-center gap-2 text-sm text-gray-500"
        >
          <Link
            href="/"
            className="transition hover:text-gray-900"
          >
            Home
          </Link>

          <span aria-hidden="true">
            /
          </span>

          <Link
            href="/shop"
            className="transition hover:text-gray-900"
          >
            Shop
          </Link>

          <span aria-hidden="true">
            /
          </span>

          <span className="line-clamp-1 text-gray-800">
            {product.name}
          </span>
        </nav>

        <section className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            {mainImage ? (
              <div className="relative aspect-square overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <Image
                  priority
                  fill
                  src={mainImage}
                  alt={product.name}
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-contain p-4 sm:p-6"
                />
              </div>
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-2xl border border-gray-200 bg-white text-gray-500 shadow-sm">
                No product image
              </div>
            )}

            {productImages.length > 1 && (
              <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-5">
                {productImages
                  .slice(1, 6)
                  .map((image, index) => (
                    <div
                      key={
                        image.id ??
                        `${image.src}-${index}`
                      }
                      className="relative aspect-square overflow-hidden rounded-xl border border-gray-200 bg-white"
                    >
                      <Image
                        fill
                        src={image.src}
                        alt={`${product.name} image ${
                          index + 2
                        }`}
                        sizes="120px"
                        className="object-contain p-2"
                      />
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="h-fit rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8 lg:sticky lg:top-24">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
              {product.type ===
              "variable"
                ? "Available options"
                : "Product details"}
            </p>

            <h1 className="mt-3 text-3xl font-bold leading-tight text-gray-900 sm:text-4xl">
              {product.name}
            </h1>

            {ratingCount > 0 ? (
              <div className="mt-4">
                <ProductRating
                  averageRating={
                    averageRating
                  }
                  ratingCount={
                    ratingCount
                  }
                />
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">
                No customer reviews yet
              </p>
            )}

            {product.short_description && (
              <div
                className="mt-5 text-sm leading-7 text-gray-600 [&_a]:font-semibold [&_a]:text-blue-700 [&_li]:ml-5 [&_li]:list-disc [&_p]:mb-3"
                dangerouslySetInnerHTML={{
                  __html:
                    product.short_description,
                }}
              />
            )}

            <ProductPurchasePanel
              product={product}
              variations={variations}
            />
          </div>
        </section>

        {product.description && (
          <section className="mt-12 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
              More information
            </p>

            <h2 className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">
              Product description
            </h2>

            <div
              className="mt-6 leading-8 text-gray-700 [&_a]:font-semibold [&_a]:text-blue-700 [&_h2]:mb-3 [&_h2]:mt-7 [&_h2]:text-2xl [&_h2]:font-bold [&_h3]:mb-3 [&_h3]:mt-6 [&_h3]:text-xl [&_h3]:font-bold [&_img]:my-5 [&_img]:h-auto [&_img]:max-w-full [&_li]:ml-6 [&_li]:list-disc [&_ol_li]:list-decimal [&_p]:mb-4 [&_strong]:font-bold"
              dangerouslySetInnerHTML={{
                __html:
                  product.description,
              }}
            />
          </section>
        )}

        <ProductReviews
          productId={product.id}
          productSlug={product.slug}
          averageRating={Number(
            averageRating,
          )}
          ratingCount={ratingCount}
        />

        <RelatedProducts
          products={relatedProducts}
        />

        <RecentlyViewedProducts
          excludeProductId={product.id}
          maximumProducts={4}
        />
      </div>
    </main>
  );
}