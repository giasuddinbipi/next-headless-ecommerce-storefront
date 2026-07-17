import { NextResponse } from "next/server";

import {
  createWooCommerceOrder,
  getProductsByIds,
} from "@/lib/woocommerce";

export const runtime = "nodejs";

type RequestItem = {
  id: number;
  quantity: number;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function readString(
  record: Record<string, unknown>,
  key: string,
  maximumLength: number,
): string {
  const value = record[key];

  if (typeof value !== "string") {
    return "";
  }

  return value
    .trim()
    .slice(0, maximumLength);
}

function validateEmail(
  email: string,
): boolean {
  if (!email) {
    return true;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email,
  );
}

function validatePhone(
  phone: string,
): boolean {
  const digits = phone.replace(
    /\D/g,
    "",
  );

  return (
    digits.length >= 8 &&
    digits.length <= 15
  );
}

export async function POST(
  request: Request,
) {
  try {
    const body: unknown =
      await request.json();

    if (!isRecord(body)) {
      return NextResponse.json(
        {
          error:
            "Invalid checkout request.",
        },
        {
          status: 400,
        },
      );
    }

    const customer = body.customer;

    if (!isRecord(customer)) {
      return NextResponse.json(
        {
          error:
            "Customer information is missing.",
        },
        {
          status: 400,
        },
      );
    }

    const firstName = readString(
      customer,
      "firstName",
      60,
    );

    const lastName = readString(
      customer,
      "lastName",
      60,
    );

    const phone = readString(
      customer,
      "phone",
      30,
    );

    const email = readString(
      customer,
      "email",
      120,
    );

    const address1 = readString(
      customer,
      "address1",
      200,
    );

    const city = readString(
      customer,
      "city",
      100,
    );

    const district = readString(
      customer,
      "district",
      100,
    );

    const postcode = readString(
      customer,
      "postcode",
      20,
    );

    const note = readString(
      customer,
      "note",
      500,
    );

    if (
      !firstName ||
      !lastName ||
      !phone ||
      !address1 ||
      !city ||
      !district
    ) {
      return NextResponse.json(
        {
          error:
            "Please complete all required customer fields.",
        },
        {
          status: 400,
        },
      );
    }

    if (!validatePhone(phone)) {
      return NextResponse.json(
        {
          error:
            "Please enter a valid phone number.",
        },
        {
          status: 400,
        },
      );
    }

    if (!validateEmail(email)) {
      return NextResponse.json(
        {
          error:
            "Please enter a valid email address.",
        },
        {
          status: 400,
        },
      );
    }

    const shippingArea =
      body.shippingArea === "dhaka"
        ? "dhaka"
        : body.shippingArea ===
            "outside"
          ? "outside"
          : null;

    if (!shippingArea) {
      return NextResponse.json(
        {
          error:
            "Please select a delivery area.",
        },
        {
          status: 400,
        },
      );
    }

    if (!Array.isArray(body.items)) {
      return NextResponse.json(
        {
          error:
            "Cart items are missing.",
        },
        {
          status: 400,
        },
      );
    }

    const itemMap =
      new Map<number, number>();

    for (const rawItem of body.items) {
      if (!isRecord(rawItem)) {
        continue;
      }

      const productId = Number(
        rawItem.id,
      );

      const quantity = Number(
        rawItem.quantity,
      );

      if (
        !Number.isInteger(productId) ||
        productId < 1 ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 20
      ) {
        return NextResponse.json(
          {
            error:
              "One or more cart items are invalid.",
          },
          {
            status: 400,
          },
        );
      }

      const currentQuantity =
        itemMap.get(productId) ?? 0;

      itemMap.set(
        productId,
        currentQuantity + quantity,
      );
    }

    const items: RequestItem[] = [
      ...itemMap.entries(),
    ].map(
      ([id, quantity]) => ({
        id,
        quantity,
      }),
    );

    if (
      items.length === 0 ||
      items.length > 50
    ) {
      return NextResponse.json(
        {
          error:
            "Your cart is empty or contains too many products.",
        },
        {
          status: 400,
        },
      );
    }

    const products =
      await getProductsByIds(
        items.map((item) => item.id),
      );

    const productMap = new Map(
      products.map((product) => [
        product.id,
        product,
      ]),
    );

    for (const item of items) {
      const product =
        productMap.get(item.id);

      if (!product) {
        return NextResponse.json(
          {
            error:
              "A product in your cart is no longer available.",
          },
          {
            status: 400,
          },
        );
      }

      if (
        product.type !== "simple"
      ) {
        return NextResponse.json(
          {
            error: `${product.name} requires variation selection. Variable products will be added in a later step.`,
          },
          {
            status: 400,
          },
        );
      }

      if (
        !product.purchasable ||
        !product.price
      ) {
        return NextResponse.json(
          {
            error: `${product.name} is not currently purchasable.`,
          },
          {
            status: 400,
          },
        );
      }

      if (
        product.stock_status ===
        "outofstock"
      ) {
        return NextResponse.json(
          {
            error: `${product.name} is currently out of stock.`,
          },
          {
            status: 400,
          },
        );
      }

      if (
        product.manage_stock &&
        product.stock_quantity !== null &&
        item.quantity >
          product.stock_quantity
      ) {
        return NextResponse.json(
          {
            error: `Only ${product.stock_quantity} units of ${product.name} are available.`,
          },
          {
            status: 400,
          },
        );
      }
    }

    const deliveryCharge =
      shippingArea === "dhaka"
        ? "80.00"
        : "150.00";

    const address = {
      first_name: firstName,
      last_name: lastName,
      address_1: address1,
      city,
      state: district,
      postcode,
      country: "BD",
      email,
      phone,
    };

    const order =
      await createWooCommerceOrder({
        payment_method: "cod",
        payment_method_title:
          "Cash on delivery",

        set_paid: false,
        status: "pending",

        billing: address,
        shipping: address,

        line_items: items.map(
          (item) => ({
            product_id: item.id,
            quantity: item.quantity,
          }),
        ),

        shipping_lines: [
          {
            method_id:
              "flat_rate",
            method_title:
              shippingArea === "dhaka"
                ? "Delivery inside Dhaka"
                : "Delivery outside Dhaka",

            total:
              deliveryCharge,
          },
        ],

        customer_note: note,

        meta_data: [
          {
            key: "order_source",
            value:
              "Next.js storefront",
          },
        ],
      });

    return NextResponse.json(
      {
        success: true,
        orderId: order.id,
        orderNumber: order.number,
        status: order.status,
        currency: order.currency,
        total: order.total,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(
      "Order creation failed:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Order could not be created.",
      },
      {
        status: 502,
      },
    );
  }
}