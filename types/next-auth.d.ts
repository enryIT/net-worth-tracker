import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      isDemo: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    isDemo: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: UserRole;
    isDemo: boolean;
  }
}
