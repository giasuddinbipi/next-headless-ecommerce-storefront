import "server-only";

const EMAIL_REQUEST_TIMEOUT_MS =
  12_000;

type UnknownRecord =
  Record<string, unknown>;

export class OrderEmailError extends Error {
  status: number;
  code: string;

  constructor(
    message: string,
    status = 500,
    code = "order_email_failed",
  ) {
    super(message);

    this.name = "OrderEmailError";
    this.status = status;
    this.code = code;
  }
}

function isObject(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getRequiredEnvironmentValue(
  name: string,
): string {
  const value =
    process.env[name]?.trim();

  if (!value) {
    throw new OrderEmailError(
      `Missing required environment variable: ${name}`,
      500,
      "missing_email_configuration",
    );
  }

  return value;
}

function getWooCommerceApiBaseUrl(
  rawStoreUrl: string,
): string {
  const normalizedUrl =
    rawStoreUrl
      .trim()
      .replace(/\/+$/, "");

  /*
   * WOOCOMMERCE_URL দুইভাবে থাকতে পারে:
   *
   * https://example.com
   *
   * অথবা
   *
   * https://example.com/wp-json/wc/v3
   */
  if (
    normalizedUrl.endsWith(
      "/wp-json/wc/v3",
    )
  ) {
    return normalizedUrl;
  }

  return `${normalizedUrl}/wp-json/wc/v3`;
}

async function readResponseData(
  response: Response,
): Promise<unknown> {
  const contentType =
    response.headers.get(
      "content-type",
    ) ?? "";

  if (
    contentType.includes(
      "application/json",
    )
  ) {
    return response
      .json()
      .catch(() => null);
  }

  const text =
    await response
      .text()
      .catch(() => "");

  return text || null;
}

function getWooCommerceErrorMessage(
  data: unknown,
): string | null {
  if (
    isObject(data) &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  if (
    typeof data === "string" &&
    data.trim()
  ) {
    return data.trim();
  }

  return null;
}

export async function sendWooCommerceOrderDetailsEmail(
  orderId: number,
): Promise<void> {
  if (
    !Number.isInteger(orderId) ||
    orderId < 1
  ) {
    throw new OrderEmailError(
      "A valid order ID is required.",
      400,
      "invalid_order_id",
    );
  }

  const storeUrl =
    getRequiredEnvironmentValue(
      "WOOCOMMERCE_URL",
    );

  const consumerKey =
    getRequiredEnvironmentValue(
      "WOOCOMMERCE_CONSUMER_KEY",
    );

  const consumerSecret =
    getRequiredEnvironmentValue(
      "WOOCOMMERCE_CONSUMER_SECRET",
    );

  const apiBaseUrl =
    getWooCommerceApiBaseUrl(
      storeUrl,
    );

  const credentials =
    Buffer.from(
      `${consumerKey}:${consumerSecret}`,
      "utf8",
    ).toString("base64");

  const controller =
    new AbortController();

  const timeout =
    setTimeout(() => {
      controller.abort();
    }, EMAIL_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${apiBaseUrl}/orders/${orderId}/actions/send_order_details`,
      {
        method: "POST",

        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",

          Authorization:
            `Basic ${credentials}`,
        },

        /*
         * Order-এর billing email আগে থেকেই আছে।
         * তাই email parameter পাঠাতে হচ্ছে না।
         */
        body: JSON.stringify({}),

        cache: "no-store",

        signal:
          controller.signal,
      },
    );

    const data =
      await readResponseData(
        response,
      );

    if (!response.ok) {
      const wooMessage =
        getWooCommerceErrorMessage(
          data,
        );

      if (
        response.status === 404
      ) {
        throw new OrderEmailError(
          wooMessage ||
            "WooCommerce order email endpoint was not found. WooCommerce 9.5 or newer is required.",
          404,
          "email_endpoint_not_found",
        );
      }

      throw new OrderEmailError(
        wooMessage ||
          "WooCommerce could not send the order confirmation email.",
        response.status,
        "woocommerce_email_failed",
      );
    }
  } catch (error) {
    if (
      error instanceof
      OrderEmailError
    ) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name ===
        "AbortError"
    ) {
      throw new OrderEmailError(
        "The WooCommerce email request timed out.",
        504,
        "email_timeout",
      );
    }

    throw new OrderEmailError(
      error instanceof Error
        ? error.message
        : "The order confirmation email could not be sent.",
      502,
      "order_email_failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}