import "server-only";

import {
  sendCancellationNotifications,
  type CancellationNotificationResult,
} from "@/lib/cancellation-notifications";

const WOO_REQUEST_TIMEOUT_MS = 15_000;

const DEFAULT_CANCELLABLE_STATUSES = [
  "pending",
  "on-hold",
];

const SUPPORTED_CANCELLABLE_STATUSES =
  new Set([
    "pending",
    "on-hold",
    "processing",
  ]);

type UnknownRecord =
  Record<string, unknown>;

type WooCancellationOrder = {
  id: number;
  number: string;
  status: string;
  customer_id: number;

  payment_method?: string;
  payment_method_title?: string;

  date_paid?: string | null;
  date_modified?: string | null;
};

type WooOrderNote = {
  id: number;
  note: string;
  customer_note: boolean;
};

export type CustomerOrderCancellationResult = {
  orderId: number;
  orderNumber: string;
  status: "cancelled";
  noteAdded: boolean;

  notifications: {
    mode:
      | "native"
      | "bridge"
      | "failed";

    customerTriggered:
      boolean | null;

    adminTriggered:
      boolean | null;
  };
};

type CancellationNotificationSummary =
  CustomerOrderCancellationResult["notifications"];

export class OrderCancellationError extends Error {
  status: number;
  code: string;

  constructor(
    message: string,
    status = 400,
    code = "order_cancellation_failed",
  ) {
    super(message);

    this.name =
      "OrderCancellationError";

    this.status = status;
    this.code = code;
  }
}

/* =========================================================
   General helpers
========================================================= */

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
    throw new OrderCancellationError(
      `Missing required environment variable: ${name}`,
      500,
      "missing_woocommerce_configuration",
    );
  }

  return value;
}

function getWooCommerceApiBaseUrl(
  rawUrl: string,
): string {
  const normalizedUrl =
    rawUrl
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

function normalizeCancellationReason(
  reason: string,
): string {
  return reason
    .replace(
      /[\u0000-\u001F\u007F]/g,
      " ",
    )
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
}

function createNotificationSummary(
  result:
    | CancellationNotificationResult
    | null,
): CancellationNotificationSummary {
  if (!result) {
    return {
      mode: "failed",
      customerTriggered: false,
      adminTriggered: false,
    };
  }

  return {
    mode: result.mode,

    customerTriggered:
      result.customer.triggered,

    adminTriggered:
      result.admin.triggered,
  };
}

/* =========================================================
   WooCommerce request helper
========================================================= */

async function wooCommerceCancellationRequest<T>({
  path,
  method = "GET",
  body,
}: {
  path: string;
  method?: "GET" | "POST" | "PUT";
  body?: UnknownRecord;
}): Promise<T> {
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
    }, WOO_REQUEST_TIMEOUT_MS);

  try {
    const response =
      await fetch(
        `${apiBaseUrl}${path}`,
        {
          method,

          headers: {
            Accept:
              "application/json",

            "Content-Type":
              "application/json",

            Authorization:
              `Basic ${credentials}`,
          },

          ...(body
            ? {
                body:
                  JSON.stringify(
                    body,
                  ),
              }
            : {}),

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
      const message =
        getWooCommerceErrorMessage(
          data,
        );

      throw new OrderCancellationError(
        message ||
          "WooCommerce could not process the cancellation request.",

        response.status >= 400 &&
        response.status < 600
          ? response.status
          : 502,

        "woocommerce_cancellation_failed",
      );
    }

    return data as T;
  } catch (error) {
    if (
      error instanceof
      OrderCancellationError
    ) {
      throw error;
    }

    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      throw new OrderCancellationError(
        "The cancellation request timed out.",
        504,
        "cancellation_timeout",
      );
    }

    throw new OrderCancellationError(
      error instanceof Error
        ? error.message
        : "The order could not be cancelled.",
      502,
      "order_cancellation_failed",
    );
  } finally {
    clearTimeout(timeout);
  }
}

/* =========================================================
   Cancellation configuration
========================================================= */

export function getCustomerCancellableOrderStatuses(): string[] {
  const configuredStatuses =
    process.env
      .CUSTOMER_CANCELLABLE_ORDER_STATUSES
      ?.split(",")
      .map((status) =>
        status
          .trim()
          .toLowerCase(),
      )
      .filter(
        (status) =>
          SUPPORTED_CANCELLABLE_STATUSES.has(
            status,
          ),
      ) ?? [];

  return configuredStatuses.length >
    0
    ? Array.from(
        new Set(
          configuredStatuses,
        ),
      )
    : DEFAULT_CANCELLABLE_STATUSES;
}

export function canCustomerCancelOrder(
  status: string,
): boolean {
  const normalizedStatus =
    status
      .trim()
      .toLowerCase();

  return getCustomerCancellableOrderStatuses().includes(
    normalizedStatus,
  );
}

/* =========================================================
   Cancellation notification helper
========================================================= */

async function processCancellationNotifications({
  orderId,
  orderNumber,
  retryingExistingCancellation = false,
}: {
  orderId: number;
  orderNumber: string;
  retryingExistingCancellation?: boolean;
}): Promise<CancellationNotificationResult | null> {
  try {
    return await sendCancellationNotifications(
      orderId,
    );
  } catch (notificationError) {
    console.error(
      retryingExistingCancellation
        ? "Existing cancellation notification retry failed:"
        : "Cancellation notifications could not be processed:",
      {
        orderId,
        orderNumber,

        error:
          notificationError instanceof Error
            ? notificationError.message
            : notificationError,
      },
    );

    return null;
  }
}

/* =========================================================
   Cancel customer order
========================================================= */

export async function cancelCustomerWooCommerceOrder({
  orderId,
  customerId,
  reason,
}: {
  orderId: number;
  customerId: number;
  reason: string;
}): Promise<CustomerOrderCancellationResult> {
  if (
    !Number.isInteger(orderId) ||
    orderId < 1
  ) {
    throw new OrderCancellationError(
      "A valid order ID is required.",
      400,
      "invalid_order_id",
    );
  }

  if (
    !Number.isInteger(customerId) ||
    customerId < 1
  ) {
    throw new OrderCancellationError(
      "You must sign in before cancelling an order.",
      401,
      "authentication_required",
    );
  }

  const normalizedReason =
    normalizeCancellationReason(
      reason,
    );

  if (
    normalizedReason.length < 10
  ) {
    throw new OrderCancellationError(
      "Please provide a cancellation reason of at least 10 characters.",
      400,
      "cancellation_reason_too_short",
    );
  }

  /*
   * Browser থেকে পাঠানো order status বিশ্বাস করা হচ্ছে না।
   * Order সরাসরি WooCommerce থেকে আবার load করা হচ্ছে।
   */
  const currentOrder =
    await wooCommerceCancellationRequest<WooCancellationOrder>(
      {
        path:
          `/orders/${orderId}`,
      },
    );

  /*
   * অন্য customer-এর order আছে কি না
   * client-কে প্রকাশ করা হবে না।
   */
  if (
    currentOrder.customer_id !==
    customerId
  ) {
    throw new OrderCancellationError(
      "The order could not be found.",
      404,
      "order_not_found",
    );
  }

  const currentStatus =
    currentOrder.status
      .trim()
      .toLowerCase();

  /*
   * ইতোমধ্যে cancelled হলে status আবার update করা হবে না।
   * Notification metadata duplicate email আটকাবে।
   */
  if (
    currentStatus === "cancelled"
  ) {
    const notificationResult =
      await processCancellationNotifications(
        {
          orderId,

          orderNumber:
            currentOrder.number,

          retryingExistingCancellation:
            true,
        },
      );

    return {
      orderId:
        currentOrder.id,

      orderNumber:
        currentOrder.number,

      status: "cancelled",

      /*
       * Order আগে cancelled হওয়ায় note-এর সঠিক
       * অবস্থা এই request থেকে নিশ্চিত করা যায় না।
       */
      noteAdded: false,

      notifications:
        createNotificationSummary(
          notificationResult,
        ),
    };
  }

  /*
   * Recorded payment থাকা order customer সরাসরি
   * cancel করতে পারবে না। Refund/support review লাগবে।
   */
  if (
    currentOrder.date_paid
  ) {
    throw new OrderCancellationError(
      "This order has a recorded payment and must be reviewed by customer support before cancellation.",
      409,
      "paid_order_requires_support",
    );
  }

  if (
    !canCustomerCancelOrder(
      currentStatus,
    )
  ) {
    throw new OrderCancellationError(
      `Orders with status "${currentStatus.replace(
        /-/g,
        " ",
      )}" can no longer be cancelled online. Please contact customer support.`,
      409,
      "order_not_cancellable",
    );
  }

  const cancelledAt =
    new Date().toISOString();

  /*
   * Previous status metadata notification bridge-কে
   * native বনাম custom email নির্বাচন করতে সাহায্য করে।
   */
  const updatedOrder =
    await wooCommerceCancellationRequest<WooCancellationOrder>(
      {
        path:
          `/orders/${orderId}`,

        method: "PUT",

        body: {
          status: "cancelled",

          meta_data: [
            {
              key:
                "_headless_customer_cancelled",

              value: "yes",
            },

            {
              key:
                "_headless_cancellation_reason",

              value:
                normalizedReason,
            },

            {
              key:
                "_headless_cancelled_at",

              value:
                cancelledAt,
            },

            {
              key:
                "_headless_cancelled_by_customer_id",

              value:
                String(customerId),
            },

            {
              key:
                "_headless_previous_status",

              value:
                currentStatus,
            },
          ],
        },
      },
    );

  if (
    updatedOrder.status
      .trim()
      .toLowerCase() !==
    "cancelled"
  ) {
    throw new OrderCancellationError(
      "WooCommerce did not confirm the cancelled order status.",
      502,
      "cancellation_not_confirmed",
    );
  }

  /*
   * Admin-visible order note best effort।
   * Note fail করলেও order ইতোমধ্যে cancelled।
   */
  let noteAdded = false;

  try {
    await wooCommerceCancellationRequest<WooOrderNote>(
      {
        path:
          `/orders/${orderId}/notes`,

        method: "POST",

        body: {
          note:
            `Customer requested cancellation through the storefront. Reason: ${normalizedReason}`,

          customer_note: false,
        },
      },
    );

    noteAdded = true;
  } catch (noteError) {
    console.error(
      "Cancellation order note could not be added:",
      {
        orderId,

        orderNumber:
          updatedOrder.number,

        error:
          noteError instanceof Error
            ? noteError.message
            : noteError,
      },
    );
  }

  /*
   * Email ব্যর্থ হলেও cancellation rollback হবে না।
   * Customer ও admin notification best effort।
   */
  const notificationResult =
    await processCancellationNotifications(
      {
        orderId,

        orderNumber:
          updatedOrder.number,
      },
    );

  return {
    orderId:
      updatedOrder.id,

    orderNumber:
      updatedOrder.number,

    status: "cancelled",

    noteAdded,

    notifications:
      createNotificationSummary(
        notificationResult,
      ),
  };
}