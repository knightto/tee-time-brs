import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { generateMemberCode } from "@/lib/member-code";

type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  role: UserRole;
  memberCode: string;
};

function passcodeAllowed(input?: string | null) {
  const memberPasscode = process.env.MEMBER_PASSCODE;
  const adminPasscode = process.env.ADMIN_PASSCODE;

  if (!input) {
    return null;
  }

  if (adminPasscode && input === adminPasscode) {
    return UserRole.ADMIN;
  }

  if (memberPasscode && input === memberPasscode) {
    return UserRole.MEMBER;
  }

  if (!memberPasscode && process.env.NODE_ENV !== "production") {
    return UserRole.MEMBER;
  }

  return null;
}

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      name: "Passcode",
      credentials: {
        email: { label: "Email", type: "email" },
        passcode: { label: "Passcode", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim().toLowerCase();
        const passcode = credentials?.passcode?.trim();

        if (!email) {
          return null;
        }

        const role = passcodeAllowed(passcode);
        if (!role) {
          return null;
        }

        const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
        const finalRole = adminEmail && email === adminEmail ? UserRole.ADMIN : role;

        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          const memberCode = await generateMemberCode();
          user = await prisma.user.create({
            data: {
              email,
              role: finalRole,
              memberCode,
            },
          });
        } else if (finalRole === UserRole.ADMIN && user.role !== UserRole.ADMIN) {
          user = await prisma.user.update({
            where: { id: user.id },
            data: { role: UserRole.ADMIN },
          });
        }

        const authUser: AuthUser = {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          role: user.role,
          memberCode: user.memberCode,
        };

        return authUser;
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user && "role" in user) {
        const authUser = user as AuthUser;
        token.role = authUser.role;
        token.memberCode = authUser.memberCode;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role;
        session.user.memberCode = token.memberCode;
      }
      return session;
    },
  },
  pages: {
    signIn: "/signin",
  },
};
