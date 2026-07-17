import type { Metadata } from "next";

import Link from "next/link";

import ProductCard from "@/components/products/ProductCard";

import {
  getProductCategories,
  getProductsPage,
  type ProductSort,
  type ProductsPageResult,
  type WooCommerceProductCategory,
} from "@/lib/woocommerce";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Browse and search products from our online store.",
};

type ShopSearchParams = {
  q?: string | string[];
  category?: string | string[];
  sort?: string | string[];
  page?: string | string[];
};

type ShopPageProps = {
  searchParams: Promise<ShopSearchParams>;
};

function getFirstValue(
  value: string | string[] | undefined,
): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function getSafePage(value: string): number {
  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 1
  ) {
    return 1;
  }

  return parsed;
}

function getSafeCategoryId(
  value: string,
): number | undefined {
  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed < 1
  ) {
    return undefined;
  }

  return parsed;
}

function getSafeSort(
  value: string,
): ProductSort {
  const validSorts: ProductSort[] = [
    "newest",
    "oldest",
    "price-low",
    "price-high",
    "popular",
    "rating",
  ];

  if (
    validSorts.includes(
      value as ProductSort,
    )
  ) {
    return value as ProductSort;
  }

  return "newest";
}

function createShopUrl({
  query,
  category,
  sort,
  page,
}: {
  query: string;
  category?: number;
  sort: ProductSort;
  page: number;
}): string {
  const parameters =
    new URLSearchParams();

  if (query) {
    parameters.set("q", query);
  }

  if (category) {
    parameters.set(
      "category",
      String(category),
    );
  }

  if (sort !== "newest") {
    parameters.set("sort", sort);
  }

  if (page > 1) {
    parameters.set(
      "page",
      String(page),
    );
  }

  const queryString =
    parameters.toString();

  return queryString
    ? `/shop?${queryString}`
    : "/shop";
}

export default async function ShopPage({
  searchParams,
}: ShopPageProps) {
  const parameters =
    await searchParams;

  const query = getFirstValue(
    parameters.q,
  ).trim();

  const categoryId =
    getSafeCategoryId(
      getFirstValue(
        parameters.category,
      ),
    );

  const sort = getSafeSort(
    getFirstValue(parameters.sort),
  );

  const requestedPage = getSafePage(
    getFirstValue(parameters.page),
  );

  let productsResult: ProductsPageResult = {
    products: [],
    page: requestedPage,
    total: 0,
    totalPages: 0,
  };

  let categories: WooCommerceProductCategory[] =
    [];

  let errorMessage = "";

  try {
    [productsResult, categories] =
      await Promise.all([
        getProductsPage({
          page: requestedPage,
          perPage: 12,
          search: query,
          categoryId,
          sort,
        }),

        getProductCategories(),
      ]);
  } catch (error) {
    errorMessage =
      error instanceof Error
        ? error.message
        : "Products could not be loaded.";
  }

  const {
    products,
    total,
    totalPages,
    page,
  } = productsResult;

  const selectedCategory =
    categories.find(
      (category) =>
        category.id === categoryId,
    );

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Product catalogue
          </p>

          <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">
            Shop
          </h1>

          <p className="mt-3 text-gray-600">
            Search, filter and browse all
            available products.
          </p>
        </header>

        <form
          action="/shop"
          method="get"
          className="mt-8 grid gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm md:grid-cols-[1fr_220px_220px_auto]"
        >
          <div>
            <label
              htmlFor="shop-search"
              className="mb-2 block text-sm font-semibold text-gray-700"
            >
              Search products
            </label>

            <input
              id="shop-search"
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Product name or keyword"
              className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-700"
            />
          </div>

          <div>
            <label
              htmlFor="shop-category"
              className="mb-2 block text-sm font-semibold text-gray-700"
            >
              Category
            </label>

            <select
              id="shop-category"
              name="category"
              defaultValue={
                categoryId
                  ? String(categoryId)
                  : ""
              }
              className="h-12 w-full rounded-lg border border-gray-300 bg-white px-4 outline-none focus:border-gray-700"
            >
              <option value="">
                All categories
              </option>

              {categories.map(
                (category) => (
                  <option
                    key={category.id}
                    value={category.id}
                  >
                    {category.name} (
                    {category.count})
                  </option>
                ),
              )}
            </select>
          </div>

          <div>
            <label
              htmlFor="shop-sort"
              className="mb-2 block text-sm font-semibold text-gray-700"
            >
              Sort by
            </label>

            <select
              id="shop-sort"
              name="sort"
              defaultValue={sort}
              className="h-12 w-full rounded-lg border border-gray-300 bg-white px-4 outline-none focus:border-gray-700"
            >
              <option value="newest">
                Newest first
              </option>

              <option value="oldest">
                Oldest first
              </option>

              <option value="price-low">
                Price: Low to high
              </option>

              <option value="price-high">
                Price: High to low
              </option>

              <option value="popular">
                Most popular
              </option>

              <option value="rating">
                Highest rated
              </option>
            </select>
          </div>

          <button
            type="submit"
            className="self-end rounded-lg bg-gray-900 px-6 py-3 font-semibold text-white transition hover:bg-gray-700"
          >
            Apply
          </button>
        </form>

        {(query ||
          categoryId ||
          sort !== "newest") && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <span className="text-gray-600">
              Active filters:
            </span>

            {query && (
              <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-800">
                Search: {query}
              </span>
            )}

            {selectedCategory && (
              <span className="rounded-full bg-green-100 px-3 py-1 text-green-800">
                Category:{" "}
                {selectedCategory.name}
              </span>
            )}

            <Link
              href="/shop"
              className="font-semibold text-red-600 hover:text-red-800"
            >
              Clear filters
            </Link>
          </div>
        )}

        {errorMessage && (
          <div className="mt-8 rounded-xl border border-red-300 bg-red-50 p-5 text-red-700">
            <p className="font-semibold">
              Products could not be loaded
            </p>

            <p className="mt-2 break-words text-sm">
              {errorMessage}
            </p>
          </div>
        )}

        {!errorMessage && (
          <>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
              <p className="text-gray-600">
                <span className="font-semibold text-gray-900">
                  {total}
                </span>{" "}
                {total === 1
                  ? "product"
                  : "products"}{" "}
                found
              </p>

              {totalPages > 0 && (
                <p className="text-sm text-gray-500">
                  Page {page} of{" "}
                  {totalPages}
                </p>
              )}
            </div>

            {products.length === 0 ? (
              <div className="mt-8 rounded-2xl border bg-white p-10 text-center">
                <h2 className="text-2xl font-bold text-gray-900">
                  No products found
                </h2>

                <p className="mt-3 text-gray-600">
                  Try a different search or
                  category.
                </p>

                <Link
                  href="/shop"
                  className="mt-6 inline-block rounded-lg bg-gray-900 px-6 py-3 font-semibold text-white"
                >
                  View all products
                </Link>
              </div>
            ) : (
              <section className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {products.map(
                  (product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                    />
                  ),
                )}
              </section>
            )}

            {totalPages > 1 && (
              <nav
                aria-label="Product pagination"
                className="mt-12 flex items-center justify-center gap-3"
              >
                {page > 1 ? (
                  <Link
                    href={createShopUrl({
                      query,
                      category: categoryId,
                      sort,
                      page: page - 1,
                    })}
                    className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-100"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span className="cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-5 py-3 text-sm font-semibold text-gray-400">
                    ← Previous
                  </span>
                )}

                <span className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-semibold text-white">
                  {page} / {totalPages}
                </span>

                {page < totalPages ? (
                  <Link
                    href={createShopUrl({
                      query,
                      category: categoryId,
                      sort,
                      page: page + 1,
                    })}
                    className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-100"
                  >
                    Next →
                  </Link>
                ) : (
                  <span className="cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-5 py-3 text-sm font-semibold text-gray-400">
                    Next →
                  </span>
                )}
              </nav>
            )}
          </>
        )}
      </div>
    </main>
  );
}