"use client";

import {
  type FormEvent,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import {
  useSession,
} from "next-auth/react";

type ProfileFormProps = {
  initialValues: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
  };
};

type ProfileResponse = {
  success: true;

  user: {
    firstName: string;
    lastName: string;
    name: string;
    email: string;
    phone: string;
  };
};

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function isProfileResponse(
  value: unknown,
): value is ProfileResponse {
  if (
    !isObject(value) ||
    value.success !== true ||
    !isObject(value.user)
  ) {
    return false;
  }

  return (
    typeof value.user.name ===
      "string" &&
    typeof value.user.firstName ===
      "string" &&
    typeof value.user.lastName ===
      "string" &&
    typeof value.user.email ===
      "string" &&
    typeof value.user.phone ===
      "string"
  );
}

function getErrorMessage(
  value: unknown,
): string {
  if (
    isObject(value) &&
    typeof value.error ===
      "string"
  ) {
    return value.error;
  }

  return "Your profile could not be updated.";
}

export default function ProfileForm({
  initialValues,
}: ProfileFormProps) {
  const router = useRouter();

  const { update } =
    useSession();

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [successMessage, setSuccessMessage] =
    useState("");

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    const formData =
      new FormData(
        event.currentTarget,
      );

    const firstName = String(
      formData.get("firstName") ??
        "",
    ).trim();

    const lastName = String(
      formData.get("lastName") ??
        "",
    ).trim();

    const phone = String(
      formData.get("phone") ?? "",
    ).trim();

    try {
      const response = await fetch(
        "/api/account/profile",
        {
          method: "PUT",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            firstName,
            lastName,
            phone,
          }),
        },
      );

      const data: unknown =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          getErrorMessage(data),
        );
      }

      if (
        !isProfileResponse(data)
      ) {
        throw new Error(
          "The server returned an invalid response.",
        );
      }

      /*
       * Update Auth.js JWT session so
       * Header immediately shows the
       * new customer name.
       */
      await update({
        name: data.user.name,
      });

      router.refresh();

      setSuccessMessage(
        "Your profile was updated successfully.",
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Your profile could not be updated.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7"
    >
      <h2 className="text-xl font-bold text-gray-900">
        Personal information
      </h2>

      <p className="mt-2 text-sm text-gray-600">
        Update your customer name and
        contact phone number.
      </p>

      {successMessage && (
        <div
          role="status"
          className="mt-6 rounded-xl border border-green-300 bg-green-50 p-4 text-sm font-medium text-green-800"
        >
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-700"
        >
          {errorMessage}
        </div>
      )}

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <div>
          <label
            htmlFor="firstName"
            className="mb-2 block text-sm font-semibold text-gray-800"
          >
            First name *
          </label>

          <input
            required
            id="firstName"
            name="firstName"
            defaultValue={
              initialValues.firstName
            }
            maxLength={60}
            autoComplete="given-name"
            className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
          />
        </div>

        <div>
          <label
            htmlFor="lastName"
            className="mb-2 block text-sm font-semibold text-gray-800"
          >
            Last name *
          </label>

          <input
            required
            id="lastName"
            name="lastName"
            defaultValue={
              initialValues.lastName
            }
            maxLength={60}
            autoComplete="family-name"
            className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
          />
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="email"
            className="mb-2 block text-sm font-semibold text-gray-800"
          >
            Account email
          </label>

          <input
            readOnly
            id="email"
            type="email"
            value={initialValues.email}
            className="h-12 w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-4 text-gray-600"
          />

          <p className="mt-2 text-xs text-gray-500">
            Your login email cannot be
            changed from this page.
          </p>
        </div>

        <div className="sm:col-span-2">
          <label
            htmlFor="phone"
            className="mb-2 block text-sm font-semibold text-gray-800"
          >
            Phone number *
          </label>

          <input
            required
            id="phone"
            name="phone"
            type="tel"
            defaultValue={
              initialValues.phone
            }
            minLength={6}
            maxLength={30}
            autoComplete="tel"
            placeholder="01XXXXXXXXX"
            className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-7 rounded-xl bg-gray-900 px-7 py-4 font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
      >
        {submitting
          ? "Saving profile..."
          : "Save profile"}
      </button>
    </form>
  );
}