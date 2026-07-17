import type { Metadata } from "next";

import Link from "next/link";

import { redirect } from "next/navigation";

import { auth } from "@/auth";

import {
  getCustomerOrders,
  type WooCommerceOrder,
} from "@/lib/woocommerce";

export const metadata: Metadata = {
  title: "My account",
};

function formatPrice(
  value: string,
  currency = "BDT",
): string {
  const price = Number(value);

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

function formatDate(
  value: string,
): string {
  const date = new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-BD",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
    },
  ).format(date);
}

function getStatusClasses(
  status: string,
): string {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-800";

    case "processing":
      return "bg-blue-100 text-blue-800";

    case "on-hold":
      return "bg-yellow-100 text-yellow-800";

    case "cancelled":
    case "failed":
      return "bg-red-100 text-red-800";

    case "refunded":
      return "bg-purple-100 text-purple-800";

    default:
      return "bg-gray-100 text-gray-800";
  }
}

export default async function AccountPage() {
  const session = await auth();

  if (
    !session?.user ||
    !session.user.customerId
  ) {
    redirect(
      "/login?callbackUrl=/account",
    );
  }

  let orders:
    WooCommerceOrder[] = [];

  let orderError = "";

  try {
    orders =
      await getCustomerOrders(
        session.user.customerId,
      );
  } catch (error) {
    console.error(
      "Customer order loading failed:",
      error,
    );

    orderError =
      "Your orders could not be loaded right now.";
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Customer dashboard
          </p>

          <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">
            Welcome,{" "}
            {session.user.name ||
              "Customer"}
          </h1>

          <p className="mt-3 text-gray-600">
            {session.user.email}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/shop"
              className="rounded-lg bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-700"
            >
              Continue shopping
            </Link>

            <Link
              href="/cart"
              className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-100"
            >
              View cart
            </Link>
            <Link
                 href="/account/addresses"
                className="rounded-lg border border-gray-300 bg-white px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-100">
                Manage addresses
            </Link>
          </div>
        </header>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                Order history
              </h2>

              <p className="mt-2 text-gray-600">
                Your recent WooCommerce
                orders.
              </p>
            </div>

            {!orderError && (
              <span className="rounded-full bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-700">
                {orders.length}{" "}
                {orders.length === 1
                  ? "order"
                  : "orders"}
              </span>
            )}
          </div>

          {orderError && (
            <div className="mt-6 rounded-xl border border-red-300 bg-red-50 p-5 text-red-700">
              {orderError}
            </div>
          )}

          {!orderError &&
            orders.length === 0 && (
              <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-10 text-center shadow-sm">
                <h3 className="text-2xl font-bold text-gray-900">
                  No orders yet
                </h3>

                <p className="mt-3 text-gray-600">
                  Products purchased
                  while logged in will
                  appear here.
                </p>

                <Link
                  href="/shop"
                  className="mt-6 inline-block rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white hover:bg-gray-700"
                >
                  Start shopping
                </Link>
              </div>
            )}

          {!orderError &&
            orders.length > 0 && (
              <div className="mt-6 space-y-5">
                {orders.map(
                  (order) => (
                    <article
                      key={order.id}
                      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-5">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900">
                            Order #
                            {
                              order.number
                            }
                          </h3>

                          <p className="mt-1 text-sm text-gray-500">
                            {formatDate(
                              order.date_created,
                            )}
                          </p>
                        </div>

                        <div className="text-right">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold capitalize ${getStatusClasses(
                              order.status,
                            )}`}
                          >
                            {order.status.replace(
                              "-",
                              " ",
                            )}
                          </span>

                          <p className="mt-3 text-xl font-bold text-gray-900">
                            {formatPrice(
                              order.total,
                              order.currency,
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 space-y-4">
                        {order.line_items.map(
                          (item) => (
                            <div
                              key={
                                item.id
                              }
                              className="flex justify-between gap-4 text-sm"
                            >
                              <div>
                                <p className="font-semibold text-gray-900">
                                  {
                                    item.name
                                  }
                                </p>

                                <p className="mt-1 text-gray-500">
                                  Quantity:{" "}
                                  {
                                    item.quantity
                                  }
                                </p>
                              </div>

                              <span className="font-semibold text-gray-900">
                                {formatPrice(
                                  item.total,
                                  order.currency,
                                )}
                              </span>
                            </div>
                          ),
                        )}
                      </div>

                    <Link
                         href={`/account/orders/${order.id}`}
                        className="mt-5 inline-flex rounded-lg border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-100">
                        View order details
                    </Link>

                      <div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-gray-200 pt-5 text-sm text-gray-600">
                        <span>
                          Payment:{" "}
                          {order.payment_method_title ||
                            "Not specified"}
                        </span>

                        {order
                          .shipping_lines
                          ?.length >
                          0 && (
                          <span>
                            Delivery:{" "}
                            {formatPrice(
                              order
                                .shipping_lines[0]
                                .total,
                              order.currency,
                            )}
                          </span>
                        )}
                      </div>
                    </article>
                  ),
                )}
              </div>
            )}
        </section>
      </div>
    </main>
  );
}