import type { Metadata } from "next";

import Link from "next/link";

import {
  AuthError,
} from "next-auth";

import { redirect } from "next/navigation";

import { z } from "zod";

import {
  auth,
  signIn,
} from "@/auth";

export const metadata: Metadata = {
  title: "Create customer account",
};

const registrationSchema =
  z
    .object({
      firstName: z
        .string()
        .trim()
        .min(1)
        .max(60),

      lastName: z
        .string()
        .trim()
        .min(1)
        .max(60),

      email: z
        .string()
        .trim()
        .email()
        .max(120),

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
      (data) =>
        data.password ===
        data.confirmPassword,
      {
        path: [
          "confirmPassword",
        ],

        message:
          "Passwords do not match.",
      },
    );

type RegisterPageProps = {
  searchParams: Promise<{
    error?:
      | string
      | string[];
  }>;
};

function getErrorMessage(
  error: string,
): string {
  switch (error) {
    case "account-exists":
      return "An account already exists with this email address.";

    case "password-mismatch":
      return "The passwords do not match.";

    case "invalid-fields":
      return "Please provide valid registration information.";

    case "spam":
      return "The registration request was rejected.";

    default:
      return "The account could not be created. Please try again.";
  }
}

export default async function RegisterPage({
  searchParams,
}: RegisterPageProps) {
  const session = await auth();

  if (session?.user) {
    redirect("/account");
  }

  const parameters =
    await searchParams;

  const errorValue =
    Array.isArray(
      parameters.error,
    )
      ? parameters.error[0] ?? ""
      : parameters.error ?? "";

  const registerAction = async (
    formData: FormData,
  ) => {
    "use server";

    const honeypot = String(
      formData.get("website") ??
        "",
    );

    if (honeypot) {
      redirect(
        "/register?error=spam",
      );
    }

    const parsed =
      registrationSchema.safeParse({
        firstName:
          formData.get(
            "firstName",
          ),

        lastName:
          formData.get(
            "lastName",
          ),

        email:
          formData.get("email"),

        password:
          formData.get(
            "password",
          ),

        confirmPassword:
          formData.get(
            "confirmPassword",
          ),
      });

    if (!parsed.success) {
      const mismatch =
        parsed.error.issues.some(
          (issue) =>
            issue.path.includes(
              "confirmPassword",
            ),
        );

      redirect(
        mismatch
          ? "/register?error=password-mismatch"
          : "/register?error=invalid-fields",
      );
    }

    const cmsUrl =
      process.env
        .WOOCOMMERCE_URL;

    const sharedSecret =
      process.env
        .HEADLESS_STORE_SHARED_SECRET;

    if (
      !cmsUrl ||
      !sharedSecret
    ) {
      throw new Error(
        "Registration configuration is missing.",
      );
    }

    const response = await fetch(
      `${cmsUrl.replace(
        /\/$/,
        "",
      )}/wp-json/headless-store/v1/register`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",

          "X-Headless-Store-Key":
            sharedSecret,
        },

        body: JSON.stringify({
          firstName:
            parsed.data
              .firstName,

          lastName:
            parsed.data
              .lastName,

          email:
            parsed.data.email
              .toLowerCase(),

          password:
            parsed.data
              .password,
        }),

        cache: "no-store",
      },
    );

    if (!response.ok) {
      redirect(
        response.status === 409
          ? "/register?error=account-exists"
          : "/register?error=registration-failed",
      );
    }

    try {
      await signIn("credentials", {
        email:
          parsed.data.email
            .toLowerCase(),

        password:
          parsed.data.password,

        redirectTo:
          "/account",
      });
    } catch (error) {
      if (
        error instanceof AuthError
      ) {
        redirect(
          "/login?registered=1",
        );
      }

      throw error;
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-16">
      <div className="w-full max-w-xl rounded-2xl border border-gray-200 bg-white p-7 shadow-sm sm:p-9">
        <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
          New customer
        </p>

        <h1 className="mt-3 text-3xl font-bold text-gray-900">
          Create account
        </h1>

        <p className="mt-3 text-gray-600">
          Register to view your
          orders and use your customer
          account.
        </p>

        {errorValue && (
          <div
            role="alert"
            className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700"
          >
            {getErrorMessage(
              errorValue,
            )}
          </div>
        )}

        <form
          action={registerAction}
          className="mt-7"
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

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label
                htmlFor="firstName"
                className="mb-2 block text-sm font-semibold text-gray-800"
              >
                First name
              </label>

              <input
                required
                id="firstName"
                name="firstName"
                maxLength={60}
                autoComplete="given-name"
                className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none focus:border-gray-900"
              />
            </div>

            <div>
              <label
                htmlFor="lastName"
                className="mb-2 block text-sm font-semibold text-gray-800"
              >
                Last name
              </label>

              <input
                required
                id="lastName"
                name="lastName"
                maxLength={60}
                autoComplete="family-name"
                className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none focus:border-gray-900"
              />
            </div>

            <div className="sm:col-span-2">
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
                className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none focus:border-gray-900"
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
                autoComplete="new-password"
                className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none focus:border-gray-900"
              />
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-2 block text-sm font-semibold text-gray-800"
              >
                Confirm password
              </label>

              <input
                required
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none focus:border-gray-900"
              />
            </div>
          </div>

          <label className="mt-6 flex items-start gap-3 text-sm text-gray-700">
            <input
              required
              type="checkbox"
              className="mt-1 h-4 w-4"
            />

            <span>
              I agree to the store
              terms and confirm that
              the provided information
              is correct.
            </span>
          </label>

          <button
            type="submit"
            className="mt-7 w-full rounded-xl bg-gray-900 px-6 py-4 font-semibold text-white transition hover:bg-gray-700"
          >
            Create account
          </button>
        </form>

        <p className="mt-7 text-center text-sm text-gray-600">
          Already registered?{" "}
          <Link
            href="/login"
            className="font-semibold text-blue-700 hover:text-blue-900"
          >
            Login
          </Link>
        </p>
      </div>
    </main>
  );
}