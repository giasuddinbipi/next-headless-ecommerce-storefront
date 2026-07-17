import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { z } from "zod";

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .max(120),

  password: z
    .string()
    .min(8)
    .max(128),
});

type WordPressLoginResponse = {
  success: boolean;

  user: {
    id: number;
    email: string;
    name: string;
    firstName: string;
    lastName: string;
  };
};

function getRequiredEnvironmentVariable(
  name: string,
): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value;
}

export const {
  handlers,
  auth,
  signIn,
  signOut,
} = NextAuth({
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },

  pages: {
    signIn: "/login",
  },

  providers: [
    Credentials({
      name: "Customer account",

      credentials: {
        email: {
          label: "Email",
          type: "email",
        },

        password: {
          label: "Password",
          type: "password",
        },
      },

      async authorize(credentials) {
        const parsed =
          loginSchema.safeParse(
            credentials,
          );

        if (!parsed.success) {
          return null;
        }

        const cmsUrl =
          getRequiredEnvironmentVariable(
            "WOOCOMMERCE_URL",
          ).replace(/\/$/, "");

        const sharedSecret =
          getRequiredEnvironmentVariable(
            "HEADLESS_STORE_SHARED_SECRET",
          );

        const response = await fetch(
          `${cmsUrl}/wp-json/headless-store/v1/login`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "X-Headless-Store-Key":
                sharedSecret,
            },

            body: JSON.stringify({
              email: parsed.data.email,
              password:
                parsed.data.password,
            }),

            cache: "no-store",
          },
        );

        if (!response.ok) {
          return null;
        }

        const data =
          (await response.json()) as
            WordPressLoginResponse;

        if (
          !data.success ||
          !data.user?.id ||
          !data.user.email
        ) {
          return null;
        }

        return {
          id: String(data.user.id),
          customerId: data.user.id,
          email: data.user.email,
          name: data.user.name,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.customerId =
          user.customerId;
      }

      return token;
    },

    async session({
      session,
      token,
    }) {
      if (session.user) {
        session.user.id =
          token.sub ?? "";

        session.user.customerId =
          typeof token.customerId ===
          "number"
            ? token.customerId
            : 0;
      }

      return session;
    },
  },
});