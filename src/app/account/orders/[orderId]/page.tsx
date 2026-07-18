import type { Metadata } from "next";

import Link from "next/link";
import {
  notFound,
  redirect,
} from "next/navigation";

import { auth } from "@/auth";

import OrderPaymentSummary from "@/components/account/OrderPaymentSummary";
import OrderStatusTimeline from "@/components/account/OrderStatusTimeline";

import {
  getCustomerOrderById,
  type WooCommerceOrderAddress,
  type WooCommerceOrderLineItemMetaData,
} from "@/lib/woocommerce";

export const metadata: Metadata = {
  title: "Order details",
  description:
    "View your order status, products, payment summary and delivery information.",
};

export const dynamic = "force-dynamic";

type OrderDetailsPageProps = {
  params: Promise<{
    orderId: string;
  }>;
};

function parseOrderId(
  value: string,
): number | null {
  const orderId = Number(value);

  if (
    !Number.isInteger(orderId) ||
    orderId < 1
  ) {
    return null;
  }

  return orderId;
}

function toValidNumber(
  value:
    | string
    | number
    | null
    | undefined,
): number {
  const amount = Number(value);

  return Number.isFinite(amount)
    ? amount
    : 0;
}

function formatPrice(
  value:
    | string
    | number
    | null
    | undefined,
  currency: string,
): string {
  return new Intl.NumberFormat(
    "en-BD",
    {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    },
  ).format(
    toValidNumber(value),
  );
}

function formatDate(
  value:
    | string
    | null
    | undefined,
): string {
  if (!value) {
    return "Not available";
  }

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
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(date);
}

function formatStatus(
  value: string,
): string {
  return value
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) =>
      letter.toUpperCase(),
    );
}

function getStatusClassName(
  status: string,
): string {
  switch (
    status.trim().toLowerCase()
  ) {
    case "completed":
      return "border-green-200 bg-green-50 text-green-800";

    case "processing":
      return "border-blue-200 bg-blue-50 text-blue-800";

    case "on-hold":
    case "pending":
      return "border-yellow-200 bg-yellow-50 text-yellow-800";

    case "cancelled":
    case "failed":
      return "border-red-200 bg-red-50 text-red-800";

    case "refunded":
      return "border-purple-200 bg-purple-50 text-purple-800";

    default:
      return "border-gray-200 bg-gray-50 text-gray-700";
  }
}

function hasAddressValue(
  address: WooCommerceOrderAddress,
): boolean {
  return Boolean(
    address.first_name ||
      address.last_name ||
      address.company ||
      address.address_1 ||
      address.address_2 ||
      address.city ||
      address.state ||
      address.postcode ||
      address.country,
  );
}

function AddressCard({
  title,
  address,
  showContact = false,
}: {
  title: string;
  address: WooCommerceOrderAddress;
  showContact?: boolean;
}) {
  const fullName = [
    address.first_name,
    address.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  const locationParts = [
    address.city,
    address.state,
    address.postcode,
  ].filter(Boolean);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-bold text-gray-900">
        {title}
      </h2>

      {hasAddressValue(address) ? (
        <div className="mt-5 space-y-2 text-sm leading-6 text-gray-600">
          {fullName && (
            <p className="font-semibold text-gray-900">
              {fullName}
            </p>
          )}

          {address.company && (
            <p>{address.company}</p>
          )}

          {address.address_1 && (
            <p>{address.address_1}</p>
          )}

          {address.address_2 && (
            <p>{address.address_2}</p>
          )}

          {locationParts.length >
            0 && (
            <p>
              {locationParts.join(
                ", ",
              )}
            </p>
          )}

          {address.country && (
            <p>{address.country}</p>
          )}

          {showContact &&
            address.phone && (
              <p className="pt-2">
                <span className="font-semibold text-gray-800">
                  Phone:
                </span>{" "}
                {address.phone}
              </p>
            )}

          {showContact &&
            address.email && (
              <p>
                <span className="font-semibold text-gray-800">
                  Email:
                </span>{" "}
                {address.email}
              </p>
            )}
        </div>
      ) : (
        <p className="mt-4 text-sm text-gray-500">
          Address information is not
          available.
        </p>
      )}
    </section>
  );
}

function getVisibleMetaData(
  metaData:
    | WooCommerceOrderLineItemMetaData[]
    | undefined,
): WooCommerceOrderLineItemMetaData[] {
  if (!metaData) {
    return [];
  }

  return metaData.filter((meta) => {
    if (!meta.key) {
      return false;
    }

    /*
     * WooCommerce internal metadata সাধারণত
     * underscore দিয়ে শুরু হয়।
     */
    return !meta.key.startsWith("_");
  });
}

function formatMetaValue(
  value: unknown,
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export default async function OrderDetailsPage({
  params,
}: OrderDetailsPageProps) {
  const { orderId: rawOrderId } =
    await params;

  const orderId =
    parseOrderId(rawOrderId);

  if (!orderId) {
    notFound();
  }

  const session = await auth();

  const customerId =
    session?.user?.customerId;

  if (
    !session?.user ||
    typeof customerId !==
      "number" ||
    customerId < 1
  ) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(
        `/account/orders/${orderId}`,
      )}`,
    );
  }

  let order;

  try {
    order =
      await getCustomerOrderById(
        orderId,
        customerId,
      );
  } catch (error) {
    console.error(
      "Customer order loading failed:",
      error,
    );

    throw new Error(
      "The order could not be loaded.",
    );
  }

  /*
   * getCustomerOrderById customer ownership
   * verify করে। অন্য customer-এর order হলে
   * null return করবে।
   */
  if (!order) {
    notFound();
  }

  const orderDate =
    formatDate(order.date_created);

  const completedDate =
    order.date_completed
      ? formatDate(
          order.date_completed,
        )
      : null;

  const paidDate =
    order.date_paid
      ? formatDate(
          order.date_paid,
        )
      : null;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-2 text-sm text-gray-500"
        >
          <Link
            href="/"
            className="transition hover:text-gray-900"
          >
            Home
          </Link>

          <span aria-hidden="true">
            /
          </span>

          <Link
            href="/account"
            className="transition hover:text-gray-900"
          >
            My account
          </Link>

          <span aria-hidden="true">
            /
          </span>

          <span className="text-gray-800">
            Order #
            {order.number}
          </span>
        </nav>

        <header className="mt-7 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                Order details
              </p>

              <h1 className="mt-2 text-3xl font-bold text-gray-900 sm:text-4xl">
                Order #
                {order.number}
              </h1>

              <p className="mt-3 text-gray-600">
                Placed on{" "}
                <time
                  dateTime={
                    order.date_created
                  }
                >
                  {orderDate}
                </time>
              </p>
            </div>

            <span
              className={[
                "inline-flex rounded-full border px-4 py-2 text-sm font-bold",
                getStatusClassName(
                  order.status,
                ),
              ].join(" ")}
            >
              {formatStatus(
                order.status,
              )}
            </span>
          </div>

          <div className="mt-7 grid gap-4 border-t border-gray-200 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Order ID
              </p>

              <p className="mt-2 font-semibold text-gray-900">
                {order.id}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Payment method
              </p>

              <p className="mt-2 font-semibold text-gray-900">
                {order.payment_method_title ||
                  "Cash on delivery"}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Payment status
              </p>

              <p
                className={[
                  "mt-2 font-semibold",
                  order.date_paid
                    ? "text-green-700"
                    : "text-yellow-700",
                ].join(" ")}
              >
                {order.date_paid
                  ? "Paid"
                  : "Pending"}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Order total
              </p>

              <p className="mt-2 text-lg font-bold text-gray-900">
                {formatPrice(
                  order.total,
                  order.currency,
                )}
              </p>
            </div>
          </div>

          {(paidDate ||
            completedDate) && (
            <div className="mt-6 flex flex-wrap gap-x-8 gap-y-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-600">
              {paidDate && (
                <p>
                  <span className="font-semibold text-gray-800">
                    Paid:
                  </span>{" "}
                  {paidDate}
                </p>
              )}

              {completedDate && (
                <p>
                  <span className="font-semibold text-gray-800">
                    Completed:
                  </span>{" "}
                  {completedDate}
                </p>
              )}
            </div>
          )}
        </header>

        <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="text-xl font-bold text-gray-900">
            Order progress
          </h2>

          <div className="mt-6">
            <OrderStatusTimeline
              status={order.status}
            />
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-8">
            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
                    Ordered items
                  </p>

                  <h2 className="mt-2 text-2xl font-bold text-gray-900">
                    Products
                  </h2>
                </div>

                <p className="text-sm text-gray-500">
                  {
                    order.line_items
                      .length
                  }{" "}
                  {order.line_items
                    .length === 1
                    ? "item"
                    : "items"}
                </p>
              </div>

              <div className="mt-6 divide-y divide-gray-200">
                {order.line_items.map(
                  (item) => {
                    const metadata =
                      getVisibleMetaData(
                        item.meta_data,
                      );

                    const subtotal =
                      toValidNumber(
                        item.subtotal,
                      );

                    const total =
                      toValidNumber(
                        item.total,
                      );

                    const hasDiscount =
                      subtotal > total;

                    return (
                      <article
                        key={item.id}
                        className="py-6 first:pt-0 last:pb-0"
                      >
                        <div className="flex items-start justify-between gap-5">
                          <div className="min-w-0">
                            <h3 className="font-bold leading-6 text-gray-900">
                              {item.name}
                            </h3>

                            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-gray-500">
                              <span>
                                Quantity:{" "}
                                {
                                  item.quantity
                                }
                              </span>

                              {item.variation_id >
                                0 && (
                                <span>
                                  Variation ID:{" "}
                                  {
                                    item.variation_id
                                  }
                                </span>
                              )}
                            </div>

                            {metadata.length >
                              0 && (
                              <dl className="mt-3 space-y-1 text-sm text-gray-500">
                                {metadata.map(
                                  (
                                    meta,
                                    index,
                                  ) => {
                                    const label =
                                      meta.display_key ??
                                      meta.key;

                                    const value =
                                      formatMetaValue(
                                        meta.display_value ??
                                          meta.value,
                                      );

                                    if (
                                      !value
                                    ) {
                                      return null;
                                    }

                                    return (
                                      <div
                                        key={`${meta.id}-${meta.key}-${index}`}
                                        className="flex flex-wrap gap-1"
                                      >
                                        <dt className="font-medium text-gray-700">
                                          {
                                            label
                                          }
                                          :
                                        </dt>

                                        <dd>
                                          {
                                            value
                                          }
                                        </dd>
                                      </div>
                                    );
                                  },
                                )}
                              </dl>
                            )}
                          </div>

                          <div className="shrink-0 text-right">
                            <p className="font-bold text-gray-900">
                              {formatPrice(
                                item.total,
                                order.currency,
                              )}
                            </p>

                            {hasDiscount && (
                              <p className="mt-1 text-xs text-gray-400 line-through">
                                {formatPrice(
                                  item.subtotal,
                                  order.currency,
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  },
                )}
              </div>
            </section>

            {order.customer_note && (
              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
                <h2 className="text-xl font-bold text-gray-900">
                  Order note
                </h2>

                <p className="mt-4 whitespace-pre-wrap leading-7 text-gray-600">
                  {order.customer_note}
                </p>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <OrderPaymentSummary
              order={order}
            />

            <AddressCard
              title="Billing address"
              address={order.billing}
              showContact
            />

            <AddressCard
              title="Shipping address"
              address={order.shipping}
            />

            <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-bold text-gray-900">
                Need assistance?
              </h2>

              <p className="mt-3 text-sm leading-6 text-gray-600">
                Contact the store and
                include order number{" "}
                <span className="font-semibold text-gray-900">
                  #{order.number}
                </span>{" "}
                in your message.
              </p>

              <Link
                href="/contact"
                className="mt-5 block rounded-xl border border-gray-300 px-5 py-3 text-center text-sm font-semibold text-gray-800 transition hover:border-gray-900 hover:bg-gray-900 hover:text-white"
              >
                Contact support
              </Link>
            </section>
          </aside>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            href="/account"
            className="rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white transition hover:bg-gray-700"
          >
            Back to my orders
          </Link>

          <Link
            href="/shop"
            className="rounded-xl border border-gray-300 bg-white px-6 py-3 font-semibold text-gray-800 transition hover:bg-gray-100"
          >
            Continue shopping
          </Link>
        </div>
      </div>
    </main>
  );
}