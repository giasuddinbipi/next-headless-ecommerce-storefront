type OrderStatusTimelineProps = {
  status: string;
  compact?: boolean;
};

type TimelineStep = {
  key: string;
  label: string;
  description: string;
};

const timelineSteps: TimelineStep[] = [
  {
    key: "pending",
    label: "Order received",
    description:
      "Your order has been received and is waiting for confirmation.",
  },
  {
    key: "processing",
    label: "Processing",
    description:
      "Your order has been confirmed and is being prepared.",
  },
  {
    key: "completed",
    label: "Completed",
    description:
      "Your order has been completed successfully.",
  },
];

function getCurrentStepIndex(
  status: string,
): number {
  switch (status) {
    case "completed":
      return 2;

    case "processing":
      return 1;

    case "pending":
    case "on-hold":
    default:
      return 0;
  }
}

function getProgressWidthClass(
  currentStepIndex: number,
): string {
  switch (currentStepIndex) {
    case 2:
      return "w-full";

    case 1:
      return "w-1/2";

    default:
      return "w-0";
  }
}

function getSpecialStatus(
  status: string,
): {
  title: string;
  description: string;
  className: string;
} | null {
  switch (status) {
    case "on-hold":
      return {
        title: "Order on hold",
        description:
          "This order is temporarily on hold. The store may contact you for confirmation.",
        className:
          "border-yellow-300 bg-yellow-50 text-yellow-800",
      };

    case "cancelled":
      return {
        title: "Order cancelled",
        description:
          "This order has been cancelled and will not be processed.",
        className:
          "border-red-300 bg-red-50 text-red-800",
      };

    case "failed":
      return {
        title: "Order failed",
        description:
          "The order could not be completed. Please contact the store for assistance.",
        className:
          "border-red-300 bg-red-50 text-red-800",
      };

    case "refunded":
      return {
        title: "Order refunded",
        description:
          "This order has been marked as refunded.",
        className:
          "border-purple-300 bg-purple-50 text-purple-800",
      };

    default:
      return null;
  }
}

export default function OrderStatusTimeline({
  status,
  compact = false,
}: OrderStatusTimelineProps) {
  const normalizedStatus = status
    .trim()
    .toLowerCase();

  const specialStatus =
    getSpecialStatus(normalizedStatus);

  const currentStepIndex =
    getCurrentStepIndex(normalizedStatus);

  const progressWidthClass =
    getProgressWidthClass(
      currentStepIndex,
    );

  const isTerminalStatus = [
    "cancelled",
    "failed",
    "refunded",
  ].includes(normalizedStatus);

  return (
    <div>
      {specialStatus && (
        <div
          role="status"
          className={`rounded-xl border p-4 text-sm ${specialStatus.className}`}
        >
          <p className="font-bold">
            {specialStatus.title}
          </p>

          {!compact && (
            <p className="mt-1 leading-6">
              {specialStatus.description}
            </p>
          )}
        </div>
      )}

      {!isTerminalStatus && (
        <div
          className={
            specialStatus ? "mt-5" : ""
          }
        >
          <div className="relative mx-4 hidden md:block">
            <div className="absolute left-0 right-0 top-4 h-1 rounded-full bg-gray-200" />

            <div
              className={`absolute left-0 top-4 h-1 rounded-full bg-green-600 transition-all ${progressWidthClass}`}
            />
          </div>

          <ol
            aria-label="Order progress"
            className="space-y-4 md:grid md:grid-cols-3 md:gap-6 md:space-y-0"
          >
            {timelineSteps.map(
              (step, index) => {
                const isCompleted =
                  index <
                    currentStepIndex ||
                  normalizedStatus ===
                    "completed";

                const isCurrent =
                  index ===
                  currentStepIndex &&
                  normalizedStatus !==
                    "completed";

                return (
                  <li
                    key={step.key}
                    className="relative flex items-start gap-4 md:flex-col md:items-center md:text-center"
                  >
                    <div
                      aria-hidden="true"
                      className={[
                        "relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold",
                        isCompleted
                          ? "border-green-600 bg-green-600 text-white"
                          : isCurrent
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-gray-300 bg-white text-gray-500",
                      ].join(" ")}
                    >
                      {isCompleted
                        ? "✓"
                        : index + 1}
                    </div>

                    <div>
                      <p
                        className={[
                          "font-semibold",
                          isCompleted
                            ? "text-green-700"
                            : isCurrent
                              ? "text-blue-700"
                              : "text-gray-500",
                        ].join(" ")}
                      >
                        {step.label}
                      </p>

                      {!compact && (
                        <p className="mt-1 text-sm leading-6 text-gray-500">
                          {step.description}
                        </p>
                      )}
                    </div>
                  </li>
                );
              },
            )}
          </ol>
        </div>
      )}
    </div>
  );
}