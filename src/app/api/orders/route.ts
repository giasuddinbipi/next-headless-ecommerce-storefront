import {
  type NextRequest,
  NextResponse,
} from "next/server";

import {
  createWooCommerceOrder,
  getProductVariations,
  getProductsByIds,
  type WooCommerceVariation,
} from "@/lib/woocommerce";

export const runtime = "nodejs";

const MAXIMUM_BODY_SIZE = 20_000;
const MAXIMUM_CART_ITEMS = 50;
const MAXIMUM_ITEM_QUANTITY = 20;

type NormalizedItem = {
  productId: number;
  variationId?: number;
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

function isSameOrigin(
  request: NextRequest,
): boolean {
  const origin =
    request.headers.get("origin");

  const host =
    request.headers.get(
      "x-forwarded-host",
    ) ??
    request.headers.get("host");

  if (!origin || !host) {
    return (
      process.env.NODE_ENV !==
      "production"
    );
  }

  try {
    return (
      new URL(origin).host === host
    );
  } catch {
    return false;
  }
}

function validatePurchasableItem(
  item: {
    name?: string;
    price: string;
    purchasable: boolean;
    stock_status:
      | "instock"
      | "outofstock"
      | "onbackorder";
    manage_stock: boolean;
    stock_quantity: number | null;
  },
  quantity: number,
): string | null {
  const name =
    item.name || "This product";

  if (
    !item.purchasable ||
    !item.price
  ) {
    return `${name} is not currently purchasable.`;
  }

  if (
    item.stock_status ===
    "outofstock"
  ) {
    return `${name} is currently out of stock.`;
  }

  if (
    item.manage_stock &&
    item.stock_quantity !== null &&
    quantity > item.stock_quantity
  ) {
    return `Only ${item.stock_quantity} units of ${name} are available.`;
  }

  return null;
}

export async function POST(
  request: NextRequest,
) {
  try {
    if (!isSameOrigin(request)) {
      return NextResponse.json(
        {
          error:
            "Invalid request origin.",
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
      !contentType
        .toLowerCase()
        .startsWith(
          "application/json",
        )
    ) {
      return NextResponse.json(
        {
          error:
            "Content type must be application/json.",
        },
        {
          status: 415,
        },
      );
    }

    const declaredLength = Number(
      request.headers.get(
        "content-length",
      ) ?? 0,
    );

    if (
      declaredLength >
      MAXIMUM_BODY_SIZE
    ) {
      return NextResponse.json(
        {
          error:
            "Checkout request is too large.",
        },
        {
          status: 413,
        },
      );
    }

    const rawBody =
      await request.text();

    if (
      rawBody.length >
      MAXIMUM_BODY_SIZE
    ) {
      return NextResponse.json(
        {
          error:
            "Checkout request is too large.",
        },
        {
          status: 413,
        },
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        {
          error:
            "Invalid JSON request.",
        },
        {
          status: 400,
        },
      );
    }

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

    /*
     * Honeypot field. Human customers
     * should never fill this.
     */
    if (
      readString(
        body,
        "website",
        200,
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Checkout request rejected.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      body.termsAccepted !== true
    ) {
      return NextResponse.json(
        {
          error:
            "Please accept the terms before placing your order.",
        },
        {
          status: 400,
        },
      );
    }

    const customer =
      body.customer;

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
      new Map<
        string,
        NormalizedItem
      >();

    for (const rawItem of body.items) {
      if (!isRecord(rawItem)) {
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

      const productId = Number(
        rawItem.productId,
      );

      const rawVariationId =
        rawItem.variationId;

      const variationId =
        rawVariationId ===
          undefined ||
        rawVariationId === null
          ? undefined
          : Number(rawVariationId);

      const quantity = Number(
        rawItem.quantity,
      );

      if (
        !Number.isInteger(
          productId,
        ) ||
        productId < 1 ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity >
          MAXIMUM_ITEM_QUANTITY ||
        (variationId !== undefined &&
          (!Number.isInteger(
            variationId,
          ) ||
            variationId < 1))
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

      const cartKey =
        variationId
          ? `${productId}:${variationId}`
          : String(productId);

      const existing =
        itemMap.get(cartKey);

      const combinedQuantity =
        (existing?.quantity ?? 0) +
        quantity;

      if (
        combinedQuantity >
        MAXIMUM_ITEM_QUANTITY
      ) {
        return NextResponse.json(
          {
            error:
              "Product quantity exceeds the allowed limit.",
          },
          {
            status: 400,
          },
        );
      }

      itemMap.set(cartKey, {
        productId,
        variationId,
        quantity:
          combinedQuantity,
      });
    }

    const items = [
      ...itemMap.values(),
    ];

    if (
      items.length === 0 ||
      items.length >
        MAXIMUM_CART_ITEMS
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
      await getProductsByIds([
        ...new Set(
          items.map(
            (item) =>
              item.productId,
          ),
        ),
      ]);

    const productMap = new Map(
      products.map((product) => [
        product.id,
        product,
      ]),
    );

    const variationCache =
      new Map<
        number,
        WooCommerceVariation[]
      >();

    const lineItems: Array<{
      product_id: number;
      variation_id?: number;
      quantity: number;
    }> = [];

    for (const item of items) {
      const product =
        productMap.get(
          item.productId,
        );

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
        product.type === "simple"
      ) {
        if (item.variationId) {
          return NextResponse.json(
            {
              error: `${product.name} does not accept a variation.`,
            },
            {
              status: 400,
            },
          );
        }

        const validationError =
          validatePurchasableItem(
            {
              ...product,
              name: product.name,
            },
            item.quantity,
          );

        if (validationError) {
          return NextResponse.json(
            {
              error:
                validationError,
            },
            {
              status: 400,
            },
          );
        }

        lineItems.push({
          product_id:
            product.id,
          quantity:
            item.quantity,
        });

        continue;
      }

      if (
        product.type !==
        "variable"
      ) {
        return NextResponse.json(
          {
            error: `${product.name} is not currently supported by checkout.`,
          },
          {
            status: 400,
          },
        );
      }

      if (!item.variationId) {
        return NextResponse.json(
          {
            error: `Please select the required options for ${product.name}.`,
          },
          {
            status: 400,
          },
        );
      }

      let variations =
        variationCache.get(
          product.id,
        );

      if (!variations) {
        variations =
          await getProductVariations(
            product.id,
          );

        variationCache.set(
          product.id,
          variations,
        );
      }

      const variation =
        variations.find(
          (candidate) =>
            candidate.id ===
            item.variationId,
        );

      if (!variation) {
        return NextResponse.json(
          {
            error: `The selected variation of ${product.name} is no longer available.`,
          },
          {
            status: 400,
          },
        );
      }

      const validationError =
        validatePurchasableItem(
          {
            ...variation,
            name: product.name,
          },
          item.quantity,
        );

      if (validationError) {
        return NextResponse.json(
          {
            error:
              validationError,
          },
          {
            status: 400,
          },
        );
      }

      lineItems.push({
        product_id: product.id,
        variation_id:
          variation.id,
        quantity: item.quantity,
      });
    }

    const deliveryCharge =
      shippingArea === "dhaka"
        ? "80.00"
        : "150.00";

    const billingAddress = {
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

    const shippingAddress = {
      first_name: firstName,
      last_name: lastName,
      address_1: address1,
      city,
      state: district,
      postcode,
      country: "BD",
    };

    const order =
      await createWooCommerceOrder({
        payment_method: "cod",

        payment_method_title:
          "Cash on delivery",

        set_paid: false,
        status: "pending",

        billing:
          billingAddress,

        shipping:
          shippingAddress,

        line_items:
          lineItems,

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
        orderNumber:
          order.number,
        status: order.status,
        currency:
          order.currency,
        total: order.total,
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    /*
     * Log detailed errors only on
     * the server. Do not expose API
     * keys or WooCommerce responses
     * to customers.
     */
    console.error(
      "Order creation failed:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Order could not be created. Please try again.",
      },
      {
        status: 502,
      },
    );
  }
}