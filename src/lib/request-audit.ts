import "server-only";

import {
  createHmac,
  randomUUID,
} from "node:crypto";

/* =========================================================
   Types
========================================================= */

export type AuditLevel =
  | "info"
  | "warn"
  | "error";

export type AuditOperation =
  | "order-create"
  | "order-status"
  | "order-cancel"
  | "order-reorder"
  | "checkout-validation";

export type AuditEvent =
  | "request.received"
  | "request.rejected"
  | "request.completed"

  | "order.rate_limited"
  | "order.validation_failed"
  | "order.idempotency_acquired"
  | "order.idempotency_replayed"
  | "order.idempotency_in_progress"
  | "order.idempotency_conflict"
  | "order.creation_started"
  | "order.created"
  | "order.totals_mismatch"
  | "order.email_sent"
  | "order.email_failed"
  | "order.idempotency_stored"
  | "order.idempotency_store_failed"
  | "order.failed"

  | "order_status.rate_limited"
  | "order_status.not_found"
  | "order_status.in_progress"
  | "order_status.completed"
  | "order_status.failed";

export type RequestAuditContext = {
  requestId: string;

  operation:
    AuditOperation;

  route: string;
  method: string;

  startedAt: string;
  startedAtMilliseconds: number;
};

type UnknownRecord =
  Record<string, unknown>;

type AuditPrimitive =
  | string
  | number
  | boolean
  | null;

type AuditValue =
  | AuditPrimitive
  | AuditValue[]
  | {
      [key: string]:
        AuditValue;
    };

export type AuditMetadata =
  Record<string, unknown>;

type AuditLogEntry = {
  timestamp: string;

  level:
    AuditLevel;

  event:
    AuditEvent;

  requestId: string;

  operation:
    AuditOperation;

  route: string;
  method: string;

  durationMs: number;

  metadata?:
    Record<string, AuditValue>;

  error?: {
    name: string;
    message: string;

    code?: string;
    status?: number;

    stack?: string;
  };
};

/* =========================================================
   Configuration
========================================================= */

const MAX_REQUEST_ID_LENGTH =
  128;

const MAX_METADATA_DEPTH =
  5;

const MAX_METADATA_KEYS =
  100;

const MAX_ARRAY_LENGTH =
  50;

const MAX_STRING_LENGTH =
  500;

const REQUEST_ID_PATTERN =
  /^[A-Za-z0-9._:-]+$/;

/*
 * এই key names-এর values log করা হবে না।
 *
 * Matching case-insensitive।
 */
const SENSITIVE_KEY_PATTERN =
  /(?:password|passwd|secret|token|authorization|cookie|session|api[-_]?key|consumer[-_]?key|consumer[-_]?secret|idempotency[-_]?key|credit[-_]?card|card[-_]?number|cvv|cvc|billing|shipping|address|phone|email|customer[-_]?note|order[-_]?note|payload|request[-_]?body|raw[-_]?body)/i;

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

function normalizeRequestId(
  value:
    | string
    | null
    | undefined,
): string | null {
  const normalized =
    value?.trim() ?? "";

  if (
    normalized.length < 8 ||
    normalized.length >
      MAX_REQUEST_ID_LENGTH
  ) {
    return null;
  }

  if (
    !REQUEST_ID_PATTERN.test(
      normalized,
    )
  ) {
    return null;
  }

  return normalized;
}

function getIncomingRequestId(
  request: Request,
): string | null {
  const candidates = [
    request.headers.get(
      "x-request-id",
    ),

    request.headers.get(
      "x-correlation-id",
    ),

    request.headers.get(
      "x-vercel-id",
    ),
  ];

  for (
    const candidate of
    candidates
  ) {
    const normalized =
      normalizeRequestId(
        candidate,
      );

    if (normalized) {
      return normalized;
    }
  }

  return null;
}

function getAuditHashSecret():
  string {
  const secret =
    process.env
      .AUDIT_LOG_HASH_SECRET
      ?.trim() ||
    process.env
      .AUTH_SECRET
      ?.trim() ||
    process.env
      .NEXTAUTH_SECRET
      ?.trim();

  if (!secret) {
    throw new Error(
      "AUDIT_LOG_HASH_SECRET is not configured.",
    );
  }

  return secret;
}

function truncateString(
  value: string,
): string {
  if (
    value.length <=
    MAX_STRING_LENGTH
  ) {
    return value;
  }

  return `${value.slice(
    0,
    MAX_STRING_LENGTH,
  )}…`;
}

function normalizeNumber(
  value: number,
): number | null {
  return Number.isFinite(
    value,
  )
    ? value
    : null;
}

/* =========================================================
   Public request-context helpers
========================================================= */

export function createRequestAuditContext({
  request,
  operation,
  route,
}: {
  request: Request;

  operation:
    AuditOperation;

  route: string;
}): RequestAuditContext {
  const requestId =
    getIncomingRequestId(
      request,
    ) ??
    randomUUID();

  const startedAtMilliseconds =
    Date.now();

  return {
    requestId,

    operation,

    route:
      route.trim() ||
      "unknown-route",

    method:
      request.method
        .trim()
        .toUpperCase() ||
      "UNKNOWN",

    startedAt:
      new Date(
        startedAtMilliseconds,
      ).toISOString(),

    startedAtMilliseconds,
  };
}

export function getAuditDurationMilliseconds(
  context:
    RequestAuditContext,
): number {
  return Math.max(
    0,
    Date.now() -
      context
        .startedAtMilliseconds,
  );
}

export function getRequestAuditHeaders(
  context:
    RequestAuditContext,
): Record<string, string> {
  return {
    "X-Request-Id":
      context.requestId,
  };
}

/* =========================================================
   Privacy-safe identifier hashing
========================================================= */

/*
 * Email, IP, customer reference বা অন্য
 * identifier-এর raw value log না করে HMAC hash।
 *
 * Different identifier types আলাদা namespace
 * ব্যবহার করবে।
 */
export function hashAuditIdentifier({
  type,
  value,
}: {
  type:
    | "customer"
    | "email"
    | "ip"
    | "order"
    | "idempotency"
    | "coupon"
    | "other";

  value:
    | string
    | number
    | null
    | undefined;
}): string | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  const normalized =
    String(value)
      .trim()
      .toLowerCase();

  if (!normalized) {
    return null;
  }

  return createHmac(
    "sha256",
    getAuditHashSecret(),
  )
    .update(
      `${type}\u0000${normalized}`,
      "utf8",
    )
    .digest("hex");
}

/* =========================================================
   Metadata sanitization
========================================================= */

function sanitizeAuditValue(
  value: unknown,
  depth: number,
): AuditValue {
  if (
    depth >
    MAX_METADATA_DEPTH
  ) {
    return "[max-depth]";
  }

  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value ===
      "string"
  ) {
    return truncateString(
      value,
    );
  }

  if (
    typeof value ===
      "number"
  ) {
    return normalizeNumber(
      value,
    );
  }

  if (
    typeof value ===
      "boolean"
  ) {
    return value;
  }

  if (
    typeof value ===
      "bigint"
  ) {
    return value.toString();
  }

  if (
    value instanceof Date
  ) {
    return value.toISOString();
  }

  if (
    value instanceof Error
  ) {
    return {
      name:
        truncateString(
          value.name,
        ),

      message:
        truncateString(
          value.message,
        ),
    };
  }

  if (
    Array.isArray(value)
  ) {
    return value
      .slice(
        0,
        MAX_ARRAY_LENGTH,
      )
      .map(
        (entry) =>
          sanitizeAuditValue(
            entry,
            depth + 1,
          ),
      );
  }

  if (
    isObject(value)
  ) {
    const sanitized:
      Record<string, AuditValue> =
      {};

    const entries =
      Object.entries(
        value,
      ).slice(
        0,
        MAX_METADATA_KEYS,
      );

    for (
      const [
        key,
        entry,
      ] of entries
    ) {
      const safeKey =
        truncateString(
          key,
        );

      if (
        SENSITIVE_KEY_PATTERN.test(
          key,
        )
      ) {
        sanitized[safeKey] =
          "[redacted]";

        continue;
      }

      sanitized[safeKey] =
        sanitizeAuditValue(
          entry,
          depth + 1,
        );
    }

    return sanitized;
  }

  return truncateString(
    String(value),
  );
}

function sanitizeAuditMetadata(
  metadata:
    AuditMetadata | undefined,
): Record<string, AuditValue> | undefined {
  if (!metadata) {
    return undefined;
  }

  const sanitized =
    sanitizeAuditValue(
      metadata,
      0,
    );

  return isObject(
    sanitized,
  )
    ? sanitized as Record<
        string,
        AuditValue
      >
    : undefined;
}

/* =========================================================
   Error normalization
========================================================= */

function getErrorProperty(
  error: unknown,
  key: string,
): unknown {
  if (
    !isObject(error)
  ) {
    return undefined;
  }

  return error[key];
}

function normalizeAuditError(
  error: unknown,
): AuditLogEntry["error"] {
  if (
    error instanceof Error
  ) {
    const codeValue =
      getErrorProperty(
        error,
        "code",
      );

    const statusValue =
      getErrorProperty(
        error,
        "status",
      );

    return {
      name:
        truncateString(
          error.name ||
            "Error",
        ),

      message:
        truncateString(
          error.message ||
            "Unknown error",
        ),

      ...(
        typeof codeValue ===
          "string" &&
        codeValue.trim()
          ? {
              code:
                truncateString(
                  codeValue,
                ),
            }
          : {}
      ),

      ...(
        typeof statusValue ===
          "number" &&
        Number.isFinite(
          statusValue,
        )
          ? {
              status:
                statusValue,
            }
          : {}
      ),

      ...(
        process.env
          .NODE_ENV ===
          "development" &&
        error.stack
          ? {
              stack:
                truncateString(
                  error.stack,
                ),
            }
          : {}
      ),
    };
  }

  if (
    typeof error ===
      "string"
  ) {
    return {
      name:
        "Error",

      message:
        truncateString(
          error,
        ),
    };
  }

  return {
    name:
      "UnknownError",

    message:
      "An unknown error occurred.",
  };
}

/* =========================================================
   Structured log writer
========================================================= */

export function writeAuditLog({
  context,
  level,
  event,
  metadata,
  error,
}: {
  context:
    RequestAuditContext;

  level:
    AuditLevel;

  event:
    AuditEvent;

  metadata?:
    AuditMetadata;

  error?: unknown;
}): void {
  const entry:
    AuditLogEntry = {
    timestamp:
      new Date()
        .toISOString(),

    level,

    event,

    requestId:
      context.requestId,

    operation:
      context.operation,

    route:
      context.route,

    method:
      context.method,

    durationMs:
      getAuditDurationMilliseconds(
        context,
      ),

    ...(
      metadata
        ? {
            metadata:
              sanitizeAuditMetadata(
                metadata,
              ),
          }
        : {}
    ),

    ...(
      error !== undefined
        ? {
            error:
              normalizeAuditError(
                error,
              ),
          }
        : {}
    ),
  };

  const serializedEntry =
    JSON.stringify(
      entry,
    );

  if (
    level ===
    "error"
  ) {
    console.error(
      serializedEntry,
    );

    return;
  }

  if (
    level ===
    "warn"
  ) {
    console.warn(
      serializedEntry,
    );

    return;
  }

  console.info(
    serializedEntry,
  );
}

/* =========================================================
   Convenience wrappers
========================================================= */

export function auditInfo(
  context:
    RequestAuditContext,
  event:
    AuditEvent,
  metadata?:
    AuditMetadata,
): void {
  writeAuditLog({
    context,
    level:
      "info",
    event,
    metadata,
  });
}

export function auditWarn(
  context:
    RequestAuditContext,
  event:
    AuditEvent,
  metadata?:
    AuditMetadata,
): void {
  writeAuditLog({
    context,
    level:
      "warn",
    event,
    metadata,
  });
}

export function auditError(
  context:
    RequestAuditContext,
  event:
    AuditEvent,
  error: unknown,
  metadata?:
    AuditMetadata,
): void {
  writeAuditLog({
    context,
    level:
      "error",
    event,
    metadata,
    error,
  });
}