import "server-only";

import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/server/prisma";
import {
  authorizeLocalCredentials,
  LocalAuthError,
} from "@/lib/server/auth/localAuthService";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Email e password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totpCode: { label: "Codice 2FA", type: "text" },
        recoveryCode: { label: "Codice di recupero", type: "text" },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        try {
          const user = await authorizeLocalCredentials({
            email: credentials.email,
            password: credentials.password,
            totpCode: credentials.totpCode || undefined,
            recoveryCode: credentials.recoveryCode || undefined,
            ipAddress: request?.headers?.["x-forwarded-for"],
            userAgent: request?.headers?.["user-agent"],
          });

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            isDemo: user.isDemo,
          };
        } catch (error) {
          if (error instanceof LocalAuthError) {
            throw new Error(error.code);
          }

          throw error;
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.isDemo = user.isDemo;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.isDemo = token.isDemo;
      }

      return session;
    },
  },
};
