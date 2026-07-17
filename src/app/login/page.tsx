import type { Metadata } from "next";

import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import {
  auth,
  signIn,
} from "@/auth";

export const metadata: Metadata = {
  title: "Customer login",
};

type LoginPageProps = {
  searchParams: Promise<{
    callbackUrl?:
      | string
      | string[];

    error?:
      | string
      | string[];

    registered?:
      | string
      | string[];

    reset?:
      | string
      | string[];
  }>;
};

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

/*
 * Prevent external redirects.
 * Only internal paths beginning with
 * one forward slash are accepted.
 */
function getSafeCallbackUrl(
  value: string,
): string {
  if (
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return "/account";
  }

  return value;
}

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const session = await auth();

  /*
   * Already authenticated customers
   * do not need to see the login page.
   */
  if (session?.user) {
    redirect("/account");
  }

  const parameters =
    await searchParams;

  const callbackUrl =
    getSafeCallbackUrl(
      getFirstValue(
        parameters.callbackUrl,
      ) || "/account",
    );

  const errorCode =
    getFirstValue(
      parameters.error,
    );

  const registered =
    getFirstValue(
      parameters.registered,
    ) === "1";

  const passwordReset =
    getFirstValue(
      parameters.reset,
    ) === "1";

  async function loginAction(
    formData: FormData,
  ) {
    "use server";

    const email = String(
      formData.get("email") ?? "",
    )
      .trim()
      .toLowerCase();

    const password = String(
      formData.get("password") ?? "",
    );

    /*
     * Basic server-side validation.
     */
    if (
      !email ||
      !email.includes("@") ||
      password.length < 8 ||
      password.length > 128
    ) {
      redirect(
        `/login?error=CredentialsSignin&callbackUrl=${encodeURIComponent(
          callbackUrl,
        )}`,
      );
    }

    try {
      await signIn("credentials", {
        email,
        password,
        redirectTo: callbackUrl,
      });
    } catch (error) {
      /*
       * Auth.js throws AuthError when
       * credentials are rejected.
       *
       * Successful redirects also use
       * an internal exception, so every
       * non-AuthError must be rethrown.
       */
      if (error instanceof AuthError) {
        redirect(
          `/login?error=CredentialsSignin&callbackUrl=${encodeURIComponent(
            callbackUrl,
          )}`,
        );
      }

      throw error;
    }
  }

  return (
    <main className="flex min-h-[75vh] items-center justify-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-7 shadow-sm sm:p-9">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          Customer account
        </p>

        <h1 className="mt-3 text-3xl font-bold text-gray-900">
          Login
        </h1>

        <p className="mt-3 text-gray-600">
          Login to view your orders,
          saved addresses and account
          information.
        </p>

        {registered && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800"
          >
            Your account was created
            successfully. Please login
            with your email and password.
          </div>
        )}

        {passwordReset && (
          <div
            role="status"
            className="mt-6 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800"
          >
            Your password was reset
            successfully. You can now
            login with your new password.
          </div>
        )}

        {errorCode && (
          <div
            role="alert"
            className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700"
          >
            Invalid email address or
            password.
          </div>
        )}

        <form
          action={loginAction}
          className="mt-7 space-y-5"
        >
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
              inputMode="email"
              placeholder="customer@example.com"
              className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-4">
              <label
                htmlFor="password"
                className="block text-sm font-semibold text-gray-800"
              >
                Password
              </label>

              <Link
                href="/forgot-password"
                className="text-sm font-semibold text-blue-700 transition hover:text-blue-900"
              >
                Forgot password?
              </Link>
            </div>

            <input
              required
              id="password"
              name="password"
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete="current-password"
              className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-xl bg-gray-900 px-6 py-4 font-semibold text-white transition hover:bg-gray-700"
          >
            Login
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-gray-600">
          Do not have an account?{" "}
          <Link
            href="/register"
            className="font-semibold text-blue-700 transition hover:text-blue-900"
          >
            Create account
          </Link>
        </p>

        <p className="mt-4 text-center text-sm text-gray-600">
          <Link
            href="/shop"
            className="font-semibold text-gray-700 transition hover:text-gray-950"
          >
            Continue shopping
          </Link>
        </p>
      </div>
    </main>
  );
}