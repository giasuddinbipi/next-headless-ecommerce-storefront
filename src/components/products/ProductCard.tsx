import Image from "next/image";
import Link from "next/link";

import { htmlToPlainText } from "@/lib/text";

import type {
  WooCommerceProduct,
} from "@/lib/woocommerce";

type ProductCardProps = {
  product: WooCommerceProduct;
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

export default function ProductCard({
  product,
}: ProductCardProps) {
  const productImage =
    product.images?.[0];

  const description =
    htmlToPlainText(
      product.short_description,
    ) ||
    "No product description available.";

  return (
    <article className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <Link
        href={`/products/${product.slug}`}
      >
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
        {product.categories?.[0] && (
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700">
            {product.categories[0].name}
          </p>
        )}

        <Link
          href={`/products/${product.slug}`}
        >
          <h2 className="line-clamp-2 text-lg font-semibold text-gray-900 hover:text-blue-700">
            {product.name}
          </h2>
        </Link>

        <p className="mt-3 line-clamp-2 text-sm leading-6 text-gray-600">
          {description}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
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
          ) : product.stock_status ===
            "onbackorder" ? (
            <span className="font-medium text-yellow-700">
              Available on backorder
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
}