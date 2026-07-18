import type { Metadata } from "next";

import Link from "next/link";

import {
  notFound,
  redirect,
} from "next/navigation";

import { auth } from "@/auth";

import ProfileForm from "@/components/account/ProfileForm";

import {
  getCustomerProfile,
} from "@/lib/customer";

export const metadata: Metadata = {
  title: "Edit profile",
};

export default async function ProfilePage() {
  const session = await auth();

  if (
    !session?.user ||
    !session.user.customerId
  ) {
    redirect(
      "/login?callbackUrl=/account/profile",
    );
  }

  let customer;

  try {
    customer =
      await getCustomerProfile(
        session.user.customerId,
      );
  } catch (error) {
    console.error(
      "Customer profile loading failed:",
      error,
    );

    return (
      <main className="min-h-[70vh] bg-gray-50 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-xl rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-gray-900">
            Profile could not be loaded
          </h1>

          <p className="mt-3 text-gray-600">
            There was a temporary
            problem loading your
            customer profile.
          </p>

          <Link
            href="/account"
            className="mt-7 inline-block rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white hover:bg-gray-700"
          >
            Return to account
          </Link>
        </div>
      </main>
    );
  }

  if (!customer) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/account"
          className="inline-flex text-sm font-semibold text-gray-700 transition hover:text-gray-950"
        >
          ← Back to account
        </Link>

        <header className="mt-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Customer account
          </p>

          <h1 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">
            Edit profile
          </h1>

          <p className="mt-3 text-gray-600">
            Manage your personal
            information and contact
            number.
          </p>
        </header>

        <div className="mt-8">
          <ProfileForm
            initialValues={{
              firstName:
                customer.first_name ||
                customer.billing
                  .first_name ||
                "",

              lastName:
                customer.last_name ||
                customer.billing
                  .last_name ||
                "",

              email:
                customer.email,

              phone:
                customer.billing.phone ??
                "",
            }}
          />
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">
            Password
          </h2>

          <p className="mt-2 text-sm text-gray-600">
            Use the password-reset flow
            when you need to change your
            account password.
          </p>

          <Link
            href="/forgot-password"
            className="mt-5 inline-flex rounded-lg border border-gray-300 px-5 py-3 text-sm font-semibold text-gray-800 transition hover:bg-gray-100"
          >
            Reset password
          </Link>
        </div>
      </div>
    </main>
  );
}