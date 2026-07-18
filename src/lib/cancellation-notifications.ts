import "server-only";

const NOTIFICATION_TIMEOUT_MS =
  15_000;

type UnknownRecord =
  Record<string, unknown>;

export type CancellationNotificationMode =
  | "native"
  | "bridge";

export type CancellationNotificationChannel = {
  status: string;
  triggered: boolean | null;
};

export type CancellationNotificationResult = {
  mode: CancellationNotificationMode;

  customer:
    CancellationNotificationChannel;

  admin:
    CancellationNotificationChannel;
};

export class CancellationNotificationError extends Error {
  status: number;
  code: string;

  constructor(
    message: string,
    status = 500,
    code = "cancellation_notification_failed",
  ) {
    super(message);

    this.name =
      "CancellationNotificationError";

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
    throw new CancellationNotificationError(
      `Missing required environment variable: ${name}`,
      500,
      "missing_notification_configuration",
    );
  }

  return value;
}

function getWordPressSiteUrl(
  rawUrl: string,
): string {
  const normalizedInput =
    rawUrl.includes("://")
      ? rawUrl
      : `https://${rawUrl}`;

  let url: URL;

  try {
    url = new URL(
      normalizedInput,
    );
  } catch {
    throw new CancellationNotificationError(
      "WOOCOMMERCE_URL is invalid.",
      500,
      "invalid_woocommerce_url",
    );
  }

  const normalizedPath =
    url.pathname
      .replace(/\/+$/, "");

  const apiSuffix =
    "/wp-json/wc/v3";

  if (
    normalizedPath.endsWith(
      apiSuffix,
    )
  ) {
    url.pathname =
      normalizedPath.slice(
        0,
        -apiSuffix.length,
      ) || "/";
  }

  url.search = "";
  url.hash = "";

  return url
    .toString()
    .replace(/\/+$/, "");
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

  return response
    .text()
    .catch(() => null);
}

function getResponseError(
  data: unknown,
): string | null {
  if (
    isObject(data) &&
    typeof data.message ===
      "string"
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

function parseChannel(
  value: unknown,
): CancellationNotificationChannel {
  if (!isObject(value)) {
    return {
      status: "unknown",
      triggered: null,
    };
  }

  return {
    status:
      typeof value.status ===
      "string"
        ? value.status
        : "unknown",

    triggered:
      typeof value.triggered ===
        "boolean"
        ? value.triggered
        : null,
  };
}

export async function sendCancellationNotifications(
  orderId: number,
): Promise<CancellationNotificationResult> {
  if (
    !Number.isInteger(orderId) ||
    orderId < 1
  ) {
    throw new CancellationNotificationError(
      "A valid order ID is required.",
      400,
      "invalid_order_id",
    );
  }

  const storeUrl =
    getRequiredEnvironmentValue(
      "WOOCOMMERCE_URL",
    );

  const sharedSecret =
    getRequiredEnvironmentValue(
      "HEADLESS_STORE_SHARED_SECRET",
    );

  const siteUrl =
    getWordPressSiteUrl(
      storeUrl,
    );

  const controller =
    new AbortController();

  const timeout =
    setTimeout(() => {
      controller.abort();
    }, NOTIFICATION_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${siteUrl}/wp-json/headless-store/v1/orders/${orderId}/cancellation-notifications`,
      {
        method: "POST",

        headers: {
          Accept:
            "application/json",

          "Content-Type":
            "application/json",

          "X-Headless-Store-Secret":
            sharedSecret,
        },

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
      throw new CancellationNotificationError(
        getResponseError(data) ||
          "WordPress could not process the cancellation notifications.",
        response.status,
        "notification_bridge_failed",
      );
    }

    if (
      !isObject(data) ||
      data.success !== true ||
      (
        data.mode !== "native" &&
        data.mode !== "bridge"
      )
    ) {
      throw new CancellationNotificationError(
        "WordPress returned an invalid notification response.",
        502,
        "invalid_notification_response",
      );
    }

    return {
      mode:
        data.mode,

      customer:
        parseChannel(
          data.customer,
        ),

      admin:
        parseChannel(
          data.admin,
        ),
    };
  } catch (error) {
    if (
      error instanceof
      CancellationNotificationError
    ) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name ===
        "AbortError"
    ) {
      throw new CancellationNotificationError(
        "The cancellation notification request timed out.",
        504,
        "notification_timeout",
      );
    }

    throw new CancellationNotificationError(
      error instanceof Error
        ? error.message
        : "Cancellation notifications could not be processed.",
      502,
      "cancellation_notification_failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}