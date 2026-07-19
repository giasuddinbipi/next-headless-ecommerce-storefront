"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useCartStore } from "@/store/cart-store";

export type CheckoutInitialValues = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address1: string;
  city: string;
  district: string;
  postcode: string;

  shippingArea:
    | "dhaka"
    | "outside";
};

type CheckoutClientProps = {
  initialValues:
    CheckoutInitialValues | null;

  hasSavedAddress: boolean;
};

type UnknownRecord =
  Record<string, unknown>;

type OrderResult = {
  success: true;

  orderId: number;
  orderNumber: string;

  status: string;
  currency: string;
  total: string;
};

type OrderAttempt = {
  version: 1;

  key: string;
  fingerprint: string;

  /*
   * Guest recovery scope-এর জন্য original
   * billing email browser storage-এ থাকবে।
   */
  billingEmail: string;

  createdAt: string;
};

type RecoveryResult =
  | "completed"
  | "in_progress"
  | "not_found"
  | "conflict"
  | "unavailable";

const ORDER_ATTEMPT_STORAGE_KEY =
  "checkout-order-attempt-v1";

/*
 * Redis completed record সাত দিন রাখা হয়।
 * Browser recovery record-ও সর্বোচ্চ সাত দিন থাকবে।
 */
const ORDER_ATTEMPT_MAX_AGE_MS =
  7 * 24 * 60 * 60 * 1_000;

/*
 * Processing lock 24 ঘণ্টা থাকে।
 * এর চেয়ে পুরোনো unresolved attempt manually
 * clear করার option পাবে।
 */
const ORDER_ATTEMPT_STALE_AFTER_MS =
  24 * 60 * 60 * 1_000;

/* =========================================================
   General helpers
========================================================= */

function formatPrice(
  value: number | string,
  currency = "BDT",
): string {
  const price =
    Number(value);

  return new Intl.NumberFormat(
    "en-BD",
    {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    },
  ).format(
    Number.isFinite(price)
      ? price
      : 0,
  );
}

function isObject(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getErrorMessage(
  data: unknown,
): string {
  if (
    isObject(data) &&
    typeof data.error ===
      "string" &&
    data.error.trim()
  ) {
    return data.error;
  }

  return "Order could not be created.";
}

function getErrorCode(
  data: unknown,
): string {
  if (
    isObject(data) &&
    typeof data.code ===
      "string"
  ) {
    return data.code;
  }

  return "";
}

function getRecoveryStatus(
  data: unknown,
): string {
  if (
    isObject(data) &&
    typeof data.status ===
      "string"
  ) {
    return data.status;
  }

  return "";
}

function getRetryAfterSeconds(
  response: Response,
  data: unknown,
): number | null {
  const headerValue =
    response.headers.get(
      "retry-after",
    );

  if (headerValue) {
    const parsedHeader =
      Number(headerValue);

    if (
      Number.isFinite(
        parsedHeader,
      ) &&
      parsedHeader > 0
    ) {
      return Math.ceil(
        parsedHeader,
      );
    }
  }

  if (
    isObject(data) &&
    typeof data.retryAfter ===
      "number" &&
    Number.isFinite(
      data.retryAfter,
    ) &&
    data.retryAfter > 0
  ) {
    return Math.ceil(
      data.retryAfter,
    );
  }

  return null;
}

function isOrderResult(
  data: unknown,
): data is OrderResult {
  return (
    isObject(data) &&
    data.success === true &&
    typeof data.orderId ===
      "number" &&
    Number.isInteger(
      data.orderId,
    ) &&
    data.orderId > 0 &&
    typeof data.orderNumber ===
      "string" &&
    typeof data.status ===
      "string" &&
    typeof data.currency ===
      "string" &&
    typeof data.total ===
      "string"
  );
}

/* =========================================================
   Idempotency helpers
========================================================= */

function normalizeRecoveryEmail(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase()
    .slice(0, 200);
}

function isOrderAttempt(
  value: unknown,
): value is OrderAttempt {
  if (
    !isObject(value) ||
    value.version !== 1 ||
    typeof value.key !==
      "string" ||
    value.key.length < 16 ||
    value.key.length > 200 ||
    !/^[A-Za-z0-9._:-]+$/.test(
      value.key,
    ) ||
    typeof value.fingerprint !==
      "string" ||
    !/^[a-f0-9]{64}$/.test(
      value.fingerprint,
    ) ||
    typeof value.billingEmail !==
      "string" ||
    value.billingEmail.length >
      200 ||
    typeof value.createdAt !==
      "string"
  ) {
    return false;
  }

  return Number.isFinite(
    Date.parse(
      value.createdAt,
    ),
  );
}

function getOrderAttemptAge(
  attempt: OrderAttempt,
): number {
  const createdTime =
    Date.parse(
      attempt.createdAt,
    );

  if (
    !Number.isFinite(
      createdTime,
    )
  ) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.max(
    0,
    Date.now() - createdTime,
  );
}

function isOrderAttemptExpired(
  attempt: OrderAttempt,
): boolean {
  return (
    getOrderAttemptAge(
      attempt,
    ) >
    ORDER_ATTEMPT_MAX_AGE_MS
  );
}

function isOrderAttemptStale(
  attempt: OrderAttempt,
): boolean {
  return (
    getOrderAttemptAge(
      attempt,
    ) >
    ORDER_ATTEMPT_STALE_AFTER_MS
  );
}

function createIdempotencyKey():
  string {
  if (
    typeof crypto ===
    "undefined"
  ) {
    throw new Error(
      "Secure checkout is not available in this browser.",
    );
  }

  if (
    typeof crypto.randomUUID ===
    "function"
  ) {
    return crypto.randomUUID();
  }

  if (
    typeof crypto.getRandomValues !==
    "function"
  ) {
    throw new Error(
      "Secure checkout is not available in this browser.",
    );
  }

  const randomBytes =
    new Uint8Array(24);

  crypto.getRandomValues(
    randomBytes,
  );

  return Array.from(
    randomBytes,
  )
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
}

async function createPayloadFingerprint(
  payload: string,
): Promise<string> {
  if (
    typeof crypto ===
      "undefined" ||
    !crypto.subtle
  ) {
    throw new Error(
      "Secure checkout fingerprinting is not available in this browser.",
    );
  }

  const encodedPayload =
    new TextEncoder().encode(
      payload,
    );

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      encodedPayload,
    );

  return Array.from(
    new Uint8Array(
      digest,
    ),
  )
    .map((byte) =>
      byte
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");
}

function readStoredOrderAttempt():
  OrderAttempt | null {
  try {
    const storedValue =
      sessionStorage.getItem(
        ORDER_ATTEMPT_STORAGE_KEY,
      );

    if (!storedValue) {
      return null;
    }

    const parsedValue:
      unknown =
      JSON.parse(
        storedValue,
      );

    if (
      !isOrderAttempt(
        parsedValue,
      )
    ) {
      sessionStorage.removeItem(
        ORDER_ATTEMPT_STORAGE_KEY,
      );

      return null;
    }

    /*
     * Redis recovery retention-এর চেয়ে
     * পুরোনো browser attempt remove হবে।
     */
    if (
      isOrderAttemptExpired(
        parsedValue,
      )
    ) {
      sessionStorage.removeItem(
        ORDER_ATTEMPT_STORAGE_KEY,
      );

      return null;
    }

    return parsedValue;
  } catch {
    try {
      sessionStorage.removeItem(
        ORDER_ATTEMPT_STORAGE_KEY,
      );
    } catch {
      // Browser storage may be unavailable.
    }

    return null;
  }
}

function storeOrderAttempt(
  attempt: OrderAttempt,
): void {
  try {
    sessionStorage.setItem(
      ORDER_ATTEMPT_STORAGE_KEY,
      JSON.stringify(
        attempt,
      ),
    );
  } catch {
    /*
     * sessionStorage unavailable হলেও
     * component ref current tab-এ কাজ করবে।
     */
  }
}

function removeStoredOrderAttempt():
  void {
  try {
    sessionStorage.removeItem(
      ORDER_ATTEMPT_STORAGE_KEY,
    );
  } catch {
    /*
     * Cleanup failure successful order
     * response-কে ব্যর্থ করবে না।
     */
  }
}

function waitForRecoveryPoll(
  milliseconds: number,
): Promise<void> {
  return new Promise(
    (resolve) => {
      window.setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

/* =========================================================
   Checkout component
========================================================= */

export default function CheckoutClient({
  initialValues,
  hasSavedAddress,
}: CheckoutClientProps) {
  const router =
    useRouter();

  const [
    mounted,
    setMounted,
  ] = useState(false);

  const [
    shippingArea,
    setShippingArea,
  ] = useState<
    "dhaka" | "outside"
  >(
    initialValues
      ?.shippingArea ??
      "dhaka",
  );

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    recoveringOrder,
    setRecoveringOrder,
  ] = useState(false);

  const [
    recoveryMessage,
    setRecoveryMessage,
  ] = useState("");

  const [
    hasRecoverableAttempt,
    setHasRecoverableAttempt,
  ] = useState(false);

  const [
    allowAttemptCleanup,
    setAllowAttemptCleanup,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const [
    orderResult,
    setOrderResult,
  ] =
    useState<OrderResult | null>(
      null,
    );

  const orderAttemptRef =
    useRef<OrderAttempt | null>(
      null,
    );

  const items =
    useCartStore(
      (state) =>
        state.items,
    );

  const clearCart =
    useCartStore(
      (state) =>
        state.clearCart,
    );

  const clearOrderAttempt =
    useCallback((): void => {
      orderAttemptRef.current =
        null;

      setHasRecoverableAttempt(
        false,
      );

      setAllowAttemptCleanup(
        false,
      );

      removeStoredOrderAttempt();
    }, []);

  const recoverPendingOrder =
    useCallback(
      async (
        orderAttempt:
          OrderAttempt,
        signal?: AbortSignal,
      ): Promise<RecoveryResult> => {
        orderAttemptRef.current =
          orderAttempt;

        setHasRecoverableAttempt(
          true,
        );

        setAllowAttemptCleanup(
          isOrderAttemptStale(
            orderAttempt,
          ),
        );

        setRecoveringOrder(
          true,
        );

        setRecoveryMessage(
          "Checking your previous order attempt...",
        );

        try {
          /*
           * Processing response পেলে সর্বোচ্চ
           * পাঁচবার bounded polling হবে।
           */
          const maximumChecks =
            5;

          for (
            let checkNumber = 0;
            checkNumber <
            maximumChecks;
            checkNumber += 1
          ) {
            if (
              signal?.aborted
            ) {
              return "unavailable";
            }

            const response =
              await fetch(
                "/api/orders/idempotency-status",
                {
                  method:
                    "POST",

                  headers: {
                    Accept:
                      "application/json",

                    "Content-Type":
                      "application/json",

                    "Idempotency-Key":
                      orderAttempt.key,
                  },

                  body:
                    JSON.stringify({
                      billingEmail:
                        orderAttempt
                          .billingEmail,
                    }),

                  cache:
                    "no-store",

                  signal,
                },
              );

            const data: unknown =
              await response
                .json()
                .catch(
                  () => null,
                );

            /*
             * Completed order result recovered।
             */
            if (
              response.ok &&
              isOrderResult(data)
            ) {
              clearOrderAttempt();

              setErrorMessage(
                "",
              );

              setRecoveryMessage(
                "",
              );

              setOrderResult(
                data,
              );

              clearCart();

              return "completed";
            }

            const status =
              getRecoveryStatus(
                data,
              );

            const errorCode =
              getErrorCode(
                data,
              );

            const responseError =
              getErrorMessage(
                data,
              );

            /*
             * Recovery status endpoint rate limited।
             *
             * Saved attempt clear করা হবে না।
             * Customer অপেক্ষার পরে একই attempt
             * manually check করতে পারবে।
             */
            if (
              response.status ===
                429 &&
              errorCode ===
                "order_status_rate_limited"
            ) {
              const retryAfter =
                getRetryAfterSeconds(
                  response,
                  data,
                );

              setRecoveryMessage(
                retryAfter
                  ? `Too many status checks were made. Please wait approximately ${retryAfter} seconds before checking again.`
                  : "Too many status checks were made. Please wait a moment before checking again.",
              );

              return "unavailable";
            }

            /*
             * Order এখনো processing হলে দুই
             * সেকেন্ড পরে status আবার check হবে।
             */
            if (
              response.status ===
                202 &&
              status ===
                "in_progress"
            ) {
              setRecoveryMessage(
                "Your order is still being processed. Please keep this page open.",
              );

              if (
                checkNumber <
                maximumChecks - 1
              ) {
                await waitForRecoveryPoll(
                  2_000,
                );

                continue;
              }

              setAllowAttemptCleanup(
                isOrderAttemptStale(
                  orderAttempt,
                ),
              );

              return "in_progress";
            }

            /*
             * Redis-এ matching result পাওয়া যায়নি।
             * Automaticভাবে new order submit করা
             * হবে না। Customer history check করে
             * attempt manually clear করবে।
             */
            if (
              response.status ===
                404 &&
              errorCode ===
                "order_attempt_not_found"
            ) {
              setAllowAttemptCleanup(
                true,
              );

              setRecoveryMessage(
                "No matching saved order result was found. Check your order history before clearing this attempt or placing the order again.",
              );

              return "not_found";
            }

            /*
             * Scope/key conflict হলে unusable
             * stored attempt remove হবে।
             */
            if (
              response.status ===
                409 &&
              errorCode ===
                "idempotency_key_reused"
            ) {
              clearOrderAttempt();

              setRecoveryMessage(
                "",
              );

              setErrorMessage(
                responseError,
              );

              return "conflict";
            }

            throw new Error(
              responseError,
            );
          }

          return "in_progress";
        } catch (error) {
          if (
            error instanceof
              DOMException &&
            error.name ===
              "AbortError"
          ) {
            return "unavailable";
          }

          console.error(
            "Pending order recovery failed:",
            error,
          );

          setRecoveryMessage(
            "",
          );

          setErrorMessage(
            error instanceof Error
              ? error.message
              : "The previous order status could not be checked.",
          );

          return "unavailable";
        } finally {
          if (
            !signal?.aborted
          ) {
            setRecoveringOrder(
              false,
            );
          }
        }
      },
      [
        clearCart,
        clearOrderAttempt,
      ],
    );

  const handleManualRecovery =
    useCallback(
      async (): Promise<void> => {
        if (
          submitting ||
          recoveringOrder
        ) {
          return;
        }

        const storedAttempt =
          orderAttemptRef.current ??
          readStoredOrderAttempt();

        if (!storedAttempt) {
          clearOrderAttempt();

          setRecoveryMessage(
            "",
          );

          setErrorMessage(
            "No saved order attempt is available.",
          );

          return;
        }

        orderAttemptRef.current =
          storedAttempt;

        setHasRecoverableAttempt(
          true,
        );

        setErrorMessage(
          "",
        );

        await recoverPendingOrder(
          storedAttempt,
        );
      },
      [
        clearOrderAttempt,
        recoverPendingOrder,
        recoveringOrder,
        submitting,
      ],
    );

  const handleClearStaleAttempt =
    useCallback((): void => {
      if (
        submitting ||
        recoveringOrder
      ) {
        return;
      }

      const confirmed =
        window.confirm(
          [
            "Clear this saved order attempt?",
            "",
            "Before continuing, check My Orders or your confirmation email to make sure the order was not already created.",
            "",
            "Clearing removes automatic recovery and duplicate protection for this saved attempt.",
          ].join("\n"),
        );

      if (!confirmed) {
        return;
      }

      clearOrderAttempt();

      setRecoveryMessage(
        "",
      );

      setErrorMessage(
        "The stale saved attempt was cleared. Review your cart carefully before submitting a new order.",
      );
    }, [
      clearOrderAttempt,
      recoveringOrder,
      submitting,
    ]);

  useEffect(() => {
    setMounted(true);

    const storedAttempt =
      readStoredOrderAttempt();

    orderAttemptRef.current =
      storedAttempt;

    setHasRecoverableAttempt(
      Boolean(
        storedAttempt,
      ),
    );

    setAllowAttemptCleanup(
      storedAttempt
        ? isOrderAttemptStale(
            storedAttempt,
          )
        : false,
    );

    if (!storedAttempt) {
      return;
    }

    const controller =
      new AbortController();

    /*
     * Page reload-এর পরে unresolved attempt
     * automatically recover হবে।
     */
    void recoverPendingOrder(
      storedAttempt,
      controller.signal,
    );

    return () => {
      controller.abort();
    };
  }, [
    recoverPendingOrder,
  ]);

  const subtotal =
    items.reduce(
      (
        total,
        item,
      ) => {
        const itemPrice =
          Number(
            item.price || 0,
          );

        const safePrice =
          Number.isFinite(
            itemPrice,
          )
            ? itemPrice
            : 0;

        return (
          total +
          safePrice *
            item.quantity
        );
      },
      0,
    );

  const deliveryCharge =
    shippingArea ===
    "dhaka"
      ? 80
      : 150;

  const estimatedTotal =
    subtotal +
    deliveryCharge;

  const handleSubmit =
    async (
      event:
        FormEvent<HTMLFormElement>,
    ) => {
      event.preventDefault();

      if (
        submitting ||
        recoveringOrder
      ) {
        return;
      }

      /*
       * Not-found অথবা stale attempt manually
       * resolve না করা পর্যন্ত new submission
       * block থাকবে।
       */
      if (
        hasRecoverableAttempt &&
        allowAttemptCleanup
      ) {
        setErrorMessage(
          "Resolve the saved order attempt before placing another order.",
        );

        return;
      }

      if (
        items.length === 0
      ) {
        setErrorMessage(
          "Your cart is empty.",
        );

        return;
      }

      setSubmitting(true);
      setErrorMessage("");
      setRecoveryMessage("");

      const formData =
        new FormData(
          event.currentTarget,
        );

      const customer = {
        firstName:
          String(
            formData.get(
              "firstName",
            ) ?? "",
          ),

        lastName:
          String(
            formData.get(
              "lastName",
            ) ?? "",
          ),

        phone:
          String(
            formData.get(
              "phone",
            ) ?? "",
          ),

        email:
          String(
            formData.get(
              "email",
            ) ?? "",
          ),

        address1:
          String(
            formData.get(
              "address1",
            ) ?? "",
          ),

        city:
          String(
            formData.get(
              "city",
            ) ?? "",
          ),

        district:
          String(
            formData.get(
              "district",
            ) ?? "",
          ),

        postcode:
          String(
            formData.get(
              "postcode",
            ) ?? "",
          ),

        note:
          String(
            formData.get(
              "note",
            ) ?? "",
          ),
      };

      /*
       * Browser price, subtotal, discount,
       * shipping total অথবা final total পাঠাবে না।
       *
       * Server product IDs, quantities ও selected
       * attributes দিয়ে fresh calculation করবে।
       */
      const requestBody = {
        customer,

        shippingArea,

        website:
          String(
            formData.get(
              "website",
            ) ?? "",
          ),

        termsAccepted:
          formData.get(
            "termsAccepted",
          ) === "on",

        /*
         * Checkout form-এ coupon input না থাকলে
         * empty coupon code পাঠানো হবে।
         */
        couponCode: "",

        items:
          items.map(
            (item) => ({
              productId:
                item.productId,

              ...(item.variationId
                ? {
                    variationId:
                      item.variationId,
                  }
                : {}),

              quantity:
                item.quantity,

              attributes:
                item.attributes.map(
                  (
                    attribute,
                  ) => ({
                    name:
                      attribute.name,

                    option:
                      attribute.option,
                  }),
                ),
            }),
          ),
      };

      const requestPayload =
        JSON.stringify(
          requestBody,
        );

      let activeOrderAttempt:
        OrderAttempt | null =
          null;

      /*
       * একই submit cycle-এ একই failure-এর জন্য
       * recovery endpoint বারবার call হবে না।
       */
      let recoveryAttempted =
        false;

      try {
        const payloadFingerprint =
          await createPayloadFingerprint(
            requestPayload,
          );

        let orderAttempt =
          orderAttemptRef.current ??
          readStoredOrderAttempt();

        /*
         * Previous unresolved attempt current
         * payload থেকে আলাদা হলে আগে previous
         * attempt-এর status check হবে।
         */
        if (
          orderAttempt &&
          orderAttempt.fingerprint !==
            payloadFingerprint
        ) {
          recoveryAttempted =
            true;

          const recoveryResult =
            await recoverPendingOrder(
              orderAttempt,
            );

          if (
            recoveryResult ===
            "completed"
          ) {
            return;
          }

          if (
            recoveryResult ===
            "in_progress"
          ) {
            throw new Error(
              "A previous order attempt is still being processed. Please wait before placing a different order.",
            );
          }

          if (
            recoveryResult ===
            "unavailable"
          ) {
            throw new Error(
              "The previous order attempt could not be verified. Check its status before placing a different order.",
            );
          }

          /*
           * Not-found result manually clear করা
           * ছাড়া different payload submit হবে না।
           */
          if (
            recoveryResult ===
            "not_found"
          ) {
            throw new Error(
              "A previous order attempt could not be confirmed. Check your order history, then clear the saved attempt before placing a different order.",
            );
          }

          /*
           * Conflict handler attempt ইতোমধ্যে
           * safely clear করেছে।
           */
          orderAttempt =
            null;
        }

        if (!orderAttempt) {
          orderAttempt = {
            version: 1,

            key:
              createIdempotencyKey(),

            fingerprint:
              payloadFingerprint,

            billingEmail:
              normalizeRecoveryEmail(
                customer.email,
              ),

            createdAt:
              new Date()
                .toISOString(),
          };

          orderAttemptRef.current =
            orderAttempt;

          storeOrderAttempt(
            orderAttempt,
          );

          setHasRecoverableAttempt(
            true,
          );

          setAllowAttemptCleanup(
            false,
          );
        } else {
          orderAttemptRef.current =
            orderAttempt;

          setHasRecoverableAttempt(
            true,
          );
        }

        activeOrderAttempt =
          orderAttempt;

        const response =
          await fetch(
            "/api/orders",
            {
              method:
                "POST",

              headers: {
                Accept:
                  "application/json",

                "Content-Type":
                  "application/json",

                "Idempotency-Key":
                  orderAttempt.key,
              },

              body:
                requestPayload,

              cache:
                "no-store",
            },
          );

        const data: unknown =
          await response
            .json()
            .catch(
              () => null,
            );

        const responseError =
          getErrorMessage(
            data,
          );

        const errorCode =
          getErrorCode(
            data,
          );

        if (!response.ok) {
          /*
           * Order-creation rate limit idempotency
           * reservation-এর আগেই check হয়েছে।
           *
           * তাই current attempt safely clear করে
           * অপেক্ষার পরে fresh submission হবে।
           */
          if (
            response.status ===
              429 &&
            errorCode ===
              "order_rate_limited"
          ) {
            const retryAfter =
              getRetryAfterSeconds(
                response,
                data,
              );

            clearOrderAttempt();

            activeOrderAttempt =
              null;

            throw new Error(
              retryAfter
                ? `${responseError} Try again in approximately ${retryAfter} seconds.`
                : responseError,
            );
          }

          /*
           * Same request processing হলে status
           * endpoint দিয়ে recovery হবে।
           */
          if (
            errorCode ===
            "order_request_in_progress"
          ) {
            recoveryAttempted =
              true;

            const recoveryResult =
              await recoverPendingOrder(
                orderAttempt,
              );

            if (
              recoveryResult ===
              "completed"
            ) {
              return;
            }

            throw new Error(
              responseError,
            );
          }

          /*
           * Same key ভিন্ন payload-এর সঙ্গে
           * ব্যবহার হলে fresh attempt প্রয়োজন।
           */
          if (
            errorCode ===
            "idempotency_key_reused"
          ) {
            clearOrderAttempt();

            activeOrderAttempt =
              null;

            throw new Error(
              responseError,
            );
          }

          /*
           * Product, stock অথবা quantity বদলে
           * গেলে cart page-এ validation review।
           */
          if (
            response.status ===
              409 &&
            (
              errorCode ===
                "checkout_cart_changed" ||
              errorCode ===
                "checkout_cart_empty"
            )
          ) {
            clearOrderAttempt();

            activeOrderAttempt =
              null;

            try {
              sessionStorage.setItem(
                "checkout-conflict-message",
                responseError,
              );
            } catch {
              // Redirect will still continue.
            }

            router.push(
              "/cart?checkoutReview=required",
            );

            return;
          }

          /*
           * Uncertain 5xx response-এর পরে
           * completed result recovery চেষ্টা।
           */
          if (
            response.status >=
            500
          ) {
            recoveryAttempted =
              true;

            const recoveryResult =
              await recoverPendingOrder(
                orderAttempt,
              );

            if (
              recoveryResult ===
              "completed"
            ) {
              return;
            }
          }

          /*
           * নিশ্চিত 4xx validation failure হলে
           * fresh submission key পাওয়া যাবে।
           *
           * 5xx response-এর key রাখা হবে।
           */
          if (
            response.status >=
              400 &&
            response.status <
              500
          ) {
            clearOrderAttempt();

            activeOrderAttempt =
              null;
          }

          throw new Error(
            responseError,
          );
        }

        if (
          !isOrderResult(data)
        ) {
          /*
           * HTTP success হলেও malformed response
           * uncertain result হিসেবে ধরা হবে।
           */
          throw new Error(
            "The server returned an invalid order response.",
          );
        }

        clearOrderAttempt();

        activeOrderAttempt =
          null;

        setRecoveryMessage(
          "",
        );

        setOrderResult(
          data,
        );

        clearCart();
      } catch (error) {
        /*
         * Network failure হলেও server order
         * তৈরি করে থাকতে পারে। Status recovery
         * দিয়ে result verify করা হবে।
         */
        if (
          activeOrderAttempt &&
          !recoveryAttempted
        ) {
          recoveryAttempted =
            true;

          const recoveryResult =
            await recoverPendingOrder(
              activeOrderAttempt,
            );

          if (
            recoveryResult ===
            "completed"
          ) {
            return;
          }
        }

        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Order could not be created.",
        );
      } finally {
        setSubmitting(false);
      }
    };

  if (!mounted) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-12">
        <div className="mx-auto h-48 max-w-7xl animate-pulse rounded-2xl bg-gray-200" />
      </main>
    );
  }

  if (orderResult) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-gray-50 px-4 py-16">
        <div className="w-full max-w-xl rounded-2xl border border-green-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-4xl text-green-700">
            ✓
          </div>

          <h1 className="mt-6 text-3xl font-bold text-gray-900">
            Order placed successfully
          </h1>

          <p className="mt-3 text-gray-600">
            Thank you. Your Cash on
            Delivery order has been
            submitted.
          </p>

          <div className="mt-7 rounded-xl bg-gray-50 p-5 text-left">
            <div className="flex justify-between gap-4">
              <span className="text-gray-600">
                Order number
              </span>

              <span className="font-bold text-gray-900">
                #
                {
                  orderResult.orderNumber
                }
              </span>
            </div>

            <div className="mt-3 flex justify-between gap-4">
              <span className="text-gray-600">
                Total
              </span>

              <span className="font-bold text-gray-900">
                {formatPrice(
                  orderResult.total,
                  orderResult.currency,
                )}
              </span>
            </div>

            <div className="mt-3 flex justify-between gap-4">
              <span className="text-gray-600">
                Status
              </span>

              <span className="font-semibold capitalize text-yellow-700">
                {orderResult.status.replace(
                  /-/g,
                  " ",
                )}
              </span>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={`/account/orders/${orderResult.orderId}`}
              className="rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white transition hover:bg-gray-700"
            >
              View order details
            </Link>

            <Link
              href="/shop"
              className="rounded-xl border border-gray-300 px-6 py-3 font-semibold text-gray-800 transition hover:bg-gray-100"
            >
              Continue shopping
            </Link>
          </div>
        </div>
      </main>
    );
  }

  /*
   * Saved recovery attempt থাকলে empty cart
   * হলেও recovery controls দেখানো হবে।
   */
  if (
    items.length === 0 &&
    !recoveringOrder &&
    !hasRecoverableAttempt
  ) {
    return (
      <main className="flex min-h-[70vh] items-center justify-center bg-gray-50 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Your cart is empty
          </h1>

          <p className="mt-3 text-gray-600">
            Add products before opening
            checkout.
          </p>

          <Link
            href="/shop"
            className="mt-7 inline-block rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white transition hover:bg-gray-700"
          >
            Visit shop
          </Link>
        </div>
      </main>
    );
  }

  const checkoutBusy =
    submitting ||
    recoveringOrder;

  const submissionBlocked =
    checkoutBusy ||
    (
      hasRecoverableAttempt &&
      allowAttemptCleanup
    );

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
          Checkout
        </h1>

        <p className="mt-3 text-gray-600">
          Complete your delivery
          information.
        </p>

        {hasSavedAddress && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800"
          >
            Your saved delivery address
            has been loaded. Please review
            the information before placing
            the order.
          </div>
        )}

        <form
          onSubmit={
            handleSubmit
          }
          className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]"
        >
          <div
            aria-hidden="true"
            className="hidden"
          >
            <label htmlFor="website">
              Website
            </label>

            <input
              id="website"
              name="website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-bold text-gray-900">
              Customer information
            </h2>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="firstName"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  First name *
                </label>

                <input
                  required
                  id="firstName"
                  name="firstName"
                  defaultValue={
                    initialValues
                      ?.firstName ??
                    ""
                  }
                  maxLength={60}
                  autoComplete="given-name"
                  disabled={
                    checkoutBusy
                  }
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
              </div>

              <div>
                <label
                  htmlFor="lastName"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Last name *
                </label>

                <input
                  required
                  id="lastName"
                  name="lastName"
                  defaultValue={
                    initialValues
                      ?.lastName ??
                    ""
                  }
                  maxLength={60}
                  autoComplete="family-name"
                  disabled={
                    checkoutBusy
                  }
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Phone number *
                </label>

                <input
                  required
                  id="phone"
                  type="tel"
                  name="phone"
                  defaultValue={
                    initialValues
                      ?.phone ??
                    ""
                  }
                  maxLength={30}
                  autoComplete="tel"
                  placeholder="01XXXXXXXXX"
                  disabled={
                    checkoutBusy
                  }
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Email *
                </label>

                <input
                  required
                  id="email"
                  type="email"
                  name="email"
                  defaultValue={
                    initialValues
                      ?.email ??
                    ""
                  }
                  maxLength={120}
                  autoComplete="email"
                  disabled={
                    checkoutBusy
                  }
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="address1"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Full address *
                </label>

                <input
                  required
                  id="address1"
                  name="address1"
                  defaultValue={
                    initialValues
                      ?.address1 ??
                    ""
                  }
                  maxLength={300}
                  autoComplete="street-address"
                  placeholder="House, road and area"
                  disabled={
                    checkoutBusy
                  }
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
              </div>

              <div>
                <label
                  htmlFor="city"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  City / Upazila *
                </label>

                <input
                  required
                  id="city"
                  name="city"
                  defaultValue={
                    initialValues
                      ?.city ??
                    ""
                  }
                  maxLength={80}
                  autoComplete="address-level2"
                  disabled={
                    checkoutBusy
                  }
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
              </div>

              <div>
                <label
                  htmlFor="district"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  District *
                </label>

                <input
                  required
                  id="district"
                  name="district"
                  defaultValue={
                    initialValues
                      ?.district ??
                    ""
                  }
                  maxLength={80}
                  autoComplete="address-level1"
                  disabled={
                    checkoutBusy
                  }
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
              </div>

              <div>
                <label
                  htmlFor="postcode"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Postcode
                </label>

                <input
                  id="postcode"
                  name="postcode"
                  defaultValue={
                    initialValues
                      ?.postcode ??
                    ""
                  }
                  maxLength={20}
                  autoComplete="postal-code"
                  disabled={
                    checkoutBusy
                  }
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
              </div>

              <div>
                <label
                  htmlFor="shippingArea"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Delivery area *
                </label>

                <select
                  id="shippingArea"
                  name="shippingArea"
                  value={
                    shippingArea
                  }
                  disabled={
                    checkoutBusy
                  }
                  onChange={(
                    event,
                  ) =>
                    setShippingArea(
                      event.target
                        .value as
                        | "dhaka"
                        | "outside",
                    )
                  }
                  className="h-12 w-full rounded-lg border border-gray-300 bg-white px-4 outline-none transition focus:border-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100"
                >
                  <option value="dhaka">
                    Inside Dhaka — ৳80
                  </option>

                  <option value="outside">
                    Outside Dhaka — ৳150
                  </option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="note"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Order note
                </label>

                <textarea
                  id="note"
                  name="note"
                  rows={4}
                  maxLength={500}
                  placeholder="Optional delivery instructions"
                  disabled={
                    checkoutBusy
                  }
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none transition focus:border-gray-800 disabled:cursor-not-allowed disabled:bg-gray-100"
                />
              </div>
            </div>
          </section>

          <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:sticky lg:top-24">
            <h2 className="text-xl font-bold text-gray-900">
              Order summary
            </h2>

            <div className="mt-6 max-h-72 space-y-4 overflow-y-auto">
              {items.length === 0 ? (
                <p className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
                  The cart is currently
                  empty. Use the recovery
                  controls below to check
                  the saved order attempt.
                </p>
              ) : (
                items.map(
                  (item) => (
                    <div
                      key={
                        item.cartKey
                      }
                      className="flex justify-between gap-4 border-b border-gray-100 pb-4 text-sm"
                    >
                      <div>
                        <p className="font-semibold text-gray-900">
                          {item.name}
                        </p>

                        {item.attributes
                          .length >
                          0 && (
                          <p className="mt-1 text-gray-500">
                            {item.attributes
                              .map(
                                (
                                  attribute,
                                ) =>
                                  `${attribute.name}: ${attribute.option}`,
                              )
                              .join(
                                " · ",
                              )}
                          </p>
                        )}

                        <p className="mt-1 text-gray-500">
                          Quantity:{" "}
                          {
                            item.quantity
                          }
                        </p>
                      </div>

                      <span className="font-semibold text-gray-900">
                        {formatPrice(
                          Number(
                            item.price,
                          ) *
                            item.quantity,
                        )}
                      </span>
                    </div>
                  ),
                )
              )}
            </div>

            <div className="mt-6 space-y-4 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>
                  Subtotal
                </span>

                <span>
                  {formatPrice(
                    subtotal,
                  )}
                </span>
              </div>

              <div className="flex justify-between text-gray-600">
                <span>
                  Delivery
                </span>

                <span>
                  {formatPrice(
                    deliveryCharge,
                  )}
                </span>
              </div>

              <div className="flex justify-between border-t border-gray-200 pt-5 text-lg font-bold text-gray-900">
                <span>
                  Estimated total
                </span>

                <span>
                  {formatPrice(
                    estimatedTotal,
                  )}
                </span>
              </div>
            </div>

            <p className="mt-3 text-xs leading-5 text-gray-500">
              Product prices, stock,
              discount and final payable
              total will be verified by
              the server before the order
              is created.
            </p>

            <div className="mt-5 rounded-lg bg-yellow-50 p-4 text-sm text-yellow-800">
              Payment method: Cash on
              Delivery
            </div>

            {(
              recoveryMessage ||
              hasRecoverableAttempt
            ) && (
              <div
                role="status"
                aria-live="polite"
                className="mt-5 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"
              >
                <p>
                  {recoveryMessage ||
                    "A saved order attempt is available for recovery."}
                </p>

                {hasRecoverableAttempt && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={
                        checkoutBusy
                      }
                      onClick={() => {
                        void handleManualRecovery();
                      }}
                      className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-blue-300"
                    >
                      {recoveringOrder
                        ? "Checking status..."
                        : "Check order status"}
                    </button>

                    {allowAttemptCleanup && (
                      <button
                        type="button"
                        disabled={
                          checkoutBusy
                        }
                        onClick={
                          handleClearStaleAttempt
                        }
                        className="rounded-lg border border-blue-300 bg-white px-4 py-2 font-semibold text-blue-800 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Clear stale attempt
                      </button>
                    )}

                    <Link
                      href="/account/orders"
                      className="rounded-lg border border-blue-300 bg-white px-4 py-2 font-semibold text-blue-800 transition hover:bg-blue-100"
                    >
                      View My Orders
                    </Link>
                  </div>
                )}

                {allowAttemptCleanup && (
                  <p className="mt-3 text-xs leading-5 text-blue-800">
                    Check your account
                    order history and
                    confirmation email
                    before clearing this
                    saved attempt.
                  </p>
                )}
              </div>
            )}

            {errorMessage && (
              <div
                role="alert"
                className="mt-5 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700"
              >
                {errorMessage}
              </div>
            )}

            <label className="mt-5 flex items-start gap-3 text-sm text-gray-700">
              <input
                required
                type="checkbox"
                name="termsAccepted"
                disabled={
                  checkoutBusy
                }
                className="mt-1 h-4 w-4 rounded border-gray-300"
              />

              <span>
                I confirm that the order
                and delivery information
                is correct and agree to
                the store terms.
              </span>
            </label>

            <button
              type="submit"
              disabled={
                submissionBlocked
              }
              aria-busy={
                checkoutBusy
              }
              className="mt-6 w-full rounded-xl bg-gray-900 px-5 py-4 font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {recoveringOrder
                ? "Checking previous order..."
                : submitting
                  ? "Placing order..."
                  : allowAttemptCleanup
                    ? "Resolve previous attempt first"
                    : "Place order"}
            </button>

            <Link
              href="/cart"
              aria-disabled={
                checkoutBusy
              }
              onClick={(
                event,
              ) => {
                if (
                  checkoutBusy
                ) {
                  event.preventDefault();
                }
              }}
              className="mt-4 block text-center text-sm font-semibold text-gray-700 transition hover:text-gray-950"
            >
              Return to cart
            </Link>

            <Link
              href="/account/addresses"
              aria-disabled={
                checkoutBusy
              }
              onClick={(
                event,
              ) => {
                if (
                  checkoutBusy
                ) {
                  event.preventDefault();
                }
              }}
              className="mt-3 block text-center text-sm font-semibold text-blue-700 transition hover:text-blue-900"
            >
              Manage saved addresses
            </Link>
          </aside>
        </form>
      </div>
    </main>
  );
}