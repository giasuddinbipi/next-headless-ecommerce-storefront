import type {
  DefaultSession,
} from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      customerId: number;
    } & DefaultSession["user"];
  }

  interface User {
    customerId: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    customerId?: number;
  }
}