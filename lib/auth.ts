import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { SQLiteAdapter } from "@/lib/adapter";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: SQLiteAdapter(),
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
      checks: ["pkce"],
    }),
  ],
  trustHost: true,
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
