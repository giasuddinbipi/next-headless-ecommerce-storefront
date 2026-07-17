import "server-only";

export type WooCommerceImage = {
  id: number;
  src: string;
  name: string;
  alt: string;
};

export type WooCommerceCategoryReference = {
  id: number;
  name: string;
  slug: string;
};

export type WooCommerceProduct = {
  id: number;
  name: string;
  slug: string;
  type: string;
  status: string;

  price: string;
  regular_price: string;
  sale_price: string;
  on_sale: boolean;

  description: string;
  short_description: string;

  purchasable: boolean;

  stock_status:
    | "instock"
    | "outofstock"
    | "onbackorder";

  manage_stock: boolean;
  stock_quantity: number | null;

  images: WooCommerceImage[];
  categories: WooCommerceCategoryReference[];
};

export type WooCommerceProductCategory = {
  id: number;
  name: string;
  slug: string;
  parent: number;
  description: string;
  count: number;
  image: WooCommerceImage | null;
};

export type ProductSort =
  | "newest"
  | "oldest"
  | "price-low"
  | "price-high"
  | "popular"
  | "rating";

export type ProductsPageResult = {
  products: WooCommerceProduct[];
  page: number;
  total: number;
  totalPages: number;
};

export type GetProductsPageOptions = {
  page?: number;
  perPage?: number;
  search?: string;
  categoryId?: number;
  sort?: ProductSort;
};

export type WooCommerceOrderAddress = {
  first_name: string;
  last_name: string;
  address_1: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
};

export type CreateOrderInput = {
  payment_method: string;
  payment_method_title: string;
  set_paid: boolean;
  status?: "pending" | "processing" | "on-hold";

  billing: WooCommerceOrderAddress;
  shipping: WooCommerceOrderAddress;

  line_items: Array<{
    product_id: number;
    quantity: number;
  }>;

  shipping_lines: Array<{
    method_id: string;
    method_title: string;
    total: string;
  }>;

  customer_note?: string;

  meta_data?: Array<{
    key: string;
    value: string;
  }>;
};

export type WooCommerceOrder = {
  id: number;
  number: string;
  status: string;
  currency: string;
  total: string;
};

function getEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value;
}

function getWooCommerceCredentials() {
  const storeUrl = getEnvironmentVariable(
    "WOOCOMMERCE_URL",
  ).replace(/\/$/, "");

  const consumerKey = getEnvironmentVariable(
    "WOOCOMMERCE_CONSUMER_KEY",
  );

  const consumerSecret = getEnvironmentVariable(
    "WOOCOMMERCE_CONSUMER_SECRET",
  );

  const authorization = Buffer.from(
    `${consumerKey}:${consumerSecret}`,
  ).toString("base64");

  return {
    storeUrl,
    authorization,
  };
}

async function wooCommerceRequest(
  endpoint: URL,
  options: RequestInit = {},
): Promise<Response> {
  const { authorization } =
    getWooCommerceCredentials();

  const headers = new Headers(options.headers);

  headers.set(
    "Authorization",
    `Basic ${authorization}`,
  );

  headers.set("Accept", "application/json");

  if (options.body) {
    headers.set(
      "Content-Type",
      "application/json",
    );
  }

  const response = await fetch(endpoint.toString(), {
    ...options,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `WooCommerce API error ${response.status}: ${errorBody}`,
    );
  }

  return response;
}

function getProductSorting(sort: ProductSort) {
  switch (sort) {
    case "oldest":
      return {
        orderby: "date",
        order: "asc",
      };

    case "price-low":
      return {
        orderby: "price",
        order: "asc",
      };

    case "price-high":
      return {
        orderby: "price",
        order: "desc",
      };

    case "popular":
      return {
        orderby: "popularity",
        order: "desc",
      };

    case "rating":
      return {
        orderby: "rating",
        order: "desc",
      };

    case "newest":
    default:
      return {
        orderby: "date",
        order: "desc",
      };
  }
}

export async function getProductsPage({
  page = 1,
  perPage = 12,
  search = "",
  categoryId,
  sort = "newest",
}: GetProductsPageOptions = {}): Promise<ProductsPageResult> {
  const { storeUrl } =
    getWooCommerceCredentials();

  const safePage = Math.max(
    1,
    Math.floor(page),
  );

  const safePerPage = Math.min(
    100,
    Math.max(1, Math.floor(perPage)),
  );

  const endpoint = new URL(
    "/wp-json/wc/v3/products",
    storeUrl,
  );

  const sorting = getProductSorting(sort);

  endpoint.searchParams.set(
    "status",
    "publish",
  );

  endpoint.searchParams.set(
    "page",
    String(safePage),
  );

  endpoint.searchParams.set(
    "per_page",
    String(safePerPage),
  );

  endpoint.searchParams.set(
    "orderby",
    sorting.orderby,
  );

  endpoint.searchParams.set(
    "order",
    sorting.order,
  );

  if (search.trim()) {
    endpoint.searchParams.set(
      "search",
      search.trim(),
    );
  }

  if (
    categoryId &&
    Number.isInteger(categoryId) &&
    categoryId > 0
  ) {
    endpoint.searchParams.set(
      "category",
      String(categoryId),
    );
  }

  const response =
    await wooCommerceRequest(endpoint);

  const data: unknown =
    await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      "WooCommerce returned an invalid products response.",
    );
  }

  const total = Number(
    response.headers.get("X-WP-Total") ?? 0,
  );

  const totalPages = Number(
    response.headers.get(
      "X-WP-TotalPages",
    ) ?? 0,
  );

  return {
    products: data as WooCommerceProduct[],
    page: safePage,
    total,
    totalPages,
  };
}

export async function getProducts(): Promise<
  WooCommerceProduct[]
> {
  const result = await getProductsPage({
    page: 1,
    perPage: 12,
    sort: "newest",
  });

  return result.products;
}

export async function getProductBySlug(
  slug: string,
): Promise<WooCommerceProduct | null> {
  const { storeUrl } =
    getWooCommerceCredentials();

  const endpoint = new URL(
    "/wp-json/wc/v3/products",
    storeUrl,
  );

  endpoint.searchParams.set(
    "slug",
    slug,
  );

  endpoint.searchParams.set(
    "status",
    "publish",
  );

  const response =
    await wooCommerceRequest(endpoint);

  const data: unknown =
    await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      "WooCommerce returned an invalid product response.",
    );
  }

  const products =
    data as WooCommerceProduct[];

  return products[0] ?? null;
}

export async function getProductCategories(): Promise<
  WooCommerceProductCategory[]
> {
  const { storeUrl } =
    getWooCommerceCredentials();

  const endpoint = new URL(
    "/wp-json/wc/v3/products/categories",
    storeUrl,
  );

  endpoint.searchParams.set(
    "per_page",
    "100",
  );

  endpoint.searchParams.set(
    "orderby",
    "name",
  );

  endpoint.searchParams.set(
    "order",
    "asc",
  );

  endpoint.searchParams.set(
    "hide_empty",
    "true",
  );

  const response =
    await wooCommerceRequest(endpoint);

  const data: unknown =
    await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      "WooCommerce returned an invalid categories response.",
    );
  }

  return data as WooCommerceProductCategory[];
}

export async function getProductsByIds(
  ids: number[],
): Promise<WooCommerceProduct[]> {
  if (ids.length === 0) {
    return [];
  }

  const uniqueIds = [
    ...new Set(ids),
  ].filter(
    (id) =>
      Number.isInteger(id) && id > 0,
  );

  const { storeUrl } =
    getWooCommerceCredentials();

  const endpoint = new URL(
    "/wp-json/wc/v3/products",
    storeUrl,
  );

  endpoint.searchParams.set(
    "include",
    uniqueIds.join(","),
  );

  endpoint.searchParams.set(
    "per_page",
    String(
      Math.min(uniqueIds.length, 100),
    ),
  );

  endpoint.searchParams.set(
    "status",
    "publish",
  );

  const response =
    await wooCommerceRequest(endpoint);

  const data: unknown =
    await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      "WooCommerce returned an invalid products response.",
    );
  }

  return data as WooCommerceProduct[];
}

export async function createWooCommerceOrder(
  order: CreateOrderInput,
): Promise<WooCommerceOrder> {
  const { storeUrl } =
    getWooCommerceCredentials();

  const endpoint = new URL(
    "/wp-json/wc/v3/orders",
    storeUrl,
  );

  const response =
    await wooCommerceRequest(endpoint, {
      method: "POST",
      body: JSON.stringify(order),
    });

  return response.json() as Promise<WooCommerceOrder>;
}