"use client";

import {
  type MouseEvent,
} from "react";

import {
  type WishlistProduct,
  useWishlistStore,
} from "@/store/wishlist-store";

import {
  useHasMounted,
} from "@/hooks/use-has-mounted";

type WishlistButtonProps = {
  product: WishlistProduct;
  showLabel?: boolean;
  className?: string;
};

export default function WishlistButton({
  product,
  showLabel = false,
  className = "",
}: WishlistButtonProps) {
  const mounted =
  useHasMounted();

  const items = useWishlistStore(
    (state) => state.items,
  );

  const toggleItem =
    useWishlistStore(
      (state) => state.toggleItem,
    );

  const isWishlisted =
    mounted &&
    items.some(
      (item) =>
        item.productId ===
        product.productId,
    );

  const handleClick = (
    event: MouseEvent<HTMLButtonElement>,
  ) => {
    /*
     * Product card-এর Link accidentally
     * click হওয়া বন্ধ করে।
     */
    event.preventDefault();
    event.stopPropagation();

    toggleItem(product);
  };

  const label = isWishlisted
    ? "Remove from wishlist"
    : "Add to wishlist";

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isWishlisted}
      title={label}
      onClick={handleClick}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-full border transition",
        isWishlisted
          ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
          : "border-gray-200 bg-white text-gray-700 hover:border-red-200 hover:text-red-600",
        showLabel
          ? "min-h-11 px-5 py-2.5 font-semibold"
          : "h-11 w-11",
        className,
      ].join(" ")}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill={
          isWishlisted
            ? "currentColor"
            : "none"
        }
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-5 w-5"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"
        />
      </svg>

      {showLabel && (
        <span>
          {mounted && isWishlisted
            ? "Saved"
            : "Add to wishlist"}
        </span>
      )}
    </button>
  );
}