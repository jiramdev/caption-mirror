import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Results from "@/components/Results";
import { ADMIN_COOKIE, isAdminToken } from "@/lib/server/auth";

export const metadata = { title: "Results · Caption Mirror" };
export default async function Page() {
  if (!isAdminToken((await cookies()).get(ADMIN_COOKIE)?.value)) redirect("/login?next=/results");
  return <Results />;
}
