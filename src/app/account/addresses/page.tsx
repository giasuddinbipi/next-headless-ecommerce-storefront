import type { Metadata } from "next";

import Link from "next/link";

import {
  revalidatePath,
} from "next/cache";

import {
  notFound,
  redirect,
} from "next/navigation";

import { z } from "zod";

import { auth } from "@/auth";

import {
  getCustomerProfile,
  updateCustomerAddresses,
  type WooCommerceCustomerAddress,
} from "@/lib/customer";

export const metadata: Metadata = {
  title: "Saved addresses",
};

type AddressPageProps = {
  searchParams: Promise<{
    saved?:
      | string
      | string[];

    error?:
      | string
      | string[];
  }>;
};

const addressSchema = z.object({
  billingFirstName: z
    .string()
    .trim()
    .min(1)
    .max(60),

  billingLastName: z
    .string()
    .trim()
    .min(1)
    .max(60),

  billingCompany: z
    .string()
    .trim()
    .max(100),

  billingAddress1: z
    .string()
    .trim()
    .min(3)
    .max(150),

  billingAddress2: z
    .string()
    .trim()
    .max(150),

  billingCity: z
    .string()
    .trim()
    .min(1)
    .max(80),

  billingDistrict: z
    .string()
    .trim()
    .min(1)
    .max(80),

  billingPostcode: z
    .string()
    .trim()
    .max(20),

  billingPhone: z
    .string()
    .trim()
    .min(6)
    .max(30),

  shippingFirstName: z
    .string()
    .trim()
    .max(60),

  shippingLastName: z
    .string()
    .trim()
    .max(60),

  shippingCompany: z
    .string()
    .trim()
    .max(100),

  shippingAddress1: z
    .string()
    .trim()
    .max(150),

  shippingAddress2: z
    .string()
    .trim()
    .max(150),

  shippingCity: z
    .string()
    .trim()
    .max(80),

  shippingDistrict: z
    .string()
    .trim()
    .max(80),

  shippingPostcode: z
    .string()
    .trim()
    .max(20),
});

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

function getFormString(
  formData: FormData,
  name: string,
): string {
  return String(
    formData.get(name) ?? "",
  );
}

function isAddressEmpty(
  address: WooCommerceCustomerAddress,
): boolean {
  return !(
    address.address_1 ||
    address.city ||
    address.state ||
    address.postcode
  );
}

function getErrorMessage(
  errorCode: string,
): string {
  switch (errorCode) {
    case "invalid":
      return "Please provide valid address information.";

    case "customer-not-found":
      return "Your customer account could not be found.";

    default:
      return "The addresses could not be saved. Please try again.";
  }
}

export default async function AddressPage({
  searchParams,
}: AddressPageProps) {
  const session = await auth();

  if (
    !session?.user ||
    !session.user.customerId
  ) {
    redirect(
      "/login?callbackUrl=/account/addresses",
    );
  }

  const customer =
    await getCustomerProfile(
      session.user.customerId,
    );

  if (!customer) {
    notFound();
  }

  const parameters =
    await searchParams;

  const saved =
    getFirstValue(
      parameters.saved,
    ) === "1";

  const errorCode =
    getFirstValue(
      parameters.error,
    );

  const billingFirstName =
    customer.billing.first_name ||
    customer.first_name ||
    "";

  const billingLastName =
    customer.billing.last_name ||
    customer.last_name ||
    "";

  const shippingFirstName =
    customer.shipping.first_name ||
    billingFirstName;

  const shippingLastName =
    customer.shipping.last_name ||
    billingLastName;

  const shippingAddressIsEmpty =
    isAddressEmpty(
      customer.shipping,
    );

  async function saveAddresses(
    formData: FormData,
  ) {
    "use server";

    const currentSession =
      await auth();

    if (
      !currentSession?.user ||
      !currentSession.user
        .customerId
    ) {
      redirect(
        "/login?callbackUrl=/account/addresses",
      );
    }

    const sameAsBilling =
      formData.get(
        "sameAsBilling",
      ) === "on";

    const parsed =
      addressSchema.safeParse({
        billingFirstName:
          getFormString(
            formData,
            "billingFirstName",
          ),

        billingLastName:
          getFormString(
            formData,
            "billingLastName",
          ),

        billingCompany:
          getFormString(
            formData,
            "billingCompany",
          ),

        billingAddress1:
          getFormString(
            formData,
            "billingAddress1",
          ),

        billingAddress2:
          getFormString(
            formData,
            "billingAddress2",
          ),

        billingCity:
          getFormString(
            formData,
            "billingCity",
          ),

        billingDistrict:
          getFormString(
            formData,
            "billingDistrict",
          ),

        billingPostcode:
          getFormString(
            formData,
            "billingPostcode",
          ),

        billingPhone:
          getFormString(
            formData,
            "billingPhone",
          ),

        shippingFirstName:
          getFormString(
            formData,
            "shippingFirstName",
          ),

        shippingLastName:
          getFormString(
            formData,
            "shippingLastName",
          ),

        shippingCompany:
          getFormString(
            formData,
            "shippingCompany",
          ),

        shippingAddress1:
          getFormString(
            formData,
            "shippingAddress1",
          ),

        shippingAddress2:
          getFormString(
            formData,
            "shippingAddress2",
          ),

        shippingCity:
          getFormString(
            formData,
            "shippingCity",
          ),

        shippingDistrict:
          getFormString(
            formData,
            "shippingDistrict",
          ),

        shippingPostcode:
          getFormString(
            formData,
            "shippingPostcode",
          ),
      });

    if (!parsed.success) {
      redirect(
        "/account/addresses?error=invalid",
      );
    }

    const values = parsed.data;

    if (
      !sameAsBilling &&
      (
        !values.shippingFirstName ||
        !values.shippingLastName ||
        !values.shippingAddress1 ||
        !values.shippingCity ||
        !values.shippingDistrict
      )
    ) {
      redirect(
        "/account/addresses?error=invalid",
      );
    }

    const accountEmail =
      currentSession.user.email
        ?.trim()
        .toLowerCase() ?? "";

    const billing = {
      first_name:
        values.billingFirstName,

      last_name:
        values.billingLastName,

      company:
        values.billingCompany,

      address_1:
        values.billingAddress1,

      address_2:
        values.billingAddress2,

      city:
        values.billingCity,

      state:
        values.billingDistrict,

      postcode:
        values.billingPostcode,

      country: "BD",

      email: accountEmail,

      phone:
        values.billingPhone,
    };

    const shipping = sameAsBilling
      ? {
          first_name:
            billing.first_name,

          last_name:
            billing.last_name,

          company:
            billing.company,

          address_1:
            billing.address_1,

          address_2:
            billing.address_2,

          city:
            billing.city,

          state:
            billing.state,

          postcode:
            billing.postcode,

          country:
            billing.country,
        }
      : {
          first_name:
            values.shippingFirstName,

          last_name:
            values.shippingLastName,

          company:
            values.shippingCompany,

          address_1:
            values.shippingAddress1,

          address_2:
            values.shippingAddress2,

          city:
            values.shippingCity,

          state:
            values.shippingDistrict,

          postcode:
            values.shippingPostcode,

          country: "BD",
        };

    try {
      const updatedCustomer =
        await updateCustomerAddresses(
          currentSession.user
            .customerId,
          {
            billing,
            shipping,
          },
        );

      if (!updatedCustomer) {
        redirect(
          "/account/addresses?error=customer-not-found",
        );
      }
    } catch (error) {
      console.error(
        "Customer address update failed:",
        error,
      );

      redirect(
        "/account/addresses?error=save-failed",
      );
    }

    revalidatePath(
      "/account/addresses",
    );

    revalidatePath(
      "/account",
    );

    revalidatePath(
      "/checkout",
    );

    redirect(
      "/account/addresses?saved=1",
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-5xl">
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
            Saved addresses
          </h1>

          <p className="mt-3 text-gray-600">
            Save your billing and
            delivery details for future
            orders.
          </p>
        </header>

        {saved && (
          <div
            role="status"
            className="mt-7 rounded-xl border border-green-300 bg-green-50 p-4 text-sm font-medium text-green-800"
          >
            Your addresses were saved
            successfully.
          </div>
        )}

        {errorCode && (
          <div
            role="alert"
            className="mt-7 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-medium text-red-700"
          >
            {getErrorMessage(
              errorCode,
            )}
          </div>
        )}

        <form
          action={saveAddresses}
          className="mt-8 space-y-8"
        >
          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-bold text-gray-900">
              Billing address
            </h2>

            <p className="mt-2 text-sm text-gray-600">
              This information will be
              used for billing and order
              contact details.
            </p>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="billingFirstName"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  First name *
                </label>

                <input
                  required
                  id="billingFirstName"
                  name="billingFirstName"
                  defaultValue={
                    billingFirstName
                  }
                  maxLength={60}
                  autoComplete="given-name"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>

              <div>
                <label
                  htmlFor="billingLastName"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Last name *
                </label>

                <input
                  required
                  id="billingLastName"
                  name="billingLastName"
                  defaultValue={
                    billingLastName
                  }
                  maxLength={60}
                  autoComplete="family-name"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="accountEmail"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Account email
                </label>

                <input
                  readOnly
                  id="accountEmail"
                  value={
                    session.user.email ??
                    customer.email
                  }
                  className="h-12 w-full cursor-not-allowed rounded-lg border border-gray-200 bg-gray-100 px-4 text-gray-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="billingCompany"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Company
                </label>

                <input
                  id="billingCompany"
                  name="billingCompany"
                  defaultValue={
                    customer.billing
                      .company
                  }
                  maxLength={100}
                  autoComplete="organization"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="billingAddress1"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Address line 1 *
                </label>

                <input
                  required
                  id="billingAddress1"
                  name="billingAddress1"
                  defaultValue={
                    customer.billing
                      .address_1
                  }
                  maxLength={150}
                  autoComplete="address-line1"
                  placeholder="House, road and area"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="billingAddress2"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Address line 2
                </label>

                <input
                  id="billingAddress2"
                  name="billingAddress2"
                  defaultValue={
                    customer.billing
                      .address_2
                  }
                  maxLength={150}
                  autoComplete="address-line2"
                  placeholder="Apartment, floor or landmark"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>

              <div>
                <label
                  htmlFor="billingCity"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  City / Upazila *
                </label>

                <input
                  required
                  id="billingCity"
                  name="billingCity"
                  defaultValue={
                    customer.billing.city
                  }
                  maxLength={80}
                  autoComplete="address-level2"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>

              <div>
                <label
                  htmlFor="billingDistrict"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  District *
                </label>

                <input
                  required
                  id="billingDistrict"
                  name="billingDistrict"
                  defaultValue={
                    customer.billing.state
                  }
                  maxLength={80}
                  autoComplete="address-level1"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>

              <div>
                <label
                  htmlFor="billingPostcode"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Postcode
                </label>

                <input
                  id="billingPostcode"
                  name="billingPostcode"
                  defaultValue={
                    customer.billing
                      .postcode
                  }
                  maxLength={20}
                  autoComplete="postal-code"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>

              <div>
                <label
                  htmlFor="billingPhone"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Phone number *
                </label>

                <input
                  required
                  id="billingPhone"
                  name="billingPhone"
                  type="tel"
                  defaultValue={
                    customer.billing
                      .phone ?? ""
                  }
                  maxLength={30}
                  autoComplete="tel"
                  placeholder="01XXXXXXXXX"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-xl font-bold text-gray-900">
              Shipping address
            </h2>

            <label className="mt-5 flex items-start gap-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-700">
              <input
                type="checkbox"
                name="sameAsBilling"
                defaultChecked={
                  shippingAddressIsEmpty
                }
                className="mt-1 h-4 w-4"
              />

              <span>
                Use the billing address
                as the shipping address.
                When selected, the fields
                below will be ignored.
              </span>
            </label>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="shippingFirstName"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  First name
                </label>

                <input
                  id="shippingFirstName"
                  name="shippingFirstName"
                  defaultValue={
                    shippingFirstName
                  }
                  maxLength={60}
                  autoComplete="shipping given-name"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>

              <div>
                <label
                  htmlFor="shippingLastName"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Last name
                </label>

                <input
                  id="shippingLastName"
                  name="shippingLastName"
                  defaultValue={
                    shippingLastName
                  }
                  maxLength={60}
                  autoComplete="shipping family-name"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="shippingCompany"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Company
                </label>

                <input
                  id="shippingCompany"
                  name="shippingCompany"
                  defaultValue={
                    customer.shipping
                      .company
                  }
                  maxLength={100}
                  autoComplete="shipping organization"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="shippingAddress1"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Address line 1
                </label>

                <input
                  id="shippingAddress1"
                  name="shippingAddress1"
                  defaultValue={
                    customer.shipping
                      .address_1
                  }
                  maxLength={150}
                  autoComplete="shipping address-line1"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>

              <div className="sm:col-span-2">
                <label
                  htmlFor="shippingAddress2"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Address line 2
                </label>

                <input
                  id="shippingAddress2"
                  name="shippingAddress2"
                  defaultValue={
                    customer.shipping
                      .address_2
                  }
                  maxLength={150}
                  autoComplete="shipping address-line2"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>

              <div>
                <label
                  htmlFor="shippingCity"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  City / Upazila
                </label>

                <input
                  id="shippingCity"
                  name="shippingCity"
                  defaultValue={
                    customer.shipping.city
                  }
                  maxLength={80}
                  autoComplete="shipping address-level2"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>

              <div>
                <label
                  htmlFor="shippingDistrict"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  District
                </label>

                <input
                  id="shippingDistrict"
                  name="shippingDistrict"
                  defaultValue={
                    customer.shipping.state
                  }
                  maxLength={80}
                  autoComplete="shipping address-level1"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>

              <div>
                <label
                  htmlFor="shippingPostcode"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Postcode
                </label>

                <input
                  id="shippingPostcode"
                  name="shippingPostcode"
                  defaultValue={
                    customer.shipping
                      .postcode
                  }
                  maxLength={20}
                  autoComplete="shipping postal-code"
                  className="h-12 w-full rounded-lg border border-gray-300 px-4 outline-none transition focus:border-gray-900"
                />
              </div>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              className="rounded-xl bg-gray-900 px-7 py-4 font-semibold text-white transition hover:bg-gray-700"
            >
              Save addresses
            </button>

            <Link
              href="/account"
              className="rounded-xl border border-gray-300 bg-white px-7 py-4 font-semibold text-gray-800 transition hover:bg-gray-100"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </main>
  );
}