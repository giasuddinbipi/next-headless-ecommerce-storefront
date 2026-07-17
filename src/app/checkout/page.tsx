"use client";

import Link from "next/link";

import {
  type FormEvent,
  useEffect,
  useState,
} from "react";

import { useCartStore } from "@/store/cart-store";

type OrderResult = {
  success: boolean;
  orderId: number;
  orderNumber: string;
  status: string;
  currency: string;
  total: string;
};

function formatPrice(
  value: number | string,
): string {
  const price = Number(value);

  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(
    Number.isFinite(price) ? price : 0,
  );
}

export default function CheckoutPage() {
  const [mounted, setMounted] =
    useState(false);

  const [shippingArea, setShippingArea] =
    useState<"dhaka" | "outside">(
      "dhaka",
    );

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [orderResult, setOrderResult] =
    useState<OrderResult | null>(null);

  const items = useCartStore(
    (state) => state.items,
  );

  const clearCart = useCartStore(
    (state) => state.clearCart,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const subtotal = items.reduce(
    (total, item) => {
      const itemPrice = Number(
        item.price || 0,
      );

      return (
        total +
        itemPrice * item.quantity
      );
    },
    0,
  );

  const deliveryCharge =
    shippingArea === "dhaka"
      ? 80
      : 150;

  const estimatedTotal =
    subtotal + deliveryCharge;

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (items.length === 0) {
      setErrorMessage(
        "Your cart is empty.",
      );

      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    const formData = new FormData(
      event.currentTarget,
    );

    const customer = {
      firstName: String(
        formData.get("firstName") ??
          "",
      ),

      lastName: String(
        formData.get("lastName") ??
          "",
      ),

      phone: String(
        formData.get("phone") ?? "",
      ),

      email: String(
        formData.get("email") ?? "",
      ),

      address1: String(
        formData.get("address1") ??
          "",
      ),

      city: String(
        formData.get("city") ?? "",
      ),

      district: String(
        formData.get("district") ??
          "",
      ),

      postcode: String(
        formData.get("postcode") ??
          "",
      ),

      note: String(
        formData.get("note") ?? "",
      ),
    };

    try {
      const response = await fetch(
        "/api/orders",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            customer,
            shippingArea,

            /*
             * Hidden honeypot field.
             * It should remain empty for
             * real customers.
             */
            website: String(
              formData.get("website") ??
                "",
            ),

            termsAccepted:
              formData.get(
                "termsAccepted",
              ) === "on",

            items: items.map(
              (item) => ({
                productId:
                  item.productId,

                variationId:
                  item.variationId,

                quantity:
                  item.quantity,
              }),
            ),
          }),
        },
      );

      const data: unknown =
        await response.json();

      if (
        !response.ok ||
        typeof data !== "object" ||
        data === null
      ) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error ===
            "string"
            ? data.error
            : "Order could not be created.";

        throw new Error(message);
      }

      if (
        !("success" in data) ||
        data.success !== true
      ) {
        const message =
          "error" in data &&
          typeof data.error ===
            "string"
            ? data.error
            : "Order could not be created.";

        throw new Error(message);
      }

      const result =
        data as OrderResult;

      setOrderResult(result);
      clearCart();
    } catch (error) {
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
                )}
              </span>
            </div>

            <div className="mt-3 flex justify-between gap-4">
              <span className="text-gray-600">
                Status
              </span>

              <span className="font-semibold capitalize text-yellow-700">
                {orderResult.status}
              </span>
            </div>
          </div>

          <Link
            href="/shop"
            className="mt-8 inline-block rounded-xl bg-gray-900 px-7 py-4 font-semibold text-white transition hover:bg-gray-700"
          >
            Continue shopping
          </Link>
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

        <form
          onSubmit={handleSubmit}
          className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]"
        >
          {/*
           * Honeypot field:
           * Real customers cannot see it.
           * Bots may fill it, allowing the
           * server to reject spam orders.
           */}
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
                  autoComplete="street-address"
                  placeholder="House, road, area"
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
                  value={shippingArea}
                  onChange={(event) =>
                    setShippingArea(
                      event.target.value as
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
              {items.map((item) => (
                <div
                  key={item.cartKey}
                  className="flex justify-between gap-4 border-b border-gray-100 pb-4 text-sm"
                >
                  <div>
                    <p className="font-semibold text-gray-900">
                      {item.name}
                    </p>

                    {item.attributes
                      .length > 0 && (
                      <p className="mt-1 text-gray-500">
                        {item.attributes
                          .map(
                            (
                              attribute,
                            ) =>
                              `${attribute.name}: ${attribute.option}`,
                          )
                          .join(" · ")}
                      </p>
                    )}

                    <p className="mt-1 text-gray-500">
                      Quantity:{" "}
                      {item.quantity}
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
              ))}
            </div>

            <div className="mt-6 space-y-4 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>

                <span>
                  {formatPrice(subtotal)}
                </span>
              </div>

              <div className="flex justify-between text-gray-600">
                <span>Delivery</span>

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
              disabled={submitting}
              className="mt-6 w-full rounded-xl bg-gray-900 px-5 py-4 font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {submitting
                ? "Placing order..."
                : "Place order"}
            </button>

            <Link
              href="/cart"
              className="mt-4 block text-center text-sm font-semibold text-gray-700 transition hover:text-gray-950"
            >
              Return to cart
            </Link>
          </aside>
        </form>
      </div>
    </main>
  );
}