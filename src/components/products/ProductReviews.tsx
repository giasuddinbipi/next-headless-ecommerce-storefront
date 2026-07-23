"use client";

import Link from "next/link";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  useSession,
} from "next-auth/react";

type ProductReview = {
  id: number;
  dateCreated: string;
  productId: number;
  reviewer: string;
  review: string;
  rating: number;
  verified: boolean;
};

type ProductReviewsProps = {
  productId: number;
  productSlug: string;
  averageRating: number;
  ratingCount: number;
};

type ReviewsResponse = {
  success: true;
  reviews: ProductReview[];
};

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null
  );
}

function isProductReview(
  value: unknown,
): value is ProductReview {
  return (
    isObject(value) &&
    typeof value.id ===
      "number" &&
    typeof value.dateCreated ===
      "string" &&
    typeof value.productId ===
      "number" &&
    typeof value.reviewer ===
      "string" &&
    typeof value.review ===
      "string" &&
    typeof value.rating ===
      "number" &&
    typeof value.verified ===
      "boolean"
  );
}

function isReviewsResponse(
  value: unknown,
): value is ReviewsResponse {
  return (
    isObject(value) &&
    value.success === true &&
    Array.isArray(
      value.reviews,
    ) &&
    value.reviews.every(
      isProductReview,
    )
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

  return "The request could not be completed.";
}

function formatDate(
  value: string,
): string {
  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-BD",
    {
      day:
        "numeric",

      month:
        "long",

      year:
        "numeric",
    },
  ).format(
    date,
  );
}

function StarRating({
  rating,
  label,
}: {
  rating: number;
  label?: string;
}) {
  const roundedRating =
    Math.round(
      rating,
    );

  return (
    <div
      aria-label={
        label ??
        `${rating} out of 5 stars`
      }
      className="flex items-center gap-0.5"
    >
      {[
        1,
        2,
        3,
        4,
        5,
      ].map(
        (
          star,
        ) => (
          <span
            key={
              star
            }
            aria-hidden="true"
            className={
              star <=
              roundedRating
                ? "text-yellow-500"
                : "text-gray-300"
            }
          >
            ★
          </span>
        ),
      )}
    </div>
  );
}

export default function ProductReviews({
  productId,
  productSlug,
  averageRating,
  ratingCount,
}: ProductReviewsProps) {
  const {
    status:
      authStatus,
  } =
    useSession();

  const [
    reviews,
    setReviews,
  ] =
    useState<
      ProductReview[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(
      true,
    );

  const [
    loadError,
    setLoadError,
  ] =
    useState("");

  const [
    rating,
    setRating,
  ] =
    useState(
      0,
    );

  const [
    submitting,
    setSubmitting,
  ] =
    useState(
      false,
    );

  const [
    submitError,
    setSubmitError,
  ] =
    useState("");

  const [
    successMessage,
    setSuccessMessage,
  ] =
    useState("");

  const loadReviews =
    useCallback(
      async (
        signal?:
          AbortSignal,
      ): Promise<void> => {
        setLoading(
          true,
        );

        setLoadError(
          "",
        );

        try {
          const response =
            await fetch(
              `/api/products/${productId}/reviews`,
              {
                method:
                  "GET",

                cache:
                  "no-store",

                signal,
              },
            );

          const data: unknown =
            await response
              .json()
              .catch(
                () => null,
              );

          if (
            signal?.aborted
          ) {
            return;
          }

          if (
            !response.ok
          ) {
            throw new Error(
              getErrorMessage(
                data,
              ),
            );
          }

          if (
            !isReviewsResponse(
              data,
            )
          ) {
            throw new Error(
              "The server returned an invalid reviews response.",
            );
          }

          setReviews(
            data.reviews,
          );
        } catch (error) {
          if (
            signal?.aborted ||
            (
              error instanceof DOMException &&
              error.name ===
                "AbortError"
            )
          ) {
            return;
          }

          setLoadError(
            error instanceof Error
              ? error.message
              : "Product reviews could not be loaded.",
          );
        } finally {
          if (
            !signal?.aborted
          ) {
            setLoading(
              false,
            );
          }
        }
      },
      [
        productId,
      ],
    );

  /*
   * Load reviews after mount. The request begins inside a
   * timer callback so the effect body does not synchronously
   * trigger React state updates through loadReviews().
   *
   * AbortController prevents a response from an older
   * product request from updating this component.
   */
  useEffect(() => {
    const controller =
      new AbortController();

    const loadTimer =
      window.setTimeout(
        () => {
          void loadReviews(
            controller.signal,
          );
        },
        0,
      );

    return () => {
      window.clearTimeout(
        loadTimer,
      );

      controller.abort();
    };
  }, [
    loadReviews,
  ]);

  const handleSubmit =
    async (
      event:
        FormEvent<HTMLFormElement>,
    ): Promise<void> => {
      event.preventDefault();

      const form =
        event.currentTarget;

      setSubmitError(
        "",
      );

      setSuccessMessage(
        "",
      );

      if (
        rating < 1 ||
        rating > 5
      ) {
        setSubmitError(
          "Select a rating before submitting your review.",
        );

        return;
      }

      const formData =
        new FormData(
          form,
        );

      const review =
        String(
          formData.get(
            "review",
          ) ?? "",
        ).trim();

      const website =
        String(
          formData.get(
            "website",
          ) ?? "",
        );

      if (
        review.length <
          10 ||
        review.length >
          1000
      ) {
        setSubmitError(
          "Your review must contain between 10 and 1000 characters.",
        );

        return;
      }

      setSubmitting(
        true,
      );

      try {
        const response =
          await fetch(
            `/api/products/${productId}/reviews`,
            {
              method:
                "POST",

              headers: {
                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  rating,
                  review,
                  website,
                }),
            },
          );

        const data: unknown =
          await response
            .json()
            .catch(
              () => null,
            );

        if (
          !response.ok
        ) {
          throw new Error(
            getErrorMessage(
              data,
            ),
          );
        }

        const message =
          isObject(
            data,
          ) &&
          typeof data.message ===
            "string"
            ? data.message
            : "Your review was submitted successfully.";

        form.reset();

        setRating(
          0,
        );

        setSuccessMessage(
          message,
        );
      } catch (error) {
        setSubmitError(
          error instanceof Error
            ? error.message
            : "Your review could not be submitted.",
        );
      } finally {
        setSubmitting(
          false,
        );
      }
    };

  const safeAverageRating =
    Number.isFinite(
      averageRating,
    )
      ? averageRating
      : 0;

  return (
    <section
      id="product-reviews"
      className="mt-12 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-5 border-b border-gray-200 pb-7">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">
            Customer feedback
          </p>

          <h2 className="mt-2 text-2xl font-bold text-gray-900 sm:text-3xl">
            Ratings and reviews
          </h2>

          <p className="mt-2 text-gray-600">
            Read feedback from customers who reviewed this product.
          </p>
        </div>

        <div className="rounded-xl bg-gray-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold text-gray-900">
              {safeAverageRating.toFixed(
                1,
              )}
            </span>

            <div>
              <StarRating
                rating={
                  safeAverageRating
                }
              />

              <p className="mt-1 text-sm text-gray-500">
                {ratingCount}{" "}
                {ratingCount ===
                1
                  ? "review"
                  : "reviews"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          <h3 className="text-xl font-bold text-gray-900">
            Customer reviews
          </h3>

          {loading && (
            <div className="mt-5 space-y-4">
              {[
                1,
                2,
              ].map(
                (
                  item,
                ) => (
                  <div
                    key={
                      item
                    }
                    className="h-32 animate-pulse rounded-xl bg-gray-100"
                  />
                ),
              )}
            </div>
          )}

          {loadError && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700"
            >
              {loadError}

              <button
                type="button"
                onClick={() => {
                  void loadReviews();
                }}
                className="ml-2 font-bold underline"
              >
                Try again
              </button>
            </div>
          )}

          {!loading &&
            !loadError &&
            reviews.length ===
              0 && (
              <div className="mt-5 rounded-xl bg-gray-50 p-7 text-center">
                <h4 className="font-bold text-gray-900">
                  No approved reviews yet
                </h4>

                <p className="mt-2 text-sm text-gray-600">
                  Be the first customer to review this product.
                </p>
              </div>
            )}

          {!loading &&
            !loadError &&
            reviews.length >
              0 && (
              <div className="mt-5 divide-y divide-gray-200">
                {reviews.map(
                  (
                    review,
                  ) => (
                    <article
                      key={
                        review.id
                      }
                      className="py-6 first:pt-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="font-bold text-gray-900">
                              {
                                review.reviewer
                              }
                            </h4>

                            {review.verified && (
                              <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-800">
                                Verified buyer
                              </span>
                            )}
                          </div>

                          <div className="mt-2">
                            <StarRating
                              rating={
                                review.rating
                              }
                            />
                          </div>
                        </div>

                        <time className="text-sm text-gray-500">
                          {formatDate(
                            review.dateCreated,
                          )}
                        </time>
                      </div>

                      <p className="mt-4 whitespace-pre-wrap leading-7 text-gray-700">
                        {
                          review.review
                        }
                      </p>
                    </article>
                  ),
                )}
              </div>
            )}
        </div>

        <aside className="h-fit rounded-2xl border border-gray-200 bg-gray-50 p-5 sm:p-6">
          <h3 className="text-xl font-bold text-gray-900">
            Write a review
          </h3>

          {authStatus ===
            "loading" && (
            <div className="mt-5 h-28 animate-pulse rounded-xl bg-gray-200" />
          )}

          {authStatus ===
            "unauthenticated" && (
            <div className="mt-5">
              <p className="text-sm leading-6 text-gray-600">
                Login to submit a rating and review.
              </p>

              <Link
                href={`/login?callbackUrl=${encodeURIComponent(
                  `/products/${productSlug}#product-reviews`,
                )}`}
                className="mt-5 block rounded-xl bg-gray-900 px-5 py-3 text-center font-semibold text-white transition hover:bg-gray-700"
              >
                Login to review
              </Link>
            </div>
          )}

          {authStatus ===
            "authenticated" && (
            <form
              onSubmit={
                handleSubmit
              }
              className="mt-5"
            >
              <div
                aria-hidden="true"
                className="hidden"
              >
                <label htmlFor="reviewWebsite">
                  Website
                </label>

                <input
                  id="reviewWebsite"
                  name="website"
                  type="text"
                  tabIndex={
                    -1
                  }
                  autoComplete="off"
                />
              </div>

              <fieldset>
                <legend className="text-sm font-semibold text-gray-800">
                  Your rating *
                </legend>

                <div className="mt-3 flex gap-1">
                  {[
                    1,
                    2,
                    3,
                    4,
                    5,
                  ].map(
                    (
                      star,
                    ) => (
                      <button
                        key={
                          star
                        }
                        type="button"
                        aria-label={`${star} ${
                          star ===
                          1
                            ? "star"
                            : "stars"
                        }`}
                        aria-pressed={
                          rating ===
                          star
                        }
                        onClick={() => {
                          setRating(
                            star,
                          );
                        }}
                        className={`text-3xl transition ${
                          star <=
                          rating
                            ? "text-yellow-500"
                            : "text-gray-300 hover:text-yellow-400"
                        }`}
                      >
                        ★
                      </button>
                    ),
                  )}
                </div>
              </fieldset>

              <div className="mt-5">
                <label
                  htmlFor="review"
                  className="mb-2 block text-sm font-semibold text-gray-800"
                >
                  Your review *
                </label>

                <textarea
                  required
                  id="review"
                  name="review"
                  rows={
                    6
                  }
                  minLength={
                    10
                  }
                  maxLength={
                    1000
                  }
                  placeholder="Share your experience with this product"
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-gray-900"
                />

                <p className="mt-2 text-xs text-gray-500">
                  10–1000 characters.
                </p>
              </div>

              {submitError && (
                <div
                  role="alert"
                  className="mt-5 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700"
                >
                  {submitError}
                </div>
              )}

              {successMessage && (
                <div
                  role="status"
                  className="mt-5 rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-800"
                >
                  {successMessage}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  submitting
                }
                className="mt-5 w-full rounded-xl bg-gray-900 px-5 py-4 font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
              >
                {submitting
                  ? "Submitting review..."
                  : "Submit review"}
              </button>

              <p className="mt-3 text-xs leading-5 text-gray-500">
                Reviews are checked before they become publicly visible.
              </p>
            </form>
          )}
        </aside>
      </div>
    </section>
  );
}