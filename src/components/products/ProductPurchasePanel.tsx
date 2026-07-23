"use client";

import {
  useMemo,
  useState,
} from "react";

import WishlistButton from "@/components/wishlist/WishlistButton";
import {
  useCartStore,
} from "@/store/cart-store";

type StockStatus =
  | "instock"
  | "outofstock"
  | "onbackorder";

type ProductImage = {
  id?: number;
  src: string;
  name?: string;
  alt?: string;
};

type ProductAttribute = {
  id: number;
  name: string;
  position?: number;
  visible?: boolean;
  variation: boolean;
  options: string[];
};

type ProductVariationAttribute = {
  id: number;
  name: string;
  option: string;
};

type ProductVariation = {
  id: number;
  price: string;
  regular_price?: string;
  sale_price?: string;
  stock_status: StockStatus;
  stock_quantity?: number | null;
  purchasable?: boolean;
  image?: ProductImage | null;
  attributes: ProductVariationAttribute[];
};

type Product = {
  id: number;
  name: string;
  slug: string;
  type: string;
  price: string;
  regular_price?: string;
  sale_price?: string;
  stock_status: StockStatus;
  stock_quantity?: number | null;
  purchasable?: boolean;
  images?: ProductImage[];
  attributes?: ProductAttribute[];
};

type ProductPurchasePanelProps = {
  product: Product;
  variations?: ProductVariation[];
};

function normalizeValue(
  value: string,
): string {
  return value
    .trim()
    .toLowerCase();
}

function getAttributeKey(
  attributeName: string,
): string {
  return normalizeValue(
    attributeName,
  );
}

function formatPrice(
  value: string,
): string {
  const price =
    Number(value);

  if (
    value === "" ||
    !Number.isFinite(
      price,
    )
  ) {
    return "Price unavailable";
  }

  return new Intl.NumberFormat(
    "en-BD",
    {
      style:
        "currency",

      currency:
        "BDT",

      maximumFractionDigits:
        0,
    },
  ).format(
    price,
  );
}

function getStockMessage(
  stockStatus:
    StockStatus,
): string {
  switch (
    stockStatus
  ) {
    case "instock":
      return "In stock";

    case "onbackorder":
      return "Available on backorder";

    case "outofstock":
      return "Out of stock";

    default:
      return "";
  }
}

function getStockClassName(
  stockStatus:
    StockStatus,
): string {
  switch (
    stockStatus
  ) {
    case "instock":
      return "text-green-700";

    case "onbackorder":
      return "text-yellow-700";

    case "outofstock":
      return "text-red-700";

    default:
      return "text-gray-600";
  }
}

export default function ProductPurchasePanel({
  product,
  variations = [],
}: ProductPurchasePanelProps) {
  const [
    selectedOptions,
    setSelectedOptions,
  ] =
    useState<
      Record<
        string,
        string
      >
    >({});

  /*
   * Store the exact product/option selection that was most
   * recently added. The visible success state is derived
   * from this signature, so changing an option resets the
   * message without a setState call inside an effect.
   */
  const [
    addedSelectionSignature,
    setAddedSelectionSignature,
  ] =
    useState<
      string | null
    >(null);

  const addItem =
    useCartStore(
      (state) =>
        state.addItem,
    );

  const variationAttributes =
    useMemo(
      () =>
        (
          product.attributes ??
          []
        ).filter(
          (
            attribute,
          ) =>
            attribute.variation &&
            attribute.options
              .length >
              0,
        ),
      [
        product.attributes,
      ],
    );

  const isVariableProduct =
    product.type ===
    "variable";

  const allOptionsSelected =
    !isVariableProduct ||
    variationAttributes.every(
      (
        attribute,
      ) => {
        const key =
          getAttributeKey(
            attribute.name,
          );

        return Boolean(
          selectedOptions[
            key
          ],
        );
      },
    );

  const selectedVariation =
    useMemo(() => {
      if (
        !isVariableProduct ||
        !allOptionsSelected
      ) {
        return undefined;
      }

      return variations.find(
        (
          variation,
        ) =>
          variationAttributes.every(
            (
              productAttribute,
            ) => {
              const attributeKey =
                getAttributeKey(
                  productAttribute.name,
                );

              const selectedValue =
                selectedOptions[
                  attributeKey
                ];

              const variationAttribute =
                variation.attributes.find(
                  (
                    attribute,
                  ) =>
                    getAttributeKey(
                      attribute.name,
                    ) ===
                    attributeKey,
                );

              /*
               * An empty WooCommerce variation option acts
               * as "Any option".
               */
              if (
                !variationAttribute ||
                !variationAttribute
                  .option
              ) {
                return true;
              }

              return (
                normalizeValue(
                  variationAttribute
                    .option,
                ) ===
                normalizeValue(
                  selectedValue ??
                    "",
                )
              );
            },
          ),
      );
    }, [
      allOptionsSelected,
      isVariableProduct,
      selectedOptions,
      variationAttributes,
      variations,
    ]);

  const currentPrice =
    isVariableProduct
      ? selectedVariation
          ?.price ??
        product.price
      : product.price;

  const currentStockStatus =
    isVariableProduct
      ? selectedVariation
          ?.stock_status ??
        product.stock_status
      : product.stock_status;

  const currentImage =
    selectedVariation
      ?.image
      ?.src ||
    product.images?.[0]
      ?.src;

  const hasValidPrice =
    currentPrice !==
      "" &&
    Number.isFinite(
      Number(
        currentPrice,
      ),
    );

  const variationUnavailable =
    isVariableProduct &&
    allOptionsSelected &&
    !selectedVariation;

  const canAddToCart =
    hasValidPrice &&
    currentStockStatus !==
      "outofstock" &&
    (
      !isVariableProduct ||
      Boolean(
        selectedVariation,
      )
    );

  const selectedCartAttributes =
    variationAttributes
      .map(
        (
          attribute,
        ) => {
          const key =
            getAttributeKey(
              attribute.name,
            );

          const option =
            selectedOptions[
              key
            ];

          if (!option) {
            return null;
          }

          return {
            name:
              attribute.name,

            option,
          };
        },
      )
      .filter(
        (
          attribute,
        ): attribute is {
          name: string;
          option: string;
        } =>
          attribute !==
          null,
      );

  /*
   * Build a stable signature from the current product and
   * ordered variation selections.
   */
  const currentSelectionSignature =
    useMemo(
      () =>
        [
          String(
            product.id,
          ),

          isVariableProduct
            ? "variable"
            : "simple",

          ...variationAttributes.map(
            (
              attribute,
            ) => {
              const key =
                getAttributeKey(
                  attribute.name,
                );

              return `${key}=${normalizeValue(
                selectedOptions[
                  key
                ] ?? "",
              )}`;
            },
          ),
        ].join(
          "|",
        ),
      [
        isVariableProduct,
        product.id,
        selectedOptions,
        variationAttributes,
      ],
    );

  const addedToCart =
    addedSelectionSignature ===
    currentSelectionSignature;

  const handleOptionChange =
    (
      attributeName:
        string,
      option:
        string,
    ): void => {
      const key =
        getAttributeKey(
          attributeName,
        );

      setSelectedOptions(
        (
          current,
        ) => ({
          ...current,
          [key]:
            option,
        }),
      );
    };

  const handleAddToCart =
    (): void => {
      if (
        !canAddToCart
      ) {
        return;
      }

      const variationId =
        selectedVariation
          ?.id;

      const cartKey =
        variationId
          ? `${product.id}:${variationId}`
          : String(
              product.id,
            );

      addItem({
        cartKey,

        productId:
          product.id,

        variationId,

        name:
          product.name,

        slug:
          product.slug,

        price:
          currentPrice,

        image:
          currentImage,

        stockStatus:
          currentStockStatus,

        attributes:
          selectedCartAttributes,
      });

      setAddedSelectionSignature(
        currentSelectionSignature,
      );
    };

  return (
    <section className="mt-6">
      {isVariableProduct &&
        variationAttributes
          .length >
          0 && (
          <div className="space-y-5">
            {variationAttributes.map(
              (
                attribute,
              ) => {
                const attributeKey =
                  getAttributeKey(
                    attribute.name,
                  );

                return (
                  <div
                    key={
                      attribute.id ||
                      attribute.name
                    }
                  >
                    <label
                      htmlFor={`product-attribute-${attribute.id}`}
                      className="mb-2 block text-sm font-semibold text-gray-800"
                    >
                      {attribute.name}
                    </label>

                    <select
                      id={`product-attribute-${attribute.id}`}
                      value={
                        selectedOptions[
                          attributeKey
                        ] ??
                        ""
                      }
                      onChange={(
                        event,
                      ) => {
                        handleOptionChange(
                          attribute.name,
                          event.target
                            .value,
                        );
                      }}
                      className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-gray-900 outline-none transition focus:border-gray-900"
                    >
                      <option value="">
                        Select{" "}
                        {attribute.name}
                      </option>

                      {attribute.options.map(
                        (
                          option,
                        ) => (
                          <option
                            key={
                              option
                            }
                            value={
                              option
                            }
                          >
                            {option}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                );
              },
            )}
          </div>
        )}

      <div className="mt-6">
        <p className="text-3xl font-bold text-gray-900">
          {isVariableProduct &&
          !selectedVariation &&
          product.price ===
            ""
            ? "Select options"
            : formatPrice(
                currentPrice,
              )}
        </p>

        {!variationUnavailable && (
          <p
            className={`mt-2 text-sm font-semibold ${getStockClassName(
              currentStockStatus,
            )}`}
          >
            {getStockMessage(
              currentStockStatus,
            )}
          </p>
        )}

        {isVariableProduct &&
          !allOptionsSelected && (
            <p className="mt-3 text-sm text-gray-600">
              Select all available options before adding this product to your cart.
            </p>
          )}

        {variationUnavailable && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            This option combination is currently unavailable. Please choose another combination.
          </div>
        )}

        {addedToCart && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-800"
          >
            Product added to your cart.
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={
            !canAddToCart
          }
          onClick={
            handleAddToCart
          }
          className="min-h-12 flex-1 rounded-xl bg-gray-900 px-7 py-3 font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400 sm:flex-none"
        >
          {currentStockStatus ===
          "outofstock"
            ? "Out of stock"
            : isVariableProduct &&
                !selectedVariation
              ? "Select options"
              : addedToCart
                ? "Added to cart"
                : "Add to cart"}
        </button>

        <WishlistButton
          showLabel
          product={{
            productId:
              product.id,

            name:
              product.name,

            slug:
              product.slug,

            price:
              currentPrice,

            image:
              currentImage,

            stockStatus:
              currentStockStatus,

            productType:
              product.type,
          }}
        />
      </div>
    </section>
  );
}