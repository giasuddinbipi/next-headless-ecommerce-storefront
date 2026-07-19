import {
  Buffer,
} from "node:buffer";

import {
  randomUUID,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  analyzeCspViolation,
  type CspViolationAnalysis,
} from "@/lib/csp-violation-analysis";

/* =========================================================
   Route configuration
========================================================= */

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export const revalidate =
  0;

/* =========================================================
   Types
========================================================= */

type UnknownRecord =
  Record<string, unknown>;

type SafeCspReport = {
  documentOrigin:
    string | null;

  blockedOrigin:
    string | null;

  sourceOrigin:
    string | null;

  effectiveDirective:
    string | null;

  violatedDirective:
    string | null;

  disposition:
    string | null;

  statusCode:
    number | null;
};

type AnalyzedCspReport = {
  report:
    SafeCspReport;

  analysis:
    CspViolationAnalysis;
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
  value:
    unknown,
): value is UnknownRecord {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value,
    )
  );
}

function sanitizeText(
  value:
    unknown,
): string | null {
  if (
    typeof value !==
    "string"
  ) {
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
  record:
    UnknownRecord,

  names:
    string[],
): string | null {
  for (
    const name of names
  ) {
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
  record:
    UnknownRecord,

  names:
    string[],
): number | null {
  for (
    const name of names
  ) {
    const value =
      record[name];

    if (
      typeof value ===
        "number" &&
      Number.isFinite(
        value,
      )
    ) {
      return Math.max(
        0,
        Math.trunc(
          value,
        ),
      );
    }

    if (
      typeof value ===
        "string" &&
      /^\d+$/.test(
        value,
      )
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
  value:
    string | null,
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
    normalized
      .toLowerCase();

  if (
    lowerValue ===
      "inline" ||
    lowerValue ===
      "eval" ||
    lowerValue ===
      "self" ||
    lowerValue ===
      "'self'" ||
    lowerValue ===
      "none" ||
    lowerValue ===
      "'none'"
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
      new URL(
        normalized,
      );

    if (
      url.protocol ===
        "http:" ||
      url.protocol ===
        "https:"
    ) {
      /*
       * Path, query এবং fragment audit log-এ রাখা হবে না।
       */
      return url.origin;
    }

    /*
     * Browser-extension অথবা অন্য protocol-এর
     * সম্পূর্ণ URL নয়, শুধু protocol রাখা হবে।
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
  value:
    unknown,
): UnknownRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const legacyReport =
    value[
      "csp-report"
    ];

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
  value:
    unknown,
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
  payload:
    unknown,
): SafeCspReport[] {
  const candidates =
    Array.isArray(
      payload,
    )
      ? payload
      : [
          payload,
        ];

  const reports:
    SafeCspReport[] =
    [];

  for (
    const candidate of
    candidates
  ) {
    const report =
      normalizeCspReport(
        candidate,
      );

    if (report) {
      reports.push(
        report,
      );
    }
  }

  return reports;
}

function analyzeReports(
  reports:
    SafeCspReport[],
): AnalyzedCspReport[] {
  return reports.map(
    (
      report,
    ) => ({
      report,

      analysis:
        analyzeCspViolation(
          report,
        ),
    }),
  );
}

/* =========================================================
   Request validation
========================================================= */

function readMediaType(
  request:
    NextRequest,
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
  request:
    NextRequest,
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
}: {
  status:
    number;

  code:
    string;

  message:
    string;

  requestId:
    string;
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

        "X-Request-Id":
          requestId,
      },
    },
  );
}

function createAcceptedResponse({
  requestId,
  acceptedReports,
  actionableReports,
}: {
  requestId:
    string;

  acceptedReports:
    number;

  actionableReports:
    number;
}): NextResponse {
  const noiseReports =
    Math.max(
      0,
      acceptedReports -
        actionableReports,
    );

  return new NextResponse(
    null,
    {
      status:
        204,

      headers: {
        ...BASE_RESPONSE_HEADERS,

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
      },
    },
  );
}

/* =========================================================
   Structured audit logging
========================================================= */

function createCspAuditEntry({
  requestId,
  analyzedReport,
}: {
  requestId:
    string;

  analyzedReport:
    AnalyzedCspReport;
}) {
  return {
    timestamp:
      new Date()
        .toISOString(),

    level:
      analyzedReport
        .analysis
        .actionable
        ? "warn"
        : "info",

    event:
      "security.csp_violation",

    requestId,

    report:
      analyzedReport.report,

    analysis: {
      fingerprint:
        analyzedReport
          .analysis
          .fingerprint,

      category:
        analyzedReport
          .analysis
          .category,

      directive:
        analyzedReport
          .analysis
          .directive,

      blockedResourceKind:
        analyzedReport
          .analysis
          .blockedResourceKind,

      severity:
        analyzedReport
          .analysis
          .severity,

      actionable:
        analyzedReport
          .analysis
          .actionable,

      reason:
        analyzedReport
          .analysis
          .reason,

      disposition:
        analyzedReport
          .analysis
          .disposition,

      statusCode:
        analyzedReport
          .analysis
          .statusCode,
    },
  };
}

function writeCspAuditLog({
  requestId,
  analyzedReport,
}: {
  requestId:
    string;

  analyzedReport:
    AnalyzedCspReport;
}): void {
  const entry =
    createCspAuditEntry({
      requestId,
      analyzedReport,
    });

  const serialized =
    JSON.stringify(
      entry,
    );

  if (
    analyzedReport
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
  request:
    NextRequest,
): Promise<NextResponse> {
  const requestId =
    randomUUID();

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
      status:
        415,

      code:
        "unsupported_csp_report_media_type",

      message:
        "Unsupported CSP report media type.",

      requestId,
    });
  }

  if (
    isContentLengthTooLarge(
      request,
    )
  ) {
    return createErrorResponse({
      status:
        413,

      code:
        "csp_report_too_large",

      message:
        "CSP report body is too large.",

      requestId,
    });
  }

  let rawBody:
    string;

  try {
    rawBody =
      await request.text();
  } catch {
    return createErrorResponse({
      status:
        400,

      code:
        "csp_report_read_failed",

      message:
        "CSP report body could not be read.",

      requestId,
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
      status:
        413,

      code:
        "csp_report_too_large",

      message:
        "CSP report body is too large.",

      requestId,
    });
  }

  if (
    !rawBody.trim()
  ) {
    return createErrorResponse({
      status:
        400,

      code:
        "csp_report_empty",

      message:
        "CSP report body is required.",

      requestId,
    });
  }

  let payload:
    unknown;

  try {
    payload =
      JSON.parse(
        rawBody,
      );
  } catch {
    return createErrorResponse({
      status:
        400,

      code:
        "csp_report_invalid_json",

      message:
        "CSP report body must contain valid JSON.",

      requestId,
    });
  }

  const reports =
    extractCspReports(
      payload,
    );

  if (
    reports.length ===
    0
  ) {
    return createErrorResponse({
      status:
        400,

      code:
        "csp_report_invalid",

      message:
        "CSP report body is invalid.",

      requestId,
    });
  }

  const analyzedReports =
    analyzeReports(
      reports,
    );

  for (
    const analyzedReport of
    analyzedReports
  ) {
    writeCspAuditLog({
      requestId,
      analyzedReport,
    });
  }

  const actionableReports =
    analyzedReports.filter(
      (
        analyzedReport,
      ) =>
        analyzedReport
          .analysis
          .actionable,
    ).length;

  return createAcceptedResponse({
    requestId,

    acceptedReports:
      analyzedReports.length,

    actionableReports,
  });
}