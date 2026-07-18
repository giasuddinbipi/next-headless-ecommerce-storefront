import "server-only";

/* =========================================================
   Product types
========================================================= */

export type WooCommerceStockStatus =
  | "instock"
  | "outofstock"
  | "onbackorder";

export type WooCommerceProductImage = {
  id: number;
  src: string;
  name: string;
  alt: string;
};

export type WooCommerceProductCategory = {
  id: number;
  name: string;
  slug: string;
};

export type WooCommerceProductTag = {
  id: number;
  name: string;
  slug: string;
};

export type WooCommerceProductAttribute = {
  id: number;
  name: string;
  position: number;
  visible: boolean;
  variation: boolean;
  options: string[];
};

export type WooCommerceVariationAttribute = {
  id: number;
  name: string;
  option: string;
};

export type WooCommerceProductDefaultAttribute = {
  id: number;
  name: string;
  option: string;
};

export type WooCommerceVariation = {
  id: number;

  date_created?: string;
  date_modified?: string;

  description?: string;
  permalink?: string;
  sku?: string;

  price: string;
  regular_price: string;
  sale_price: string;

  on_sale?: boolean;
  purchasable: boolean;

  virtual?: boolean;
  downloadable?: boolean;

  manage_stock?: boolean | "parent";
  stock_quantity?: number | null;
  stock_status: WooCommerceStockStatus;

  backorders?: string;
  backorders_allowed?: boolean;
  backordered?: boolean;

  weight?: string;

  image?: WooCommerceProductImage | null;

  attributes: WooCommerceVariationAttribute[];

  menu_order?: number;
};

export type WooCommerceProduct = {
  id: number;

  name: string;
  slug: string;
  permalink?: string;

  type: string;
  status?: string;
  featured?: boolean;
  catalog_visibility?: string;

  description: string;
  short_description: string;

  sku?: string;

  price: string;
  regular_price: string;
  sale_price: string;
  price_html?: string;

  on_sale?: boolean;
  purchasable?: boolean;

  average_rating: string;
  rating_count: number;

  related_ids: number[];

  manage_stock?: boolean;
  stock_quantity?: number | null;
  stock_status: WooCommerceStockStatus;

  backorders?: string;
  backorders_allowed?: boolean;
  backordered?: boolean;

  categories: WooCommerceProductCategory[];
  tags?: WooCommerceProductTag[];

  images: WooCommerceProductImage[];

  attributes: WooCommerceProductAttribute[];

  default_attributes?: WooCommerceProductDefaultAttribute[];

  variations?: number[];

  parent_id?: number;
  total_sales?: number;
  menu_order?: number;

  date_created?: string;
  date_modified?: string;
};

/* =========================================================
   Products listing and sorting types
========================================================= */

export type WooCommerceProductsResult = {
  products: WooCommerceProduct[];

  total: number;
  totalProducts: number;
  total_products: number;

  totalPages: number;
  total_pages: number;

  page: number;
  currentPage: number;
  current_page: number;

  perPage: number;

  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type GetProductsOptions = {
  page?: number;
  perPage?: number;

  search?: string;

  category?: number | string;

  include?: number[];
  exclude?: number[];

  featured?: boolean;
  onSale?: boolean;

  stockStatus?: WooCommerceStockStatus;

  minPrice?: number;
  maxPrice?: number;

  order?: "asc" | "desc";

  orderBy?:
    | "date"
    | "id"
    | "include"
    | "title"
    | "slug"
    | "price"
    | "popularity"
    | "rating"
    | "menu_order";
};

/*
 * Compatibility type used by src/app/shop/page.tsx.
 */
export type ProductSort =
  | "latest"
  | "newest"
  | "date"
  | "oldest"
  | "price-asc"
  | "price-desc"
  | "price-low"
  | "price-high"
  | "price-low-to-high"
  | "price-high-to-low"
  | "price_asc"
  | "price_desc"
  | "popularity"
  | "popular"
  | "rating";

export type ProductsPageResult = WooCommerceProductsResult;

export type GetProductsPageOptions = {
  page?: number;
  perPage?: number;

  search?: string;

  category?: number | string;
  categoryId?: number | string;

  sort?: ProductSort;

  include?: number[];
  exclude?: number[];

  featured?: boolean;
  onSale?: boolean;

  stockStatus?: WooCommerceStockStatus;

  minPrice?: number;
  maxPrice?: number;
};

/* =========================================================
   Order types
========================================================= */

export type WooCommerceOrderAddress = {
  first_name: string;
  last_name: string;

  company?: string;

  address_1: string;
  address_2?: string;

  city: string;
  state: string;
  postcode: string;
  country: string;

  email?: string;
  phone?: string;
};

export type WooCommerceOrderLineItemMetaData = {
  id: number;
  key: string;
  value: unknown;

  display_key?: string;
  display_value?: string;
};

export type WooCommerceOrderLineItem = {
  id: number;
  name: string;

  product_id: number;
  variation_id: number;

  quantity: number;

  subtotal: string;
  subtotal_tax?: string;

  total: string;
  total_tax?: string;

  meta_data?: WooCommerceOrderLineItemMetaData[];
};

export type WooCommerceOrderShippingLine = {
  id: number;

  method_title: string;
  method_id?: string;
  instance_id?: string;

  total: string;
  total_tax?: string;
};

export type WooCommerceOrderCouponLine = {
  id: number;
  code: string;
  discount: string;
  discount_tax?: string;
};

export type WooCommerceOrder = {
  id: number;
  number: string;

  status:
    | "pending"
    | "processing"
    | "on-hold"
    | "completed"
    | "cancelled"
    | "refunded"
    | "failed"
    | string;

  currency: string;

  discount_total?: string;
  discount_tax?: string;

  shipping_total?: string;
  shipping_tax?: string;

  cart_tax?: string;

  total: string;
  total_tax?: string;

  customer_id: number;

  date_created: string;
  date_modified?: string;
  date_completed?: string | null;
  date_paid?: string | null;

  payment_method: string;
  payment_method_title: string;

  billing: WooCommerceOrderAddress;
  shipping: WooCommerceOrderAddress;

  line_items: WooCommerceOrderLineItem[];

  shipping_lines: WooCommerceOrderShippingLine[];

  coupon_lines?: WooCommerceOrderCouponLine[];

  customer_note?: string;
};

export type CreateOrderInput = {
  customer_id?: number;

  payment_method: string;
  payment_method_title: string;

  set_paid: boolean;

  status?: "pending" | "processing" | "on-hold";

  billing: WooCommerceOrderAddress;
  shipping: WooCommerceOrderAddress;

  line_items: Array<{
    product_id: number;
    variation_id?: number;
    quantity: number;

    meta_data?: Array<{
      key: string;
      value: unknown;
    }>;
  }>;

  shipping_lines: Array<{
    method_id: string;
    method_title: string;
    total: string;
  }>;

  coupon_lines?: Array<{
    code: string;
  }>;

  customer_note?: string;

  meta_data?: Array<{
    key: string;
    value: unknown;
  }>;
};

/* =========================================================
   WooCommerce configuration
========================================================= */

type WooCommerceConfiguration = {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
};

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function getWooCommerceCredentials(): WooCommerceConfiguration {
  const storeUrl = getRequiredEnvironmentVariable(
    "WOOCOMMERCE_URL",
  ).replace(/\/+$/, "");

  const consumerKey = getRequiredEnvironmentVariable(
    "WOOCOMMERCE_CONSUMER_KEY",
  );

  const consumerSecret = getRequiredEnvironmentVariable(
    "WOOCOMMERCE_CONSUMER_SECRET",
  );

  return {
    storeUrl,
    consumerKey,
    consumerSecret,
  };
}

function createWooCommerceEndpoint(pathname: string): URL {
  const { storeUrl } = getWooCommerceCredentials();

  const normalizedPath = pathname.startsWith("/")
    ? pathname
    : `/${pathname}`;

  /*
   * String concatenation preserves a WordPress
   * subdirectory in WOOCOMMERCE_URL.
   *
   * Example:
   * https://example.com/wordpress
   */
  return new URL(`${storeUrl}${normalizedPath}`);
}

function createAuthorizationHeader(
  consumerKey: string,
  consumerSecret: string,
): string {
  const credentials = Buffer.from(
    `${consumerKey}:${consumerSecret}`,
    "utf8",
  ).toString("base64");

  return `Basic ${credentials}`;
}

/* =========================================================
   General helper functions
========================================================= */

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getWooCommerceErrorMessage(
  data: unknown,
  fallback: string,
): string {
  if (
    isObject(data) &&
    typeof data.message === "string" &&
    data.message.trim()
  ) {
    return data.message;
  }

  return fallback;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

export async function wooCommerceRequest(
  endpoint: URL,
  options: RequestInit = {},
): Promise<Response> {
  const { consumerKey, consumerSecret } =
    getWooCommerceCredentials();

  const headers = new Headers(options.headers);

  headers.set("Accept", "application/json");

  headers.set(
    "Authorization",
    createAuthorizationHeader(consumerKey, consumerSecret),
  );

  if (options.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(endpoint, {
    ...options,
    headers,
    cache: options.cache ?? "no-store",
  });
}

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1
  ) {
    return fallback;
  }

  return value;
}

function normalizeProductIds(
  productIds: number[],
  maximumItems = 100,
): number[] {
  return Array.from(
    new Set(
      productIds.filter(
        (productId) =>
          Number.isInteger(productId) && productId > 0,
      ),
    ),
  ).slice(0, maximumItems);
}

function getProductsSortConfiguration(sort?: ProductSort): {
  orderBy: GetProductsOptions["orderBy"];
  order: GetProductsOptions["order"];
} {
  switch (sort) {
    case "oldest":
      return {
        orderBy: "date",
        order: "asc",
      };

    case "price-asc":
    case "price-low":
    case "price-low-to-high":
    case "price_asc":
      return {
        orderBy: "price",
        order: "asc",
      };

    case "price-desc":
    case "price-high":
    case "price-high-to-low":
    case "price_desc":
      return {
        orderBy: "price",
        order: "desc",
      };

    case "popularity":
    case "popular":
      return {
        orderBy: "popularity",
        order: "desc",
      };

    case "rating":
      return {
        orderBy: "rating",
        order: "desc",
      };

    case "latest":
    case "newest":
    case "date":
    default:
      return {
        orderBy: "date",
        order: "desc",
      };
  }
}

/* =========================================================
   Products
========================================================= */

export async function getProducts(
  options: GetProductsOptions = {},
): Promise<WooCommerceProductsResult> {
  const page = normalizePositiveInteger(options.page, 1);

  const perPage = Math.min(
    normalizePositiveInteger(options.perPage, 12),
    100,
  );

  const endpoint = createWooCommerceEndpoint(
    "/wp-json/wc/v3/products",
  );

  endpoint.searchParams.set("status", "publish");
  endpoint.searchParams.set("page", String(page));
  endpoint.searchParams.set("per_page", String(perPage));

  endpoint.searchParams.set(
    "orderby",
    options.orderBy ?? "date",
  );

  endpoint.searchParams.set(
    "order",
    options.order ?? "desc",
  );

  const search = options.search?.trim();

  if (search) {
    endpoint.searchParams.set("search", search);
  }

  if (
    options.category !== undefined &&
    String(options.category).trim()
  ) {
    endpoint.searchParams.set(
      "category",
      String(options.category),
    );
  }

  const include = normalizeProductIds(options.include ?? []);

  if (include.length > 0) {
    endpoint.searchParams.set("include", include.join(","));
  }

  const exclude = normalizeProductIds(options.exclude ?? []);

  if (exclude.length > 0) {
    endpoint.searchParams.set("exclude", exclude.join(","));
  }

  if (typeof options.featured === "boolean") {
    endpoint.searchParams.set(
      "featured",
      String(options.featured),
    );
  }

  if (typeof options.onSale === "boolean") {
    endpoint.searchParams.set(
      "on_sale",
      String(options.onSale),
    );
  }

  if (options.stockStatus) {
    endpoint.searchParams.set(
      "stock_status",
      options.stockStatus,
    );
  }

  if (
    typeof options.minPrice === "number" &&
    Number.isFinite(options.minPrice) &&
    options.minPrice >= 0
  ) {
    endpoint.searchParams.set(
      "min_price",
      String(options.minPrice),
    );
  }

  if (
    typeof options.maxPrice === "number" &&
    Number.isFinite(options.maxPrice) &&
    options.maxPrice >= 0
  ) {
    endpoint.searchParams.set(
      "max_price",
      String(options.maxPrice),
    );
  }

  const response = await wooCommerceRequest(endpoint);

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      getWooCommerceErrorMessage(
        data,
        `WooCommerce products request failed with status ${response.status}.`,
      ),
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "WooCommerce returned an invalid products response.",
    );
  }

  const totalHeader = response.headers.get("x-wp-total");

  const totalPagesHeader = response.headers.get(
    "x-wp-totalpages",
  );

  const parsedTotal = Number(totalHeader ?? data.length);

  const parsedTotalPages = Number(totalPagesHeader ?? 1);

  const total = Number.isFinite(parsedTotal)
    ? parsedTotal
    : data.length;

  const totalPages =
    Number.isFinite(parsedTotalPages) && parsedTotalPages > 0
      ? parsedTotalPages
      : 1;

  return {
    products: data as WooCommerceProduct[],

    total,
    totalProducts: total,
    total_products: total,

    totalPages,
    total_pages: totalPages,

    page,
    currentPage: page,
    current_page: page,

    perPage,

    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/*
 * Compatibility wrapper used by the shop page.
 */
export async function getProductsPage(
  options: GetProductsPageOptions = {},
): Promise<ProductsPageResult> {
  const { orderBy, order } = getProductsSortConfiguration(
    options.sort,
  );

  return getProducts({
    page: options.page,
    perPage: options.perPage,

    search: options.search,

    category:
      options.category !== undefined
        ? options.category
        : options.categoryId,

    include: options.include,
    exclude: options.exclude,

    featured: options.featured,
    onSale: options.onSale,

    stockStatus: options.stockStatus,

    minPrice: options.minPrice,
    maxPrice: options.maxPrice,

    orderBy,
    order,
  });
}

export async function getProductBySlug(
  slug: string,
): Promise<WooCommerceProduct | null> {
  const normalizedSlug = slug.trim();

  if (!normalizedSlug) {
    return null;
  }

  const endpoint = createWooCommerceEndpoint(
    "/wp-json/wc/v3/products",
  );

  endpoint.searchParams.set("slug", normalizedSlug);
  endpoint.searchParams.set("status", "publish");
  endpoint.searchParams.set("per_page", "1");

  const response = await wooCommerceRequest(endpoint);

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      getWooCommerceErrorMessage(
        data,
        `WooCommerce product request failed with status ${response.status}.`,
      ),
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "WooCommerce returned an invalid product response.",
    );
  }

  const product = data[0];

  if (!product || !isObject(product)) {
    return null;
  }

  return product as WooCommerceProduct;
}

export async function getProductById(
  productId: number,
): Promise<WooCommerceProduct | null> {
  if (!Number.isInteger(productId) || productId < 1) {
    return null;
  }

  const endpoint = createWooCommerceEndpoint(
    `/wp-json/wc/v3/products/${productId}`,
  );

  const response = await wooCommerceRequest(endpoint);

  const data = await parseJsonResponse(response);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      getWooCommerceErrorMessage(
        data,
        `WooCommerce product request failed with status ${response.status}.`,
      ),
    );
  }

  if (!isObject(data) || typeof data.id !== "number") {
    throw new Error(
      "WooCommerce returned an invalid product response.",
    );
  }

  return data as WooCommerceProduct;
}

export async function getProductVariations(
  productId: number,
): Promise<WooCommerceVariation[]> {
  if (!Number.isInteger(productId) || productId < 1) {
    return [];
  }

  const variations: WooCommerceVariation[] = [];

  let page = 1;
  let totalPages = 1;

  do {
    const endpoint = createWooCommerceEndpoint(
      `/wp-json/wc/v3/products/${productId}/variations`,
    );

    endpoint.searchParams.set("page", String(page));
    endpoint.searchParams.set("per_page", "100");
    endpoint.searchParams.set("orderby", "menu_order");
    endpoint.searchParams.set("order", "asc");

    const response = await wooCommerceRequest(endpoint);

    const data = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(
        getWooCommerceErrorMessage(
          data,
          `WooCommerce variations request failed with status ${response.status}.`,
        ),
      );
    }

    if (!Array.isArray(data)) {
      throw new Error(
        "WooCommerce returned an invalid variations response.",
      );
    }

    variations.push(...(data as WooCommerceVariation[]));

    const parsedTotalPages = Number(
      response.headers.get("x-wp-totalpages") ?? 1,
    );

    totalPages =
      Number.isFinite(parsedTotalPages) && parsedTotalPages > 0
        ? parsedTotalPages
        : 1;

    page += 1;
  } while (page <= totalPages && page <= 20);

  return variations;
}

export async function getProductsByIds(
  productIds: number[],
): Promise<WooCommerceProduct[]> {
  const validIds = normalizeProductIds(productIds, 12);

  if (validIds.length === 0) {
    return [];
  }

  const result = await getProducts({
    include: validIds,
    perPage: validIds.length,
    orderBy: "include",
    order: "asc",
  });

  const productMap = new Map(
    result.products.map((product) => [product.id, product]),
  );

  /*
   * Preserve the original requested ID order.
   */
  return validIds
    .map((productId) => productMap.get(productId))
    .filter(
      (
        product,
      ): product is WooCommerceProduct => product !== undefined,
    );
}

/* =========================================================
   Product categories
========================================================= */

export async function getProductCategories(): Promise<
  WooCommerceProductCategory[]
> {
  const categories: WooCommerceProductCategory[] = [];

  let page = 1;
  let totalPages = 1;

  do {
    const endpoint = createWooCommerceEndpoint(
      "/wp-json/wc/v3/products/categories",
    );

    endpoint.searchParams.set("page", String(page));
    endpoint.searchParams.set("per_page", "100");
    endpoint.searchParams.set("hide_empty", "true");
    endpoint.searchParams.set("orderby", "name");
    endpoint.searchParams.set("order", "asc");

    const response = await wooCommerceRequest(endpoint);

    const data = await parseJsonResponse(response);

    if (!response.ok) {
      throw new Error(
        getWooCommerceErrorMessage(
          data,
          `WooCommerce categories request failed with status ${response.status}.`,
        ),
      );
    }

    if (!Array.isArray(data)) {
      throw new Error(
        "WooCommerce returned an invalid categories response.",
      );
    }

    categories.push(
      ...(data as WooCommerceProductCategory[]),
    );

    const parsedTotalPages = Number(
      response.headers.get("x-wp-totalpages") ?? 1,
    );

    totalPages =
      Number.isFinite(parsedTotalPages) && parsedTotalPages > 0
        ? parsedTotalPages
        : 1;

    page += 1;
  } while (page <= totalPages && page <= 20);

  return categories;
}

/*
 * Alias for files that import getCategories().
 */
export const getCategories = getProductCategories;

/* =========================================================
   Orders
========================================================= */

export async function createWooCommerceOrder(
  input: CreateOrderInput,
): Promise<WooCommerceOrder> {
  const endpoint = createWooCommerceEndpoint(
    "/wp-json/wc/v3/orders",
  );

  const response = await wooCommerceRequest(endpoint, {
    method: "POST",
    body: JSON.stringify(input),
  });

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      getWooCommerceErrorMessage(
        data,
        `WooCommerce order creation failed with status ${response.status}.`,
      ),
    );
  }

  if (
    !isObject(data) ||
    typeof data.id !== "number" ||
    typeof data.number !== "string" ||
    typeof data.total !== "string"
  ) {
    throw new Error(
      "WooCommerce returned an invalid order response.",
    );
  }

  return data as WooCommerceOrder;
}

export async function getCustomerOrders(
  customerId: number,
): Promise<WooCommerceOrder[]> {
  if (!Number.isInteger(customerId) || customerId < 1) {
    return [];
  }

  const endpoint = createWooCommerceEndpoint(
    "/wp-json/wc/v3/orders",
  );

  endpoint.searchParams.set("customer", String(customerId));
  endpoint.searchParams.set("status", "any");
  endpoint.searchParams.set("orderby", "date");
  endpoint.searchParams.set("order", "desc");
  endpoint.searchParams.set("per_page", "50");

  const response = await wooCommerceRequest(endpoint);

  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      getWooCommerceErrorMessage(
        data,
        `WooCommerce customer orders request failed with status ${response.status}.`,
      ),
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "WooCommerce returned an invalid orders response.",
    );
  }

  return data as WooCommerceOrder[];
}

export async function getCustomerOrderById(
  orderId: number,
  customerId: number,
): Promise<WooCommerceOrder | null> {
  if (
    !Number.isInteger(orderId) ||
    orderId < 1 ||
    !Number.isInteger(customerId) ||
    customerId < 1
  ) {
    return null;
  }

  const endpoint = createWooCommerceEndpoint(
    `/wp-json/wc/v3/orders/${orderId}`,
  );

  const response = await wooCommerceRequest(endpoint);

  const data = await parseJsonResponse(response);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      getWooCommerceErrorMessage(
        data,
        `WooCommerce order request failed with status ${response.status}.`,
      ),
    );
  }

  if (
    !isObject(data) ||
    typeof data.id !== "number" ||
    typeof data.customer_id !== "number"
  ) {
    throw new Error(
      "WooCommerce returned an invalid order response.",
    );
  }

  const order = data as WooCommerceOrder;

  /*
   * Security check:
   * a customer can access only their own order.
   */
  if (order.customer_id !== customerId) {
    return null;
  }

  return order;
}