import { NextResponse } from "next/server";
import { HOSTED } from "@/lib/server/store";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ hosted: HOSTED }); }
