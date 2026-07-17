"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  type CartProduct,
  useCartStore,
} from "@/store/cart-store";

type AddToCartButtonProps = {
  product: CartProduct;
};

export default function AddToCartButton({
  product,
}: AddToCartButtonProps) {
  const addItem = useCartStore(
    (state) => state.addItem,
  );

  const [added, setAdded] = useState(false);

  const timeoutReference =
    useRef<ReturnType<typeof setTimeout> | null>(
      null,
    );

  const unavailable =
    product.stockStatus === "outofstock" ||
    !product.price;

  const handleAddToCart = () => {
    if (unavailable) {
      return;
    }

    addItem(product);
    setAdded(true);

    if (timeoutReference.current) {
      clearTimeout(timeoutReference.current);
    }

    timeoutReference.current = setTimeout(() => {
      setAdded(false);
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (timeoutReference.current) {
        clearTimeout(timeoutReference.current);
      }
    };
  }, []);

  return (
    <button
      type="button"
      disabled={unavailable}
      onClick={handleAddToCart}
      className="mt-8 w-full rounded-xl bg-gray-900 px-6 py-4 font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
    >
      {unavailable
        ? "Currently unavailable"
        : added
          ? "Added to cart ✓"
          : "Add to cart"}
    </button>
  );
}