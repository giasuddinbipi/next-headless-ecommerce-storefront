import type { Metadata } from "next";

import Link from "next/link";

import {
  AuthError,
} from "next-auth";

import { redirect } from "next/navigation";

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

  const loginAction = async (
    formData: FormData,
  ) => {
    "use server";

    const email = String(
      formData.get("email") ?? "",
    )
      .trim()
      .toLowerCase();

    const password = String(
      formData.get("password") ??
        "",
    );

    try {
      await signIn("credentials", {
        email,
        password,
        redirectTo: callbackUrl,
      });
    } catch (error) {
      if (
        error instanceof AuthError
      ) {
        redirect(
          `/login?error=CredentialsSignin&callbackUrl=${encodeURIComponent(
            callbackUrl,
          )}`,
        );
      }

      throw error;
    }
  };

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
          Login to view your orders
          and account information.
        </p>

        {registered && (
          <div className="mt-6 rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-800">
            Account created. Please
            login with your email and
            password.
          </div>
        )}

        {errorCode && (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700"
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
              autoComplete="email"
              className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-semibold text-gray-800"
            >
              Password
            </label>

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
            className="font-semibold text-blue-700 hover:text-blue-900"
          >
            Create account
          </Link>
        </p>
      </div>
    </main>
  );
}