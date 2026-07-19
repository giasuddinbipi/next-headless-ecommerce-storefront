import "server-only";

import {
  createHash,
} from "node:crypto";

import {
  Ratelimit,
} from "@upstash/ratelimit";

import {
  getRedisClient,
} from "@/lib/redis";

/* =========================================================
   Types
========================================================= */

type CheckoutRateLimitKind =
  | "order-create"
  | "order-status";

type CheckoutRateLimitScope =
  | "subject"
  | "ip";

type RateLimiterCollection = {
  orderCreateSubject:
    Ratelimit;

  orderCreateIp:
    Ratelimit;

  orderStatusSubject:
    Ratelimit;

  orderStatusIp:
    Ratelimit;
};

export type CheckoutRateLimitResult = {
  allowed: boolean;

  /*
   * true হলে Redis timeout/error-এর কারণে
   * request fail-open হয়েছে।
   */
  degraded: boolean;

  /*
   * Blocked না হলে null।
   */
  blockedScope:
    CheckoutRateLimitScope | null;

  limit: number;
  remaining: number;

  /*
   * Unix timestamp in milliseconds.
   */
  reset: number;

  retryAfterSeconds: number;
};

export type CheckoutRateLimitIdentity = {
  request: Request;

  customerId?:
    | number
    | null;

  billingEmail?:
    | string
    | null;
};

/* =========================================================
   Singleton limiters
========================================================= */

let rateLimiters:
  RateLimiterCollection | null =
    null;

function getRateLimiters():
  RateLimiterCollection {
  if (rateLimiters) {
    return rateLimiters;
  }

  const redis =
    getRedisClient();

  rateLimiters = {
    /*
     * একটি customer/guest সর্বোচ্চ
     * 10 মিনিটে 6টি order request।
     *
     * Network retry এবং normal correction-এর
     * জন্য কিছু অতিরিক্ত allowance আছে।
     */
    orderCreateSubject:
      new Ratelimit({
        redis,

        limiter:
          Ratelimit.slidingWindow(
            6,
            "10 m",
          ),

        prefix:
          "storefront:ratelimit:v1:order-create:subject",

        analytics: false,

        /*
         * Rate-limit Redis slow হলে checkout
         * পুরোপুরি unavailable হবে না।
         */
        timeout: 1_500,
      }),

    /*
     * একই network/IP থেকে সর্বোচ্চ
     * 10 মিনিটে 30টি order request।
     */
    orderCreateIp:
      new Ratelimit({
        redis,

        limiter:
          Ratelimit.slidingWindow(
            30,
            "10 m",
          ),

        prefix:
          "storefront:ratelimit:v1:order-create:ip",

        analytics: false,
        timeout: 1_500,
      }),

    /*
     * Recovery polling-এর জন্য বেশি allowance।
     *
     * একটি customer/guest সর্বোচ্চ
     * প্রতি মিনিটে 30টি status request।
     */
    orderStatusSubject:
      new Ratelimit({
        redis,

        limiter:
          Ratelimit.slidingWindow(
            30,
            "1 m",
          ),

        prefix:
          "storefront:ratelimit:v1:order-status:subject",

        analytics: false,
        timeout: 1_500,
      }),

    /*
     * একটি IP থেকে প্রতি মিনিটে
     * সর্বোচ্চ 120টি status request।
     */
    orderStatusIp:
      new Ratelimit({
        redis,

        limiter:
          Ratelimit.slidingWindow(
            120,
            "1 m",
          ),

        prefix:
          "storefront:ratelimit:v1:order-status:ip",

        analytics: false,
        timeout: 1_500,
      }),
  };

  return rateLimiters;
}

/* =========================================================
   Identifier helpers
========================================================= */

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

function normalizeEmail(
  value:
    | string
    | null
    | undefined,
): string {
  return (
    value
      ?.trim()
      .toLowerCase()
      .slice(0, 200) ??
    ""
  );
}

function readFirstForwardedValue(
  value:
    | string
    | null,
): string {
  if (!value) {
    return "";
  }

  return (
    value
      .split(",")[0]
      ?.trim()
      .slice(0, 200) ??
    ""
  );
}

function getClientAddress(
  request: Request,
): string {
  /*
   * Hosting platform অনুযায়ী header name
   * ভিন্ন হতে পারে।
   *
   * Raw address Redis-এ রাখা হবে না।
   */
  const candidates = [
    request.headers.get(
      "x-forwarded-for",
    ),

    request.headers.get(
      "x-vercel-forwarded-for",
    ),

    request.headers.get(
      "cf-connecting-ip",
    ),

    request.headers.get(
      "true-client-ip",
    ),

    request.headers.get(
      "x-real-ip",
    ),
  ];

  for (
    const candidate of
    candidates
  ) {
    const address =
      readFirstForwardedValue(
        candidate,
      );

    if (address) {
      return address;
    }
  }

  /*
   * Local development অথবা proxy header
   * unavailable হলে deterministic fallback।
   */
  return "unknown-client";
}

function getSubjectIdentity({
  customerId,
  billingEmail,
  clientAddress,
}: {
  customerId?:
    | number
    | null;

  billingEmail?:
    | string
    | null;

  clientAddress: string;
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
    normalizeEmail(
      billingEmail,
    );

  if (normalizedEmail) {
    /*
     * Raw guest email identifier-এ রাখা
     * হচ্ছে না।
     */
    return `guest:${sha256(
      normalizedEmail,
    )}`;
  }

  /*
   * Billing email unavailable হলে global
   * anonymous key ব্যবহার না করে IP-based
   * fallback ব্যবহার করা হবে।
   */
  return `guest-ip:${sha256(
    clientAddress,
  )}`;
}

function buildRateLimitIdentifiers({
  request,
  customerId,
  billingEmail,
}: CheckoutRateLimitIdentity): {
  subjectIdentifier: string;
  ipIdentifier: string;
} {
  const clientAddress =
    getClientAddress(
      request,
    );

  const subjectIdentity =
    getSubjectIdentity({
      customerId,
      billingEmail,
      clientAddress,
    });

  /*
   * Redis analytics/keyspace-এ raw customer,
   * email অথবা IP রাখা হবে না।
   */
  return {
    subjectIdentifier:
      sha256(
        `subject\u0000${subjectIdentity}`,
      ),

    ipIdentifier:
      sha256(
        `ip\u0000${clientAddress}`,
      ),
  };
}

/* =========================================================
   Result helpers
========================================================= */

function calculateRetryAfterSeconds(
  reset: number,
): number {
  if (
    !Number.isFinite(
      reset,
    )
  ) {
    return 60;
  }

  return Math.max(
    1,

    Math.ceil(
      (
        reset -
        Date.now()
      ) /
        1_000,
    ),
  );
}

function createDegradedResult():
  CheckoutRateLimitResult {
  return {
    allowed: true,
    degraded: true,

    blockedScope:
      null,

    limit: 0,
    remaining: 0,

    reset:
      Date.now(),

    retryAfterSeconds:
      0,
  };
}

/* =========================================================
   Shared rate-limit execution
========================================================= */

async function checkCheckoutRateLimit({
  kind,
  identity,
}: {
  kind:
    CheckoutRateLimitKind;

  identity:
    CheckoutRateLimitIdentity;
}): Promise<CheckoutRateLimitResult> {
  try {
    const limiters =
      getRateLimiters();

    const {
      subjectIdentifier,
      ipIdentifier,
    } =
      buildRateLimitIdentifiers(
        identity,
      );

    const subjectLimiter =
      kind ===
      "order-create"
        ? limiters
            .orderCreateSubject
        : limiters
            .orderStatusSubject;

    const ipLimiter =
      kind ===
      "order-create"
        ? limiters
            .orderCreateIp
        : limiters
            .orderStatusIp;

    /*
     * Customer/guest এবং IP—দুইটি
     * independent limit একই সঙ্গে check হবে।
     */
    const [
      subjectResult,
      ipResult,
    ] =
      await Promise.all([
        subjectLimiter.limit(
          subjectIdentifier,
        ),

        ipLimiter.limit(
          ipIdentifier,
        ),
      ]);

    const degraded =
      subjectResult.reason ===
        "timeout" ||
      ipResult.reason ===
        "timeout";

    if (
      subjectResult.success &&
      ipResult.success
    ) {
      /*
       * Client-facing metadata হিসেবে
       * stricter remaining value ব্যবহার হবে।
       */
      const subjectIsStricter =
        subjectResult.remaining <=
        ipResult.remaining;

      const selectedResult =
        subjectIsStricter
          ? subjectResult
          : ipResult;

      return {
        allowed: true,
        degraded,

        blockedScope:
          null,

        limit:
          selectedResult.limit,

        remaining:
          Math.min(
            subjectResult.remaining,
            ipResult.remaining,
          ),

        reset:
          Math.max(
            subjectResult.reset,
            ipResult.reset,
          ),

        retryAfterSeconds:
          0,
      };
    }

    /*
     * দুই limit-ই exceeded হলে যে limit-এর
     * reset পরে হবে সেটি response-এ ব্যবহার হবে।
     */
    const shouldUseIpResult =
      !ipResult.success &&
      (
        subjectResult.success ||
        ipResult.reset >=
          subjectResult.reset
      );

    const blockedResult =
      shouldUseIpResult
        ? ipResult
        : subjectResult;

    return {
      allowed: false,
      degraded,

      blockedScope:
        shouldUseIpResult
          ? "ip"
          : "subject",

      limit:
        blockedResult.limit,

      remaining:
        Math.max(
          0,
          blockedResult.remaining,
        ),

      reset:
        blockedResult.reset,

      retryAfterSeconds:
        calculateRetryAfterSeconds(
          blockedResult.reset,
        ),
    };
  } catch (error) {
    /*
     * Rate limiting একটি abuse-control layer।
     *
     * এটির network failure-এর কারণে legitimate
     * checkout পুরোপুরি বন্ধ করা হবে না।
     * Idempotency ও server-side checkout
     * validation আলাদাভাবে সক্রিয় থাকবে।
     */
    console.error(
      "Checkout rate-limit check failed:",
      {
        kind,

        error:
          error instanceof Error
            ? error.message
            : error,
      },
    );

    return createDegradedResult();
  }
}

/* =========================================================
   Public functions
========================================================= */

export async function checkOrderCreationRateLimit(
  identity:
    CheckoutRateLimitIdentity,
): Promise<CheckoutRateLimitResult> {
  return checkCheckoutRateLimit({
    kind:
      "order-create",

    identity,
  });
}

export async function checkOrderStatusRateLimit(
  identity:
    CheckoutRateLimitIdentity,
): Promise<CheckoutRateLimitResult> {
  return checkCheckoutRateLimit({
    kind:
      "order-status",

    identity,
  });
}

/* =========================================================
   Response headers
========================================================= */

export function getCheckoutRateLimitHeaders(
  result:
    CheckoutRateLimitResult,
): Record<string, string> {
  const headers:
    Record<string, string> = {
    "X-RateLimit-Degraded":
      result.degraded
        ? "true"
        : "false",
  };

  if (!result.degraded) {
    headers[
      "RateLimit-Limit"
    ] =
      String(
        result.limit,
      );

    headers[
      "RateLimit-Remaining"
    ] =
      String(
        Math.max(
          0,
          result.remaining,
        ),
      );

    /*
     * Upstash reset milliseconds-এ দেয়।
     * HTTP header-এর জন্য seconds-এ convert।
     */
    headers[
      "RateLimit-Reset"
    ] =
      String(
        Math.ceil(
          result.reset /
            1_000,
        ),
      );
  }

  if (!result.allowed) {
    headers[
      "Retry-After"
    ] =
      String(
        result.retryAfterSeconds,
      );
  }

  return headers;
}