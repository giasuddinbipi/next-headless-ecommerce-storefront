"use client";

import Image from "next/image";

import {
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  WooCommerceProduct,
  WooCommerceVariation,
} from "@/lib/woocommerce";

import {
  type CartAttribute,
  useCartStore,
} from "@/store/cart-store";

type ProductPurchasePanelProps = {
  product: WooCommerceProduct;
  variations: WooCommerceVariation[];
};

function formatPrice(
  price: string,
): string {
  const numericPrice = Number(price);

  if (!Number.isFinite(numericPrice)) {
    return "Price unavailable";
  }

  return new Intl.NumberFormat(
    "en-BD",
    {
      style: "currency",
      currency: "BDT",
      maximumFractionDigits: 0,
    },
  ).format(numericPrice);
}

function normalizeOption(
  value: string,
): string {
  return value.trim().toLowerCase();
}

export default function ProductPurchasePanel({
  product,
  variations,
}: ProductPurchasePanelProps) {
  const addItem = useCartStore(
    (state) => state.addItem,
  );

  const [added, setAdded] =
    useState(false);

  const timerReference =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  const variationAttributes =
    useMemo(
      () =>
        (product.attributes ?? [])
          .filter(
            (attribute) =>
              attribute.variation,
          )
          .sort(
            (first, second) =>
              first.position -
              second.position,
          ),
      [product.attributes],
    );

  const [selectedAttributes, setSelectedAttributes] =
    useState<Record<string, string>>(
      () => {
        const defaults: Record<
          string,
          string
        > = {};

        for (const attribute of
          product.default_attributes ??
          []) {
          defaults[attribute.name] =
            attribute.option;
        }

        return defaults;
      },
    );

  const allAttributesSelected =
    variationAttributes.every(
      (attribute) =>
        Boolean(
          selectedAttributes[
            attribute.name
          ],
        ),
    );

  const selectedVariation =
    useMemo(() => {
      if (
        product.type !== "variable" ||
        !allAttributesSelected
      ) {
        return undefined;
      }

      return variations.find(
        (variation) =>
          variation.attributes.every(
            (attribute) => {
              /*
               * An empty WooCommerce
               * variation option means
               * "any option".
               */
              if (!attribute.option) {
                return true;
              }

              return (
                normalizeOption(
                  selectedAttributes[
                    attribute.name
                  ] ?? "",
                ) ===
                normalizeOption(
                  attribute.option,
                )
              );
            },
          ),
      );
    }, [
      allAttributesSelected,
      product.type,
      selectedAttributes,
      variations,
    ]);

  const currentPrice =
    product.type === "variable"
      ? selectedVariation?.price ?? ""
      : product.price;

  const currentRegularPrice =
    product.type === "variable"
      ? selectedVariation
          ?.regular_price ?? ""
      : product.regular_price;

  const currentlyOnSale =
    product.type === "variable"
      ? selectedVariation?.on_sale ??
        false
      : product.on_sale;

  const currentStockStatus =
    product.type === "variable"
      ? selectedVariation
          ?.stock_status
      : product.stock_status;

  const currentPurchasable =
    product.type === "variable"
      ? selectedVariation
          ?.purchasable ?? false
      : product.purchasable;

  const currentImage =
    selectedVariation?.image?.src ||
    product.images?.[0]?.src;

  const selectedCartAttributes:
    CartAttribute[] =
    variationAttributes
      .map((attribute) => ({
        name: attribute.name,
        option:
          selectedAttributes[
            attribute.name
          ] ?? "",
      }))
      .filter(
        (attribute) =>
          Boolean(attribute.option),
      );

  const selectionMissing =
    product.type === "variable" &&
    !allAttributesSelected;

  const combinationUnavailable =
    product.type === "variable" &&
    allAttributesSelected &&
    !selectedVariation;

  const unavailable =
    selectionMissing ||
    combinationUnavailable ||
    !currentPrice ||
    !currentPurchasable ||
    currentStockStatus ===
      "outofstock";

  const handleAttributeChange = (
    name: string,
    option: string,
  ) => {
    setSelectedAttributes(
      (current) => ({
        ...current,
        [name]: option,
      }),
    );

    setAdded(false);
  };

  const handleAddToCart = () => {
    if (unavailable) {
      return;
    }

    const variationId =
      selectedVariation?.id;

    addItem({
      cartKey: variationId
        ? `${product.id}:${variationId}`
        : String(product.id),

      productId: product.id,
      variationId,

      name: product.name,
      slug: product.slug,
      price: currentPrice,
      image: currentImage,

      stockStatus:
        currentStockStatus ??
        "outofstock",

      attributes:
        selectedCartAttributes,
    });

    setAdded(true);

    if (timerReference.current) {
      clearTimeout(
        timerReference.current,
      );
    }

    timerReference.current =
      setTimeout(() => {
        setAdded(false);
      }, 1500);
  };

  return (
    <div className="mt-6">
      {product.type === "variable" && (
        <div className="space-y-5">
          {variationAttributes.map(
            (attribute) => (
              <div key={attribute.name}>
                <label
                  htmlFor={`attribute-${attribute.slug}`}
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  {attribute.name}
                </label>

                <select
                  id={`attribute-${attribute.slug}`}
                  value={
                    selectedAttributes[
                      attribute.name
                    ] ?? ""
                  }
                  onChange={(event) =>
                    handleAttributeChange(
                      attribute.name,
                      event.target.value,
                    )
                  }
                  className="h-12 w-full rounded-lg border border-gray-300 bg-white px-4 outline-none transition focus:border-gray-900"
                >
                  <option value="">
                    Select{" "}
                    {attribute.name}
                  </option>

                  {attribute.options.map(
                    (option) => (
                      <option
                        key={option}
                        value={option}
                      >
                        {option}
                      </option>
                    ),
                  )}
                </select>
              </div>
            ),
          )}
        </div>
      )}

      {currentImage &&
        product.type === "variable" &&
        selectedVariation && (
          <div className="mt-6 flex items-center gap-4 rounded-xl bg-gray-50 p-4">
            <div className="relative h-20 w-20 overflow-hidden rounded-lg bg-white">
              <Image
                src={currentImage}
                alt={product.name}
                fill
                sizes="80px"
                className="object-cover"
              />
            </div>

            <div>
              <p className="text-sm text-gray-500">
                Selected variation
              </p>

              <p className="mt-1 font-semibold text-gray-900">
                {selectedCartAttributes
                  .map(
                    (attribute) =>
                      `${attribute.name}: ${attribute.option}`,
                  )
                  .join(", ")}
              </p>
            </div>
          </div>
        )}

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <span className="text-3xl font-bold text-gray-900">
          {currentPrice
            ? formatPrice(currentPrice)
            : product.type ===
                "variable"
              ? "Select options"
              : "Price unavailable"}
        </span>

        {currentlyOnSale &&
          currentRegularPrice && (
            <span className="text-lg text-gray-500 line-through">
              {formatPrice(
                currentRegularPrice,
              )}
            </span>
          )}
      </div>

      <div className="mt-4">
        {selectionMissing && (
          <p className="text-sm font-medium text-gray-600">
            Select all options to
            continue.
          </p>
        )}

        {combinationUnavailable && (
          <p className="text-sm font-medium text-red-700">
            This combination is not
            available.
          </p>
        )}

        {!selectionMissing &&
          !combinationUnavailable &&
          currentStockStatus ===
            "instock" && (
            <span className="inline-flex rounded-full bg-green-100 px-4 py-2 text-sm font-semibold text-green-800">
              In stock
            </span>
          )}

        {!selectionMissing &&
          currentStockStatus ===
            "onbackorder" && (
            <span className="inline-flex rounded-full bg-yellow-100 px-4 py-2 text-sm font-semibold text-yellow-800">
              Available on backorder
            </span>
          )}

        {!selectionMissing &&
          currentStockStatus ===
            "outofstock" && (
            <span className="inline-flex rounded-full bg-red-100 px-4 py-2 text-sm font-semibold text-red-800">
              Out of stock
            </span>
          )}
      </div>

      <button
        type="button"
        disabled={unavailable}
        onClick={handleAddToCart}
        className="mt-6 w-full rounded-xl bg-gray-900 px-6 py-4 font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {selectionMissing
          ? "Select product options"
          : combinationUnavailable
            ? "Combination unavailable"
            : unavailable
              ? "Currently unavailable"
              : added
                ? "Added to cart ✓"
                : "Add to cart"}
      </button>
    </div>
  );
}