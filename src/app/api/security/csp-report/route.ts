import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  checkCspReportDuplicate,
  checkCspReportRateLimit,
  getCspReportRateLimitHeaders,
  type CspReportDuplicateResult,
  type CspReportRateLimitResult,
} from "@/lib/csp-report-protection";

import {
  analyzeCspViolation,
  type CspViolationAnalysis,
} from "@/lib/csp-violation-analysis";

/* =========================================================
   Route configuration
========================================================= */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/* =========================================================
   Types
========================================================= */

type UnknownRecord =
  Record<string, unknown>;

type ResponseHeaderRecord =
  Record<string, string>;

type SafeCspReport = {
  documentOrigin: string | null;
  blockedOrigin: string | null;
  sourceOrigin: string | null;
  effectiveDirective: string | null;
  violatedDirective: string | null;
  disposition: string | null;
  statusCode: number | null;
};

type AnalyzedCspReport = {
  report: SafeCspReport;
  analysis: CspViolationAnalysis;
};

type ProtectedCspReport =
  AnalyzedCspReport & {
    duplicateProtection:
      CspReportDuplicateResult;
  };

/* =========================================================
   Constants
========================================================= */

const MAXIMUM_REPORT_BODY_BYTES =
  32 * 1_024;

const MAXIMUM_TEXT_LENGTH =
  160;

const SUPPORTED_MEDIA_TYPES =
  new Set([
    "application/csp-report",
    "application/json",
    "application/reports+json",
  ]);

const BASE_RESPONSE_HEADERS = {
  "Cache-Control":
    "no-store, no-cache, must-revalidate, proxy-revalidate",

  Pragma:
    "no-cache",

  Expires:
    "0",

  "X-Content-Type-Options":
    "nosniff",

  "X-Robots-Tag":
    "noindex, nofollow, noarchive",

  "X-Health-Check-Type":
    "security-report",
} as const;

/* =========================================================
   Basic helpers
========================================================= */

function isRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function sanitizeText(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized =
    value
      .replace(
        /[\r\n\t]+/g,
        " ",
      )
      .replace(
        /\s+/g,
        " ",
      )
      .trim();

  if (!normalized) {
    return null;
  }

  return normalized.slice(
    0,
    MAXIMUM_TEXT_LENGTH,
  );
}

function readFirstString(
  record: UnknownRecord,
  names: string[],
): string | null {
  for (const name of names) {
    const value =
      sanitizeText(
        record[name],
      );

    if (value) {
      return value;
    }
  }

  return null;
}

function readFirstNumber(
  record: UnknownRecord,
  names: string[],
): number | null {
  for (const name of names) {
    const value =
      record[name];

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return Math.max(
        0,
        Math.trunc(value),
      );
    }

    if (
      typeof value === "string" &&
      /^\d+$/.test(value)
    ) {
      return Math.max(
        0,
        Number.parseInt(
          value,
          10,
        ),
      );
    }
  }

  return null;
}

/* =========================================================
   Safe URL handling
========================================================= */

function sanitizeUrlForAudit(
  value: string | null,
): string | null {
  if (!value) {
    return null;
  }

  const normalized =
    value
      .trim()
      .slice(
        0,
        2_048,
      );

  if (!normalized) {
    return null;
  }

  const lowerValue =
    normalized.toLowerCase();

  if (
    lowerValue === "inline" ||
    lowerValue === "eval" ||
    lowerValue === "self" ||
    lowerValue === "'self'" ||
    lowerValue === "none" ||
    lowerValue === "'none'"
  ) {
    return lowerValue;
  }

  if (
    lowerValue.startsWith(
      "data:",
    )
  ) {
    return "data:";
  }

  if (
    lowerValue.startsWith(
      "blob:",
    )
  ) {
    return "blob:";
  }

  if (
    lowerValue.startsWith(
      "about:",
    )
  ) {
    return "about:";
  }

  if (
    normalized.startsWith(
      "/",
    )
  ) {
    return "same-origin-relative";
  }

  try {
    const url =
      new URL(normalized);

    if (
      url.protocol === "http:" ||
      url.protocol === "https:"
    ) {
      /*
       * Path, query এবং fragment audit log-এ
       * রাখা হবে না।
       */
      return url.origin;
    }

    /*
     * Extension বা custom protocol-এর ক্ষেত্রে
     * শুধু protocol রাখা হবে।
     */
    return url.protocol;
  } catch {
    return null;
  }
}

/* =========================================================
   CSP report normalization
========================================================= */

function resolveReportBody(
  value: unknown,
): UnknownRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const legacyReport =
    value["csp-report"];

  if (
    isRecord(
      legacyReport,
    )
  ) {
    return legacyReport;
  }

  const modernBody =
    value.body;

  if (
    isRecord(
      modernBody,
    )
  ) {
    return modernBody;
  }

  return value;
}

function normalizeCspReport(
  value: unknown,
): SafeCspReport | null {
  const report =
    resolveReportBody(
      value,
    );

  if (!report) {
    return null;
  }

  const documentUrl =
    readFirstString(
      report,
      [
        "document-uri",
        "documentURL",
        "documentUrl",
        "url",
      ],
    );

  const blockedUrl =
    readFirstString(
      report,
      [
        "blocked-uri",
        "blockedURL",
        "blockedUrl",
      ],
    );

  const sourceFile =
    readFirstString(
      report,
      [
        "source-file",
        "sourceFile",
      ],
    );

  const effectiveDirective =
    readFirstString(
      report,
      [
        "effective-directive",
        "effectiveDirective",
      ],
    );

  const violatedDirective =
    readFirstString(
      report,
      [
        "violated-directive",
        "violatedDirective",
      ],
    );

  const disposition =
    readFirstString(
      report,
      [
        "disposition",
      ],
    );

  const statusCode =
    readFirstNumber(
      report,
      [
        "status-code",
        "statusCode",
      ],
    );

  if (
    !documentUrl &&
    !blockedUrl &&
    !effectiveDirective &&
    !violatedDirective
  ) {
    return null;
  }

  return {
    documentOrigin:
      sanitizeUrlForAudit(
        documentUrl,
      ),

    blockedOrigin:
      sanitizeUrlForAudit(
        blockedUrl,
      ),

    sourceOrigin:
      sanitizeUrlForAudit(
        sourceFile,
      ),

    effectiveDirective,
    violatedDirective,
    disposition,
    statusCode,
  };
}

function extractCspReports(
  payload: unknown,
): SafeCspReport[] {
  const candidates =
    Array.isArray(payload)
      ? payload
      : [payload];

  const reports:
    SafeCspReport[] = [];

  for (const candidate of candidates) {
    const report =
      normalizeCspReport(
        candidate,
      );

    if (report) {
      reports.push(report);
    }
  }

  return reports;
}

function analyzeReports(
  reports: SafeCspReport[],
): AnalyzedCspReport[] {
  return reports.map(
    (report) => ({
      report,

      analysis:
        analyzeCspViolation(
          report,
        ),
    }),
  );
}

async function applyDuplicateProtection(
  reports:
    AnalyzedCspReport[],
): Promise<
  ProtectedCspReport[]
> {
  return Promise.all(
    reports.map(
      async (
        analyzedReport,
      ) => ({
        ...analyzedReport,

        duplicateProtection:
          await checkCspReportDuplicate(
            analyzedReport
              .analysis
              .fingerprint,
          ),
      }),
    ),
  );
}

/* =========================================================
   Request validation
========================================================= */

function readMediaType(
  request: NextRequest,
): string {
  return (
    request.headers
      .get(
        "content-type",
      )
      ?.split(
        ";",
      )[0]
      ?.trim()
      .toLowerCase() ??
    ""
  );
}

function isContentLengthTooLarge(
  request: NextRequest,
): boolean {
  const rawValue =
    request.headers.get(
      "content-length",
    );

  if (!rawValue) {
    return false;
  }

  const parsedValue =
    Number.parseInt(
      rawValue,
      10,
    );

  return (
    Number.isFinite(
      parsedValue,
    ) &&
    parsedValue >
      MAXIMUM_REPORT_BODY_BYTES
  );
}

/* =========================================================
   Response helpers
========================================================= */

function createErrorResponse({
  status,
  code,
  message,
  requestId,
  additionalHeaders = {},
}: {
  status: number;
  code: string;
  message: string;
  requestId: string;
  additionalHeaders?:
    ResponseHeaderRecord;
}): NextResponse {
  return NextResponse.json(
    {
      error: {
        code,
        message,
      },

      requestId,
    },
    {
      status,

      headers: {
        ...BASE_RESPONSE_HEADERS,
        ...additionalHeaders,

        "X-Request-Id":
          requestId,
      },
    },
  );
}

function createAcceptedResponse({
  requestId,
  protectedReports,
  rateLimitResult,
}: {
  requestId: string;

  protectedReports:
    ProtectedCspReport[];

  rateLimitResult:
    CspReportRateLimitResult;
}): NextResponse {
  const acceptedReports =
    protectedReports.length;

  const actionableReports =
    protectedReports.filter(
      (item) =>
        item.analysis
          .actionable,
    ).length;

  const noiseReports =
    acceptedReports -
    actionableReports;

  const duplicateReports =
    protectedReports.filter(
      (item) =>
        item
          .duplicateProtection
          .duplicate,
    ).length;

  const loggedReports =
    acceptedReports -
    duplicateReports;

  const duplicateProtectionDegraded =
    protectedReports.some(
      (item) =>
        item
          .duplicateProtection
          .degraded,
    );

  return new NextResponse(
    null,
    {
      status: 204,

      headers: {
        ...BASE_RESPONSE_HEADERS,

        ...getCspReportRateLimitHeaders(
          rateLimitResult,
        ),

        "X-Request-Id":
          requestId,

        "X-CSP-Reports-Accepted":
          String(
            acceptedReports,
          ),

        "X-CSP-Actionable-Reports":
          String(
            actionableReports,
          ),

        "X-CSP-Noise-Reports":
          String(
            noiseReports,
          ),

        "X-CSP-Duplicate-Reports":
          String(
            duplicateReports,
          ),

        "X-CSP-Logged-Reports":
          String(
            loggedReports,
          ),

        "X-CSP-Duplicate-Protection-Degraded":
          String(
            duplicateProtectionDegraded,
          ),
      },
    },
  );
}

/* =========================================================
   Structured audit logging
========================================================= */

function createCspAuditEntry({
  requestId,
  protectedReport,
}: {
  requestId: string;

  protectedReport:
    ProtectedCspReport;
}) {
  return {
    timestamp:
      new Date()
        .toISOString(),

    level:
      protectedReport
        .analysis
        .actionable
        ? "warn"
        : "info",

    event:
      "security.csp_violation",

    requestId,

    report:
      protectedReport.report,

    analysis: {
      fingerprint:
        protectedReport
          .analysis
          .fingerprint,

      category:
        protectedReport
          .analysis
          .category,

      directive:
        protectedReport
          .analysis
          .directive,

      blockedResourceKind:
        protectedReport
          .analysis
          .blockedResourceKind,

      severity:
        protectedReport
          .analysis
          .severity,

      actionable:
        protectedReport
          .analysis
          .actionable,

      reason:
        protectedReport
          .analysis
          .reason,

      disposition:
        protectedReport
          .analysis
          .disposition,

      statusCode:
        protectedReport
          .analysis
          .statusCode,
    },

    protection: {
      duplicateCheckDegraded:
        protectedReport
          .duplicateProtection
          .degraded,

      duplicateReason:
        protectedReport
          .duplicateProtection
          .reason,
    },
  };
}

function writeCspAuditLog({
  requestId,
  protectedReport,
}: {
  requestId: string;

  protectedReport:
    ProtectedCspReport;
}): void {
  /*
   * Duplicate report কোনো log তৈরি করবে না।
   */
  if (
    protectedReport
      .duplicateProtection
      .duplicate
  ) {
    return;
  }

  const entry =
    createCspAuditEntry({
      requestId,
      protectedReport,
    });

  const serialized =
    JSON.stringify(
      entry,
    );

  if (
    protectedReport
      .analysis
      .actionable
  ) {
    console.warn(
      serialized,
    );

    return;
  }

  console.info(
    serialized,
  );
}

/* =========================================================
   POST /api/security/csp-report
========================================================= */

export async function POST(
  request: NextRequest,
): Promise<NextResponse> {
  const requestId =
    randomUUID();

  /*
   * Rate limiting body parsing-এর আগে হচ্ছে যাতে
   * rejected requests-এর body process করতে না হয়।
   */
  const rateLimitResult =
    await checkCspReportRateLimit(
      request,
    );

  const rateLimitHeaders =
    getCspReportRateLimitHeaders(
      rateLimitResult,
    );

  if (!rateLimitResult.allowed) {
    return createErrorResponse({
      status: 429,

      code:
        "csp_report_rate_limited",

      message:
        "Too many CSP reports were submitted.",

      requestId,

      additionalHeaders:
        rateLimitHeaders,
    });
  }

  const mediaType =
    readMediaType(
      request,
    );

  if (
    !SUPPORTED_MEDIA_TYPES.has(
      mediaType,
    )
  ) {
    return createErrorResponse({
      status: 415,

      code:
        "unsupported_csp_report_media_type",

      message:
        "Unsupported CSP report media type.",

      requestId,

      additionalHeaders:
        rateLimitHeaders,
    });
  }

  if (
    isContentLengthTooLarge(
      request,
    )
  ) {
    return createErrorResponse({
      status: 413,

      code:
        "csp_report_too_large",

      message:
        "CSP report body is too large.",

      requestId,

      additionalHeaders:
        rateLimitHeaders,
    });
  }

  let rawBody: string;

  try {
    rawBody =
      await request.text();
  } catch {
    return createErrorResponse({
      status: 400,

      code:
        "csp_report_read_failed",

      message:
        "CSP report body could not be read.",

      requestId,

      additionalHeaders:
        rateLimitHeaders,
    });
  }

  if (
    Buffer.byteLength(
      rawBody,
      "utf8",
    ) >
    MAXIMUM_REPORT_BODY_BYTES
  ) {
    return createErrorResponse({
      status: 413,

      code:
        "csp_report_too_large",

      message:
        "CSP report body is too large.",

      requestId,

      additionalHeaders:
        rateLimitHeaders,
    });
  }

  if (!rawBody.trim()) {
    return createErrorResponse({
      status: 400,

      code:
        "csp_report_empty",

      message:
        "CSP report body is required.",

      requestId,

      additionalHeaders:
        rateLimitHeaders,
    });
  }

  let payload: unknown;

  try {
    payload =
      JSON.parse(
        rawBody,
      );
  } catch {
    return createErrorResponse({
      status: 400,

      code:
        "csp_report_invalid_json",

      message:
        "CSP report body must contain valid JSON.",

      requestId,

      additionalHeaders:
        rateLimitHeaders,
    });
  }

  const reports =
    extractCspReports(
      payload,
    );

  if (
    reports.length === 0
  ) {
    return createErrorResponse({
      status: 400,

      code:
        "csp_report_invalid",

      message:
        "CSP report body is invalid.",

      requestId,

      additionalHeaders:
        rateLimitHeaders,
    });
  }

  const analyzedReports =
    analyzeReports(
      reports,
    );

  const protectedReports =
    await applyDuplicateProtection(
      analyzedReports,
    );

  for (
    const protectedReport of
    protectedReports
  ) {
    writeCspAuditLog({
      requestId,
      protectedReport,
    });
  }

  return createAcceptedResponse({
    requestId,
    protectedReports,
    rateLimitResult,
  });
}