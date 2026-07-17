import type { Metadata } from "next";

import Link from "next/link";
import { redirect } from "next/navigation";

import { z } from "zod";

export const metadata: Metadata = {
  title: "Forgot password",
};

type ForgotPasswordPageProps = {
  searchParams: Promise<{
    sent?: string | string[];
    error?: string | string[];
  }>;
};

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(120);

function getFirstValue(
  value: string | string[] | undefined,
): string {
  return Array.isArray(value)
    ? value[0] ?? ""
    : value ?? "";
}

export default async function ForgotPasswordPage({
  searchParams,
}: ForgotPasswordPageProps) {
  const parameters = await searchParams;

  const sent =
    getFirstValue(parameters.sent) === "1";

  const errorCode =
    getFirstValue(parameters.error);

  async function requestPasswordReset(
    formData: FormData,
  ) {
    "use server";

    const honeypot = String(
      formData.get("website") ?? "",
    );

    /*
     * Return the normal success screen for bots.
     */
    if (honeypot) {
      redirect(
        "/forgot-password?sent=1",
      );
    }

    const parsed = emailSchema.safeParse(
      formData.get("email"),
    );

    if (!parsed.success) {
      redirect(
        "/forgot-password?error=invalid",
      );
    }

    const cmsUrl =
      process.env.WOOCOMMERCE_URL
        ?.trim()
        .replace(/\/+$/, "");

    const sharedSecret =
      process.env
        .HEADLESS_STORE_SHARED_SECRET
        ?.trim();

    if (!cmsUrl || !sharedSecret) {
      redirect(
        "/forgot-password?error=unavailable",
      );
    }

    let requestSucceeded = false;

    try {
      const response = await fetch(
        `${cmsUrl}/wp-json/headless-store/v1/forgot-password`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "X-Headless-Store-Key":
              sharedSecret,
          },

          body: JSON.stringify({
            email: parsed.data
              .toLowerCase(),
          }),

          cache: "no-store",
        },
      );

      requestSucceeded = response.ok;
    } catch (error) {
      console.error(
        "Password-reset request failed:",
        error,
      );
    }

    redirect(
      requestSucceeded
        ? "/forgot-password?sent=1"
        : "/forgot-password?error=unavailable",
    );
  }

  return (
    <main className="flex min-h-[75vh] items-center justify-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-7 shadow-sm sm:p-9">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          Customer account
        </p>

        <h1 className="mt-3 text-3xl font-bold text-gray-900">
          Forgot password
        </h1>

        <p className="mt-3 text-gray-600">
          Enter your account email. We
          will send password-reset
          instructions when an eligible
          account exists.
        </p>

        {sent && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800"
          >
            Request received. Check your
            email and spam folder for the
            password-reset link.
          </div>
        )}

        {errorCode === "invalid" && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700"
          >
            Enter a valid email address.
          </div>
        )}

        {errorCode === "unavailable" && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700"
          >
            Password reset is temporarily
            unavailable. Please try again
            later.
          </div>
        )}

        {!sent && (
          <form
            action={requestPasswordReset}
            className="mt-7 space-y-5"
          >
            <div
              aria-hidden="true"
              className="hidden"
            >
              <label htmlFor="website">
                Website
              </label>

              <input
                id="website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-semibold text-gray-800"
              >
                Email address
              </label>

              <input
                required
                id="email"
                name="email"
                type="email"
                maxLength={120}
                autoComplete="email"
                className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-gray-900 px-6 py-4 font-semibold text-white transition hover:bg-gray-700"
            >
              Send reset link
            </button>
          </form>
        )}

        <p className="mt-7 text-center text-sm text-gray-600">
          <Link
            href="/login"
            className="font-semibold text-blue-700 hover:text-blue-900"
          >
            Return to login
          </Link>
        </p>
      </div>
    </main>
  );
}