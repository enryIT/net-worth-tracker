import "server-only";

import type { UserRole } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/server/auth/nextAuthOptions";

export class AuthSessionError extends Error {
  constructor(
    message: string,
    public readonly code: "UNAUTHENTICATED" | "DEMO_READONLY"
  ) {
    super(message);
    this.name = "AuthSessionError";
  }
}

export type AuthenticatedUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: UserRole;
  isDemo: boolean;
};

export async function requireUserSession(): Promise<AuthenticatedUser> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new AuthSessionError("Autenticazione richiesta.", "UNAUTHENTICATED");
  }

  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role,
    isDemo: session.user.isDemo,
  };
}

export function assertWritableUser(user: AuthenticatedUser): void {
  if (user.isDemo) {
    throw new AuthSessionError(
      "Non disponibile in modalita demo.",
      "DEMO_READONLY"
    );
  }
}
