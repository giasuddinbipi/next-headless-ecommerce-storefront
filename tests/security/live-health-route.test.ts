import {
  describe,
  expect,
  it,
} from "vitest";

import {
  GET,
  HEAD,
} from "@/app/api/health/live/route";

/* =========================================================
   Types and helpers
========================================================= */

type UnknownRecord =
  Record<string, unknown>;

function isObject(
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

async function readJsonResponse(
  response:
    Response,
): Promise<UnknownRecord> {
  const data:
    unknown =
    await response.json();

  if (!isObject(data)) {
    throw new Error(
      "Expected a JSON object response.",
    );
  }

  return data;
}

/* =========================================================
   GET liveness tests
========================================================= */

describe(
  "GET /api/health/live",
  () => {
    it(
      "returns a public HTTP 200 liveness response",
      async () => {
        const response =
          await GET();

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          response.status,
        ).toBe(
          200,
        );

        expect(
          data,
        ).toMatchObject({
          status:
            "alive",

          check:
            "liveness",
        });

        expect(
          data.checkedAt,
        ).toEqual(
          expect.any(
            String,
          ),
        );

        expect(
          String(
            data.checkedAt,
          ),
        ).toMatch(
          /^\d{4}-\d{2}-\d{2}T/,
        );
      },
    );

    it(
      "does not expose readiness or deployment information",
      async () => {
        const response =
          await GET();

        const data =
          await readJsonResponse(
            response,
          );

        expect(
          data.dependencies,
        ).toBeUndefined();

        expect(
          data.environment,
        ).toBeUndefined();

        expect(
          data.release,
        ).toBeUndefined();

        expect(
          data.redis,
        ).toBeUndefined();

        expect(
          data.woocommerce,
        ).toBeUndefined();

        expect(
          data.token,
        ).toBeUndefined();

        expect(
          data.secret,
        ).toBeUndefined();
      },
    );

    it(
      "returns secure no-cache response headers",
      async () => {
        const response =
          await GET();

        expect(
          response.headers.get(
            "cache-control",
          ),
        ).toContain(
          "no-store",
        );

        expect(
          response.headers.get(
            "pragma",
          ),
        ).toBe(
          "no-cache",
        );

        expect(
          response.headers.get(
            "expires",
          ),
        ).toBe(
          "0",
        );

        expect(
          response.headers.get(
            "x-content-type-options",
          ),
        ).toBe(
          "nosniff",
        );

        expect(
          response.headers.get(
            "x-robots-tag",
          ),
        ).toContain(
          "noindex",
        );

        expect(
          response.headers.get(
            "x-health-check-type",
          ),
        ).toBe(
          "liveness",
        );
      },
    );

    it(
      "returns JSON content",
      async () => {
        const response =
          await GET();

        expect(
          response.headers.get(
            "content-type",
          ),
        ).toContain(
          "application/json",
        );
      },
    );
  },
);

/* =========================================================
   HEAD liveness tests
========================================================= */

describe(
  "HEAD /api/health/live",
  () => {
    it(
      "returns HTTP 200 without a response body",
      async () => {
        const response =
          await HEAD();

        expect(
          response.status,
        ).toBe(
          200,
        );

        expect(
          await response.text(),
        ).toBe(
          "",
        );
      },
    );

    it(
      "returns the same health and cache headers",
      async () => {
        const response =
          await HEAD();

        expect(
          response.headers.get(
            "cache-control",
          ),
        ).toContain(
          "no-store",
        );

        expect(
          response.headers.get(
            "x-content-type-options",
          ),
        ).toBe(
          "nosniff",
        );

        expect(
          response.headers.get(
            "x-robots-tag",
          ),
        ).toContain(
          "noindex",
        );

        expect(
          response.headers.get(
            "x-health-check-type",
          ),
        ).toBe(
          "liveness",
        );
      },
    );
  },
);