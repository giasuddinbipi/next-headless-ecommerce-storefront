import type {
  WooCommerceOrder,
} from "@/lib/woocommerce";

type OrderPaymentSummaryProps = {
  order: WooCommerceOrder;
};

function toValidNumber(
  value: string | number | undefined,
): number {
  const amount = Number(value);

  return Number.isFinite(amount)
    ? amount
    : 0;
}

function formatPrice(
  value: string | number,
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

export default function OrderPaymentSummary({
  order,
}: OrderPaymentSummaryProps) {
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
    toValidNumber(order.total);

  const coupons =
    order.coupon_lines ?? [];

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-xl font-bold text-gray-900">
        Payment summary
      </h2>

      <div className="mt-5 space-y-4 text-sm">
        <div className="flex items-center justify-between gap-4 text-gray-600">
          <span>
            Items subtotal
          </span>

          <span className="font-medium text-gray-900">
            {formatPrice(
              itemsSubtotal,
              order.currency,
            )}
          </span>
        </div>

        {coupons.length > 0 && (
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="font-semibold text-green-800">
              Applied coupon
            </p>

            <div className="mt-3 space-y-3">
              {coupons.map(
                (coupon) => {
                  const couponDiscount =
                    toValidNumber(
                      coupon.discount,
                    );

                  return (
                    <div
                      key={`${coupon.id}-${coupon.code}`}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase text-green-800">
                        {coupon.code}
                      </span>

                      {couponDiscount >
                        0 && (
                        <span className="font-semibold text-green-700">
                          −
                          {formatPrice(
                            couponDiscount,
                            order.currency,
                          )}
                        </span>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          </div>
        )}

        {discountTotal > 0 && (
          <div className="flex items-center justify-between gap-4 text-green-700">
            <span>
              Total discount
            </span>

            <span className="font-semibold">
              −
              {formatPrice(
                discountTotal,
                order.currency,
              )}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 text-gray-600">
          <span>
            Delivery charge
          </span>

          {shippingTotal > 0 ? (
            <span className="font-medium text-gray-900">
              {formatPrice(
                shippingTotal,
                order.currency,
              )}
            </span>
          ) : (
            <span className="font-semibold text-green-700">
              Free
            </span>
          )}
        </div>

        {taxTotal > 0 && (
          <div className="flex items-center justify-between gap-4 text-gray-600">
            <span>Tax</span>

            <span className="font-medium text-gray-900">
              {formatPrice(
                taxTotal,
                order.currency,
              )}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 border-t border-gray-200 pt-5 text-lg font-bold text-gray-900">
          <span>
            Order total
          </span>

          <span>
            {formatPrice(
              orderTotal,
              order.currency,
            )}
          </span>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-gray-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Payment method
        </p>

        <p className="mt-2 font-semibold text-gray-900">
          {order.payment_method_title ||
            "Cash on delivery"}
        </p>

        {order.date_paid ? (
          <p className="mt-1 text-sm font-medium text-green-700">
            Payment completed
          </p>
        ) : (
          <p className="mt-1 text-sm text-yellow-700">
            Payment pending
          </p>
        )}
      </div>
    </section>
  );
}