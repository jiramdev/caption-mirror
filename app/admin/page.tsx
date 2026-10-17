import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Admin from "@/components/Admin";
import { ADMIN_COOKIE, isAdminToken } from "@/lib/server/auth";

export const metadata = { title: "Admin · Caption Mirror" };
export default async function Page() {
  if (!isAdminToken((await cookies()).get(ADMIN_COOKIE)?.value)) redirect("/login?next=/admin");
  return <Admin />;
}
