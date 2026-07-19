// @vitest-environment jsdom

import type {
  AnchorHTMLAttributes,
  ReactNode,
} from "react";

import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/* =========================================================
   Shared mocked modules
========================================================= */

const componentBridge =
  vi.hoisted(() => ({
    router: {
      push: vi.fn(),
      replace: vi.fn(),
      refresh: vi.fn(),
      back: vi.fn(),
      prefetch: vi.fn(),
    },

    cartState: {
      items: [] as Array<{
        cartKey: string;

        productId: number;
        variationId?: number;

        name: string;
        slug: string;
        price: string;

        quantity: number;

        image: string;

        stockStatus:
          | "instock"
          | "outofstock"
          | "onbackorder";

        attributes: Array<{
          name: string;
          option: string;
        }>;
      }>,

      clearCart: vi.fn(),
    },
  }));

vi.mock(
  "next/navigation",
  () => ({
    useRouter: () =>
      componentBridge.router,
  }),
);

type LinkMockProps =
  Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    "href"
  > & {
    href: string;
    children: ReactNode;
  };

vi.mock(
  "next/link",
  () => ({
    default: ({
      href,
      children,
      ...props
    }: LinkMockProps) => (
      <a
        href={href}
        {...props}
      >
        {children}
      </a>
    ),
  }),
);

vi.mock(
  "@/store/cart-store",
  () => ({
    useCartStore: (
      selector: (
        state:
          typeof componentBridge.cartState,
      ) => unknown,
    ) =>
      selector(
        componentBridge.cartState,
      ),
  }),
);

/*
 * Component import অবশ্যই mocks-এর পরে থাকবে।
 */
import CheckoutClient, {
  type CheckoutInitialValues,
} from "@/components/checkout/CheckoutClient";

/* =========================================================
   Constants
========================================================= */

const ORDER_ATTEMPT_STORAGE_KEY =
  "checkout-order-attempt-v1";

const TEST_UUID =
  "11111111-1111-4111-8111-111111111111";

const SAVED_IDEMPOTENCY_KEY =
  "saved-checkout-attempt-key-123456789";

const SAVED_FINGERPRINT =
  "a".repeat(64);

const ORDER_REQUEST_ID =
  "order-client-request-123456";

const STATUS_REQUEST_ID =
  "status-client-request-123456";

const MANUAL_STATUS_REQUEST_ID =
  "manual-status-request-123456";

const RATE_LIMIT_REQUEST_ID =
  "status-rate-limit-request-123456";

const INITIAL_VALUES:
  CheckoutInitialValues = {
  firstName: "Test",
  lastName: "Customer",

  phone: "01700000000",
  email: "customer@example.com",

  address1: "House 10, Road 2",

  city: "Dhaka",
  district: "Dhaka",
  postcode: "1200",

  shippingArea: "dhaka",
};

const CART_ITEM = {
  cartKey: "product-100",

  productId: 100,

  name: "Security Test Product",
  slug: "security-test-product",

  price: "500.00",
  quantity: 2,

  image: "",

  stockStatus: "instock" as const,

  attributes: [],
};

/* =========================================================
   Shared mocks
========================================================= */

const fetchMock =
  vi.fn();

const clipboardWriteText =
  vi.fn();

const confirmMock =
  vi.fn();

/* =========================================================
   Types
========================================================= */

type Deferred<T> = {
  promise: Promise<T>;

  resolve: (
    value: T,
  ) => void;

  reject: (
    reason?: unknown,
  ) => void;
};

type SavedOrderAttempt = {
  version: 1;

  key: string;
  fingerprint: string;

  billingEmail: string;

  /*
   * CheckoutClient ISO date string ব্যবহার করে।
   */
  createdAt: string;
};

/* =========================================================
   General helpers
========================================================= */

function createDeferred<T>():
  Deferred<T> {
  let resolve:
    Deferred<T>["resolve"] =
    () => undefined;

  let reject:
    Deferred<T>["reject"] =
    () => undefined;

  const promise =
    new Promise<T>(
      (
        resolvePromise,
        rejectPromise,
      ) => {
        resolve =
          resolvePromise;

        reject =
          rejectPromise;
      },
    );

  return {
    promise,
    resolve,
    reject,
  };
}

function createJsonResponse(
  body: unknown,
  status = 200,
  headers:
    Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify(body),
    {
      status,

      headers: {
        "Content-Type":
          "application/json",

        ...headers,
      },
    },
  );
}

function createOrderResult({
  requestId =
    ORDER_REQUEST_ID,

  orderId = 501,

  orderNumber = "501",
}: {
  requestId?: string;
  orderId?: number;
  orderNumber?: string;
} = {}) {
  return {
    success: true,

    requestId,

    orderId,
    orderNumber,

    status: "processing",

    currency: "BDT",
    total: "1080.00",

    emailSent: true,
    totalsVerified: true,

    idempotencyStored: true,
    idempotencyReplayed: false,
  };
}

function saveOrderAttempt({
  createdAt =
    new Date().toISOString(),

  key =
    SAVED_IDEMPOTENCY_KEY,

  billingEmail =
    INITIAL_VALUES.email,
}: {
  createdAt?: string;
  key?: string;
  billingEmail?: string;
} = {}): SavedOrderAttempt {
  const attempt:
    SavedOrderAttempt = {
    version: 1,

    key,

    fingerprint:
      SAVED_FINGERPRINT,

    billingEmail,

    createdAt,
  };

  sessionStorage.setItem(
    ORDER_ATTEMPT_STORAGE_KEY,
    JSON.stringify(attempt),
  );

  return attempt;
}

function readSavedOrderAttempt():
  SavedOrderAttempt | null {
  const stored =
    sessionStorage.getItem(
      ORDER_ATTEMPT_STORAGE_KEY,
    );

  if (!stored) {
    return null;
  }

  return JSON.parse(
    stored,
  ) as SavedOrderAttempt;
}

function renderCheckout() {
  return render(
    <CheckoutClient
      initialValues={
        INITIAL_VALUES
      }
      hasSavedAddress={
        true
      }
    />,
  );
}

async function waitForCheckout():
  Promise<void> {
  await screen.findByRole(
    "heading",
    {
      name: /^checkout$/i,
    },
  );
}

function getTermsCheckbox(
  container:
    HTMLElement,
): HTMLInputElement {
  const checkbox =
    container.querySelector<HTMLInputElement>(
      'input[name="termsAccepted"]',
    );

  if (!checkbox) {
    throw new Error(
      "The checkout terms checkbox was not found.",
    );
  }

  return checkbox;
}

function getButtonByPatterns(
  ...patterns:
    RegExp[]
): HTMLButtonElement {
  const buttons =
    screen.getAllByRole(
      "button",
    );

  const button =
    buttons.find(
      (
        candidate,
      ) => {
        const text =
          candidate
            .textContent
            ?.trim() ??
          "";

        return patterns.some(
          (
            pattern,
          ) =>
            pattern.test(
              text,
            ),
        );
      },
    );

  if (
    !(button instanceof
      HTMLButtonElement)
  ) {
    throw new Error(
      `No matching button was found for: ${patterns
        .map(String)
        .join(", ")}`,
    );
  }

  return button;
}

async function submitCheckout(
  container:
    HTMLElement,
): Promise<void> {
  const termsCheckbox =
    getTermsCheckbox(
      container,
    );

  if (
    !termsCheckbox.checked
  ) {
    fireEvent.click(
      termsCheckbox,
    );
  }

  fireEvent.click(
    screen.getByRole(
      "button",
      {
        name:
          /place order/i,
      },
    ),
  );
}

function getFetchOptions(
  callIndex = 0,
): RequestInit {
  const options =
    fetchMock.mock
      .calls[callIndex]?.[1];

  if (
    !options ||
    typeof options !==
      "object"
  ) {
    throw new Error(
      `Fetch options were not found for call ${callIndex}.`,
    );
  }

  return options as
    RequestInit;
}

/* =========================================================
   Test environment setup
========================================================= */

beforeEach(() => {
  fetchMock.mockReset();

  clipboardWriteText
    .mockReset()
    .mockResolvedValue(
      undefined,
    );

  confirmMock
    .mockReset()
    .mockReturnValue(
      true,
    );

  componentBridge
    .cartState
    .clearCart
    .mockReset();

  componentBridge
    .router
    .push
    .mockReset();

  componentBridge
    .router
    .replace
    .mockReset();

  componentBridge
    .router
    .refresh
    .mockReset();

  componentBridge
    .router
    .back
    .mockReset();

  componentBridge
    .router
    .prefetch
    .mockReset();

  componentBridge
    .cartState
    .items = [
    {
      ...CART_ITEM,
    },
  ];

  sessionStorage.clear();
  localStorage.clear();

  vi.stubGlobal(
    "fetch",
    fetchMock,
  );

  vi.stubGlobal(
    "confirm",
    confirmMock,
  );

  vi.stubGlobal(
    "scrollTo",
    vi.fn(),
  );

  Object.defineProperty(
    navigator,
    "clipboard",
    {
      configurable: true,

      value: {
        writeText:
          clipboardWriteText,
      },
    },
  );

  /*
   * Stable Idempotency-Key generation।
   */
  Object.defineProperty(
    globalThis.crypto,
    "randomUUID",
    {
      configurable: true,

      value:
        vi.fn(
          () =>
            TEST_UUID,
        ),
    },
  );

  /*
   * jsdom environment-এ SubtleCrypto
   * না থাকলে deterministic fallback।
   */
  if (
    !globalThis.crypto
      .subtle
  ) {
    Object.defineProperty(
      globalThis.crypto,
      "subtle",
      {
        configurable: true,

        value: {
          digest:
            vi.fn(
              async () =>
                new Uint8Array(
                  32,
                ).buffer,
            ),
        },
      },
    );
  }
});

/* =========================================================
   Order submission tests
========================================================= */

describe(
  "CheckoutClient order submission",
  () => {
    it(
      "submits the order and clears the cart after success",
      async () => {
        fetchMock
          .mockResolvedValueOnce(
            createJsonResponse(
              createOrderResult(),
              201,
              {
                "X-Request-Id":
                  ORDER_REQUEST_ID,
              },
            ),
          );

        const {
          container,
        } =
          renderCheckout();

        await waitForCheckout();

        await submitCheckout(
          container,
        );

        await screen.findByRole(
          "heading",
          {
            name:
              /order placed successfully/i,
          },
        );

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          fetchMock.mock
            .calls[0]?.[0],
        ).toBe(
          "/api/orders",
        );

        const options =
          getFetchOptions();

        expect(
          options.method,
        ).toBe(
          "POST",
        );

        const headers =
          new Headers(
            options.headers,
          );

        expect(
          headers.get(
            "content-type",
          ),
        ).toBe(
          "application/json",
        );

        expect(
          headers.get(
            "idempotency-key",
          ),
        ).toMatch(
          /^[A-Za-z0-9._:-]{16,200}$/,
        );

        const body =
          JSON.parse(
            String(
              options.body,
            ),
          ) as {
            shippingArea: string;

            items: Array<{
              productId: number;
              quantity: number;
            }>;
          };

        expect(
          body.shippingArea,
        ).toBe(
          "dhaka",
        );

        expect(
          body.items,
        ).toEqual([
          expect.objectContaining({
            productId: 100,
            quantity: 2,
          }),
        ]);

        expect(
          String(
            options.body,
          ),
        ).toContain(
          "customer@example.com",
        );

        expect(
          componentBridge
            .cartState
            .clearCart,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          sessionStorage.getItem(
            ORDER_ATTEMPT_STORAGE_KEY,
          ),
        ).toBeNull();
      },
    );

    it(
      "prevents a second submission while the first request is pending",
      async () => {
        const deferred =
          createDeferred<Response>();

        fetchMock
          .mockReturnValueOnce(
            deferred.promise,
          );

        const {
          container,
        } =
          renderCheckout();

        await waitForCheckout();

        await submitCheckout(
          container,
        );

        await waitFor(
          () => {
            expect(
              fetchMock,
            ).toHaveBeenCalledTimes(
              1,
            );
          },
        );

        const pendingButton =
          screen.getByRole(
            "button",
            {
              name:
                /placing order/i,
            },
          );

        expect(
          pendingButton,
        ).toBeDisabled();

        /*
         * Disabled button click দ্বিতীয়
         * request তৈরি করবে না।
         */
        fireEvent.click(
          pendingButton,
        );

        expect(
          fetchMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        deferred.resolve(
          createJsonResponse(
            createOrderResult(),
            201,
          ),
        );

        await screen.findByRole(
          "heading",
          {
            name:
              /order placed successfully/i,
          },
        );

        expect(
          componentBridge
            .cartState
            .clearCart,
        ).toHaveBeenCalledTimes(
          1,
        );
      },
    );
  },
);

/* =========================================================
   Automatic recovery tests
========================================================= */

describe(
  "CheckoutClient automatic recovery",
  () => {
    it(
      "automatically restores a completed saved order attempt",
      async () => {
        const savedAttempt =
          saveOrderAttempt();

        /*
         * নিশ্চিত করা হচ্ছে attempt render-এর
         * আগেই sessionStorage-এ রয়েছে।
         */
        expect(
          readSavedOrderAttempt(),
        ).toEqual(
          savedAttempt,
        );

        fetchMock
          .mockResolvedValueOnce(
            createJsonResponse(
              {
                ...createOrderResult({
                  requestId:
                    STATUS_REQUEST_ID,
                }),

                originalOrderRequestId:
                  ORDER_REQUEST_ID,

                idempotencyRecovered:
                  true,

                idempotencyReplayed:
                  true,

                recoveryStatus:
                  "completed",
              },
              200,
              {
                "X-Request-Id":
                  STATUS_REQUEST_ID,

                "Idempotency-Replayed":
                  "true",
              },
            ),
          );

        renderCheckout();

        await waitFor(
          () => {
            expect(
              fetchMock,
            ).toHaveBeenCalledTimes(
              1,
            );
          },
        );

        await screen.findByRole(
          "heading",
          {
            name:
              /order placed successfully/i,
          },
        );

        expect(
          fetchMock.mock
            .calls[0]?.[0],
        ).toBe(
          "/api/orders/idempotency-status",
        );

        const options =
          getFetchOptions();

        expect(
          options.method,
        ).toBe(
          "POST",
        );

        const headers =
          new Headers(
            options.headers,
          );

        expect(
          headers.get(
            "content-type",
          ),
        ).toBe(
          "application/json",
        );

        expect(
          headers.get(
            "idempotency-key",
          ),
        ).toBe(
          SAVED_IDEMPOTENCY_KEY,
        );

        expect(
          JSON.parse(
            String(
              options.body,
            ),
          ),
        ).toMatchObject({
          billingEmail:
            INITIAL_VALUES.email,
        });

        expect(
          componentBridge
            .cartState
            .clearCart,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          sessionStorage.getItem(
            ORDER_ATTEMPT_STORAGE_KEY,
          ),
        ).toBeNull();
      },
    );

    it(
      "allows a manual status check after automatic recovery cannot find the attempt",
      async () => {
        const savedAttempt =
          saveOrderAttempt();

        expect(
          readSavedOrderAttempt(),
        ).toEqual(
          savedAttempt,
        );

        /*
         * Initial automatic recovery response।
         */
        fetchMock
          .mockResolvedValueOnce(
            createJsonResponse(
              {
                success: false,

                requestId:
                  STATUS_REQUEST_ID,

                status:
                  "not_found",

                code:
                  "order_attempt_not_found",
              },
              404,
              {
                "X-Request-Id":
                  STATUS_REQUEST_ID,
              },
            ),
          );

        /*
         * Manual recovery response।
         */
        fetchMock
          .mockResolvedValueOnce(
            createJsonResponse(
              {
                ...createOrderResult({
                  requestId:
                    MANUAL_STATUS_REQUEST_ID,
                }),

                originalOrderRequestId:
                  ORDER_REQUEST_ID,

                idempotencyRecovered:
                  true,

                idempotencyReplayed:
                  true,

                recoveryStatus:
                  "completed",
              },
              200,
              {
                "X-Request-Id":
                  MANUAL_STATUS_REQUEST_ID,
              },
            ),
          );

        renderCheckout();

        await waitFor(
          () => {
            expect(
              fetchMock,
            ).toHaveBeenCalledTimes(
              1,
            );
          },
        );

        expect(
          fetchMock.mock
            .calls[0]?.[0],
        ).toBe(
          "/api/orders/idempotency-status",
        );

        const manualButton =
          await waitFor(
            () => {
              const button =
                getButtonByPatterns(
                  /check.*order.*status/i,
                  /check.*status/i,
                  /try.*recovery/i,
                  /check again/i,
                );

              expect(
                button,
              ).not.toBeDisabled();

              return button;
            },
          );

        fireEvent.click(
          manualButton,
        );

        await waitFor(
          () => {
            expect(
              fetchMock,
            ).toHaveBeenCalledTimes(
              2,
            );
          },
        );

        await screen.findByRole(
          "heading",
          {
            name:
              /order placed successfully/i,
          },
        );

        expect(
          fetchMock.mock
            .calls[1]?.[0],
        ).toBe(
          "/api/orders/idempotency-status",
        );

        expect(
          componentBridge
            .cartState
            .clearCart,
        ).toHaveBeenCalledTimes(
          1,
        );

        expect(
          sessionStorage.getItem(
            ORDER_ATTEMPT_STORAGE_KEY,
          ),
        ).toBeNull();
      },
    );
  },
);

/* =========================================================
   Support-reference tests
========================================================= */

describe(
  "CheckoutClient support reference",
  () => {
    it(
      "shows and copies the request ID when recovery is rate limited",
      async () => {
        const savedAttempt =
          saveOrderAttempt();

        expect(
          readSavedOrderAttempt(),
        ).toEqual(
          savedAttempt,
        );

        fetchMock
          .mockResolvedValueOnce(
            createJsonResponse(
              {
                success: false,

                requestId:
                  RATE_LIMIT_REQUEST_ID,

                status:
                  "rate_limited",

                code:
                  "order_status_rate_limited",

                retryAfter: 60,
              },
              429,
              {
                "X-Request-Id":
                  RATE_LIMIT_REQUEST_ID,

                "Retry-After":
                  "60",
              },
            ),
          );

        renderCheckout();

        await waitFor(
          () => {
            expect(
              fetchMock,
            ).toHaveBeenCalledTimes(
              1,
            );
          },
        );

        expect(
          fetchMock.mock
            .calls[0]?.[0],
        ).toBe(
          "/api/orders/idempotency-status",
        );

        await screen.findByText(
          RATE_LIMIT_REQUEST_ID,
        );

        const copyButton =
          getButtonByPatterns(
            /^copy$/i,
            /copy.*reference/i,
            /copy.*request/i,
          );

        fireEvent.click(
          copyButton,
        );

        await waitFor(
          () => {
            expect(
              clipboardWriteText,
            ).toHaveBeenCalledWith(
              RATE_LIMIT_REQUEST_ID,
            );
          },
        );

        expect(
          componentBridge
            .cartState
            .clearCart,
        ).not.toHaveBeenCalled();

        expect(
          sessionStorage.getItem(
            ORDER_ATTEMPT_STORAGE_KEY,
          ),
        ).not.toBeNull();
      },
    );
  },
);

/* =========================================================
   Stale attempt cleanup
========================================================= */

describe(
  "CheckoutClient stale-attempt cleanup",
  () => {
    it(
      "removes a stale saved attempt after customer confirmation",
      async () => {
        /*
         * Attempt 24-hour stale threshold-এর
         * চেয়ে পুরোনো, কিন্তু 7-day maximum
         * retention-এর মধ্যে।
         */
        const staleCreatedAt =
          new Date(
            Date.now() -
              2 *
                24 *
                60 *
                60 *
                1_000,
          ).toISOString();

        const savedAttempt =
          saveOrderAttempt({
            createdAt:
              staleCreatedAt,
          });

        expect(
          readSavedOrderAttempt(),
        ).toEqual(
          savedAttempt,
        );

        fetchMock
          .mockResolvedValueOnce(
            createJsonResponse(
              {
                success: false,

                requestId:
                  STATUS_REQUEST_ID,

                status:
                  "not_found",

                code:
                  "order_attempt_not_found",
              },
              404,
              {
                "X-Request-Id":
                  STATUS_REQUEST_ID,
              },
            ),
          );

        renderCheckout();

        await waitFor(
          () => {
            expect(
              fetchMock,
            ).toHaveBeenCalledTimes(
              1,
            );
          },
        );

        const cleanupButton =
          await waitFor(
            () => {
              const button =
                getButtonByPatterns(
                  /clear.*attempt/i,
                  /remove.*attempt/i,
                  /discard.*attempt/i,
                  /start.*new/i,
                  /clear.*saved/i,
                );

              expect(
                button,
              ).not.toBeDisabled();

              return button;
            },
          );

        fireEvent.click(
          cleanupButton,
        );

        expect(
          confirmMock,
        ).toHaveBeenCalledTimes(
          1,
        );

        await waitFor(
          () => {
            expect(
              sessionStorage.getItem(
                ORDER_ATTEMPT_STORAGE_KEY,
              ),
            ).toBeNull();
          },
        );

        expect(
          componentBridge
            .cartState
            .clearCart,
        ).not.toHaveBeenCalled();
      },
    );
  },
);