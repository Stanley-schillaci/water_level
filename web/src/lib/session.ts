import type { SessionOptions } from "iron-session";

export type SessionData = { isAdmin?: boolean };

export const sessionOptions: SessionOptions = {
  password:
    process.env.SESSION_PASSWORD ??
    "fallback-only-for-dev-do-not-use-in-prod-32chars",
  cookieName: "lac-session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "strict",
    maxAge: 60 * 60 * 24 * 7,
  },
};
