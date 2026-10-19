import { NextResponse, type NextRequest } from "next/server";
import { sendDueReminders } from "@/lib/agenda-reminders";

export const maxDuration = 300;

// Lo llama el cron de Vercel una vez al día (vercel.json). Vercel envía CRON_SECRET en el header.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse("No autorizado", { status: 401 });
  }
  return NextResponse.json(await sendDueReminders());
}
