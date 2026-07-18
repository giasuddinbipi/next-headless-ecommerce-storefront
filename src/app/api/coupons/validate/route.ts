import {
  NextRequest,
  NextResponse,
} from "next/server";

import { z } from "zod";

import { auth } from "@/auth";

import {
  getCustomerProfile,
} from "@/lib/customer";

import {
  CouponValidationError,
  validateCouponForCart,
} from "@/lib/coupons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REQUEST_SIZE = 30_000;

const couponRequestSchema =
  z.object({
    code: z
      .string()
      .trim()
      .min(1)
      .max(100),

    email: z
      .string()
      .trim()
      .email()
      .max(200)
      .optional()
      .or(z.literal("")),

    items: z
      .array(
        z.object({
          productId: z
            .number()
            .int()
            .positive(),

          variationId: z
            .number()
            .int()
            .positive()
            .nullable()
            .optional(),

          quantity: z
            .number()
            .int()
            .min(1)
            .max(99),
        }),
      )
      .min(1)
      .max(50),
  });

function addAllowedOrigin(
  origins: Set<string>,
  value: string | undefined,
) {
  const normalized =
    value?.trim();

  if (!normalized) {
    return;
  }

  try {
    const url =
      normalized.includes(
        "://",
      )
        ? new URL(normalized)
        : new URL(
            `https://${normalized}`,
          );

    origins.add(url.origin);
  } catch {
    // Invalid environment URL ignored.
  }
}

function isSameOrigin(
  request: NextRequest,
): boolean {
  const origin =
    request.headers.get(
      "origin",
    );

  if (!origin) {
    return false;
  }

  let submittedOrigin: string;

  try {
    submittedOrigin =
      new URL(origin).origin;
  } catch {
    return false;
  }

  const allowedOrigins =
    new Set<string>();

  allowedOrigins.add(
    new URL(
      request.url,
    ).origin,
  );

  addAllowedOrigin(
    allowedOrigins,
    process.env.AUTH_URL,
  );

  addAllowedOrigin(
    allowedOrigins,
    process.env.NEXTAUTH_URL,
  );

  addAllowedOrigin(
    allowedOrigins,
    process.env
      .NEXT_PUBLIC_SITE_URL,
  );

  addAllowedOrigin(
    allowedOrigins,
    process.env.VERCEL_URL,
  );

  addAllowedOrigin(
    allowedOrigins,
    process.env
      .VERCEL_PROJECT_PRODUCTION_URL,
  );

  return allowedOrigins.has(
    submittedOrigin,
  );
}

async function parseJsonBody(
  request: NextRequest,
): Promise<unknown> {
  const contentType =
    request.headers.get(
      "content-type",
    ) ?? "";

  if (
    !contentType
      .toLowerCase()
      .includes(
        "application/json",
      )
  ) {
    throw new CouponValidationError(
      "The coupon request must use JSON.",
      415,
      "invalid_content_type",
    );
  }

  const contentLength =
    Number(
      request.headers.get(
        "content-length",
      ) ?? 0,
    );

  if (
    Number.isFinite(
      contentLength,
    ) &&
    contentLength >
      MAX_REQUEST_SIZE
  ) {
    throw new CouponValidationError(
      "The coupon request is too large.",
      413,
      "request_too_large",
    );
  }

  const rawBody =
    await request.text();

  if (
    rawBody.length >
    MAX_REQUEST_SIZE
  ) {
    throw new CouponValidationError(
      "The coupon request is too large.",
      413,
      "request_too_large",
    );
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    throw new CouponValidationError(
      "The coupon request contains invalid JSON.",
      400,
      "invalid_json",
    );
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    if (!isSameOrigin(request)) {
      throw new CouponValidationError(
        "The coupon request was rejected.",
        403,
        "invalid_origin",
      );
    }

    const rawBody =
      await parseJsonBody(
        request,
      );

    const parsed =
      couponRequestSchema.safeParse(
        rawBody,
      );

    if (!parsed.success) {
      throw new CouponValidationError(
        "Enter a valid coupon code and cart information.",
        400,
        "invalid_coupon_request",
      );
    }

    const session =
      await auth();

    const customerId =
      typeof session?.user
        ?.customerId ===
        "number" &&
      session.user.customerId > 0
        ? session.user.customerId
        : undefined;

    let trustedEmail =
      parsed.data.email
        ?.trim()
        .toLowerCase() || "";

    if (customerId) {
      try {
        const customer =
          await getCustomerProfile(
            customerId,
          );

        if (
          customer?.email
        ) {
          trustedEmail =
            customer.email
              .trim()
              .toLowerCase();
        }
      } catch (error) {
        console.error(
          "Coupon customer profile lookup failed:",
          error,
        );

        if (
          session?.user?.email
        ) {
          trustedEmail =
            session.user.email
              .trim()
              .toLowerCase();
        }
      }
    }

    const coupon =
      await validateCouponForCart(
        {
          code:
            parsed.data.code,

          email:
            trustedEmail ||
            undefined,

          customerId,

          items:
            parsed.data.items.map(
              (item) => ({
                productId:
                  item.productId,

                variationId:
                  item.variationId ??
                  undefined,

                quantity:
                  item.quantity,
              }),
            ),
        },
      );

    return NextResponse.json(
      {
        success: true,
        coupon,
      },
      {
        status: 200,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  } catch (error) {
    if (
      error instanceof
      CouponValidationError
    ) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
        },
        {
          status: error.status,

          headers: {
            "Cache-Control":
              "no-store",
          },
        },
      );
    }

    console.error(
      "Coupon validation failed:",
      error,
    );

    return NextResponse.json(
      {
        success: false,

        error:
          "The coupon could not be validated right now.",

        code:
          "coupon_validation_failed",
      },
      {
        status: 502,

        headers: {
          "Cache-Control":
            "no-store",
        },
      },
    );
  }
}