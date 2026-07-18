import type { Metadata } from "next";

import Link from "next/link";

import {
  notFound,
  redirect,
} from "next/navigation";

import { auth } from "@/auth";

import PrintInvoiceButton from "@/components/account/PrintInvoiceButton";

import {
  getCustomerOrderById,
  type WooCommerceOrderAddress,
  type WooCommerceOrderLineItemMetaData,
} from "@/lib/woocommerce";

export const metadata: Metadata = {
  title: "Printable order invoice",
  description:
    "View and print your order invoice.",
};

export const dynamic = "force-dynamic";

type OrderInvoicePageProps = {
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

function getVisibleMetadata(
  metadata:
    | WooCommerceOrderLineItemMetaData[]
    | undefined,
): WooCommerceOrderLineItemMetaData[] {
  if (!metadata) {
    return [];
  }

  return metadata.filter(
    (item) =>
      Boolean(item.key) &&
      !item.key.startsWith("_"),
  );
}

function AddressBlock({
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

  const cityLine = [
    address.city,
    address.state,
    address.postcode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="invoice-avoid-break">
      <h2 className="border-b border-gray-300 pb-2 text-base font-bold text-gray-900">
        {title}
      </h2>

      <div className="mt-3 space-y-1 text-sm leading-6 text-gray-700">
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

        {cityLine && (
          <p>{cityLine}</p>
        )}

        {address.country && (
          <p>{address.country}</p>
        )}

        {showContact &&
          address.phone && (
            <p className="pt-1">
              <span className="font-semibold">
                Phone:
              </span>{" "}
              {address.phone}
            </p>
          )}

        {showContact &&
          address.email && (
            <p>
              <span className="font-semibold">
                Email:
              </span>{" "}
              {address.email}
            </p>
          )}
      </div>
    </section>
  );
}

export default async function OrderInvoicePage({
  params,
}: OrderInvoicePageProps) {
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
    typeof customerId !== "number" ||
    customerId < 1
  ) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(
        `/account/orders/${orderId}/invoice`,
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
      "Invoice order loading failed:",
      error,
    );

    throw new Error(
      "The invoice could not be loaded.",
    );
  }

  /*
   * getCustomerOrderById ownership check করে।
   * অন্য customer-এর order হলে null পাওয়া যাবে।
   */
  if (!order) {
    notFound();
  }

  const storeName =
    process.env.STORE_NAME
      ?.trim() ||
    process.env
      .NEXT_PUBLIC_STORE_NAME
      ?.trim() ||
    "Online Store";

  const storeAddress =
    process.env.STORE_ADDRESS
      ?.trim() || "";

  const storePhone =
    process.env.STORE_PHONE
      ?.trim() || "";

  const storeEmail =
    process.env.STORE_EMAIL
      ?.trim() || "";

  const itemsSubtotal =
    order.line_items.reduce(
      (total, item) =>
        total +
        toValidNumber(
          item.subtotal,
        ),
      0,
    );

  const discountTotal =
    toValidNumber(
      order.discount_total,
    );

  const shippingTotal =
    toValidNumber(
      order.shipping_total,
    );

  const taxTotal =
    toValidNumber(
      order.total_tax,
    );

  const orderTotal =
    toValidNumber(
      order.total,
    );

  const coupons =
    order.coupon_lines ?? [];

  const paymentStatus =
    order.date_paid
      ? "Paid"
      : "Payment pending";

  return (
    <>
      <style>
        {`
          @media print {
            @page {
              size: A4;
              margin: 12mm;
            }

            body {
              background: #ffffff !important;
            }

            .invoice-screen-only {
              display: none !important;
            }

            .invoice-page-shell {
              background: #ffffff !important;
              padding: 0 !important;
            }

            .invoice-sheet {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              border: 0 !important;
              border-radius: 0 !important;
              box-shadow: none !important;
              padding: 0 !important;
            }

            .invoice-avoid-break {
              break-inside: avoid;
              page-break-inside: avoid;
            }

            .invoice-product-table thead {
              display: table-header-group;
            }

            .invoice-product-table tr {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }
        `}
      </style>

      <main className="invoice-page-shell min-h-screen bg-gray-100 px-4 py-8 sm:px-6">
        <div className="invoice-screen-only mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4">
          <Link
            href={`/account/orders/${order.id}`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 bg-white px-5 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
          >
            Back to order
          </Link>

          <PrintInvoiceButton />
        </div>

        <article className="invoice-sheet mx-auto mt-6 max-w-5xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-10">
          {/* Invoice header */}
          <div className="invoice-avoid-break flex flex-wrap items-start justify-between gap-8 border-b border-gray-300 pb-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gray-500">
                Order invoice
              </p>

              <h1 className="mt-3 text-3xl font-bold text-gray-950">
                {storeName}
              </h1>

              <div className="mt-3 space-y-1 text-sm leading-6 text-gray-600">
                {storeAddress && (
                  <p>{storeAddress}</p>
                )}

                {storePhone && (
                  <p>
                    Phone: {storePhone}
                  </p>
                )}

                {storeEmail && (
                  <p>
                    Email: {storeEmail}
                  </p>
                )}
              </div>
            </div>

            <div className="min-w-64 text-left sm:text-right">
              <p className="text-2xl font-bold text-gray-950">
                Invoice #
                {order.number}
              </p>

              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between gap-5 sm:justify-end">
                  <dt className="text-gray-500">
                    Order ID:
                  </dt>

                  <dd className="font-semibold text-gray-900">
                    {order.id}
                  </dd>
                </div>

                <div className="flex justify-between gap-5 sm:justify-end">
                  <dt className="text-gray-500">
                    Order date:
                  </dt>

                  <dd className="font-semibold text-gray-900">
                    {formatDate(
                      order.date_created,
                    )}
                  </dd>
                </div>

                <div className="flex justify-between gap-5 sm:justify-end">
                  <dt className="text-gray-500">
                    Status:
                  </dt>

                  <dd className="font-semibold text-gray-900">
                    {formatStatus(
                      order.status,
                    )}
                  </dd>
                </div>

                <div className="flex justify-between gap-5 sm:justify-end">
                  <dt className="text-gray-500">
                    Payment:
                  </dt>

                  <dd
                    className={
                      order.date_paid
                        ? "font-semibold text-green-700"
                        : "font-semibold text-yellow-700"
                    }
                  >
                    {paymentStatus}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Addresses */}
          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <AddressBlock
              title="Bill to"
              address={order.billing}
              showContact
            />

            <AddressBlock
              title="Deliver to"
              address={order.shipping}
            />
          </div>

          {/* Ordered products */}
          <section className="mt-10">
            <h2 className="text-xl font-bold text-gray-950">
              Ordered products
            </h2>

            <div className="mt-4 overflow-x-auto">
              <table className="invoice-product-table w-full min-w-[680px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-300 bg-gray-50">
                    <th className="px-4 py-3 font-bold text-gray-900">
                      Product
                    </th>

                    <th className="px-4 py-3 text-center font-bold text-gray-900">
                      Quantity
                    </th>

                    <th className="px-4 py-3 text-right font-bold text-gray-900">
                      Unit price
                    </th>

                    <th className="px-4 py-3 text-right font-bold text-gray-900">
                      Total
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {order.line_items.map(
                    (item) => {
                      const metadata =
                        getVisibleMetadata(
                          item.meta_data,
                        );

                      const quantity =
                        item.quantity > 0
                          ? item.quantity
                          : 1;

                      const unitPrice =
                        toValidNumber(
                          item.subtotal,
                        ) / quantity;

                      return (
                        <tr
                          key={item.id}
                          className="border-b border-gray-200 align-top"
                        >
                          <td className="px-4 py-4">
                            <p className="font-semibold text-gray-950">
                              {item.name}
                            </p>

                            {metadata.length >
                              0 && (
                              <div className="mt-2 space-y-1 text-xs text-gray-500">
                                {metadata.map(
                                  (
                                    meta,
                                    index,
                                  ) => {
                                    const value =
                                      formatMetaValue(
                                        meta.display_value ??
                                          meta.value,
                                      );

                                    if (!value) {
                                      return null;
                                    }

                                    return (
                                      <p
                                        key={`${meta.id}-${meta.key}-${index}`}
                                      >
                                        <span className="font-semibold">
                                          {meta.display_key ??
                                            meta.key}
                                          :
                                        </span>{" "}
                                        {value}
                                      </p>
                                    );
                                  },
                                )}
                              </div>
                            )}

                            {item.variation_id >
                              0 && (
                              <p className="mt-2 text-xs text-gray-400">
                                Variation ID:{" "}
                                {
                                  item.variation_id
                                }
                              </p>
                            )}
                          </td>

                          <td className="px-4 py-4 text-center text-gray-700">
                            {item.quantity}
                          </td>

                          <td className="px-4 py-4 text-right text-gray-700">
                            {formatPrice(
                              unitPrice,
                              order.currency,
                            )}
                          </td>

                          <td className="px-4 py-4 text-right font-semibold text-gray-950">
                            {formatPrice(
                              item.total,
                              order.currency,
                            )}
                          </td>
                        </tr>
                      );
                    },
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Note and totals */}
          <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div>
              {order.customer_note ? (
                <section className="invoice-avoid-break rounded-xl border border-gray-200 bg-gray-50 p-5">
                  <h2 className="font-bold text-gray-900">
                    Customer note
                  </h2>

                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                    {order.customer_note}
                  </p>
                </section>
              ) : (
                <section className="invoice-avoid-break rounded-xl border border-gray-200 bg-gray-50 p-5">
                  <h2 className="font-bold text-gray-900">
                    Payment method
                  </h2>

                  <p className="mt-2 text-sm text-gray-600">
                    {order.payment_method_title ||
                      "Cash on delivery"}
                  </p>
                </section>
              )}
            </div>

            <section className="invoice-avoid-break rounded-xl border border-gray-300 p-5">
              <h2 className="text-lg font-bold text-gray-950">
                Payment summary
              </h2>

              {coupons.length > 0 && (
                <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-green-800">
                    Applied coupon
                  </p>

                  <div className="mt-2 space-y-2">
                    {coupons.map(
                      (coupon) => (
                        <div
                          key={`${coupon.id}-${coupon.code}`}
                          className="flex justify-between gap-4 text-sm"
                        >
                          <span className="font-bold uppercase text-green-800">
                            {coupon.code}
                          </span>

                          {toValidNumber(
                            coupon.discount,
                          ) > 0 && (
                            <span className="font-semibold text-green-700">
                              −
                              {formatPrice(
                                coupon.discount,
                                order.currency,
                              )}
                            </span>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between gap-5 text-gray-600">
                  <dt>Items subtotal</dt>

                  <dd className="font-medium text-gray-900">
                    {formatPrice(
                      itemsSubtotal,
                      order.currency,
                    )}
                  </dd>
                </div>

                {discountTotal > 0 && (
                  <div className="flex justify-between gap-5 text-green-700">
                    <dt>Discount</dt>

                    <dd className="font-semibold">
                      −
                      {formatPrice(
                        discountTotal,
                        order.currency,
                      )}
                    </dd>
                  </div>
                )}

                <div className="flex justify-between gap-5 text-gray-600">
                  <dt>Delivery charge</dt>

                  <dd className="font-medium text-gray-900">
                    {shippingTotal > 0
                      ? formatPrice(
                          shippingTotal,
                          order.currency,
                        )
                      : "Free"}
                  </dd>
                </div>

                {taxTotal > 0 && (
                  <div className="flex justify-between gap-5 text-gray-600">
                    <dt>Tax</dt>

                    <dd className="font-medium text-gray-900">
                      {formatPrice(
                        taxTotal,
                        order.currency,
                      )}
                    </dd>
                  </div>
                )}

                <div className="flex justify-between gap-5 border-t-2 border-gray-300 pt-4 text-lg font-bold text-gray-950">
                  <dt>Order total</dt>

                  <dd>
                    {formatPrice(
                      orderTotal,
                      order.currency,
                    )}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 border-t border-gray-200 pt-4 text-sm">
                <p className="text-gray-500">
                  Payment method
                </p>

                <p className="mt-1 font-semibold text-gray-900">
                  {order.payment_method_title ||
                    "Cash on delivery"}
                </p>

                <p
                  className={[
                    "mt-1 font-semibold",
                    order.date_paid
                      ? "text-green-700"
                      : "text-yellow-700",
                  ].join(" ")}
                >
                  {paymentStatus}
                </p>
              </div>
            </section>
          </div>

          {/* Invoice footer */}
          <div className="invoice-avoid-break mt-10 border-t border-gray-300 pt-6 text-center text-sm leading-6 text-gray-500">
            <p className="font-semibold text-gray-800">
              Thank you for your order.
            </p>

            <p className="mt-1">
              Please keep this document
              for your order records.
            </p>

            <p className="mt-3 text-xs">
              Generated from order #
              {order.number}
            </p>
          </div>
        </article>
      </main>
    </>
  );
}