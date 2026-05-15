import { getSession } from "@/lib/auth";
import { getThresholds } from "@/lib/db";
import AdminClient from "./_AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session.isAdmin) {
    return <AdminClient initialThresholds={[]} authed={false} />;
  }
  return <AdminClient initialThresholds={getThresholds()} authed={true} />;
}
