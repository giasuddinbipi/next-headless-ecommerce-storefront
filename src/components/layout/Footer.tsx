import Link from "next/link";

export default function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-gray-950 text-gray-300">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3">
        <section>
          <h2 className="text-xl font-bold text-white">
            MyStore
          </h2>

          <p className="mt-4 max-w-sm text-sm leading-6 text-gray-400">
            A modern ecommerce storefront powered by Next.js
            and WooCommerce.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-white">
            Quick links
          </h2>

          <div className="mt-4 flex flex-col gap-3 text-sm">
            <Link
              href="/"
              className="hover:text-white"
            >
              Home
            </Link>

            <Link
              href="/cart"
              className="hover:text-white"
            >
              Shopping cart
            </Link>
          </div>
        </section>

        <section>
          <h2 className="font-semibold text-white">
            Customer service
          </h2>

          <div className="mt-4 space-y-3 text-sm text-gray-400">
            <p>Secure online shopping</p>
            <p>Customer support</p>
            <p>Delivery across Bangladesh</p>
          </div>
        </section>
      </div>

      <div className="border-t border-gray-800 px-4 py-5 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} MyStore. All rights
        reserved.
      </div>
    </footer>
  );
}