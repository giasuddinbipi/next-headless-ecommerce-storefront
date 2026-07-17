import "server-only";

export type WooCommerceCustomerAddress = {
  first_name: string;
  last_name: string;
  company: string;
  address_1: string;
  address_2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email?: string;
  phone?: string;
};

export type WooCommerceCustomer = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  username: string;

  billing: WooCommerceCustomerAddress;
  shipping: WooCommerceCustomerAddress;
};

export type UpdateCustomerAddressesInput = {
  billing: WooCommerceCustomerAddress;

  shipping: Omit<
    WooCommerceCustomerAddress,
    "email" | "phone"
  >;
};

function getRequiredEnvironmentVariable(
  name: string,
): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value;
}

function getWooCommerceConfiguration() {
  const storeUrl =
    getRequiredEnvironmentVariable(
      "WOOCOMMERCE_URL",
    ).replace(/\/+$/, "");

  const consumerKey =
    getRequiredEnvironmentVariable(
      "WOOCOMMERCE_CONSUMER_KEY",
    );

  const consumerSecret =
    getRequiredEnvironmentVariable(
      "WOOCOMMERCE_CONSUMER_SECRET",
    );

  return {
    storeUrl,
    consumerKey,
    consumerSecret,
  };
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

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function getWooCommerceErrorMessage(
  data: unknown,
): string {
  if (
    isObject(data) &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return "WooCommerce customer request failed.";
}

async function customerRequest(
  customerId: number,
  options?: {
    method?: "GET" | "PUT";
    body?: UpdateCustomerAddressesInput;
  },
): Promise<WooCommerceCustomer | null> {
  if (
    !Number.isInteger(customerId) ||
    customerId < 1
  ) {
    return null;
  }

  const {
    storeUrl,
    consumerKey,
    consumerSecret,
  } = getWooCommerceConfiguration();

  const endpoint = new URL(
    `/wp-json/wc/v3/customers/${customerId}`,
    storeUrl,
  );

  const method = options?.method ?? "GET";

  const response = await fetch(
    endpoint,
    {
      method,

      headers: {
        Accept: "application/json",

        Authorization:
          createAuthorizationHeader(
            consumerKey,
            consumerSecret,
          ),

        ...(method === "PUT"
          ? {
              "Content-Type":
                "application/json",
            }
          : {}),
      },

      body:
        method === "PUT" &&
        options?.body
          ? JSON.stringify(
              options.body,
            )
          : undefined,

      cache: "no-store",
    },
  );

  const data: unknown =
    await response
      .json()
      .catch(() => null);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(
      getWooCommerceErrorMessage(
        data,
      ),
    );
  }

  if (
    !isObject(data) ||
    typeof data.id !== "number" ||
    typeof data.email !== "string" ||
    !isObject(data.billing) ||
    !isObject(data.shipping)
  ) {
    throw new Error(
      "WooCommerce returned an invalid customer response.",
    );
  }

  return data as WooCommerceCustomer;
}

export async function getCustomerProfile(
  customerId: number,
): Promise<WooCommerceCustomer | null> {
  return customerRequest(
    customerId,
  );
}

export async function updateCustomerAddresses(
  customerId: number,
  input: UpdateCustomerAddressesInput,
): Promise<WooCommerceCustomer | null> {
  return customerRequest(
    customerId,
    {
      method: "PUT",
      body: input,
    },
  );
}