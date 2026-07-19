import {
  describe,
  expect,
  it,
} from "vitest";

describe(
  "Vitest security test environment",
  () => {
    it(
      "runs tests in the Node environment",
      () => {
        expect(
          process.release.name,
        ).toBe(
          "node",
        );
      },
    );

    it(
      "supports Web Request and Response APIs",
      () => {
        const request =
          new Request(
            "https://store.example/api/orders",
            {
              method:
                "POST",
            },
          );

        const response =
          new Response(
            JSON.stringify({
              success:
                true,
            }),
            {
              status:
                201,
            },
          );

        expect(
          request.method,
        ).toBe(
          "POST",
        );

        expect(
          response.status,
        ).toBe(
          201,
        );
      },
    );

    it(
      "resolves project path aliases",
      async () => {
        const auditModule =
          await import(
            "@/lib/request-audit"
          );

        expect(
          auditModule
            .createRequestAuditContext,
        ).toBeTypeOf(
          "function",
        );
      },
    );
  },
);