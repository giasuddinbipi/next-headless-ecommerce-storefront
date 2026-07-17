export type WooCommerceProduct = {
  id: number;
  name: string;
  slug: string;
  price: string;
  regular_price: string;
  sale_price: string;
  stock_status: "instock" | "outofstock" | "onbackorder";
};

function getEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export async function getProducts(): Promise<WooCommerceProduct[]> {
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

  const credentials = Buffer.from(
    `${consumerKey}:${consumerSecret}`,
  ).toString("base64");

  const endpoint = new URL(
    "/wp-json/wc/v3/products",
    storeUrl,
  );

  endpoint.searchParams.set("status", "publish");
  endpoint.searchParams.set("per_page", "12");

  const response = await fetch(endpoint.toString(), {
    headers: {
      Authorization: `Basic ${credentials}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorBody = await response.text();

    throw new Error(
      `WooCommerce API error ${response.status}: ${errorBody}`,
    );
  }

  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("WooCommerce returned an invalid product response.");
  }

  return data as WooCommerceProduct[];
}