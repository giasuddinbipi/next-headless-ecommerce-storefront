import {
  NextResponse,
} from "next/server";

export const runtime =
  "nodejs";

export const dynamic =
  "force-dynamic";

export const revalidate =
  0;

const HEALTH_CHECK_TYPE =
  "liveness";

const RESPONSE_HEADERS = {
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
    HEALTH_CHECK_TYPE,
} as const;

export async function GET():
  Promise<NextResponse> {
  return NextResponse.json(
    {
      status:
        "alive",

      check:
        HEALTH_CHECK_TYPE,

      checkedAt:
        new Date()
          .toISOString(),
    },
    {
      status:
        200,

      headers:
        RESPONSE_HEADERS,
    },
  );
}

export async function HEAD():
  Promise<NextResponse> {
  return new NextResponse(
    null,
    {
      status:
        200,

      headers:
        RESPONSE_HEADERS,
    },
  );
}