export type WooCommerceImage = {
  id: number;
  src: string;
  name: string;
  alt: string;
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

  stock_status: "instock" | "outofstock" | "onbackorder";

  images: WooCommerceImage[];
};

function getEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function getWooCommerceCredentials() {
  const storeUrl = getEnvironmentVariable("WOOCOMMERCE_URL").replace(
    /\/$/,
    "",
  );

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

async function wooCommerceFetch(
  endpoint: URL,
): Promise<unknown> {
  const { authorization } = getWooCommerceCredentials();

  const response = await fetch(endpoint.toString(), {
    headers: {
      Authorization: `Basic ${authorization}`,
      Accept: "application/json",
    },

    /*
     * During development, this ensures that new WooCommerce
     * changes appear immediately.
     */
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `WooCommerce API error ${response.status}: ${errorBody}`,
    );
  }

  return response.json();
}

export async function getProducts(): Promise<
  WooCommerceProduct[]
> {
  const { storeUrl } = getWooCommerceCredentials();

  const endpoint = new URL(
    "/wp-json/wc/v3/products",
    storeUrl,
  );

  endpoint.searchParams.set("status", "publish");
  endpoint.searchParams.set("per_page", "12");
  endpoint.searchParams.set("orderby", "date");
  endpoint.searchParams.set("order", "desc");

  const data = await wooCommerceFetch(endpoint);

  if (!Array.isArray(data)) {
    throw new Error(
      "WooCommerce returned an invalid products response.",
    );
  }

  return data as WooCommerceProduct[];
}

export async function getProductBySlug(
  slug: string,
): Promise<WooCommerceProduct | null> {
  const { storeUrl } = getWooCommerceCredentials();

  const endpoint = new URL(
    "/wp-json/wc/v3/products",
    storeUrl,
  );

  endpoint.searchParams.set("slug", slug);
  endpoint.searchParams.set("status", "publish");

  const data = await wooCommerceFetch(endpoint);

  if (!Array.isArray(data)) {
    throw new Error(
      "WooCommerce returned an invalid product response.",
    );
  }

  const products = data as WooCommerceProduct[];

  return products[0] ?? null;
}