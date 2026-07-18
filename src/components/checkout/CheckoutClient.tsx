"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useCartStore,
} from "@/store/cart-store";

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
  key: string;
  fingerprint: string;
};

const ORDER_ATTEMPT_STORAGE_KEY =
  "checkout-order-attempt-v1";

/* =========================================================
   General helpers
========================================================= */

function formatPrice(
  value:
    | number
    | string,
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
    typeof value === "object" &&
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

function isOrderAttempt(
  value: unknown,
): value is OrderAttempt {
  return (
    isObject(value) &&
    typeof value.key ===
      "string" &&
    value.key.length >= 16 &&
    value.key.length <= 200 &&
    /^[A-Za-z0-9._:-]+$/.test(
      value.key,
    ) &&
    typeof value.fingerprint ===
      "string" &&
    /^[a-f0-9]{64}$/.test(
      value.fingerprint,
    )
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

    return parsedValue;
  } catch {
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
     * component-এর in-memory ref কাজ করবে।
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
     * Storage cleanup failure successful
     * order response-কে ব্যর্থ করবে না।
     */
  }
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

  useEffect(() => {
    setMounted(true);

    /*
     * Page reload বা uncertain network
     * response-এর পরে একই attempt recover হবে।
     */
    orderAttemptRef.current =
      readStoredOrderAttempt();
  }, []);

  const clearOrderAttempt =
    (): void => {
      orderAttemptRef.current =
        null;

      removeStoredOrderAttempt();
    };

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

      if (submitting) {
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
       * Browser product price, subtotal,
       * shipping total বা final total পাঠাবে না।
       *
       * Server IDs, quantities এবং selected
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
         * এই checkout form-এ coupon input
         * না থাকায় empty code পাঠানো হচ্ছে।
         *
         * ভবিষ্যতে coupon state থাকলে এখানে
         * সেই validated UI value বসানো যাবে।
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

      try {
        const payloadFingerprint =
          await createPayloadFingerprint(
            requestPayload,
          );

        let orderAttempt =
          orderAttemptRef.current ??
          readStoredOrderAttempt();

        /*
         * একই payload retry হলে একই key reuse হবে।
         *
         * Customer address, shipping area, cart,
         * variation বা quantity পরিবর্তন করলে
         * fingerprint বদলাবে এবং নতুন key হবে।
         */
        if (
          !orderAttempt ||
          orderAttempt.fingerprint !==
            payloadFingerprint
        ) {
          orderAttempt = {
            key:
              createIdempotencyKey(),

            fingerprint:
              payloadFingerprint,
          };

          orderAttemptRef.current =
            orderAttempt;

          storeOrderAttempt(
            orderAttempt,
          );
        } else {
          orderAttemptRef.current =
            orderAttempt;
        }

        const response =
          await fetch(
            "/api/orders",
            {
              method: "POST",

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
           * একই request এখনো process হলে key
           * রাখা হবে। Retry একই key ব্যবহার করবে।
           */
          if (
            errorCode ===
            "order_request_in_progress"
          ) {
            throw new Error(
              responseError,
            );
          }

          /*
           * একই key অন্য payload-এর সঙ্গে
           * ব্যবহার হলে fresh attempt প্রয়োজন।
           */
          if (
            errorCode ===
            "idempotency_key_reused"
          ) {
            clearOrderAttempt();

            throw new Error(
              responseError,
            );
          }

          /*
           * Product, stock বা quantity বদলে গেলে
           * order তৈরি হবে না। Customer cart-এ
           * ফিরে fresh validation review করবে।
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

            try {
              sessionStorage.setItem(
                "checkout-conflict-message",
                responseError,
              );
            } catch {
              /*
               * Storage unavailable হলেও
               * redirect চলবে।
               */
            }

            router.push(
              "/cart?checkoutReview=required",
            );

            return;
          }

          /*
           * নিশ্চিত client/validation failure হলে
           * next submission fresh key পাবে।
           *
           * 5xx বা uncertain server response হলে
           * key রাখা হবে, কারণ order তৈরি হয়ে
           * response হারিয়ে যেতে পারে।
           */
          if (
            response.status >=
              400 &&
            response.status <
              500
          ) {
            clearOrderAttempt();
          }

          throw new Error(
            responseError,
          );
        }

        if (
          !isOrderResult(data)
        ) {
          /*
           * HTTP success হলেও invalid response
           * uncertain ধরা হবে। Key রাখা হবে,
           * যাতে retry duplicate order না করে।
           */
          throw new Error(
            "The server returned an invalid order response.",
          );
        }

        clearOrderAttempt();

        setOrderResult(
          data,
        );

        clearCart();
      } catch (error) {
        /*
         * Network failure বা unknown 5xx-এ
         * order attempt clear করা হবে না।
         *
         * Retry একই key দিয়ে হবে।
         */
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

  if (items.length === 0) {
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
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-800"
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
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-800"
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
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-800"
                />
              </div>

              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Email
                </label>

                <input
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
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-800"
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
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-800"
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
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-800"
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
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-800"
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
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-800"
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
                  className="h-12 w-full rounded-lg border border-gray-300 bg-white px-4 outline-none transition focus:border-gray-800"
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
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none transition focus:border-gray-800"
                />
              </div>
            </div>
          </section>

          <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:sticky lg:top-24">
            <h2 className="text-xl font-bold text-gray-900">
              Order summary
            </h2>

            <div className="mt-6 max-h-72 space-y-4 overflow-y-auto">
              {items.map(
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
                  submitting
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
                submitting
              }
              aria-busy={
                submitting
              }
              className="mt-6 w-full rounded-xl bg-gray-900 px-5 py-4 font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {submitting
                ? "Placing order..."
                : "Place order"}
            </button>

            <Link
              href="/cart"
              aria-disabled={
                submitting
              }
              onClick={(
                event,
              ) => {
                if (
                  submitting
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
                submitting
              }
              onClick={(
                event,
              ) => {
                if (
                  submitting
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