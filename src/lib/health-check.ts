import "server-only";

/* =========================================================
   Public health-check types
========================================================= */

export type HealthStatus =
  | "healthy"
  | "degraded"
  | "unhealthy";

export type HealthDependencyName =
  | "application"
  | "redis"
  | "woocommerce";

export type DependencyHealthResult = {
  name:
    HealthDependencyName;

  status:
    HealthStatus;

  critical:
    boolean;

  latencyMs:
    number;

  checkedAt:
    string;

  code?:
    string;

  message:
    string;
};

export type HealthCheckSummary = {
  status:
    HealthStatus;

  checkedAt:
    string;

  durationMs:
    number;

  environment:
    string;

  release:
    string | null;

  dependencies:
    DependencyHealthResult[];
};

export type DependencyCheckResponse = {
  status?:
    HealthStatus;

  code?:
    string;

  message?:
    string;
};

export type DependencyHealthCheckOptions = {
  name:
    HealthDependencyName;

  critical:
    boolean;

  timeoutMs?:
    number;

  check: (
    signal:
      AbortSignal,
  ) =>
    Promise<
      DependencyCheckResponse
    >;
};

/* =========================================================
   Internal constants
========================================================= */

const DEFAULT_TIMEOUT_MS =
  1_500;

const MAX_TIMEOUT_MS =
  10_000;

const DEFAULT_SUCCESS_MESSAGE =
  "Dependency is available.";

const DEFAULT_FAILURE_MESSAGE =
  "Dependency check failed.";

const DEFAULT_TIMEOUT_MESSAGE =
  "Dependency check timed out.";

/* =========================================================
   Typed public error
========================================================= */

export class HealthCheckError
  extends Error {
  readonly code:
    string;

  readonly publicMessage:
    string;

  constructor({
    message,
    code =
      "health_check_failed",
    publicMessage =
      DEFAULT_FAILURE_MESSAGE,
  }: {
    message:
      string;

    code?:
      string;

    publicMessage?:
      string;
  }) {
    super(message);

    this.name =
      "HealthCheckError";

    this.code =
      code;

    this.publicMessage =
      publicMessage;
  }
}

/* =========================================================
   Utility functions
========================================================= */

function normalizeTimeout(
  timeoutMs:
    number | undefined,
): number {
  if (
    typeof timeoutMs !==
      "number" ||
    !Number.isFinite(
      timeoutMs,
    )
  ) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.min(
    Math.max(
      Math.trunc(
        timeoutMs,
      ),
      100,
    ),
    MAX_TIMEOUT_MS,
  );
}

function calculateLatency(
  startedAt:
    number,
): number {
  return Math.max(
    0,
    Math.round(
      performance.now() -
        startedAt,
    ),
  );
}

function normalizeEnvironment():
  string {
  const environment =
    process.env
      .VERCEL_ENV ??
    process.env
      .NODE_ENV ??
    "unknown";

  return environment
    .trim()
    .slice(
      0,
      40,
    );
}

function normalizeRelease():
  string | null {
  const release =
    process.env
      .APP_RELEASE ??
    process.env
      .VERCEL_GIT_COMMIT_SHA ??
    "";

  const normalized =
    release.trim();

  if (!normalized) {
    return null;
  }

  /*
   * Full deployment identifiers public response-এ
   * প্রকাশ না করে short operational reference।
   */
  return normalized.slice(
    0,
    12,
  );
}

function sanitizePublicText(
  value:
    string | undefined,
  fallback:
    string,
): string {
  const normalized =
    value
      ?.replace(
        /[\r\n\t]+/g,
        " ",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .trim() ??
    "";

  if (!normalized) {
    return fallback;
  }

  return normalized.slice(
    0,
    240,
  );
}

function getSafeFailureDetails(
  error:
    unknown,
): {
  code:
    string;

  message:
    string;
} {
  if (
    error instanceof
    HealthCheckError
  ) {
    return {
      code:
        error.code,

      message:
        sanitizePublicText(
          error.publicMessage,
          DEFAULT_FAILURE_MESSAGE,
        ),
    };
  }

  /*
   * Unknown error-এর raw message, stack,
   * URL, token বা provider response প্রকাশ
   * করা হবে না।
   */
  return {
    code:
      "health_check_failed",

    message:
      DEFAULT_FAILURE_MESSAGE,
  };
}

/* =========================================================
   Dependency check runner
========================================================= */

export async function runDependencyHealthCheck({
  name,
  critical,
  timeoutMs,
  check,
}: DependencyHealthCheckOptions):
  Promise<
    DependencyHealthResult
  > {
  const startedAt =
    performance.now();

  const checkedAt =
    new Date()
      .toISOString();

  const safeTimeoutMs =
    normalizeTimeout(
      timeoutMs,
    );

  const controller =
    new AbortController();

  let timeoutHandle:
    ReturnType<
      typeof setTimeout
    > | null =
    null;

  const timeoutPromise =
    new Promise<
      never
    >(
      (
        _resolve,
        reject,
      ) => {
        timeoutHandle =
          setTimeout(
            () => {
              controller.abort();

              reject(
                new HealthCheckError({
                  message:
                    `${name} health check exceeded ${safeTimeoutMs}ms.`,

                  code:
                    "health_check_timeout",

                  publicMessage:
                    DEFAULT_TIMEOUT_MESSAGE,
                }),
              );
            },
            safeTimeoutMs,
          );
      },
    );

  try {
    const response =
      await Promise.race([
        check(
          controller.signal,
        ),

        timeoutPromise,
      ]);

    const status =
      response.status ??
      "healthy";

    return {
      name,
      status,
      critical,

      latencyMs:
        calculateLatency(
          startedAt,
        ),

      checkedAt,

      code:
        response.code,

      message:
        sanitizePublicText(
          response.message,
          DEFAULT_SUCCESS_MESSAGE,
        ),
    };
  } catch (
    error
  ) {
    const failure =
      getSafeFailureDetails(
        error,
      );

    return {
      name,

      status:
        "unhealthy",

      critical,

      latencyMs:
        calculateLatency(
          startedAt,
        ),

      checkedAt,

      code:
        failure.code,

      message:
        failure.message,
    };
  } finally {
    if (
      timeoutHandle !==
      null
    ) {
      clearTimeout(
        timeoutHandle,
      );
    }
  }
}

/* =========================================================
   Overall status calculation
========================================================= */

export function calculateOverallHealthStatus(
  dependencies:
    DependencyHealthResult[],
): HealthStatus {
  const hasCriticalFailure =
    dependencies.some(
      (
        dependency,
      ) =>
        dependency.critical &&
        dependency.status ===
          "unhealthy",
    );

  if (
    hasCriticalFailure
  ) {
    return "unhealthy";
  }

  const hasAnyProblem =
    dependencies.some(
      (
        dependency,
      ) =>
        dependency.status !==
        "healthy",
    );

  if (
    hasAnyProblem
  ) {
    return "degraded";
  }

  return "healthy";
}

/* =========================================================
   Final health summary
========================================================= */

export function createHealthCheckSummary({
  dependencies,
  startedAt,
}: {
  dependencies:
    DependencyHealthResult[];

  startedAt:
    number;
}): HealthCheckSummary {
  return {
    status:
      calculateOverallHealthStatus(
        dependencies,
      ),

    checkedAt:
      new Date()
        .toISOString(),

    durationMs:
      calculateLatency(
        startedAt,
      ),

    environment:
      normalizeEnvironment(),

    release:
      normalizeRelease(),

    dependencies,
  };
}