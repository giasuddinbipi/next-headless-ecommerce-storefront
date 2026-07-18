import "server-only";

export type ProductReviewStatus =
  | "approved"
  | "hold"
  | "spam"
  | "trash"
  | string;

type WooCommerceProductReview = {
  id: number;
  date_created: string;
  product_id: number;
  status: ProductReviewStatus;
  reviewer: string;
  reviewer_email: string;
  review: string;
  rating: number;
  verified: boolean;

  reviewer_avatar_urls?: {
    "24"?: string;
    "48"?: string;
    "96"?: string;
  };
};

export type PublicProductReview = {
  id: number;
  dateCreated: string;
  productId: number;
  reviewer: string;
  review: string;
  rating: number;
  verified: boolean;
};

export type CreateProductReviewInput = {
  productId: number;
  reviewer: string;
  reviewerEmail: string;
  review: string;
  rating: number;
};

function getRequiredEnvironmentVariable(
  name: string,
): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value;
}

function getWooCommerceConfiguration() {
  const storeUrl =
    getRequiredEnvironmentVariable(
      "WOOCOMMERCE_URL",
    ).replace(/\/+$/, "");

  const consumerKey =
    getRequiredEnvironmentVariable(
      "WOOCOMMERCE_CONSUMER_KEY",
    );

  const consumerSecret =
    getRequiredEnvironmentVariable(
      "WOOCOMMERCE_CONSUMER_SECRET",
    );

  return {
    storeUrl,
    consumerKey,
    consumerSecret,
  };
}

function createAuthorizationHeader(
  consumerKey: string,
  consumerSecret: string,
): string {
  const credentials = Buffer.from(
    `${consumerKey}:${consumerSecret}`,
    "utf8",
  ).toString("base64");

  return `Basic ${credentials}`;
}

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function getWooCommerceErrorMessage(
  data: unknown,
): string {
  if (
    isObject(data) &&
    typeof data.message === "string"
  ) {
    return data.message;
  }

  return "WooCommerce review request failed.";
}

function decodeBasicHtmlEntities(
  value: string,
): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&nbsp;/gi, " ");
}

function convertReviewToPlainText(
  value: string,
): string {
  const withoutTags = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]*>/g, "");

  return decodeBasicHtmlEntities(
    withoutTags,
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function toPublicReview(
  review: WooCommerceProductReview,
): PublicProductReview {
  return {
    id: review.id,
    dateCreated:
      review.date_created,
    productId:
      review.product_id,
    reviewer:
      review.reviewer,
    review:
      convertReviewToPlainText(
        review.review,
      ),
    rating:
      Math.min(
        5,
        Math.max(
          0,
          Number(review.rating) || 0,
        ),
      ),
    verified:
      review.verified === true,
  };
}

async function reviewRequest(
  endpoint: URL,
  options?: RequestInit,
): Promise<Response> {
  const {
    consumerKey,
    consumerSecret,
  } = getWooCommerceConfiguration();

  return fetch(endpoint, {
    ...options,

    headers: {
      Accept: "application/json",

      Authorization:
        createAuthorizationHeader(
          consumerKey,
          consumerSecret,
        ),

      ...(options?.body
        ? {
            "Content-Type":
              "application/json",
          }
        : {}),

      ...options?.headers,
    },

    cache: "no-store",
  });
}

export async function getProductReviews(
  productId: number,
): Promise<PublicProductReview[]> {
  if (
    !Number.isInteger(productId) ||
    productId < 1
  ) {
    return [];
  }

  const { storeUrl } =
    getWooCommerceConfiguration();

  const endpoint = new URL(
    "/wp-json/wc/v3/products/reviews",
    storeUrl,
  );

  endpoint.searchParams.set(
    "product",
    String(productId),
  );

  endpoint.searchParams.set(
    "status",
    "approved",
  );

  endpoint.searchParams.set(
    "orderby",
    "date",
  );

  endpoint.searchParams.set(
    "order",
    "desc",
  );

  endpoint.searchParams.set(
    "per_page",
    "100",
  );

  const response =
    await reviewRequest(endpoint);

  const data: unknown =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    throw new Error(
      getWooCommerceErrorMessage(
        data,
      ),
    );
  }

  if (!Array.isArray(data)) {
    throw new Error(
      "WooCommerce returned an invalid reviews response.",
    );
  }

  return (
    data as WooCommerceProductReview[]
  )
    .filter(
      (review) =>
        review.product_id ===
          productId &&
        review.status ===
          "approved",
    )
    .map(toPublicReview);
}

export async function customerHasReview(
  productId: number,
  reviewerEmail: string,
): Promise<boolean> {
  const normalizedEmail =
    reviewerEmail
      .trim()
      .toLowerCase();

  if (
    !Number.isInteger(productId) ||
    productId < 1 ||
    !normalizedEmail
  ) {
    return false;
  }

  const { storeUrl } =
    getWooCommerceConfiguration();

  const endpoint = new URL(
    "/wp-json/wc/v3/products/reviews",
    storeUrl,
  );

  endpoint.searchParams.set(
    "product",
    String(productId),
  );

  endpoint.searchParams.set(
    "reviewer_email",
    normalizedEmail,
  );

  endpoint.searchParams.set(
    "status",
    "all",
  );

  endpoint.searchParams.set(
    "per_page",
    "100",
  );

  const response =
    await reviewRequest(endpoint);

  const data: unknown =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    throw new Error(
      getWooCommerceErrorMessage(
        data,
      ),
    );
  }

  if (!Array.isArray(data)) {
    return false;
  }

  return (
    data as WooCommerceProductReview[]
  ).some(
    (review) =>
      review.product_id ===
        productId &&
      review.reviewer_email
        .trim()
        .toLowerCase() ===
        normalizedEmail &&
      review.status !== "trash",
  );
}

export async function createProductReview(
  input: CreateProductReviewInput,
): Promise<PublicProductReview> {
  const { storeUrl } =
    getWooCommerceConfiguration();

  const endpoint = new URL(
    "/wp-json/wc/v3/products/reviews",
    storeUrl,
  );

  const response =
    await reviewRequest(endpoint, {
      method: "POST",

      body: JSON.stringify({
        product_id:
          input.productId,

        reviewer:
          input.reviewer,

        reviewer_email:
          input.reviewerEmail,

        review:
          input.review,

        rating:
          input.rating,

        /*
         * Admin approval is required
         * before the review becomes public.
         */
        status: "hold",
      }),
    });

  const data: unknown =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    throw new Error(
      getWooCommerceErrorMessage(
        data,
      ),
    );
  }

  if (
    !isObject(data) ||
    typeof data.id !== "number" ||
    typeof data.product_id !==
      "number" ||
    typeof data.reviewer !==
      "string" ||
    typeof data.review !==
      "string" ||
    typeof data.rating !==
      "number"
  ) {
    throw new Error(
      "WooCommerce returned an invalid review response.",
    );
  }

  return toPublicReview(
    data as WooCommerceProductReview,
  );
}