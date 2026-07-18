import {
  NextRequest,
  NextResponse,
} from "next/server";

import { z } from "zod";

import { auth } from "@/auth";

import {
  getCustomerProfile,
  updateCustomerProfile,
} from "@/lib/customer";

const profileSchema = z.object({
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

  phone: z
    .string()
    .trim()
    .min(6)
    .max(30),
});

function isSameOrigin(
  request: NextRequest,
): boolean {
  const origin =
    request.headers.get("origin");

  if (!origin) {
    return false;
  }

  try {
    return (
      new URL(origin).origin ===
      request.nextUrl.origin
    );
  } catch {
    return false;
  }
}

export async function PUT(
  request: NextRequest,
) {
  const session = await auth();

  if (
    !session?.user ||
    !session.user.customerId
  ) {
    return NextResponse.json(
      {
        error:
          "You must be logged in.",
      },
      {
        status: 401,
      },
    );
  }

  if (!isSameOrigin(request)) {
    return NextResponse.json(
      {
        error:
          "The request was rejected.",
      },
      {
        status: 403,
      },
    );
  }

  const contentType =
    request.headers.get(
      "content-type",
    ) ?? "";

  if (
    !contentType.includes(
      "application/json",
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid request format.",
      },
      {
        status: 415,
      },
    );
  }

  let body: unknown;

  try {
    const rawBody =
      await request.text();

    if (rawBody.length > 10_000) {
      return NextResponse.json(
        {
          error:
            "The request is too large.",
        },
        {
          status: 413,
        },
      );
    }

    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid request data.",
      },
      {
        status: 400,
      },
    );
  }

  const parsed =
    profileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Please provide valid profile information.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const customer =
      await getCustomerProfile(
        session.user.customerId,
      );

    if (!customer) {
      return NextResponse.json(
        {
          error:
            "Customer account was not found.",
        },
        {
          status: 404,
        },
      );
    }

    const {
      firstName,
      lastName,
      phone,
    } = parsed.data;

    const billing = {
      ...customer.billing,

      first_name: firstName,
      last_name: lastName,

      email:
        customer.email,

      phone,
    };

    const shipping = {
      first_name:
        customer.shipping
          .first_name ||
        firstName,

      last_name:
        customer.shipping
          .last_name ||
        lastName,

      company:
        customer.shipping.company,

      address_1:
        customer.shipping.address_1,

      address_2:
        customer.shipping.address_2,

      city:
        customer.shipping.city,

      state:
        customer.shipping.state,

      postcode:
        customer.shipping.postcode,

      country:
        customer.shipping.country ||
        "BD",
    };

    const updatedCustomer =
      await updateCustomerProfile(
        session.user.customerId,
        {
          first_name: firstName,
          last_name: lastName,
          billing,
          shipping,
        },
      );

    if (!updatedCustomer) {
      return NextResponse.json(
        {
          error:
            "Customer account was not found.",
        },
        {
          status: 404,
        },
      );
    }

    const fullName = [
      updatedCustomer.first_name,
      updatedCustomer.last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    return NextResponse.json({
      success: true,

      user: {
        firstName:
          updatedCustomer.first_name,

        lastName:
          updatedCustomer.last_name,

        name:
          fullName ||
          updatedCustomer.email,

        email:
          updatedCustomer.email,

        phone:
          updatedCustomer.billing
            .phone ?? "",
      },
    });
  } catch (error) {
    console.error(
      "Customer profile update failed:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Your profile could not be updated.",
      },
      {
        status: 500,
      },
    );
  }
}