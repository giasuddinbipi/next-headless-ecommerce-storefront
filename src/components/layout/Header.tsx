"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import { useCartStore } from "@/store/cart-store";

export default function Header() {
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] =
    useState(false);

  const items = useCartStore((state) => state.items);

  useEffect(() => {
    setMounted(true);
  }, []);

  const totalItems = items.reduce(
    (total, item) => total + item.quantity,
    0,
  );

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-gray-900"
          onClick={closeMobileMenu}
        >
          MyStore
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <Link
            href="/"
            className="text-sm font-medium text-gray-700 transition hover:text-gray-950"
          >
            Home
          </Link>

          <Link
            href="/"
            className="text-sm font-medium text-gray-700 transition hover:text-gray-950"
          >
            Shop
          </Link>

          <Link
            href="/cart"
            className="text-sm font-medium text-gray-700 transition hover:text-gray-950"
          >
            Cart
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/cart"
            aria-label={`Shopping cart with ${
              mounted ? totalItems : 0
            } items`}
            className="relative flex h-11 w-11 items-center justify-center rounded-full text-gray-800 transition hover:bg-gray-100"
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
                d="M3 3h2l2.4 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.6L21 7H6"
              />

              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 20h.01M18 20h.01"
              />
            </svg>

            {mounted && totalItems > 0 && (
              <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </Link>

          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            onClick={() =>
              setMobileMenuOpen((current) => !current)
            }
            className="flex h-11 w-11 items-center justify-center rounded-full text-gray-800 transition hover:bg-gray-100 md:hidden"
          >
            {mobileMenuOpen ? (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-6 w-6"
              >
                <path
                  strokeLinecap="round"
                  d="M6 6l12 12M18 6 6 18"
                />
              </svg>
            ) : (
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="h-6 w-6"
              >
                <path
                  strokeLinecap="round"
                  d="M4 7h16M4 12h16M4 17h16"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <nav className="border-t border-gray-200 bg-white px-4 py-4 md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col">
            <Link
              href="/"
              onClick={closeMobileMenu}
              className="rounded-lg px-3 py-3 font-medium text-gray-800 hover:bg-gray-100"
            >
              Home
            </Link>

            <Link
              href="/"
              onClick={closeMobileMenu}
              className="rounded-lg px-3 py-3 font-medium text-gray-800 hover:bg-gray-100"
            >
              Shop
            </Link>

            <Link
              href="/cart"
              onClick={closeMobileMenu}
              className="rounded-lg px-3 py-3 font-medium text-gray-800 hover:bg-gray-100"
            >
              Cart ({mounted ? totalItems : 0})
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}