import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Library from "@/components/Library";
import { ADMIN_COOKIE, isAdminToken } from "@/lib/server/auth";

export const metadata = { title: "Test library · Caption Mirror" };
export default async function Page() {
  if (!isAdminToken((await cookies()).get(ADMIN_COOKIE)?.value)) redirect("/login?next=/test/library");
  return <Library />;
}
