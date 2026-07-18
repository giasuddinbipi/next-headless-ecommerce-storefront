"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import { useWishlistStore } from "@/store/wishlist-store";

export default function WishlistHeaderLink() {
  const [mounted, setMounted] =
    useState(false);

  const items = useWishlistStore(
    (state) => state.items,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  const totalItems = mounted
    ? items.length
    : 0;

  return (
    <Link
      href="/wishlist"
      aria-label={`Wishlist with ${totalItems} products`}
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-800 transition hover:bg-gray-100 hover:text-red-600"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="h-6 w-6"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78Z"
        />
      </svg>

      {totalItems > 0 && (
        <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
          {totalItems > 99
            ? "99+"
            : totalItems}
        </span>
      )}
    </Link>
  );
}