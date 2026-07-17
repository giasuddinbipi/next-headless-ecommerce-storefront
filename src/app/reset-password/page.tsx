import type { Metadata } from "next";

import Link from "next/link";
import { redirect } from "next/navigation";

import { z } from "zod";

export const metadata: Metadata = {
  title: "Reset password",
};

type ResetPasswordPageProps = {
  searchParams: Promise<{
    key?: string | string[];
    login?: string | string[];
    error?: string | string[];
  }>;
};

const resetSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(100),

    login: z
      .string()
      .trim()
      .min(1)
      .max(100),

    password: z
      .string()
      .min(8)
      .max(128),

    confirmPassword: z
      .string()
      .min(8)
      .max(128),
  })
  .refine(
    (values) =>
      values.password ===
      values.confirmPassword,
    {
      path: ["confirmPassword"],
      message: "Passwords do not match.",
    },
  );

function getFirstValue(
  value:
    | string
    | string[]
    | undefined,
): string {
  return Array.isArray(value)
    ? value[0] ?? ""
    : value ?? "";
}

function getErrorMessage(
  errorCode: string,
): string {
  switch (errorCode) {
    case "password-mismatch":
      return "The passwords do not match.";

    case "invalid-password":
      return "Password must contain between 8 and 128 characters.";

    case "invalid-link":
      return "This password-reset link is invalid, expired, or has already been used.";

    case "unavailable":
      return "Password reset is temporarily unavailable. Please try again later.";

    default:
      return "The password could not be reset. Please request a new reset link.";
  }
}

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const parameters = await searchParams;

  const key = getFirstValue(
    parameters.key,
  );

  const login = getFirstValue(
    parameters.login,
  );

  const errorCode = getFirstValue(
    parameters.error,
  );

  const hasResetInformation =
    Boolean(key && login);

  async function resetCustomerPassword(
    formData: FormData,
  ) {
    "use server";

    const honeypot = String(
      formData.get("website") ?? "",
    );

    const submittedKey = String(
      formData.get("key") ?? "",
    );

    const submittedLogin = String(
      formData.get("login") ?? "",
    );

    const encodedKey =
      encodeURIComponent(
        submittedKey,
      );

    const encodedLogin =
      encodeURIComponent(
        submittedLogin,
      );

    if (honeypot) {
      redirect(
        `/reset-password?key=${encodedKey}&login=${encodedLogin}&error=invalid-link`,
      );
    }

    const parsed = resetSchema.safeParse({
      key: submittedKey,

      login: submittedLogin,

      password: formData.get(
        "password",
      ),

      confirmPassword:
        formData.get(
          "confirmPassword",
        ),
    });

    if (!parsed.success) {
      const passwordMismatch =
        parsed.error.issues.some(
          (issue) =>
            issue.path.includes(
              "confirmPassword",
            ),
        );

      redirect(
        `/reset-password?key=${encodedKey}&login=${encodedLogin}&error=${
          passwordMismatch
            ? "password-mismatch"
            : "invalid-password"
        }`,
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
        `/reset-password?key=${encodeURIComponent(
          parsed.data.key,
        )}&login=${encodeURIComponent(
          parsed.data.login,
        )}&error=unavailable`,
      );
    }

    let responseStatus = 500;
    let resetSucceeded = false;

    try {
      const response = await fetch(
        `${cmsUrl}/wp-json/headless-store/v1/reset-password`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "X-Headless-Store-Key":
              sharedSecret,
          },

          body: JSON.stringify({
            key: parsed.data.key,

            login:
              parsed.data.login,

            password:
              parsed.data.password,
          }),

          cache: "no-store",
        },
      );

      responseStatus =
        response.status;

      resetSucceeded =
        response.ok;
    } catch (error) {
      console.error(
        "Password reset failed:",
        error,
      );
    }

    if (resetSucceeded) {
      redirect("/login?reset=1");
    }

    const nextError =
      responseStatus === 400 ||
      responseStatus === 401 ||
      responseStatus === 403 ||
      responseStatus === 404
        ? "invalid-link"
        : "unavailable";

    redirect(
      `/reset-password?key=${encodeURIComponent(
        parsed.data.key,
      )}&login=${encodeURIComponent(
        parsed.data.login,
      )}&error=${nextError}`,
    );
  }

  return (
    <main className="flex min-h-[75vh] items-center justify-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-7 shadow-sm sm:p-9">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          Customer account
        </p>

        <h1 className="mt-3 text-3xl font-bold text-gray-900">
          Create a new password
        </h1>

        {!hasResetInformation ? (
          <>
            <div
              role="alert"
              className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700"
            >
              This password-reset link is
              incomplete or invalid.
            </div>

            <Link
              href="/forgot-password"
              className="mt-7 block rounded-xl bg-gray-900 px-6 py-4 text-center font-semibold text-white transition hover:bg-gray-700"
            >
              Request a new reset link
            </Link>
          </>
        ) : (
          <>
            <p className="mt-3 text-gray-600">
              Enter a new password for
              your customer account.
            </p>

            {errorCode && (
              <div
                role="alert"
                className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700"
              >
                {getErrorMessage(
                  errorCode,
                )}
              </div>
            )}

            <form
              action={
                resetCustomerPassword
              }
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

              <input
                type="hidden"
                name="key"
                value={key}
              />

              <input
                type="hidden"
                name="login"
                value={login}
              />

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  New password
                </label>

                <input
                  required
                  id="password"
                  name="password"
                  type="password"
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />

                <p className="mt-2 text-xs text-gray-500">
                  Use at least 8
                  characters.
                </p>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Confirm new password
                </label>

                <input
                  required
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-xl bg-gray-900 px-6 py-4 font-semibold text-white transition hover:bg-gray-700"
              >
                Reset password
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-600">
              Link expired or already
              used?{" "}
              <Link
                href="/forgot-password"
                className="font-semibold text-blue-700 hover:text-blue-900"
              >
                Request a new link
              </Link>
            </p>
          </>
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