"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  useEffect,
  useRef,
  useState,
} from "react";

import { useCartStore } from "@/store/cart-store";

export default function Header() {
  const [mounted, setMounted] = useState(false);

  const [mobileMenuOpen, setMobileMenuOpen] =
    useState(false);

  const pathname = usePathname();

  const {
    data: session,
    status,
    update,
  } = useSession();

  const lastPathnameRef =
    useRef<string | null>(null);

  const items = useCartStore(
    (state) => state.items,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  /*
   * Login server action redirect করার পর
   * client-side SessionProvider-এর session
   * refresh করে।
   */
  useEffect(() => {
    if (
      lastPathnameRef.current === pathname
    ) {
      return;
    }

    lastPathnameRef.current = pathname;

    void update();
  }, [pathname, update]);

  /*
   * Page পরিবর্তন হলে mobile menu বন্ধ হবে।
   */
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const totalItems = items.reduce(
    (total, item) =>
      total + item.quantity,
    0,
  );

  const customerName =
    session?.user?.name ||
    session?.user?.email ||
    "My account";

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    closeMobileMenu();

    await signOut({
      redirectTo: "/",
    });
  };

  return (
    <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {/* Logo */}
        <Link
          href="/"
          onClick={closeMobileMenu}
          className="shrink-0 text-xl font-bold tracking-tight text-gray-900"
        >
          MyStore
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-7 md:flex">
          <Link
            href="/"
            className="text-sm font-medium text-gray-700 transition hover:text-gray-950"
          >
            Home
          </Link>

          <Link
            href="/shop"
            className="text-sm font-medium text-gray-700 transition hover:text-gray-950"
          >
            Shop
          </Link>

          {status ===
            "authenticated" && (
            <Link
              href="/account"
              className="text-sm font-medium text-gray-700 transition hover:text-gray-950"
            >
              My account
            </Link>
          )}
        </nav>

        {/* Right-side controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Authentication controls */}
          {status === "loading" ? (
            <div className="h-9 w-16 animate-pulse rounded-lg bg-gray-200 sm:w-24" />
          ) : status ===
            "authenticated" ? (
            <>
              <Link
                href="/account"
                className="hidden max-w-36 truncate text-sm font-semibold text-gray-800 transition hover:text-blue-700 lg:block"
              >
                {customerName}
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center justify-center rounded-lg border border-gray-300 px-2.5 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 sm:px-4 sm:text-sm"
              >
                Logout
              </button>
            </>
          ) : (
            <div className="hidden items-center gap-3 md:flex">
              <Link
                href="/login"
                className="text-sm font-semibold text-gray-700 transition hover:text-gray-950"
              >
                Login
              </Link>

              <Link
                href="/register"
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-700"
              >
                Register
              </Link>
            </div>
          )}

          {/* Cart */}
          <Link
            href="/cart"
            onClick={closeMobileMenu}
            aria-label={`Shopping cart with ${
              mounted ? totalItems : 0
            } items`}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-800 transition hover:bg-gray-100"
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

            {mounted &&
              totalItems > 0 && (
                <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
                  {totalItems > 99
                    ? "99+"
                    : totalItems}
                </span>
              )}
          </Link>

          {/* Mobile menu button */}
          <button
            type="button"
            aria-label={
              mobileMenuOpen
                ? "Close navigation menu"
                : "Open navigation menu"
            }
            aria-expanded={
              mobileMenuOpen
            }
            aria-controls="mobile-navigation"
            onClick={() =>
              setMobileMenuOpen(
                (current) => !current,
              )
            }
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-gray-800 transition hover:bg-gray-100 md:hidden"
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

      {/* Mobile navigation */}
      {mobileMenuOpen && (
        <nav
          id="mobile-navigation"
          className="border-t border-gray-200 bg-white px-4 py-4 md:hidden"
        >
          <div className="mx-auto flex max-w-7xl flex-col">
            {status ===
              "authenticated" && (
              <div className="mb-3 rounded-xl bg-gray-50 px-3 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Signed in as
                </p>

                <p className="mt-1 truncate text-sm font-semibold text-gray-900">
                  {customerName}
                </p>

                {session.user
                  .email && (
                  <p className="mt-1 truncate text-xs text-gray-500">
                    {
                      session.user
                        .email
                    }
                  </p>
                )}
              </div>
            )}

            <Link
              href="/"
              onClick={closeMobileMenu}
              className="rounded-lg px-3 py-3 font-medium text-gray-800 transition hover:bg-gray-100"
            >
              Home
            </Link>

            <Link
              href="/shop"
              onClick={closeMobileMenu}
              className="rounded-lg px-3 py-3 font-medium text-gray-800 transition hover:bg-gray-100"
            >
              Shop
            </Link>

            <Link
              href="/cart"
              onClick={closeMobileMenu}
              className="rounded-lg px-3 py-3 font-medium text-gray-800 transition hover:bg-gray-100"
            >
              Cart (
              {mounted
                ? totalItems
                : 0}
              )
            </Link>

            {status ===
            "loading" ? (
              <div className="mt-2 h-11 animate-pulse rounded-lg bg-gray-200" />
            ) : status ===
              "authenticated" ? (
              <>
                <Link
                  href="/account"
                  onClick={
                    closeMobileMenu
                  }
                  className="rounded-lg px-3 py-3 font-medium text-gray-800 transition hover:bg-gray-100"
                >
                  My account
                </Link>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="mt-2 rounded-lg bg-red-50 px-3 py-3 text-left font-semibold text-red-700 transition hover:bg-red-100"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={
                    closeMobileMenu
                  }
                  className="rounded-lg px-3 py-3 font-medium text-gray-800 transition hover:bg-gray-100"
                >
                  Login
                </Link>

                <Link
                  href="/register"
                  onClick={
                    closeMobileMenu
                  }
                  className="mt-2 rounded-lg bg-gray-900 px-3 py-3 text-center font-semibold text-white transition hover:bg-gray-700"
                >
                  Create account
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}