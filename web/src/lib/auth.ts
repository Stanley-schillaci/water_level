import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { type SessionData, sessionOptions } from "./session";

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

export async function requireAdmin(): Promise<
  { ok: true } | { ok: false; status: number }
> {
  const s = await getSession();
  if (!s.isAdmin) return { ok: false, status: 401 };
  return { ok: true };
}
