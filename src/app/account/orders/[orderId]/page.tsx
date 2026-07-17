import type { Metadata } from "next";

import Link from "next/link";

import {
  notFound,
  redirect,
} from "next/navigation";

import { auth } from "@/auth";

import {
  getCustomerOrderById,
  type WooCommerceOrderAddress,
  type WooCommerceOrderLineItemMetaData,
} from "@/lib/woocommerce";

export const metadata: Metadata = {
  title: "Order details",
};

type OrderDetailsPageProps = {
  params: Promise<{
    orderId: string;
  }>;
};

function formatPrice(
  value: number | string,
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

function formatDateTime(
  value: string,
): string {
  const date = new Date(value);

  if (
    Number.isNaN(date.getTime())
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-BD",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
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

function getAddressName(
  address: WooCommerceOrderAddress,
): string {
  return [
    address.first_name,
    address.last_name,
  ]
    .filter(Boolean)
    .join(" ");
}

function getAddressLines(
  address: WooCommerceOrderAddress,
): string[] {
  return [
    address.company,
    address.address_1,
    address.address_2,
    address.city,
    address.state,
    address.postcode,
    address.country,
  ].filter(
    (
      value,
    ): value is string =>
      typeof value === "string" &&
      value.trim().length > 0,
  );
}

function getMetaValue(
  meta:
    WooCommerceOrderLineItemMetaData,
): string {
  if (
    typeof meta.display_value ===
      "string" &&
    meta.display_value.trim()
  ) {
    return meta.display_value;
  }

  if (
    typeof meta.value === "string" ||
    typeof meta.value === "number" ||
    typeof meta.value === "boolean"
  ) {
    return String(meta.value);
  }

  return "";
}

function getVariationDetails(
  metaData:
    WooCommerceOrderLineItemMetaData[] |
    undefined,
): string[] {
  if (!metaData) {
    return [];
  }

  return metaData
    .filter(
      (meta) =>
        !meta.key.startsWith("_"),
    )
    .map((meta) => {
      const label =
        meta.display_key ||
        meta.key;

      const value =
        getMetaValue(meta);

      if (!label || !value) {
        return "";
      }

      return `${label}: ${value}`;
    })
    .filter(Boolean);
}

export default async function OrderDetailsPage({
  params,
}: OrderDetailsPageProps) {
  const { orderId } =
    await params;

  const numericOrderId =
    Number(orderId);

  if (
    !Number.isInteger(
      numericOrderId,
    ) ||
    numericOrderId < 1
  ) {
    notFound();
  }

  const session = await auth();

  if (
    !session?.user ||
    !session.user.customerId
  ) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(
        `/account/orders/${numericOrderId}`,
      )}`,
    );
  }

  let order;

  try {
    order =
      await getCustomerOrderById(
        numericOrderId,
        session.user.customerId,
      );
  } catch (error) {
    console.error(
      "Order details loading failed:",
      error,
    );

    return (
      <main className="min-h-[70vh] bg-gray-50 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">
            Order could not be loaded
          </h1>

          <p className="mt-3 text-gray-600">
            There was a temporary
            problem loading this order.
          </p>

          <Link
            href="/account"
            className="mt-7 inline-block rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white transition hover:bg-gray-700"
          >
            Return to account
          </Link>
        </div>
      </main>
    );
  }

  if (!order) {
    notFound();
  }

  const billingAddressLines =
    getAddressLines(order.billing);

  const shippingAddressLines =
    getAddressLines(order.shipping);

  const shippingTotal =
    order.shipping_lines.reduce(
      (total, shippingLine) =>
        total +
        Number(
          shippingLine.total || 0,
        ),
      0,
    );

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/account"
          className="inline-flex items-center text-sm font-semibold text-gray-700 transition hover:text-gray-950"
        >
          ← Back to account
        </Link>

        <header className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                Order details
              </p>

              <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">
                Order #{order.number}
              </h1>

              <p className="mt-3 text-gray-600">
                Placed on{" "}
                {formatDateTime(
                  order.date_created,
                )}
              </p>
            </div>

            <div className="text-right">
              <span
                className={`inline-flex rounded-full px-4 py-2 text-sm font-semibold capitalize ${getStatusClasses(
                  order.status,
                )}`}
              >
                {order.status.replace(
                  /-/g,
                  " ",
                )}
              </span>

              <p className="mt-4 text-2xl font-bold text-gray-900">
                {formatPrice(
                  order.total,
                  order.currency,
                )}
              </p>
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-2xl font-bold text-gray-900">
              Products
            </h2>

            <div className="mt-6 divide-y divide-gray-200">
              {order.line_items.map(
                (item) => {
                  const variationDetails =
                    getVariationDetails(
                      item.meta_data,
                    );

                  return (
                    <article
                      key={item.id}
                      className="flex items-start justify-between gap-5 py-5 first:pt-0 last:pb-0"
                    >
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {item.name}
                        </h3>

                        {variationDetails.length >
                          0 && (
                          <p className="mt-2 text-sm text-gray-600">
                            {variationDetails.join(
                              " · ",
                            )}
                          </p>
                        )}

                        <p className="mt-2 text-sm text-gray-500">
                          Quantity:{" "}
                          {item.quantity}
                        </p>
                      </div>

                      <p className="shrink-0 font-semibold text-gray-900">
                        {formatPrice(
                          item.total,
                          order.currency,
                        )}
                      </p>
                    </article>
                  );
                },
              )}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">
                Order summary
              </h2>

              <div className="mt-5 space-y-4 text-sm">
                <div className="flex justify-between gap-4 text-gray-600">
                  <span>Products</span>

                  <span>
                    {formatPrice(
                      order.line_items.reduce(
                        (
                          total,
                          item,
                        ) =>
                          total +
                          Number(
                            item.total ||
                              0,
                          ),
                        0,
                      ),
                      order.currency,
                    )}
                  </span>
                </div>

                <div className="flex justify-between gap-4 text-gray-600">
                  <span>Delivery</span>

                  <span>
                    {formatPrice(
                      shippingTotal,
                      order.currency,
                    )}
                  </span>
                </div>

                <div className="flex justify-between gap-4 border-t border-gray-200 pt-4 text-lg font-bold text-gray-900">
                  <span>Total</span>

                  <span>
                    {formatPrice(
                      order.total,
                      order.currency,
                    )}
                  </span>
                </div>
              </div>

              <div className="mt-6 border-t border-gray-200 pt-5">
                <p className="text-sm text-gray-500">
                  Payment method
                </p>

                <p className="mt-1 font-semibold text-gray-900">
                  {order.payment_method_title ||
                    "Not specified"}
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">
                Delivery address
              </h2>

              <div className="mt-4 text-sm leading-7 text-gray-600">
                <p className="font-semibold text-gray-900">
                  {getAddressName(
                    order.shipping,
                  ) ||
                    getAddressName(
                      order.billing,
                    )}
                </p>

                {(shippingAddressLines.length >
                0
                  ? shippingAddressLines
                  : billingAddressLines
                ).map(
                  (
                    addressLine,
                    index,
                  ) => (
                    <p
                      key={`${addressLine}-${index}`}
                    >
                      {addressLine}
                    </p>
                  ),
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-gray-900">
                Contact information
              </h2>

              <div className="mt-4 space-y-3 text-sm">
                <div>
                  <p className="text-gray-500">
                    Email
                  </p>

                  <p className="mt-1 break-all font-semibold text-gray-900">
                    {order.billing.email ||
                      session.user.email ||
                      "Not provided"}
                  </p>
                </div>

                <div>
                  <p className="text-gray-500">
                    Phone
                  </p>

                  <p className="mt-1 font-semibold text-gray-900">
                    {order.billing.phone ||
                      "Not provided"}
                  </p>
                </div>
              </div>
            </section>
          </aside>
        </div>

        {order.customer_note && (
          <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">
              Order note
            </h2>

            <p className="mt-3 whitespace-pre-wrap text-gray-600">
              {order.customer_note}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}