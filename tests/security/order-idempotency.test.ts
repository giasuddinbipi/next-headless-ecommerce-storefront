import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

/*
 * order-idempotency.ts getRedisClient() call করলে
 * প্রতিটি test-এর current in-memory Redis পাবে।
 */
const redisBridge =
  vi.hoisted(() => ({
    client:
      null as unknown,
  }));

vi.mock(
  "@/lib/redis",
  () => ({
    getRedisClient: () =>
      redisBridge.client,
  }),
);

import {
  completeOrderIdempotency,
  createOrderIdempotencyScope,
  createOrderRequestFingerprint,
  getOrderIdempotencyStatus,
  OrderIdempotencyError,
  readOrderIdempotencyKey,
  releaseOrderIdempotency,
  reserveOrderIdempotency,
} from "@/lib/order-idempotency";

type SetOptions =
  Record<string, unknown>;

type SetCall = {
  key: string;
  value: string;
  options:
    SetOptions | undefined;
};

type EvalCall = {
  script: string;
  keys: string[];
  arguments: string[];
};

/* =========================================================
   Flexible in-memory Redis test double
========================================================= */

class InMemoryRedis {
  private values =
    new Map<
      string,
      string
    >();

  readonly setCalls:
    SetCall[] = [];

  readonly evalCalls:
    EvalCall[] = [];

  reset(): void {
    this.values.clear();

    this.setCalls.length =
      0;

    this.evalCalls.length =
      0;
  }

  async get(
    key: string,
  ): Promise<string | null> {
    return (
      this.values.get(
        key,
      ) ?? null
    );
  }

  async set(
    key: string,
    value: string,
    options?:
      SetOptions,
  ): Promise<
    "OK" | null
  > {
    this.setCalls.push({
      key,
      value,
      options,
    });

    const useNx =
      options?.nx === true;

    if (
      useNx &&
      this.values.has(
        key,
      )
    ) {
      return null;
    }

    this.values.set(
      key,
      value,
    );

    return "OK";
  }

  async del(
    ...keys: string[]
  ): Promise<number> {
    let removed =
      0;

    for (
      const key of keys
    ) {
      if (
        this.values.delete(
          key,
        )
      ) {
        removed += 1;
      }
    }

    return removed;
  }

  /*
   * Production module Lua scripts ব্যবহার করে:
   *
   * 1. replace-if-unchanged
   * 2. delete-if-unchanged
   *
   * এই fake Redis script text execute করে না।
   * Script intent detect করে equivalent atomic
   * operation perform করে।
   */
  async eval(
    ...rawParameters:
      unknown[]
  ): Promise<number> {
    const script =
      typeof rawParameters[0] ===
        "string"
        ? rawParameters[0]
        : "";

    const secondParameter =
      rawParameters[1];

    const thirdParameter =
      rawParameters[2];

    let keys:
      string[] = [];

    let scriptArguments:
      string[] = [];

    /*
     * Upstash-compatible shape:
     *
     * eval(script, [key], [arg1, arg2, ...])
     */
    if (
      Array.isArray(
        secondParameter,
      )
    ) {
      keys =
        secondParameter.map(
          String,
        );

      if (
        Array.isArray(
          thirdParameter,
        )
      ) {
        scriptArguments =
          thirdParameter.map(
            String,
          );
      } else {
        scriptArguments =
          rawParameters
            .slice(2)
            .flatMap(
              (value) =>
                Array.isArray(
                  value,
                )
                  ? value
                  : [
                      value,
                    ],
            )
            .map(
              String,
            );
      }
    } else {
      /*
       * Additional fallback shape:
       *
       * eval(script, key, arg1, arg2, ...)
       */
      if (
        typeof secondParameter ===
          "string"
      ) {
        keys = [
          secondParameter,
        ];
      }

      scriptArguments =
        rawParameters
          .slice(2)
          .flatMap(
            (value) =>
              Array.isArray(
                value,
              )
                ? value
                : [
                    value,
                  ],
          )
          .map(
            String,
          );
    }

    this.evalCalls.push({
      script,
      keys,
      arguments:
        scriptArguments,
    });

    const key =
      keys[0];

    if (!key) {
      return 0;
    }

    const currentValue =
      this.values.get(
        key,
      );

    const expectedValue =
      scriptArguments[0];

    if (
      currentValue ===
        undefined ||
      expectedValue ===
        undefined ||
      currentValue !==
        expectedValue
    ) {
      return 0;
    }

    const normalizedScript =
      script.toLowerCase();

    /*
     * delete-if-unchanged script
     */
    if (
      normalizedScript.includes(
        "del",
      ) &&
      !normalizedScript.includes(
        "set",
      )
    ) {
      this.values.delete(
        key,
      );

      return 1;
    }

    /*
     * replace-if-unchanged script
     */
    const replacementValue =
      scriptArguments[1];

    if (
      replacementValue ===
      undefined
    ) {
      return 0;
    }

    this.values.set(
      key,
      replacementValue,
    );

    return 1;
  }

  hasStoredValue():
    boolean {
    return (
      this.values.size >
      0
    );
  }
}

/* =========================================================
   Shared helpers
========================================================= */

let redis:
  InMemoryRedis;

const IDEMPOTENCY_KEY =
  "checkout-test-key-1234567890";

const CUSTOMER_SCOPE =
  createOrderIdempotencyScope({
    customerId:
      42,

    billingEmail:
      "ignored@example.com",
  });

function createFingerprint({
  quantity = 1,
  address = "Road 1",
}: {
  quantity?: number;
  address?: string;
} = {}): string {
  return createOrderRequestFingerprint({
    version: 1,

    paymentMethod:
      "cod",

    customerId:
      42,

    billing: {
      first_name:
        "Test",

      last_name:
        "Customer",

      address_1:
        address,

      city:
        "Dhaka",

      state:
        "Dhaka",

      postcode:
        "1200",

      country:
        "BD",

      email:
        "customer@example.com",

      phone:
        "01700000000",
    },

    shipping: {
      first_name:
        "Test",

      last_name:
        "Customer",

      address_1:
        address,

      city:
        "Dhaka",

      state:
        "Dhaka",

      postcode:
        "1200",

      country:
        "BD",
    },

    shippingArea:
      "dhaka",

    items: [
      {
        productId:
          100,

        quantity,

        attributes: [],
      },
    ],

    customerNote:
      "",

    couponCode:
      "",
  });
}

function objectContainsDuration(
  value: unknown,
  seconds: number,
): boolean {
  const acceptedValues =
    new Set([
      String(seconds),

      String(
        seconds *
          1_000,
      ),
    ]);

  if (
    value === null ||
    value === undefined
  ) {
    return false;
  }

  if (
    typeof value ===
      "string" ||
    typeof value ===
      "number"
  ) {
    return acceptedValues.has(
      String(value),
    );
  }

  if (
    Array.isArray(
      value,
    )
  ) {
    return value.some(
      (entry) =>
        objectContainsDuration(
          entry,
          seconds,
        ),
    );
  }

  if (
    typeof value ===
      "object"
  ) {
    return Object.values(
      value,
    ).some(
      (entry) =>
        objectContainsDuration(
          entry,
          seconds,
        ),
    );
  }

  return false;
}

beforeEach(() => {
  redis =
    new InMemoryRedis();

  redisBridge.client =
    redis;
});

/* =========================================================
   Fingerprint tests
========================================================= */

describe(
  "order request fingerprint",
  () => {
    it(
      "creates a deterministic SHA-256 fingerprint",
      () => {
        const firstFingerprint =
          createFingerprint();

        const secondFingerprint =
          createFingerprint();

        expect(
          firstFingerprint,
        ).toMatch(
          /^[a-f0-9]{64}$/,
        );

        expect(
          secondFingerprint,
        ).toBe(
          firstFingerprint,
        );
      },
    );

    it(
      "changes when trusted order data changes",
      () => {
        const original =
          createFingerprint({
            quantity: 1,
          });

        const changedQuantity =
          createFingerprint({
            quantity: 2,
          });

        const changedAddress =
          createFingerprint({
            quantity: 1,
            address:
              "Road 2",
          });

        expect(
          changedQuantity,
        ).not.toBe(
          original,
        );

        expect(
          changedAddress,
        ).not.toBe(
          original,
        );
      },
    );

    it(
      "is stable when object property order changes",
      () => {
        const first =
          createOrderRequestFingerprint({
            version: 1,
            currency:
              "BDT",
            total:
              "100.00",
          });

        const second =
          createOrderRequestFingerprint({
            total:
              "100.00",
            currency:
              "BDT",
            version: 1,
          });

        expect(
          second,
        ).toBe(
          first,
        );
      },
    );
  },
);

/* =========================================================
   Scope tests
========================================================= */

describe(
  "order idempotency scope",
  () => {
    it(
      "creates stable customer and guest scopes",
      () => {
        const customerScope =
          createOrderIdempotencyScope({
            customerId:
              42,

            billingEmail:
              "ignored@example.com",
          });

        const firstGuestScope =
          createOrderIdempotencyScope({
            customerId:
              0,

            billingEmail:
              " Guest@Example.com ",
          });

        const secondGuestScope =
          createOrderIdempotencyScope({
            customerId:
              0,

            billingEmail:
              "guest@example.com",
          });

        expect(
          customerScope,
        ).toBeTruthy();

        expect(
          firstGuestScope,
        ).toBe(
          secondGuestScope,
        );

        expect(
          firstGuestScope,
        ).not.toBe(
          customerScope,
        );

        /*
         * Raw guest email Redis scope-এ
         * প্রকাশ হওয়া উচিত নয়।
         */
        expect(
          firstGuestScope.toLowerCase(),
        ).not.toContain(
          "guest@example.com",
        );
      },
    );
  },
);

/* =========================================================
   Idempotency-Key validation
========================================================= */

describe(
  "Idempotency-Key validation",
  () => {
    it(
      "reads a valid Idempotency-Key header",
      () => {
        const request =
          new Request(
            "https://store.example/api/orders",
            {
              method:
                "POST",

              headers: {
                "Idempotency-Key":
                  IDEMPOTENCY_KEY,
              },
            },
          );

        expect(
          readOrderIdempotencyKey(
            request,
          ),
        ).toBe(
          IDEMPOTENCY_KEY,
        );
      },
    );

    it(
      "rejects missing and malformed keys",
      () => {
        const missingKeyRequest =
          new Request(
            "https://store.example/api/orders",
            {
              method:
                "POST",
            },
          );

        const malformedKeyRequest =
          new Request(
            "https://store.example/api/orders",
            {
              method:
                "POST",

              headers: {
                "Idempotency-Key":
                  "invalid key",
              },
            },
          );

        expect(() =>
          readOrderIdempotencyKey(
            missingKeyRequest,
          ),
        ).toThrow(
          OrderIdempotencyError,
        );

        expect(() =>
          readOrderIdempotencyKey(
            malformedKeyRequest,
          ),
        ).toThrow(
          OrderIdempotencyError,
        );
      },
    );
  },
);

/* =========================================================
   Reservation and concurrency
========================================================= */

describe(
  "order idempotency reservation",
  () => {
    it(
      "acquires the first reservation",
      async () => {
        const decision =
          await reserveOrderIdempotency({
            idempotencyKey:
              IDEMPOTENCY_KEY,

            scope:
              CUSTOMER_SCOPE,

            fingerprint:
              createFingerprint(),
          });

        expect(
          decision.kind,
        ).toBe(
          "acquired",
        );

        expect(
          redis.hasStoredValue(),
        ).toBe(
          true,
        );
      },
    );

    it(
      "allows only one concurrent reservation",
      async () => {
        const fingerprint =
          createFingerprint();

        const [
          firstDecision,
          secondDecision,
        ] =
          await Promise.all([
            reserveOrderIdempotency({
              idempotencyKey:
                IDEMPOTENCY_KEY,

              scope:
                CUSTOMER_SCOPE,

              fingerprint,
            }),

            reserveOrderIdempotency({
              idempotencyKey:
                IDEMPOTENCY_KEY,

              scope:
                CUSTOMER_SCOPE,

              fingerprint,
            }),
          ]);

        const decisions = [
          firstDecision.kind,
          secondDecision.kind,
        ].sort();

        expect(
          decisions,
        ).toEqual([
          "acquired",
          "in_progress",
        ]);
      },
    );

    it(
      "returns in-progress for a repeated active request",
      async () => {
        const fingerprint =
          createFingerprint();

        await reserveOrderIdempotency({
          idempotencyKey:
            IDEMPOTENCY_KEY,

          scope:
            CUSTOMER_SCOPE,

          fingerprint,
        });

        const repeatedDecision =
          await reserveOrderIdempotency({
            idempotencyKey:
              IDEMPOTENCY_KEY,

            scope:
              CUSTOMER_SCOPE,

            fingerprint,
          });

        expect(
          repeatedDecision.kind,
        ).toBe(
          "in_progress",
        );

        const status =
          await getOrderIdempotencyStatus({
            idempotencyKey:
              IDEMPOTENCY_KEY,

            scope:
              CUSTOMER_SCOPE,

            fingerprint,
          });

        expect(
          status.kind,
        ).toBe(
          "in_progress",
        );
      },
    );
  },
);

/* =========================================================
   Completion and replay
========================================================= */

describe(
  "completed order replay",
  () => {
    it(
      "stores and replays the successful response",
      async () => {
        const fingerprint =
          createFingerprint();

        const decision =
          await reserveOrderIdempotency({
            idempotencyKey:
              IDEMPOTENCY_KEY,

            scope:
              CUSTOMER_SCOPE,

            fingerprint,
          });

        expect(
          decision.kind,
        ).toBe(
          "acquired",
        );

        if (
          decision.kind !==
          "acquired"
        ) {
          throw new Error(
            "Expected an acquired reservation.",
          );
        }

        await completeOrderIdempotency({
          reservation:
            decision.reservation,

          response: {
            status: 201,

            body: {
              success:
                true,

              orderId:
                501,

              orderNumber:
                "501",

              status:
                "processing",

              currency:
                "BDT",

              total:
                "1250.00",
            },
          },
        });

        const replayDecision =
          await reserveOrderIdempotency({
            idempotencyKey:
              IDEMPOTENCY_KEY,

            scope:
              CUSTOMER_SCOPE,

            fingerprint,
          });

        expect(
          replayDecision.kind,
        ).toBe(
          "replay",
        );

        if (
          replayDecision.kind !==
          "replay"
        ) {
          throw new Error(
            "Expected a replay decision.",
          );
        }

        expect(
          replayDecision
            .response.status,
        ).toBe(
          201,
        );

        expect(
          replayDecision
            .response.body,
        ).toMatchObject({
          success:
            true,

          orderId:
            501,

          orderNumber:
            "501",

          total:
            "1250.00",
        });

        const status =
          await getOrderIdempotencyStatus({
            idempotencyKey:
              IDEMPOTENCY_KEY,

            scope:
              CUSTOMER_SCOPE,

            fingerprint,
          });

        expect(
          status.kind,
        ).toBe(
          "completed",
        );

        if (
          status.kind ===
          "completed"
        ) {
          expect(
            status.response.body,
          ).toMatchObject({
            orderId:
              501,
          });
        }
      },
    );

    it(
      "rejects the same key when the payload fingerprint differs",
      async () => {
        await reserveOrderIdempotency({
          idempotencyKey:
            IDEMPOTENCY_KEY,

          scope:
            CUSTOMER_SCOPE,

          fingerprint:
            createFingerprint({
              quantity: 1,
            }),
        });

        await expect(
          reserveOrderIdempotency({
            idempotencyKey:
              IDEMPOTENCY_KEY,

            scope:
              CUSTOMER_SCOPE,

            fingerprint:
              createFingerprint({
                quantity: 2,
              }),
          }),
        ).rejects.toMatchObject({
          name:
            "OrderIdempotencyError",

          code:
            "idempotency_key_reused",

          status:
            409,
        });
      },
    );
  },
);

/* =========================================================
   Reservation release
========================================================= */

describe(
  "reservation release",
  () => {
    it(
      "releases an unchanged processing reservation",
      async () => {
        const fingerprint =
          createFingerprint();

        const decision =
          await reserveOrderIdempotency({
            idempotencyKey:
              IDEMPOTENCY_KEY,

            scope:
              CUSTOMER_SCOPE,

            fingerprint,
          });

        if (
          decision.kind !==
          "acquired"
        ) {
          throw new Error(
            "Expected an acquired reservation.",
          );
        }

        await releaseOrderIdempotency(
          decision.reservation,
        );

        const statusAfterRelease =
          await getOrderIdempotencyStatus({
            idempotencyKey:
              IDEMPOTENCY_KEY,

            scope:
              CUSTOMER_SCOPE,

            fingerprint,
          });

        expect(
          statusAfterRelease.kind,
        ).toBe(
          "not_found",
        );

        /*
         * Release-এর পরে একই request আবার
         * fresh reservation নিতে পারবে।
         */
        const nextDecision =
          await reserveOrderIdempotency({
            idempotencyKey:
              IDEMPOTENCY_KEY,

            scope:
              CUSTOMER_SCOPE,

            fingerprint,
          });

        expect(
          nextDecision.kind,
        ).toBe(
          "acquired",
        );
      },
    );

    it(
      "returns not-found for an unknown attempt",
      async () => {
        const status =
          await getOrderIdempotencyStatus({
            idempotencyKey:
              "unknown-order-key-123456",

            scope:
              CUSTOMER_SCOPE,

            fingerprint:
              createFingerprint(),
          });

        expect(
          status,
        ).toEqual({
          kind:
            "not_found",
        });
      },
    );
  },
);

/* =========================================================
   TTL configuration
========================================================= */

describe(
  "idempotency record retention",
  () => {
    it(
      "uses a 24-hour processing reservation TTL",
      async () => {
        await reserveOrderIdempotency({
          idempotencyKey:
            IDEMPOTENCY_KEY,

          scope:
            CUSTOMER_SCOPE,

          fingerprint:
            createFingerprint(),
        });

        expect(
          redis.setCalls.length,
        ).toBeGreaterThan(
          0,
        );

        const reservationSetCall =
          redis.setCalls[0];

        /*
         * Implementation seconds অথবা
         * milliseconds ব্যবহার করতে পারে।
         */
        expect(
          objectContainsDuration(
            reservationSetCall
              ?.options,
            24 * 60 * 60,
          ),
        ).toBe(
          true,
        );
      },
    );

    it(
      "uses a seven-day completed-response TTL",
      async () => {
        const decision =
          await reserveOrderIdempotency({
            idempotencyKey:
              IDEMPOTENCY_KEY,

            scope:
              CUSTOMER_SCOPE,

            fingerprint:
              createFingerprint(),
          });

        if (
          decision.kind !==
          "acquired"
        ) {
          throw new Error(
            "Expected an acquired reservation.",
          );
        }

        await completeOrderIdempotency({
          reservation:
            decision.reservation,

          response: {
            status: 201,

            body: {
              success:
                true,

              orderId:
                600,

              orderNumber:
                "600",

              status:
                "processing",

              currency:
                "BDT",

              total:
                "1000.00",
            },
          },
        });

        expect(
          redis.evalCalls.length,
        ).toBeGreaterThan(
          0,
        );

        const completionCall =
          redis.evalCalls.find(
            (call) =>
              call.script
                .toLowerCase()
                .includes(
                  "set",
                ),
          );

        expect(
          completionCall,
        ).toBeDefined();

        expect(
          objectContainsDuration(
            completionCall
              ?.arguments,
            7 * 24 * 60 * 60,
          ),
        ).toBe(
          true,
        );
      },
    );
  },
);