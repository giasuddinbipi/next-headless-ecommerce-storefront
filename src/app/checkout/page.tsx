import type { Metadata } from "next";

import { auth } from "@/auth";

import CheckoutClient, {
  type CheckoutInitialValues,
} from "@/components/checkout/CheckoutClient";

import {
  getCustomerProfile,
  type WooCommerceCustomerAddress,
} from "@/lib/customer";

export const metadata: Metadata = {
  title: "Checkout",
};

function hasAddress(
  address: WooCommerceCustomerAddress,
): boolean {
  return Boolean(
    address.address_1.trim() ||
      address.city.trim() ||
      address.state.trim() ||
      address.postcode.trim(),
  );
}

function combineAddressLines(
  address: WooCommerceCustomerAddress,
): string {
  return [
    address.address_1,
    address.address_2,
  ]
    .map((value) => value.trim())
    .filter(Boolean)
    .join(", ");
}

function getShippingArea(
  address: WooCommerceCustomerAddress,
): "dhaka" | "outside" {
  const location = [
    address.city,
    address.state,
  ]
    .join(" ")
    .trim()
    .toLowerCase();

  return location.includes("dhaka")
    ? "dhaka"
    : "outside";
}

export default async function CheckoutPage() {
  const session = await auth();

  let initialValues:
    | CheckoutInitialValues
    | null = null;

  let hasSavedAddress = false;

  if (
    session?.user?.customerId &&
    session.user.customerId > 0
  ) {
    try {
      const customer =
        await getCustomerProfile(
          session.user.customerId,
        );

      if (customer) {
        const shippingIsSaved =
          hasAddress(
            customer.shipping,
          );

        const billingIsSaved =
          hasAddress(
            customer.billing,
          );

        const deliveryAddress =
          shippingIsSaved
            ? customer.shipping
            : customer.billing;

        hasSavedAddress =
          shippingIsSaved ||
          billingIsSaved;

        initialValues = {
          firstName:
            deliveryAddress.first_name ||
            customer.billing.first_name ||
            customer.first_name ||
            "",

          lastName:
            deliveryAddress.last_name ||
            customer.billing.last_name ||
            customer.last_name ||
            "",

          phone:
            customer.billing.phone ??
            "",

          email:
            customer.billing.email ||
            customer.email ||
            session.user.email ||
            "",

          address1:
            combineAddressLines(
              deliveryAddress,
            ),

          city:
            deliveryAddress.city ||
            "",

          district:
            deliveryAddress.state ||
            "",

          postcode:
            deliveryAddress.postcode ||
            "",

          shippingArea:
            hasSavedAddress
              ? getShippingArea(
                  deliveryAddress,
                )
              : "dhaka",
        };
      }
    } catch (error) {
      console.error(
        "Checkout customer profile loading failed:",
        error,
      );
    }
  }

  return (
    <CheckoutClient
      initialValues={initialValues}
      hasSavedAddress={
        hasSavedAddress
      }
    />
  );
}