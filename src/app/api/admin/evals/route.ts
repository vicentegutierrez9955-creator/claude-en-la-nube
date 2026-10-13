import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AI_MODELS } from "@/lib/ai-usage";
import { currentUser, isAdminEmail } from "@/lib/auth";
import { runScenario } from "@/lib/evals/run";

export const maxDuration = 300;

const Body = z.object({ scenarioId: z.string(), model: z.string() });

// Corre una conversación de prueba contra la IA real (se llama una vez por escenario).
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user || !isAdminEmail(user.email)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !AI_MODELS.some((m) => m.id === parsed.data.model)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  try {
    return NextResponse.json(await runScenario(parsed.data.scenarioId, parsed.data.model));
  } catch (err) {
    console.error("[evals]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
