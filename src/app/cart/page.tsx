"use client";

import Image from "next/image";
import Link from "next/link";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

import CartValidationBanner, {
  type CartValidationChange,
  type CartValidationRemovedItem,
  type CartValidationViewResult,
} from "@/components/cart/CartValidationBanner";

import ReorderResultBanner from "@/components/cart/ReorderResultBanner";

import {
  useCartStore,
  type CartAttribute,
  type CartItem,
} from "@/store/cart-store";

type UnknownRecord =
  Record<string, unknown>;

type CartValidationSuccessResponse = {
  success: true;
  message: string;

  items: CartItem[];

  removedItems:
    CartValidationRemovedItem[];

  changes:
    CartValidationChange[];

  originalItemCount: number;
  validatedItemCount: number;
  removedItemCount: number;
  changedItemCount: number;
};

function formatPrice(
  price: number,
): string {
  return new Intl.NumberFormat(
    "en-BD",
    {
      style: "currency",
      currency: "BDT",
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

  const variationIsValid =
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

  const imageIsValid =
    value.image === undefined ||
    typeof value.image ===
      "string";

  const stockStatusIsValid =
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
    variationIsValid &&
    typeof value.name ===
      "string" &&
    typeof value.slug ===
      "string" &&
    typeof value.price ===
      "string" &&
    imageIsValid &&
    stockStatusIsValid &&
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

function isRemovedItem(
  value: unknown,
): value is CartValidationRemovedItem {
  return (
    isObject(value) &&
    typeof value.cartKey ===
      "string" &&
    typeof value.productId ===
      "number" &&
    typeof value.name ===
      "string" &&
    typeof value.code ===
      "string" &&
    typeof value.reason ===
      "string"
  );
}

function isValidationChange(
  value: unknown,
): value is CartValidationChange {
  if (!isObject(value)) {
    return false;
  }

  const typeIsValid =
    value.type ===
      "price_changed" ||
    value.type ===
      "quantity_adjusted" ||
    value.type ===
      "details_updated";

  return (
    typeIsValid &&
    typeof value.cartKey ===
      "string" &&
    typeof value.productId ===
      "number" &&
    typeof value.name ===
      "string" &&
    typeof value.message ===
      "string"
  );
}

function isNonNegativeInteger(
  value: unknown,
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0
  );
}

function isValidationSuccessResponse(
  value: unknown,
): value is CartValidationSuccessResponse {
  return (
    isObject(value) &&
    value.success === true &&
    typeof value.message ===
      "string" &&
    Array.isArray(
      value.items,
    ) &&
    value.items.every(
      isCartItem,
    ) &&
    Array.isArray(
      value.removedItems,
    ) &&
    value.removedItems.every(
      isRemovedItem,
    ) &&
    Array.isArray(
      value.changes,
    ) &&
    value.changes.every(
      isValidationChange,
    ) &&
    isNonNegativeInteger(
      value.originalItemCount,
    ) &&
    isNonNegativeInteger(
      value.validatedItemCount,
    ) &&
    isNonNegativeInteger(
      value.removedItemCount,
    ) &&
    isNonNegativeInteger(
      value.changedItemCount,
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

  return "The cart could not be checked right now.";
}

export default function CartPage() {
  const router =
    useRouter();

  const [mounted, setMounted] =
    useState(false);

  const [
    validating,
    setValidating,
  ] = useState(false);

  const [
    cartValidated,
    setCartValidated,
  ] = useState(false);

  const [
    validationError,
    setValidationError,
  ] = useState("");

  const [
    validationResult,
    setValidationResult,
  ] =
    useState<CartValidationViewResult | null>(
      null,
    );

  const automaticValidationStarted =
    useRef(false);

  const items =
    useCartStore(
      (state) => state.items,
    );

  const replaceItems =
    useCartStore(
      (state) =>
        state.replaceItems,
    );

  const increaseQuantity =
    useCartStore(
      (state) =>
        state.increaseQuantity,
    );

  const decreaseQuantity =
    useCartStore(
      (state) =>
        state.decreaseQuantity,
    );

  const removeItem =
    useCartStore(
      (state) =>
        state.removeItem,
    );

  const clearCart =
    useCartStore(
      (state) =>
        state.clearCart,
    );

  useEffect(() => {
    setMounted(true);
  }, []);

  const validateCartSnapshot =
    useCallback(
      async (
        cartItems:
          CartItem[],
      ): Promise<
        | CartValidationSuccessResponse
        | null
      > => {
        if (
          cartItems.length === 0
        ) {
          setCartValidated(true);
          setValidationError("");

          return null;
        }

        setValidating(true);
        setValidationError("");
        setValidationResult(null);

        try {
          const response =
            await fetch(
              "/api/cart/validate",
              {
                method: "POST",

                headers: {
                  Accept:
                    "application/json",

                  "Content-Type":
                    "application/json",
                },

                body:
                  JSON.stringify({
                    website: "",
                    items:
                      cartItems,
                  }),

                cache: "no-store",
              },
            );

          const data: unknown =
            await response
              .json()
              .catch(() => null);

          if (!response.ok) {
            throw new Error(
              getErrorMessage(
                data,
              ),
            );
          }

          if (
            !isValidationSuccessResponse(
              data,
            )
          ) {
            throw new Error(
              "The server returned an invalid cart validation response.",
            );
          }

          /*
           * Server response সফল হলে তবেই
           * existing cart replace করা হবে।
           */
          replaceItems(
            data.items,
          );

          setValidationResult({
            message:
              data.message,

            originalItemCount:
              data.originalItemCount,

            validatedItemCount:
              data.validatedItemCount,

            removedItemCount:
              data.removedItemCount,

            changedItemCount:
              data.changedItemCount,

            removedItems:
              data.removedItems,

            changes:
              data.changes,
          });

          setCartValidated(true);

          return data;
        } catch (error) {
          setCartValidated(false);

          setValidationError(
            error instanceof Error
              ? error.message
              : "The cart could not be checked right now.",
          );

          return null;
        } finally {
          setValidating(false);
        }
      },
      [replaceItems],
    );

  /*
   * Cart page প্রথমবার hydration শেষ হলে
   * automatic validation চালানো হবে।
   */
  useEffect(() => {
    if (
      !mounted ||
      automaticValidationStarted
        .current
    ) {
      return;
    }

    automaticValidationStarted.current =
      true;

    if (items.length === 0) {
      setCartValidated(true);
      return;
    }

    void validateCartSnapshot(
      items,
    );
  }, [
    mounted,
    items,
    validateCartSnapshot,
  ]);

  const markCartAsChanged = () => {
    setCartValidated(false);
    setValidationResult(null);
    setValidationError("");
  };

  const handleIncreaseQuantity = (
    cartKey: string,
  ) => {
    if (validating) {
      return;
    }

    increaseQuantity(cartKey);
    markCartAsChanged();
  };

  const handleDecreaseQuantity = (
    cartKey: string,
  ) => {
    if (validating) {
      return;
    }

    decreaseQuantity(cartKey);
    markCartAsChanged();
  };

  const handleRemoveItem = (
    cartKey: string,
  ) => {
    if (validating) {
      return;
    }

    removeItem(cartKey);
    markCartAsChanged();
  };

  const handleClearCart = () => {
    if (validating) {
      return;
    }

    clearCart();

    setCartValidated(true);
    setValidationResult(null);
    setValidationError("");
  };

  const handleRetryValidation =
    () => {
      if (
        validating ||
        items.length === 0
      ) {
        return;
      }

      void validateCartSnapshot(
        items,
      );
    };

  const handleProceedToCheckout =
    async () => {
      if (
        validating ||
        items.length === 0
      ) {
        return;
      }

      /*
       * Checkout-এর ঠিক আগেও cart আবার
       * validate হবে। Page-load validation-এর
       * ওপর একমাত্রভাবে নির্ভর করা হবে না।
       */
      const result =
        await validateCartSnapshot(
          items,
        );

      if (
        !result ||
        result.items.length === 0
      ) {
        return;
      }

      router.push(
        "/checkout",
      );
    };

  const subtotal =
    items.reduce(
      (total, item) => {
        const itemPrice =
          Number(
            item.price || 0,
          );

        return (
          total +
          (
            Number.isFinite(
              itemPrice,
            )
              ? itemPrice
              : 0
          ) *
            item.quantity
        );
      },
      0,
    );

  const totalItems =
    items.reduce(
      (total, item) =>
        total +
        item.quantity,
      0,
    );

  if (!mounted) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <div className="h-40 animate-pulse rounded-2xl bg-gray-200" />
        </div>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="min-h-[70vh] bg-gray-50 px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-7xl">
          <ReorderResultBanner />

          <div className="mt-6">
            <CartValidationBanner
              validating={
                validating
              }
              errorMessage={
                validationError
              }
              result={
                validationResult
              }
              onRetry={
                handleRetryValidation
              }
              onDismiss={() => {
                setValidationResult(
                  null,
                );

                setValidationError(
                  "",
                );
              }}
            />
          </div>

          <div className="flex min-h-[55vh] items-center justify-center">
            <div className="max-w-lg text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gray-200">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  className="h-10 w-10 text-gray-700"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 3h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 7H6"
                  />

                  <path
                    strokeLinecap="round"
                    d="M10 20h.01M18 20h.01"
                  />
                </svg>
              </div>

              <h1 className="mt-6 text-3xl font-bold text-gray-900">
                Your cart is empty
              </h1>

              <p className="mt-3 text-gray-600">
                Browse the store and add
                products to your cart.
              </p>

              <Link
                href="/shop"
                className="mt-7 inline-block rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white transition hover:bg-gray-700"
              >
                Continue shopping
              </Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main
      aria-busy={validating}
      className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6"
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              Shopping cart
            </h1>

            <p className="mt-2 text-gray-600">
              {totalItems}{" "}
              {totalItems === 1
                ? "item"
                : "items"}{" "}
              in your cart
            </p>
          </div>

          <button
            type="button"
            disabled={validating}
            onClick={
              handleClearCart
            }
            className="text-sm font-semibold text-red-600 transition hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear cart
          </button>
        </div>

        <div className="mb-6">
          <ReorderResultBanner />
        </div>

        <div className="mb-8">
          <CartValidationBanner
            validating={
              validating
            }
            errorMessage={
              validationError
            }
            result={
              validationResult
            }
            onRetry={
              handleRetryValidation
            }
            onDismiss={() => {
              setValidationResult(
                null,
              );

              setValidationError(
                "",
              );
            }}
          />
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
          <section className="space-y-4">
            {items.map((item) => {
              const itemPrice =
                Number(
                  item.price ||
                    0,
                );

              const lineTotal =
                (
                  Number.isFinite(
                    itemPrice,
                  )
                    ? itemPrice
                    : 0
                ) *
                item.quantity;

              return (
                <article
                  key={
                    item.cartKey
                  }
                  className="grid gap-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-[140px_1fr]"
                >
                  <Link
                    href={`/products/${item.slug}`}
                    className="relative aspect-square overflow-hidden rounded-xl bg-gray-100"
                  >
                    {item.image ? (
                      <Image
                        src={
                          item.image
                        }
                        alt={
                          item.name
                        }
                        fill
                        sizes="140px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-gray-500">
                        No image
                      </div>
                    )}
                  </Link>

                  <div className="flex flex-col justify-between">
                    <div>
                      <Link
                        href={`/products/${item.slug}`}
                      >
                        <h2 className="text-lg font-semibold text-gray-900 transition hover:text-blue-700">
                          {item.name}
                        </h2>
                      </Link>

                      {item.attributes
                        ?.length >
                        0 && (
                        <p className="mt-2 text-sm text-gray-600">
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

                      <p className="mt-2 text-sm text-gray-600">
                        Unit price:{" "}
                        {formatPrice(
                          itemPrice,
                        )}
                      </p>

                      <p className="mt-2 font-bold text-gray-900">
                        Total:{" "}
                        {formatPrice(
                          lineTotal,
                        )}
                      </p>

                      {item.stockStatus ===
                        "instock" && (
                        <p className="mt-2 text-sm font-medium text-green-700">
                          In stock
                        </p>
                      )}

                      {item.stockStatus ===
                        "onbackorder" && (
                        <p className="mt-2 text-sm font-medium text-yellow-700">
                          Available on
                          backorder
                        </p>
                      )}

                      {item.stockStatus ===
                        "outofstock" && (
                        <p className="mt-2 text-sm font-medium text-red-700">
                          Currently out
                          of stock
                        </p>
                      )}
                    </div>

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center overflow-hidden rounded-lg border border-gray-300">
                        <button
                          type="button"
                          disabled={
                            validating
                          }
                          aria-label={`Decrease ${item.name} quantity`}
                          onClick={() =>
                            handleDecreaseQuantity(
                              item.cartKey,
                            )
                          }
                          className="h-10 w-10 text-lg font-semibold transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          −
                        </button>

                        <span className="flex h-10 min-w-10 items-center justify-center border-x border-gray-300 px-3 font-semibold">
                          {
                            item.quantity
                          }
                        </span>

                        <button
                          type="button"
                          disabled={
                            validating ||
                            item.quantity >=
                              99
                          }
                          aria-label={`Increase ${item.name} quantity`}
                          onClick={() =>
                            handleIncreaseQuantity(
                              item.cartKey,
                            )
                          }
                          className="h-10 w-10 text-lg font-semibold transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={
                          validating
                        }
                        onClick={() =>
                          handleRemoveItem(
                            item.cartKey,
                          )
                        }
                        className="text-sm font-semibold text-red-600 transition hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          <aside className="h-fit rounded-2xl border border-gray-200 bg-white p-6 shadow-sm lg:sticky lg:top-24">
            <h2 className="text-xl font-bold text-gray-900">
              Order summary
            </h2>

            <div className="mt-6 space-y-4 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>Items</span>

                <span>
                  {totalItems}
                </span>
              </div>

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
                  Calculated at
                  checkout
                </span>
              </div>
            </div>

            <div className="mt-6 flex justify-between border-t border-gray-200 pt-5 text-lg font-bold text-gray-900">
              <span>Total</span>

              <span>
                {formatPrice(
                  subtotal,
                )}
              </span>
            </div>

            {!cartValidated &&
              !validating && (
                <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800">
                  Your cart will be
                  checked again before
                  checkout.
                </div>
              )}

            <button
              type="button"
              disabled={
                validating ||
                items.length === 0
              }
              onClick={() =>
                void handleProceedToCheckout()
              }
              className="mt-6 block w-full rounded-xl bg-gray-900 px-5 py-4 text-center font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {validating
                ? "Checking cart..."
                : "Proceed to checkout"}
            </button>

            <Link
              href="/shop"
              className="mt-4 block text-center text-sm font-semibold text-gray-700 transition hover:text-gray-950"
            >
              Continue shopping
            </Link>
          </aside>
        </div>
      </div>
    </main>
  );
}