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
  createProductReview,
  customerHasReview,
  getProductReviews,
} from "@/lib/reviews";

type ReviewsRouteContext = {
  params: Promise<{
    productId: string;
  }>;
};

const reviewSchema = z.object({
  rating: z
    .number()
    .int()
    .min(1)
    .max(5),

  review: z
    .string()
    .trim()
    .min(10)
    .max(1000),

  website: z
    .string()
    .max(200)
    .optional()
    .default(""),
});

function parseProductId(
  value: string,
): number | null {
  const productId = Number(value);

  if (
    !Number.isInteger(productId) ||
    productId < 1
  ) {
    return null;
  }

  return productId;
}

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

export async function GET(
  _request: NextRequest,
  context: ReviewsRouteContext,
) {
  const { productId: value } =
    await context.params;

  const productId =
    parseProductId(value);

  if (!productId) {
    return NextResponse.json(
      {
        error:
          "Invalid product ID.",
      },
      {
        status: 400,
      },
    );
  }

  try {
    const reviews =
      await getProductReviews(
        productId,
      );

    return NextResponse.json({
      success: true,
      reviews,
    });
  } catch (error) {
    console.error(
      "Product reviews loading failed:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Product reviews could not be loaded.",
      },
      {
        status: 502,
      },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: ReviewsRouteContext,
) {
  const session = await auth();

  if (
    !session?.user ||
    !session.user.customerId
  ) {
    return NextResponse.json(
      {
        error:
          "You must be logged in to submit a review.",
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

  const { productId: value } =
    await context.params;

  const productId =
    parseProductId(value);

  if (!productId) {
    return NextResponse.json(
      {
        error:
          "Invalid product ID.",
      },
      {
        status: 400,
      },
    );
  }

  let body: unknown;

  try {
    const rawBody =
      await request.text();

    if (rawBody.length > 5_000) {
      return NextResponse.json(
        {
          error:
            "The review request is too large.",
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
          "Invalid review data.",
      },
      {
        status: 400,
      },
    );
  }

  const parsed =
    reviewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Choose a rating and write a review containing between 10 and 1000 characters.",
      },
      {
        status: 400,
      },
    );
  }

  /*
   * Honeypot: return a normal-looking
   * success response without creating
   * a review.
   */
  if (parsed.data.website) {
    return NextResponse.json(
      {
        success: true,
        pending: true,
        message:
          "Your review was submitted for approval.",
      },
      {
        status: 201,
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
            "Your customer account could not be found.",
        },
        {
          status: 404,
        },
      );
    }

    const reviewerEmail =
      customer.email
        .trim()
        .toLowerCase();

    const reviewerName = [
      customer.first_name,
      customer.last_name,
    ]
      .filter(Boolean)
      .join(" ")
      .trim();

    const alreadyReviewed =
      await customerHasReview(
        productId,
        reviewerEmail,
      );

    if (alreadyReviewed) {
      return NextResponse.json(
        {
          error:
            "You have already submitted a review for this product.",
        },
        {
          status: 409,
        },
      );
    }

    await createProductReview({
      productId,

      reviewer:
        reviewerName ||
        session.user.name ||
        "Customer",

      reviewerEmail,

      rating:
        parsed.data.rating,

      review:
        parsed.data.review,
    });

    return NextResponse.json(
      {
        success: true,
        pending: true,

        message:
          "Your review was submitted successfully and is waiting for approval.",
      },
      {
        status: 201,
      },
    );
  } catch (error) {
    console.error(
      "Product review submission failed:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Your review could not be submitted.",
      },
      {
        status: 502,
      },
    );
  }
}