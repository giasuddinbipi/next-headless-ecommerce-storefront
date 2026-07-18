"use client";

import {
  type FormEvent,
  useState,
} from "react";

import {
  useRouter,
} from "next/navigation";

type CancelOrderButtonProps = {
  orderId: number;
  orderNumber: string;
};

type UnknownRecord =
  Record<string, unknown>;

function isObject(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function getErrorMessage(
  data: unknown,
): string {
  if (
    isObject(data) &&
    typeof data.error ===
      "string"
  ) {
    return data.error;
  }

  return "The order could not be cancelled.";
}

export default function CancelOrderButton({
  orderId,
  orderNumber,
}: CancelOrderButtonProps) {
  const router =
    useRouter();

  const [open, setOpen] =
    useState(false);

  const [reason, setReason] =
    useState("");

  const [submitting, setSubmitting] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const [cancelled, setCancelled] =
    useState(false);

  const normalizedReason =
    reason
      .replace(/\s+/g, " ")
      .trim();

  const closeDialog = () => {
    if (submitting) {
      return;
    }

    setOpen(false);
    setErrorMessage("");
  };

  const handleSubmit = async (
    event:
      FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (
      normalizedReason.length <
      10
    ) {
      setErrorMessage(
        "Please provide a reason of at least 10 characters.",
      );

      return;
    }

    setSubmitting(true);
    setErrorMessage("");

    try {
      const response =
        await fetch(
          `/api/orders/${orderId}/cancel`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify({
                reason:
                  normalizedReason,

                website: "",
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

      setCancelled(true);
      setOpen(false);

      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The order could not be cancelled.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (cancelled) {
    return (
      <div
        role="status"
        className="rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm font-semibold text-green-800"
      >
        Order cancelled successfully.
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setErrorMessage("");
        }}
        className="rounded-xl border border-red-300 bg-white px-6 py-3 font-semibold text-red-700 transition hover:border-red-700 hover:bg-red-700 hover:text-white"
      >
        Cancel order
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-8"
          role="presentation"
          onMouseDown={(
            event,
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeDialog();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-order-title"
            aria-describedby="cancel-order-description"
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl sm:p-7"
          >
            <h2
              id="cancel-order-title"
              className="text-2xl font-bold text-gray-900"
            >
              Cancel order #
              {orderNumber}?
            </h2>

            <p
              id="cancel-order-description"
              className="mt-3 text-sm leading-6 text-gray-600"
            >
              This action will request
              immediate cancellation of
              the order. Please provide
              the reason below.
            </p>

            <form
              onSubmit={
                handleSubmit
              }
              className="mt-6"
            >
              <div
                aria-hidden="true"
                className="hidden"
              >
                <label htmlFor="cancellationWebsite">
                  Website
                </label>

                <input
                  id="cancellationWebsite"
                  name="website"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              <label
                htmlFor="cancellationReason"
                className="block text-sm font-semibold text-gray-800"
              >
                Cancellation reason *
              </label>

              <textarea
                required
                id="cancellationReason"
                value={reason}
                onChange={(
                  event,
                ) => {
                  setReason(
                    event.target.value,
                  );

                  setErrorMessage("");
                }}
                rows={5}
                minLength={10}
                maxLength={500}
                placeholder="Example: I selected the wrong product and need to place a new order."
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-gray-900"
              />

              <div className="mt-2 flex justify-between gap-4 text-xs text-gray-500">
                <span>
                  Minimum 10 characters
                </span>

                <span>
                  {reason.length}/500
                </span>
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700"
                >
                  {errorMessage}
                </div>
              )}

              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={
                    submitting
                  }
                  onClick={
                    closeDialog
                  }
                  className="rounded-xl border border-gray-300 px-5 py-3 font-semibold text-gray-800 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Keep order
                </button>

                <button
                  type="submit"
                  disabled={
                    submitting ||
                    normalizedReason.length <
                      10
                  }
                  className="rounded-xl bg-red-700 px-5 py-3 font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-red-300"
                >
                  {submitting
                    ? "Cancelling..."
                    : "Confirm cancellation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}