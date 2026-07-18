import type { Metadata } from "next";

import Link from "next/link";

import ProductCard from "@/components/products/ProductCard";

import {
  getProductCategories,
  getProductsPage,
  type ProductSort,
  type WooCommerceProduct,
  type WooCommerceProductCategory,
} from "@/lib/woocommerce";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Browse products, search the store, filter by category and sort by price, popularity or rating.",
};

type ShopPageProps = {
  searchParams: Promise<{
    page?: string | string[];
    search?: string | string[];
    category?: string | string[];
    sort?: string | string[];
  }>;
};

type PaginationItem =
  | number
  | "ellipsis-left"
  | "ellipsis-right";

const productsPerPage = 12;

const validSortValues: ProductSort[] = [
  "latest",
  "oldest",
  "price-asc",
  "price-desc",
  "popularity",
  "rating",
];

function getFirstSearchParam(
  value: string | string[] | undefined,
): string {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function parsePositiveInteger(
  value: string,
  fallback: number,
): number {
  const parsedValue = Number(value);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < 1
  ) {
    return fallback;
  }

  return parsedValue;
}

function normalizeSearch(value: string): string {
  return value.trim().slice(0, 100);
}

function normalizeCategory(
  value: string,
): number | undefined {
  const categoryId = Number(value);

  if (
    !Number.isInteger(categoryId) ||
    categoryId < 1
  ) {
    return undefined;
  }

  return categoryId;
}

function normalizeSort(value: string): ProductSort {
  if (
    validSortValues.includes(
      value as ProductSort,
    )
  ) {
    return value as ProductSort;
  }

  return "latest";
}

function getSortLabel(
  sort: ProductSort,
): string {
  switch (sort) {
    case "oldest":
      return "Oldest first";

    case "price-asc":
      return "Price: low to high";

    case "price-desc":
      return "Price: high to low";

    case "popularity":
      return "Most popular";

    case "rating":
      return "Highest rated";

    case "latest":
    default:
      return "Latest products";
  }
}

function createShopUrl({
  page,
  search,
  category,
  sort,
}: {
  page?: number;
  search?: string;
  category?: number;
  sort?: ProductSort;
}): string {
  const params = new URLSearchParams();

  if (page && page > 1) {
    params.set("page", String(page));
  }

  if (search) {
    params.set("search", search);
  }

  if (category) {
    params.set(
      "category",
      String(category),
    );
  }

  if (sort && sort !== "latest") {
    params.set("sort", sort);
  }

  const queryString = params.toString();

  return queryString
    ? `/shop?${queryString}`
    : "/shop";
}

function getPaginationItems(
  currentPage: number,
  totalPages: number,
): PaginationItem[] {
  if (totalPages <= 7) {
    return Array.from(
      { length: totalPages },
      (_, index) => index + 1,
    );
  }

  const items: PaginationItem[] = [1];

  if (currentPage > 4) {
    items.push("ellipsis-left");
  }

  const startPage = Math.max(
    2,
    currentPage - 1,
  );

  const endPage = Math.min(
    totalPages - 1,
    currentPage + 1,
  );

  for (
    let page = startPage;
    page <= endPage;
    page += 1
  ) {
    items.push(page);
  }

  if (currentPage < totalPages - 3) {
    items.push("ellipsis-right");
  }

  items.push(totalPages);

  return items;
}

export default async function ShopPage({
  searchParams,
}: ShopPageProps) {
  const resolvedSearchParams =
    await searchParams;

  const requestedPage =
    parsePositiveInteger(
      getFirstSearchParam(
        resolvedSearchParams.page,
      ),
      1,
    );

  const search = normalizeSearch(
    getFirstSearchParam(
      resolvedSearchParams.search,
    ),
  );

  const category = normalizeCategory(
    getFirstSearchParam(
      resolvedSearchParams.category,
    ),
  );

  const sort = normalizeSort(
    getFirstSearchParam(
      resolvedSearchParams.sort,
    ),
  );

  let products: WooCommerceProduct[] = [];
  let categories:
    WooCommerceProductCategory[] = [];

  let totalProducts = 0;
  let totalPages = 1;
  let currentPage = requestedPage;

  let productsError = "";
  let categoriesError = "";

  try {
    categories =
      await getProductCategories();
  } catch (error) {
    console.error(
      "Shop categories loading failed:",
      error,
    );

    categoriesError =
      "Product categories could not be loaded.";
  }

  try {
    const result =
      await getProductsPage({
        page: requestedPage,
        perPage: productsPerPage,
        search: search || undefined,
        category,
        sort,
      });

    products = result.products;
    totalProducts =
      result.totalProducts;
    totalPages = result.totalPages;
    currentPage = result.currentPage;
  } catch (error) {
    console.error(
      "Shop products loading failed:",
      error,
    );

    productsError =
      error instanceof Error
        ? error.message
        : "Products could not be loaded.";
  }

  const selectedCategory =
    categories.find(
      (item) => item.id === category,
    );

  const hasActiveFilters = Boolean(
    search ||
      category ||
      sort !== "latest",
  );

  const paginationItems =
    getPaginationItems(
      currentPage,
      totalPages,
    );

  const resultStart =
    totalProducts > 0
      ? (currentPage - 1) *
          productsPerPage +
        1
      : 0;

  const resultEnd =
    totalProducts > 0
      ? Math.min(
          currentPage *
            productsPerPage,
          totalProducts,
        )
      : 0;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-7xl">
        {/* Page heading */}
        <header className="rounded-3xl bg-gray-950 px-6 py-10 text-white sm:px-10 sm:py-14">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">
            Product collection
          </p>

          <h1 className="mt-4 text-4xl font-bold sm:text-5xl">
            Shop
          </h1>

          <p className="mt-4 max-w-2xl text-lg leading-8 text-gray-300">
            Search products, browse
            categories and discover the
            latest items available in our
            store.
          </p>
        </header>

        {/* Search and filters */}
        <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          <form
            method="GET"
            action="/shop"
            className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px_220px_auto]"
          >
            <div>
              <label
                htmlFor="shop-search"
                className="mb-2 block text-sm font-semibold text-gray-800"
              >
                Search products
              </label>

              <input
                id="shop-search"
                name="search"
                type="search"
                defaultValue={search}
                maxLength={100}
                placeholder="Search by product name"
                className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-900"
              />
            </div>

            <div>
              <label
                htmlFor="shop-category"
                className="mb-2 block text-sm font-semibold text-gray-800"
              >
                Category
              </label>

              <select
                id="shop-category"
                name="category"
                defaultValue={
                  category
                    ? String(category)
                    : ""
                }
                className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-gray-900 outline-none transition focus:border-gray-900"
              >
                <option value="">
                  All categories
                </option>

                {categories.map(
                  (item) => (
                    <option
                      key={item.id}
                      value={item.id}
                    >
                      {item.name}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div>
              <label
                htmlFor="shop-sort"
                className="mb-2 block text-sm font-semibold text-gray-800"
              >
                Sort by
              </label>

              <select
                id="shop-sort"
                name="sort"
                defaultValue={sort}
                className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-gray-900 outline-none transition focus:border-gray-900"
              >
                <option value="latest">
                  Latest products
                </option>

                <option value="oldest">
                  Oldest first
                </option>

                <option value="price-asc">
                  Price: low to high
                </option>

                <option value="price-desc">
                  Price: high to low
                </option>

                <option value="popularity">
                  Most popular
                </option>

                <option value="rating">
                  Highest rated
                </option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                className="h-12 w-full rounded-xl bg-gray-900 px-6 font-semibold text-white transition hover:bg-gray-700 lg:w-auto"
              >
                Apply filters
              </button>
            </div>
          </form>

          {categoriesError && (
            <p className="mt-4 text-sm text-yellow-700">
              {categoriesError}
            </p>
          )}

          {hasActiveFilters && (
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-5">
              <span className="text-sm font-semibold text-gray-700">
                Active filters:
              </span>

              {search && (
                <span className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700">
                  Search: {search}
                </span>
              )}

              {selectedCategory && (
                <span className="rounded-full bg-purple-50 px-3 py-1.5 text-sm font-medium text-purple-700">
                  Category:{" "}
                  {selectedCategory.name}
                </span>
              )}

              {sort !== "latest" && (
                <span className="rounded-full bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700">
                  Sort:{" "}
                  {getSortLabel(sort)}
                </span>
              )}

              <Link
                href="/shop"
                className="ml-1 text-sm font-semibold text-red-600 underline underline-offset-4 transition hover:text-red-700"
              >
                Clear all
              </Link>
            </div>
          )}
        </section>

        {/* Products heading */}
        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                Browse products
              </p>

              <h2 className="mt-2 text-3xl font-bold text-gray-900">
                {selectedCategory
                  ? selectedCategory.name
                  : search
                    ? `Search results for “${search}”`
                    : "All products"}
              </h2>
            </div>

            {!productsError &&
              totalProducts > 0 && (
                <p className="text-sm text-gray-600">
                  Showing{" "}
                  <span className="font-semibold text-gray-900">
                    {resultStart}–
                    {resultEnd}
                  </span>{" "}
                  of{" "}
                  <span className="font-semibold text-gray-900">
                    {totalProducts}
                  </span>{" "}
                  products
                </p>
              )}
          </div>

          {/* Error state */}
          {productsError && (
            <div
              role="alert"
              className="mt-8 rounded-2xl border border-red-200 bg-red-50 p-7"
            >
              <h3 className="text-lg font-bold text-red-800">
                Products unavailable
              </h3>

              <p className="mt-2 text-sm leading-6 text-red-700">
                {productsError}
              </p>

              <Link
                href="/shop"
                className="mt-5 inline-flex rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-800"
              >
                Reload shop
              </Link>
            </div>
          )}

          {/* Empty state */}
          {!productsError &&
            products.length === 0 && (
              <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 text-2xl">
                  ⌕
                </div>

                <h3 className="mt-5 text-2xl font-bold text-gray-900">
                  No products found
                </h3>

                <p className="mx-auto mt-3 max-w-lg leading-7 text-gray-600">
                  No products matched the
                  selected search and
                  filter options. Try a
                  different keyword or
                  category.
                </p>

                <Link
                  href="/shop"
                  className="mt-6 inline-flex rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white transition hover:bg-gray-700"
                >
                  View all products
                </Link>
              </div>
            )}

          {/* Product grid */}
          {!productsError &&
            products.length > 0 && (
              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {products.map(
                  (product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                    />
                  ),
                )}
              </div>
            )}
        </section>

        {/* Pagination */}
        {!productsError &&
          totalPages > 1 && (
            <nav
              aria-label="Shop pagination"
              className="mt-12 flex flex-wrap items-center justify-center gap-2"
            >
              {currentPage > 1 ? (
                <Link
                  href={createShopUrl({
                    page:
                      currentPage - 1,
                    search,
                    category,
                    sort,
                  })}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 transition hover:border-gray-900 hover:bg-gray-900 hover:text-white"
                >
                  Previous
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-xl border border-gray-200 bg-gray-100 px-4 text-sm font-semibold text-gray-400"
                >
                  Previous
                </span>
              )}

              {paginationItems.map(
                (item) => {
                  if (
                    item ===
                      "ellipsis-left" ||
                    item ===
                      "ellipsis-right"
                  ) {
                    return (
                      <span
                        key={item}
                        aria-hidden="true"
                        className="inline-flex h-11 min-w-11 items-center justify-center text-gray-500"
                      >
                        …
                      </span>
                    );
                  }

                  const isCurrentPage =
                    item === currentPage;

                  return (
                    <Link
                      key={item}
                      href={createShopUrl({
                        page: item,
                        search,
                        category,
                        sort,
                      })}
                      aria-current={
                        isCurrentPage
                          ? "page"
                          : undefined
                      }
                      className={[
                        "inline-flex h-11 min-w-11 items-center justify-center rounded-xl border px-3 text-sm font-semibold transition",
                        isCurrentPage
                          ? "border-gray-900 bg-gray-900 text-white"
                          : "border-gray-300 bg-white text-gray-800 hover:border-gray-900 hover:bg-gray-900 hover:text-white",
                      ].join(" ")}
                    >
                      {item}
                    </Link>
                  );
                },
              )}

              {currentPage <
              totalPages ? (
                <Link
                  href={createShopUrl({
                    page:
                      currentPage + 1,
                    search,
                    category,
                    sort,
                  })}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-800 transition hover:border-gray-900 hover:bg-gray-900 hover:text-white"
                >
                  Next
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="inline-flex min-h-11 cursor-not-allowed items-center justify-center rounded-xl border border-gray-200 bg-gray-100 px-4 text-sm font-semibold text-gray-400"
                >
                  Next
                </span>
              )}
            </nav>
          )}
      </div>
    </main>
  );
}