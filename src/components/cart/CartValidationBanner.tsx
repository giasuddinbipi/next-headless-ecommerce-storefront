"use client";

export type CartValidationRemovedItem = {
  cartKey: string;

  productId: number;
  variationId?: number;

  name: string;

  code: string;
  reason: string;
};

export type CartValidationChange = {
  type:
    | "price_changed"
    | "quantity_adjusted"
    | "details_updated";

  cartKey: string;

  productId: number;
  variationId?: number;

  name: string;
  message: string;

  previousPrice?: string;
  currentPrice?: string;

  previousQuantity?: number;
  currentQuantity?: number;
};

export type CartValidationViewResult = {
  message: string;

  originalItemCount: number;
  validatedItemCount: number;
  removedItemCount: number;
  changedItemCount: number;

  removedItems:
    CartValidationRemovedItem[];

  changes:
    CartValidationChange[];
};

type CartValidationBannerProps = {
  validating: boolean;
  errorMessage: string;

  result:
    CartValidationViewResult | null;

  onRetry: () => void;
  onDismiss: () => void;
};

function formatPrice(
  value:
    | string
    | number
    | undefined,
): string {
  const price = Number(value);

  return new Intl.NumberFormat(
    "en-BD",
    {
      style: "currency",
      currency: "BDT",
      maximumFractionDigits: 2,
    },
  ).format(
    Number.isFinite(price)
      ? price
      : 0,
  );
}

function getChangeTitle(
  type:
    CartValidationChange["type"],
): string {
  switch (type) {
    case "price_changed":
      return "Price updated";

    case "quantity_adjusted":
      return "Quantity adjusted";

    case "details_updated":
      return "Product details updated";

    default:
      return "Cart updated";
  }
}

export default function CartValidationBanner({
  validating,
  errorMessage,
  result,
  onRetry,
  onDismiss,
}: CartValidationBannerProps) {
  if (validating) {
    return (
      <section
        role="status"
        aria-live="polite"
        className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm sm:p-6"
      >
        <div className="flex items-center gap-4">
          <div
            aria-hidden="true"
            className="h-6 w-6 animate-spin rounded-full border-2 border-blue-200 border-t-blue-700"
          />

          <div>
            <h2 className="font-bold text-blue-900">
              Checking your cart
            </h2>

            <p className="mt-1 text-sm leading-6 text-blue-800">
              Current prices, stock and
              product options are being
              verified.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section
        role="alert"
        className="relative rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm sm:p-6"
      >
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss cart validation error"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold text-red-500 transition hover:bg-white hover:text-red-800"
        >
          ×
        </button>

        <div className="pr-10">
          <h2 className="font-bold text-red-900">
            Cart could not be checked
          </h2>

          <p className="mt-2 text-sm leading-6 text-red-700">
            {errorMessage}
          </p>

          <p className="mt-2 text-sm leading-6 text-red-700">
            Your existing cart has not
            been changed.
          </p>

          <button
            type="button"
            onClick={onRetry}
            className="mt-4 rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-800"
          >
            Check cart again
          </button>
        </div>
      </section>
    );
  }

  if (!result) {
    return null;
  }

  const hasWarnings =
    result.removedItemCount > 0 ||
    result.changedItemCount > 0;

  return (
    <section
      aria-live="polite"
      className={[
        "relative rounded-2xl border p-5 shadow-sm sm:p-6",

        hasWarnings
          ? "border-amber-200 bg-amber-50"
          : "border-green-200 bg-green-50",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss cart validation result"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-xl font-bold text-gray-500 transition hover:bg-white hover:text-gray-900"
      >
        ×
      </button>

      <div className="pr-10">
        <p
          className={[
            "text-sm font-semibold uppercase tracking-wide",

            hasWarnings
              ? "text-amber-700"
              : "text-green-700",
          ].join(" ")}
        >
          {hasWarnings
            ? "Cart updated"
            : "Cart verified"}
        </p>

        <h2 className="mt-2 text-xl font-bold text-gray-900">
          {hasWarnings
            ? "Your cart changed"
            : "Your cart is up to date"}
        </h2>

        <p className="mt-2 text-sm leading-6 text-gray-700">
          {result.message}
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/80 bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Available
          </p>

          <p className="mt-1 text-2xl font-bold text-green-700">
            {result.validatedItemCount}
          </p>
        </div>

        <div className="rounded-xl border border-white/80 bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Changes
          </p>

          <p className="mt-1 text-2xl font-bold text-amber-700">
            {result.changedItemCount}
          </p>
        </div>

        <div className="rounded-xl border border-white/80 bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Removed
          </p>

          <p className="mt-1 text-2xl font-bold text-red-700">
            {result.removedItemCount}
          </p>
        </div>
      </div>

      {result.changes.length > 0 && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-white/80 p-4">
          <h3 className="font-bold text-amber-900">
            Cart changes
          </h3>

          <ul className="mt-3 space-y-4">
            {result.changes
              .slice(0, 30)
              .map(
                (
                  change,
                  index,
                ) => (
                  <li
                    key={`${change.type}-${change.cartKey}-${index}`}
                    className="border-b border-amber-100 pb-4 text-sm last:border-b-0 last:pb-0"
                  >
                    <p className="font-semibold text-gray-900">
                      {change.name}
                    </p>

                    <p className="mt-1 font-medium text-amber-800">
                      {getChangeTitle(
                        change.type,
                      )}
                    </p>

                    {change.type ===
                      "price_changed" &&
                      change.previousPrice !==
                        undefined &&
                      change.currentPrice !==
                        undefined && (
                        <p className="mt-1 text-gray-700">
                          Previous price:{" "}
                          <span className="line-through">
                            {formatPrice(
                              change.previousPrice,
                            )}
                          </span>
                          {" → "}
                          Current price:{" "}
                          <strong>
                            {formatPrice(
                              change.currentPrice,
                            )}
                          </strong>
                        </p>
                      )}

                    {change.type ===
                      "quantity_adjusted" &&
                      change.previousQuantity !==
                        undefined &&
                      change.currentQuantity !==
                        undefined && (
                        <p className="mt-1 text-gray-700">
                          Previous quantity:{" "}
                          <strong>
                            {
                              change.previousQuantity
                            }
                          </strong>
                          {" → "}
                          Available quantity:{" "}
                          <strong>
                            {
                              change.currentQuantity
                            }
                          </strong>
                        </p>
                      )}

                    <p className="mt-1 leading-6 text-gray-600">
                      {change.message}
                    </p>
                  </li>
                ),
              )}
          </ul>
        </div>
      )}

      {result.removedItems.length >
        0 && (
        <div className="mt-5 rounded-xl border border-red-200 bg-white/80 p-4">
          <h3 className="font-bold text-red-900">
            Removed products
          </h3>

          <ul className="mt-3 space-y-4">
            {result.removedItems
              .slice(0, 30)
              .map(
                (
                  item,
                  index,
                ) => (
                  <li
                    key={`${item.cartKey}-${index}`}
                    className="border-b border-red-100 pb-4 text-sm last:border-b-0 last:pb-0"
                  >
                    <p className="font-semibold text-gray-900">
                      {item.name}
                    </p>

                    <p className="mt-1 leading-6 text-red-700">
                      {item.reason}
                    </p>
                  </li>
                ),
              )}
          </ul>
        </div>
      )}
    </section>
  );
}