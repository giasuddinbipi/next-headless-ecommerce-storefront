import {
  getProducts,
  type WooCommerceProduct,
} from "@/lib/woocommerce";

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
    <main className="min-h-screen bg-gray-50 px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10">
          <h1 className="text-4xl font-bold text-gray-900">
            My Ecommerce Store
          </h1>

          <p className="mt-3 text-gray-600">
            Products loaded from WooCommerce
          </p>
        </header>

        {errorMessage && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-700">
            <p className="font-semibold">
              Products could not be loaded
            </p>

            <p className="mt-2 break-words text-sm">
              {errorMessage}
            </p>
          </div>
        )}

        {!errorMessage && products.length === 0 && (
          <div className="rounded-lg border bg-white p-6 text-gray-700">
            No published products were found.
          </div>
        )}

        <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <article
              key={product.id}
              className="rounded-xl border bg-white p-6 shadow-sm"
            >
              <h2 className="text-xl font-semibold text-gray-900">
                {product.name}
              </h2>

              <p className="mt-3 text-2xl font-bold text-gray-900">
                {formatPrice(product.price)}
              </p>

              <p className="mt-3 text-sm text-gray-600">
                Status:{" "}
                {product.stock_status === "instock"
                  ? "In stock"
                  : "Out of stock"}
              </p>

              <p className="mt-2 text-xs text-gray-400">
                Product ID: {product.id}
              </p>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}