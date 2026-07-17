import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-red-600">
          404 error
        </p>

        <h1 className="mt-4 text-4xl font-bold text-gray-900">
          Product not found
        </h1>

        <p className="mt-4 text-gray-600">
          The requested product may have been removed or is
          unavailable.
        </p>

        <Link
          href="/"
          className="mt-8 inline-block rounded-lg bg-gray-900 px-6 py-3 font-semibold text-white hover:bg-gray-700"
        >
          Return to store
        </Link>
      </div>
    </main>
  );
}