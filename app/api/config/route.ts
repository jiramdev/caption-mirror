import { NextResponse } from "next/server";
import { HOSTED } from "@/lib/server/store";
import { workerUrl } from "@/lib/server/worker";
export const dynamic = "force-dynamic";
export async function GET() {
  const analysis = HOSTED ? !!(await workerUrl()) : true; // can a pasted link be analyzed right now?
  return NextResponse.json({ hosted: HOSTED, analysis });
}
