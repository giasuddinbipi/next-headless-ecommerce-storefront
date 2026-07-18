import "server-only";

import {
  createHash,
  randomUUID,
} from "node:crypto";

import {
  getRedisClient,
} from "@/lib/redis";

/* =========================================================
   Configuration
========================================================= */

/*
 * Processing request 24 ঘণ্টা lock থাকবে।
 *
 * WooCommerce request-এর result uncertain হলে
 * একই key দিয়ে সঙ্গে সঙ্গে duplicate order তৈরি
 * হতে দেওয়া হবে না।
 */
const PROCESSING_TTL_SECONDS =
  24 * 60 * 60;

/*
 * Successful order response 7 দিন replay করা যাবে।
 */
const COMPLETED_TTL_SECONDS =
  7 * 24 * 60 * 60;

const IDEMPOTENCY_KEY_PREFIX =
  "storefront:order-idempotency:v1:";

const MIN_IDEMPOTENCY_KEY_LENGTH =
  16;

const MAX_IDEMPOTENCY_KEY_LENGTH =
  200;

type UnknownRecord =
  Record<string, unknown>;

type StableJsonValue =
  | null
  | boolean
  | number
  | string
  | StableJsonValue[]
  | {
      [key: string]:
        StableJsonValue;
    };

type ProcessingRecord = {
  version: 1;

  status:
    "processing";

  fingerprint: string;
  lockToken: string;

  createdAt: string;
};

type CompletedRecord = {
  version: 1;

  status:
    "completed";

  fingerprint: string;

  completedAt: string;

  response:
    OrderIdempotencyCachedResponse;
};

type IdempotencyRecord =
  | ProcessingRecord
  | CompletedRecord;

export type OrderIdempotencyCachedResponse = {
  status: number;

  body:
    Record<string, unknown>;
};

export type OrderIdempotencyReservation = {
  storageKey: string;

  /*
   * Redis-এ stored exact processing value।
   *
   * Completion ও release-এর সময় compare-and-set
   * operation-এ ব্যবহার হবে।
   */
  processingValue: string;

  fingerprint: string;
};

export type OrderIdempotencyDecision =
  | {
      kind:
        "acquired";

      reservation:
        OrderIdempotencyReservation;
    }
  | {
      kind:
        "replay";

      response:
        OrderIdempotencyCachedResponse;
    }
  | {
      kind:
        "in_progress";
    };

export class OrderIdempotencyError extends Error {
  status: number;
  code: string;

  constructor(
    message: string,
    status = 400,
    code =
      "order_idempotency_failed",
  ) {
    super(message);

    this.name =
      "OrderIdempotencyError";

    this.status = status;
    this.code = code;
  }
}

/* =========================================================
   Redis atomic scripts
========================================================= */

/*
 * Current stored value expected value-এর সঙ্গে
 * মিললেই নতুন value বসানো হবে।
 *
 * অন্য request lock নিয়ে থাকলে overwrite হবে না।
 */
const REPLACE_IF_UNCHANGED_SCRIPT = `
local current = redis.call("GET", KEYS[1])

if current ~= ARGV[1] then
  return 0
end

redis.call(
  "SET",
  KEYS[1],
  ARGV[2],
  "EX",
  ARGV[3]
)

return 1
`;

/*
 * Current stored value expected value-এর সঙ্গে
 * মিললেই reservation delete হবে।
 */
const DELETE_IF_UNCHANGED_SCRIPT = `
local current = redis.call("GET", KEYS[1])

if current ~= ARGV[1] then
  return 0
end

redis.call("DEL", KEYS[1])

return 1
`;

/* =========================================================
   General helpers
========================================================= */

function isObject(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function sha256(
  value: string,
): string {
  return createHash(
    "sha256",
  )
    .update(
      value,
      "utf8",
    )
    .digest("hex");
}

function isSha256Hash(
  value: unknown,
): value is string {
  return (
    typeof value ===
      "string" &&
    /^[a-f0-9]{64}$/.test(
      value,
    )
  );
}

/* =========================================================
   Stable request serialization
========================================================= */

function toStableJsonValue(
  value: unknown,
): StableJsonValue {
  if (value === null) {
    return null;
  }

  if (
    typeof value ===
      "string" ||
    typeof value ===
      "boolean"
  ) {
    return value;
  }

  if (
    typeof value ===
      "number"
  ) {
    if (
      !Number.isFinite(value)
    ) {
      throw new OrderIdempotencyError(
        "The order request contains an invalid number.",
        400,
        "invalid_order_fingerprint",
      );
    }

    return value;
  }

  if (
    Array.isArray(value)
  ) {
    return value.map(
      (entry) =>
        entry === undefined
          ? null
          : toStableJsonValue(
              entry,
            ),
    );
  }

  if (isObject(value)) {
    const stableObject: {
      [key: string]:
        StableJsonValue;
    } = {};

    const sortedKeys =
      Object.keys(value).sort(
        (
          first,
          second,
        ) =>
          first.localeCompare(
            second,
          ),
      );

    for (
      const key of
      sortedKeys
    ) {
      const entry =
        value[key];

      /*
       * JSON.stringify-এর মতো undefined,
       * function ও symbol object property
       * থেকে বাদ দেওয়া হবে।
       */
      if (
        entry === undefined ||
        typeof entry ===
          "function" ||
        typeof entry ===
          "symbol"
      ) {
        continue;
      }

      stableObject[key] =
        toStableJsonValue(
          entry,
        );
    }

    return stableObject;
  }

  throw new OrderIdempotencyError(
    "The order request cannot be fingerprinted.",
    400,
    "invalid_order_fingerprint",
  );
}

function stableStringify(
  value: unknown,
): string {
  return JSON.stringify(
    toStableJsonValue(
      value,
    ),
  );
}

/*
 * Normalized order request-এর deterministic
 * SHA-256 fingerprint তৈরি করবে।
 *
 * একই data ভিন্ন object-key order-এ এলেও
 * একই fingerprint হবে।
 */
export function createOrderRequestFingerprint(
  value: unknown,
): string {
  return sha256(
    stableStringify(
      value,
    ),
  );
}

/* =========================================================
   Customer/guest scope
========================================================= */

export function createOrderIdempotencyScope({
  customerId,
  billingEmail,
}: {
  customerId:
    | number
    | null
    | undefined;

  billingEmail:
    | string
    | null
    | undefined;
}): string {
  if (
    typeof customerId ===
      "number" &&
    Number.isInteger(
      customerId,
    ) &&
    customerId > 0
  ) {
    return `customer:${customerId}`;
  }

  const normalizedEmail =
    billingEmail
      ?.trim()
      .toLowerCase() ||
    "anonymous-guest";

  /*
   * Raw guest email Redis key-তে রাখা হবে না।
   */
  return `guest:${sha256(
    normalizedEmail,
  )}`;
}

/* =========================================================
   Idempotency key validation
========================================================= */

export function readOrderIdempotencyKey(
  request: Request,
): string {
  const key =
    request.headers
      .get(
        "idempotency-key",
      )
      ?.trim() ?? "";

  if (!key) {
    throw new OrderIdempotencyError(
      "An idempotency key is required to place an order.",
      400,
      "idempotency_key_required",
    );
  }

  if (
    key.length <
      MIN_IDEMPOTENCY_KEY_LENGTH ||
    key.length >
      MAX_IDEMPOTENCY_KEY_LENGTH
  ) {
    throw new OrderIdempotencyError(
      "The order idempotency key has an invalid length.",
      400,
      "invalid_idempotency_key",
    );
  }

  /*
   * UUID, nanoid এবং সাধারণ random token
   * safely support করবে।
   */
  if (
    !/^[A-Za-z0-9._:-]+$/.test(
      key,
    )
  ) {
    throw new OrderIdempotencyError(
      "The order idempotency key contains invalid characters.",
      400,
      "invalid_idempotency_key",
    );
  }

  return key;
}

function getStorageKey({
  scope,
  idempotencyKey,
}: {
  scope: string;
  idempotencyKey: string;
}): string {
  const normalizedScope =
    scope.trim();

  if (
    !normalizedScope ||
    normalizedScope.length >
      300
  ) {
    throw new OrderIdempotencyError(
      "The order idempotency scope is invalid.",
      400,
      "invalid_idempotency_scope",
    );
  }

  /*
   * Raw idempotency key Redis key-name-এ
   * সংরক্ষণ করা হচ্ছে না।
   */
  const keyHash =
    sha256(
      `${normalizedScope}\u0000${idempotencyKey}`,
    );

  return (
    IDEMPOTENCY_KEY_PREFIX +
    keyHash
  );
}

/* =========================================================
   Record encoding
========================================================= */

/*
 * Base64url ব্যবহার করলে Redis client value-কে
 * JSON হিসেবে auto-deserialize করবে না এবং Lua
 * script exact string comparison করতে পারবে।
 */
function encodeRecord(
  record:
    IdempotencyRecord,
): string {
  return Buffer.from(
    JSON.stringify(record),
    "utf8",
  ).toString(
    "base64url",
  );
}

function decodeRecord(
  encodedValue: string,
): IdempotencyRecord {
  let parsed: unknown;

  try {
    const json =
      Buffer.from(
        encodedValue,
        "base64url",
      ).toString("utf8");

    parsed =
      JSON.parse(json);
  } catch {
    throw new OrderIdempotencyError(
      "The stored order idempotency record is invalid.",
      503,
      "invalid_idempotency_record",
    );
  }

  if (
    !isObject(parsed) ||
    parsed.version !== 1 ||
    !isSha256Hash(
      parsed.fingerprint,
    )
  ) {
    throw new OrderIdempotencyError(
      "The stored order idempotency record is invalid.",
      503,
      "invalid_idempotency_record",
    );
  }

  if (
    parsed.status ===
    "processing"
  ) {
    if (
      typeof parsed.lockToken !==
        "string" ||
      !parsed.lockToken ||
      typeof parsed.createdAt !==
        "string"
    ) {
      throw new OrderIdempotencyError(
        "The stored order idempotency record is invalid.",
        503,
        "invalid_idempotency_record",
      );
    }

    return {
      version: 1,

      status:
        "processing",

      fingerprint:
        parsed.fingerprint,

      lockToken:
        parsed.lockToken,

      createdAt:
        parsed.createdAt,
    };
  }

  if (
    parsed.status ===
    "completed"
  ) {
    if (
      typeof parsed.completedAt !==
        "string" ||
      !isObject(
        parsed.response,
      ) ||
      typeof parsed.response.status !==
        "number" ||
      !Number.isInteger(
        parsed.response.status,
      ) ||
      parsed.response.status <
        100 ||
      parsed.response.status >
        599 ||
      !isObject(
        parsed.response.body,
      )
    ) {
      throw new OrderIdempotencyError(
        "The stored order idempotency record is invalid.",
        503,
        "invalid_idempotency_record",
      );
    }

    return {
      version: 1,

      status:
        "completed",

      fingerprint:
        parsed.fingerprint,

      completedAt:
        parsed.completedAt,

      response: {
        status:
          parsed.response.status,

        body:
          parsed.response.body,
      },
    };
  }

  throw new OrderIdempotencyError(
    "The stored order idempotency record is invalid.",
    503,
    "invalid_idempotency_record",
  );
}

/* =========================================================
   Atomic Redis helpers
========================================================= */

async function replaceIfUnchanged({
  storageKey,
  expectedValue,
  nextValue,
  ttlSeconds,
}: {
  storageKey: string;
  expectedValue: string;
  nextValue: string;
  ttlSeconds: number;
}): Promise<boolean> {
  const redis =
    getRedisClient();

  /*
   * @upstash/redis eval generic order:
   *
   * eval<TArgs extends unknown[], TData>()
   *
   * First generic = argument tuple
   * Second generic = Lua return type
   */
  const result =
    await redis.eval<
      [string, string, string],
      number
    >(
      REPLACE_IF_UNCHANGED_SCRIPT,
      [storageKey],
      [
        expectedValue,
        nextValue,
        String(ttlSeconds),
      ],
    );

  return Number(result) === 1;
}

async function deleteIfUnchanged({
  storageKey,
  expectedValue,
}: {
  storageKey: string;
  expectedValue: string;
}): Promise<boolean> {
  const redis =
    getRedisClient();

  /*
   * First generic = argument tuple
   * Second generic = Lua return type
   */
  const result =
    await redis.eval<
      [string],
      number
    >(
      DELETE_IF_UNCHANGED_SCRIPT,
      [storageKey],
      [
        expectedValue,
      ],
    );

  return Number(result) === 1;
}

/* =========================================================
   Reserve idempotency key
========================================================= */

export async function reserveOrderIdempotency({
  idempotencyKey,
  scope,
  fingerprint,
}: {
  idempotencyKey: string;
  scope: string;
  fingerprint: string;
}): Promise<OrderIdempotencyDecision> {
  if (
    !isSha256Hash(
      fingerprint,
    )
  ) {
    throw new OrderIdempotencyError(
      "The order request fingerprint is invalid.",
      400,
      "invalid_order_fingerprint",
    );
  }

  const storageKey =
    getStorageKey({
      scope,
      idempotencyKey,
    });

  const processingRecord:
    ProcessingRecord = {
    version: 1,

    status:
      "processing",

    fingerprint,

    lockToken:
      randomUUID(),

    createdAt:
      new Date().toISOString(),
  };

  const processingValue =
    encodeRecord(
      processingRecord,
    );

  try {
    const redis =
      getRedisClient();

    /*
     * SET NX হলো atomic reservation।
     *
     * একই key একসঙ্গে দুই request reserve
     * করতে পারবে না।
     */
    for (
      let attempt = 0;
      attempt < 2;
      attempt += 1
    ) {
      const acquired =
        await redis.set(
          storageKey,
          processingValue,
          {
            nx: true,

            ex:
              PROCESSING_TTL_SECONDS,
          },
        );

      if (
        acquired === "OK"
      ) {
        return {
          kind:
            "acquired",

          reservation: {
            storageKey,
            processingValue,
            fingerprint,
          },
        };
      }

      const existingValue =
        await redis.get<string>(
          storageKey,
        );

      /*
       * Failed SET এবং GET-এর মাঝখানে key
       * expire হলে আরেকবার reserve চেষ্টা হবে।
       */
      if (!existingValue) {
        continue;
      }

      const existingRecord =
        decodeRecord(
          existingValue,
        );

      if (
        existingRecord.fingerprint !==
        fingerprint
      ) {
        throw new OrderIdempotencyError(
          "This idempotency key was already used for a different order request.",
          409,
          "idempotency_key_reused",
        );
      }

      if (
        existingRecord.status ===
        "completed"
      ) {
        return {
          kind:
            "replay",

          response:
            existingRecord.response,
        };
      }

      return {
        kind:
          "in_progress",
      };
    }

    return {
      kind:
        "in_progress",
    };
  } catch (error) {
    if (
      error instanceof
      OrderIdempotencyError
    ) {
      throw error;
    }

    console.error(
      "Order idempotency reservation failed:",
      error,
    );

    throw new OrderIdempotencyError(
      "The order safety service is temporarily unavailable. Please try again.",
      503,
      "idempotency_store_unavailable",
    );
  }
}

/* =========================================================
   Complete idempotent order
========================================================= */

export async function completeOrderIdempotency({
  reservation,
  response,
}: {
  reservation:
    OrderIdempotencyReservation;

  response:
    OrderIdempotencyCachedResponse;
}): Promise<void> {
  if (
    !Number.isInteger(
      response.status,
    ) ||
    response.status < 100 ||
    response.status > 599 ||
    !isObject(
      response.body,
    )
  ) {
    throw new OrderIdempotencyError(
      "The cached order response is invalid.",
      500,
      "invalid_idempotency_response",
    );
  }

  const completedRecord:
    CompletedRecord = {
    version: 1,

    status:
      "completed",

    fingerprint:
      reservation.fingerprint,

    completedAt:
      new Date().toISOString(),

    response: {
      status:
        response.status,

      body:
        response.body,
    },
  };

  const completedValue =
    encodeRecord(
      completedRecord,
    );

  try {
    const replaced =
      await replaceIfUnchanged({
        storageKey:
          reservation.storageKey,

        expectedValue:
          reservation.processingValue,

        nextValue:
          completedValue,

        ttlSeconds:
          COMPLETED_TTL_SECONDS,
      });

    if (replaced) {
      return;
    }

    /*
     * Function retry বা duplicate completion হলে
     * existing completed result গ্রহণযোগ্য।
     */
    const redis =
      getRedisClient();

    const existingValue =
      await redis.get<string>(
        reservation.storageKey,
      );

    if (existingValue) {
      const existingRecord =
        decodeRecord(
          existingValue,
        );

      if (
        existingRecord.status ===
          "completed" &&
        existingRecord.fingerprint ===
          reservation.fingerprint
      ) {
        return;
      }
    }

    throw new OrderIdempotencyError(
      "The order idempotency reservation was lost before completion.",
      409,
      "idempotency_reservation_lost",
    );
  } catch (error) {
    if (
      error instanceof
      OrderIdempotencyError
    ) {
      throw error;
    }

    console.error(
      "Order idempotency completion failed:",
      error,
    );

    throw new OrderIdempotencyError(
      "The order was created, but its duplicate-protection result could not be stored.",
      503,
      "idempotency_completion_failed",
    );
  }
}

/* =========================================================
   Release known failed reservation
========================================================= */

/*
 * এটি শুধু সেই failure-এর জন্য ব্যবহার হবে যেখানে
 * নিশ্চিতভাবে WooCommerce order তৈরি হয়নি।
 *
 * WooCommerce creation request পাঠানোর পরে result
 * uncertain হলে reservation release করা যাবে না।
 */
export async function releaseOrderIdempotency(
  reservation:
    OrderIdempotencyReservation,
): Promise<boolean> {
  try {
    return await deleteIfUnchanged({
      storageKey:
        reservation.storageKey,

      expectedValue:
        reservation.processingValue,
    });
  } catch (error) {
    if (
      error instanceof
      OrderIdempotencyError
    ) {
      throw error;
    }

    console.error(
      "Order idempotency release failed:",
      error,
    );

    throw new OrderIdempotencyError(
      "The order safety reservation could not be released.",
      503,
      "idempotency_release_failed",
    );
  }
}