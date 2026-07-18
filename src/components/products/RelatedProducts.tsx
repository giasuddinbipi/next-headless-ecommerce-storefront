import ProductCard from "@/components/products/ProductCard";

import type {
  WooCommerceProduct,
} from "@/lib/woocommerce";

type RelatedProductsProps = {
  products: WooCommerceProduct[];
};

export default function RelatedProducts({
  products,
}: RelatedProductsProps) {
  if (products.length === 0) {
    return null;
  }

  return (
    <section className="mt-12">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          You may also like
        </p>

        <h2 className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">
          Related products
        </h2>

        <p className="mt-2 text-gray-600">
          Explore similar products from
          this category.
        </p>
      </div>

      <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
          />
        ))}
      </div>
    </section>
  );
}