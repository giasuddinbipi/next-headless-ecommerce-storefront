"use client";

import {
  useEffect,
  useState,
} from "react";

type UnknownRecord =
  Record<string, unknown>;

type ReorderSkippedItem = {
  name: string;
  reason: string;
};

type ReorderAdjustedItem = {
  name: string;
  requestedQuantity: number;
  addedQuantity: number;
  reason: string;
};

type ReorderResult = {
  orderNumber: string;
  message: string;

  addedItemCount: number;
  skippedItemCount: number;
  adjustedItemCount: number;

  skippedItems:
    ReorderSkippedItem[];

  adjustedItems:
    ReorderAdjustedItem[];
};

const REORDER_STORAGE_KEY =
  "latest-reorder-result";

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

function isSkippedItem(
  value: unknown,
): value is ReorderSkippedItem {
  return (
    isObject(value) &&
    typeof value.name ===
      "string" &&
    typeof value.reason ===
      "string"
  );
}

function isAdjustedItem(
  value: unknown,
): value is ReorderAdjustedItem {
  return (
    isObject(value) &&
    typeof value.name ===
      "string" &&
    typeof value.reason ===
      "string" &&
    typeof value.requestedQuantity ===
      "number" &&
    Number.isFinite(
      value.requestedQuantity,
    ) &&
    typeof value.addedQuantity ===
      "number" &&
    Number.isFinite(
      value.addedQuantity,
    )
  );
}

function parseStoredResult(
  value: unknown,
): ReorderResult | null {
  if (!isObject(value)) {
    return null;
  }

  if (
    typeof value.orderNumber !==
      "string" ||
    typeof value.message !==
      "string" ||
    typeof value.addedItemCount !==
      "number" ||
    !Number.isFinite(
      value.addedItemCount,
    ) ||
    !Array.isArray(
      value.skippedItems,
    ) ||
    !value.skippedItems.every(
      isSkippedItem,
    ) ||
    !Array.isArray(
      value.adjustedItems,
    ) ||
    !value.adjustedItems.every(
      isAdjustedItem,
    )
  ) {
    return null;
  }

  return {
    orderNumber:
      value.orderNumber,

    message:
      value.message,

    addedItemCount:
      Math.max(
        0,
        Math.floor(
          value.addedItemCount,
        ),
      ),

    skippedItemCount:
      value.skippedItems.length,

    adjustedItemCount:
      value.adjustedItems.length,

    skippedItems:
      value.skippedItems,

    adjustedItems:
      value.adjustedItems,
  };
}

function parseCount(
  value: string | null,
): number {
  const count =
    Number(value);

  if (
    !Number.isFinite(
      count,
    ) ||
    count < 0
  ) {
    return 0;
  }

  return Math.floor(
    count,
  );
}

function getFallbackResultFromUrl():
  | ReorderResult
  | null {
  const searchParams =
    new URLSearchParams(
      window.location.search,
    );

  const orderNumber =
    searchParams.get(
      "reorderedFrom",
    );

  if (!orderNumber) {
    return null;
  }

  const addedItemCount =
    parseCount(
      searchParams.get(
        "added",
      ),
    );

  const skippedItemCount =
    parseCount(
      searchParams.get(
        "skipped",
      ),
    );

  const adjustedItemCount =
    parseCount(
      searchParams.get(
        "adjusted",
      ),
    );

  const hasChanges =
    skippedItemCount > 0 ||
    adjustedItemCount > 0;

  return {
    orderNumber,

    message:
      hasChanges
        ? "Available products were added using their current price and stock information."
        : "All available products were added to your cart.",

    addedItemCount,
    skippedItemCount,
    adjustedItemCount,

    skippedItems:
      [],

    adjustedItems:
      [],
  };
}

function removeReorderSearchParams():
  void {
  const url =
    new URL(
      window.location.href,
    );

  url.searchParams.delete(
    "reorderedFrom",
  );

  url.searchParams.delete(
    "added",
  );

  url.searchParams.delete(
    "skipped",
  );

  url.searchParams.delete(
    "adjusted",
  );

  const nextUrl =
    [
      url.pathname,
      url.search,
      url.hash,
    ].join("");

  window.history.replaceState(
    window.history.state,
    "",
    nextUrl,
  );
}

export default function ReorderResultBanner() {
  const [
    result,
    setResult,
  ] =
    useState<ReorderResult | null>(
      null,
    );

  /*
   * Load the one-time reorder result after the component
   * has mounted.
   *
   * The work runs inside a timer callback so the effect
   * body does not synchronously update React state.
   */
  useEffect(() => {
    const resultTimer =
      window.setTimeout(
        () => {
          let reorderResult:
            ReorderResult | null =
              null;

          /*
           * ReorderButton stores the detailed result in
           * sessionStorage.
           */
          try {
            const storedValue =
              sessionStorage.getItem(
                REORDER_STORAGE_KEY,
              );

            if (storedValue) {
              const parsedValue:
                unknown =
                JSON.parse(
                  storedValue,
                );

              reorderResult =
                parseStoredResult(
                  parsedValue,
                );

              /*
               * Show the stored result only once.
               */
              sessionStorage.removeItem(
                REORDER_STORAGE_KEY,
              );
            }
          } catch {
            /*
             * Invalid or unavailable storage must not break
             * the cart page.
             */
          }

          /*
           * Fall back to the URL summary when detailed
           * storage is unavailable.
           */
          if (!reorderResult) {
            reorderResult =
              getFallbackResultFromUrl();
          }

          if (!reorderResult) {
            return;
          }

          setResult(
            reorderResult,
          );

          removeReorderSearchParams();
        },
        0,
      );

    return () => {
      window.clearTimeout(
        resultTimer,
      );
    };
  }, []);

  if (!result) {
    return null;
  }

  const hasWarnings =
    result.skippedItemCount >
      0 ||
    result.adjustedItemCount >
      0;

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
        onClick={() => {
          setResult(
            null,
          );
        }}
        aria-label="Dismiss reorder result"
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
            ? "Reorder completed with changes"
            : "Reorder completed"}
        </p>

        <h2 className="mt-2 text-xl font-bold text-gray-900">
          Products from order #
          {result.orderNumber}
        </h2>

        <p className="mt-2 text-sm leading-6 text-gray-700">
          {result.message}
        </p>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/80 bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Added
          </p>

          <p className="mt-1 text-2xl font-bold text-green-700">
            {result.addedItemCount}
          </p>
        </div>

        <div className="rounded-xl border border-white/80 bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Stock adjusted
          </p>

          <p className="mt-1 text-2xl font-bold text-amber-700">
            {result.adjustedItemCount}
          </p>
        </div>

        <div className="rounded-xl border border-white/80 bg-white/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Skipped
          </p>

          <p className="mt-1 text-2xl font-bold text-red-700">
            {result.skippedItemCount}
          </p>
        </div>
      </div>

      {result.adjustedItems
        .length >
        0 && (
        <div className="mt-5 rounded-xl border border-amber-200 bg-white/80 p-4">
          <h3 className="font-bold text-amber-900">
            Quantity adjustments
          </h3>

          <ul className="mt-3 space-y-3 text-sm leading-6 text-gray-700">
            {result.adjustedItems
              .slice(
                0,
                20,
              )
              .map(
                (
                  item,
                  index,
                ) => (
                  <li
                    key={`${item.name}-${index}`}
                    className="border-b border-amber-100 pb-3 last:border-b-0 last:pb-0"
                  >
                    <p className="font-semibold text-gray-900">
                      {item.name}
                    </p>

                    <p className="mt-1">
                      Requested:{" "}
                      <strong>
                        {
                          item.requestedQuantity
                        }
                      </strong>
                      {" · "}
                      Added:{" "}
                      <strong>
                        {
                          item.addedQuantity
                        }
                      </strong>
                    </p>

                    <p className="mt-1 text-gray-600">
                      {item.reason}
                    </p>
                  </li>
                ),
              )}
          </ul>
        </div>
      )}

      {result.skippedItems
        .length >
        0 && (
        <div className="mt-5 rounded-xl border border-red-200 bg-white/80 p-4">
          <h3 className="font-bold text-red-900">
            Unavailable products
          </h3>

          <ul className="mt-3 space-y-3 text-sm leading-6 text-gray-700">
            {result.skippedItems
              .slice(
                0,
                20,
              )
              .map(
                (
                  item,
                  index,
                ) => (
                  <li
                    key={`${item.name}-${index}`}
                    className="border-b border-red-100 pb-3 last:border-b-0 last:pb-0"
                  >
                    <p className="font-semibold text-gray-900">
                      {item.name}
                    </p>

                    <p className="mt-1 text-gray-600">
                      {item.reason}
                    </p>
                  </li>
                ),
              )}
          </ul>
        </div>
      )}

      {result.skippedItemCount >
        0 &&
        result.skippedItems
          .length ===
          0 && (
          <p className="mt-4 text-sm leading-6 text-red-700">
            {
              result.skippedItemCount
            }{" "}
            unavailable{" "}
            {result.skippedItemCount ===
            1
              ? "product was"
              : "products were"}{" "}
            not added to the cart.
          </p>
        )}

      {result.adjustedItemCount >
        0 &&
        result.adjustedItems
          .length ===
          0 && (
          <p className="mt-3 text-sm leading-6 text-amber-800">
            Stock availability changed for{" "}
            {
              result.adjustedItemCount
            }{" "}
            {result.adjustedItemCount ===
            1
              ? "product"
              : "products"}
            , so the reorder quantity was adjusted.
          </p>
        )}
    </section>
  );
}