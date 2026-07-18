"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  useCartStore,
  type CartAttribute,
  type CartItem,
} from "@/store/cart-store";

type ReorderButtonProps = {
  orderId: number;
  orderNumber: string;
};

type UnknownRecord = Record<
  string,
  unknown
>;

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

type ReorderSuccessResponse = {
  success: true;
  message: string;

  orderId: number;
  orderNumber: string;

  addedItemCount: number;
  skippedItemCount: number;
  adjustedItemCount: number;

  items: CartItem[];

  skippedItems:
    ReorderSkippedItem[];

  adjustedItems:
    ReorderAdjustedItem[];
};

function isObject(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isCartAttribute(
  value: unknown,
): value is CartAttribute {
  return (
    isObject(value) &&
    typeof value.name ===
      "string" &&
    typeof value.option ===
      "string"
  );
}

function isCartItem(
  value: unknown,
): value is CartItem {
  if (!isObject(value)) {
    return false;
  }

  const hasValidVariationId =
    value.variationId ===
      undefined ||
    (
      typeof value.variationId ===
        "number" &&
      Number.isInteger(
        value.variationId,
      ) &&
      value.variationId > 0
    );

  const hasValidImage =
    value.image === undefined ||
    typeof value.image ===
      "string";

  const hasValidStockStatus =
    value.stockStatus ===
      "instock" ||
    value.stockStatus ===
      "outofstock" ||
    value.stockStatus ===
      "onbackorder";

  return (
    typeof value.cartKey ===
      "string" &&
    value.cartKey.trim().length >
      0 &&
    typeof value.productId ===
      "number" &&
    Number.isInteger(
      value.productId,
    ) &&
    value.productId > 0 &&
    hasValidVariationId &&
    typeof value.name ===
      "string" &&
    typeof value.slug ===
      "string" &&
    typeof value.price ===
      "string" &&
    hasValidImage &&
    hasValidStockStatus &&
    Array.isArray(
      value.attributes,
    ) &&
    value.attributes.every(
      isCartAttribute,
    ) &&
    typeof value.quantity ===
      "number" &&
    Number.isInteger(
      value.quantity,
    ) &&
    value.quantity > 0
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
    typeof value.addedQuantity ===
      "number"
  );
}

function isReorderSuccessResponse(
  value: unknown,
): value is ReorderSuccessResponse {
  return (
    isObject(value) &&
    value.success === true &&
    typeof value.message ===
      "string" &&
    typeof value.orderId ===
      "number" &&
    typeof value.orderNumber ===
      "string" &&
    typeof value.addedItemCount ===
      "number" &&
    typeof value.skippedItemCount ===
      "number" &&
    typeof value.adjustedItemCount ===
      "number" &&
    Array.isArray(value.items) &&
    value.items.every(
      isCartItem,
    ) &&
    Array.isArray(
      value.skippedItems,
    ) &&
    value.skippedItems.every(
      isSkippedItem,
    ) &&
    Array.isArray(
      value.adjustedItems,
    ) &&
    value.adjustedItems.every(
      isAdjustedItem,
    )
  );
}

function getErrorMessage(
  value: unknown,
): string {
  if (
    isObject(value) &&
    typeof value.error ===
      "string" &&
    value.error.trim()
  ) {
    return value.error;
  }

  return "The products could not be added to your cart.";
}

export default function ReorderButton({
  orderId,
  orderNumber,
}: ReorderButtonProps) {
  const router = useRouter();

  const addItems =
    useCartStore(
      (state) =>
        state.addItems,
    );

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    errorMessage,
    setErrorMessage,
  ] = useState("");

  const handleReorder =
    async () => {
      if (submitting) {
        return;
      }

      setSubmitting(true);
      setErrorMessage("");

      try {
        const response =
          await fetch(
            `/api/orders/${orderId}/reorder`,
            {
              method: "POST",

              headers: {
                Accept:
                  "application/json",

                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({}),
            },
          );

        const data: unknown =
          await response
            .json()
            .catch(() => null);

        if (!response.ok) {
          throw new Error(
            getErrorMessage(data),
          );
        }

        if (
          !isReorderSuccessResponse(
            data,
          )
        ) {
          throw new Error(
            "The server returned an invalid reorder response.",
          );
        }

        if (
          data.items.length === 0
        ) {
          throw new Error(
            "No available products were returned for reorder.",
          );
        }

        /*
         * Server-validated current product
         * information cart store-এ যোগ হবে।
         */
        addItems(data.items);

        /*
         * Cart page-এর পরবর্তী step-এ এই
         * information দিয়ে detailed banner
         * দেখানো যাবে।
         */
        try {
          sessionStorage.setItem(
            "latest-reorder-result",
            JSON.stringify({
              orderNumber:
                data.orderNumber,

              message:
                data.message,

              addedItemCount:
                data.addedItemCount,

              skippedItems:
                data.skippedItems,

              adjustedItems:
                data.adjustedItems,
            }),
          );
        } catch {
          /*
           * sessionStorage unavailable হলেও
           * reorder ও cart redirect চলবে।
           */
        }

        const searchParams =
          new URLSearchParams({
            reorderedFrom:
              orderNumber,

            added:
              String(
                data.addedItemCount,
              ),

            skipped:
              String(
                data.skippedItemCount,
              ),

            adjusted:
              String(
                data.adjustedItemCount,
              ),
          });

        router.push(
          `/cart?${searchParams.toString()}`,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "The products could not be added to your cart.",
        );
      } finally {
        setSubmitting(false);
      }
    };

  return (
    <div className="max-w-xl">
      <button
        type="button"
        disabled={submitting}
        onClick={() =>
          void handleReorder()
        }
        aria-busy={submitting}
        className="inline-flex min-h-12 items-center justify-center rounded-xl bg-green-700 px-6 font-semibold text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-green-400"
      >
        {submitting
          ? "Checking products..."
          : "Reorder"}
      </button>

      {errorMessage && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700"
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}