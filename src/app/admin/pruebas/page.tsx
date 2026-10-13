import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { AI_MODELS, DEFAULT_MODEL, usdToClp } from "@/lib/ai-usage";
import { requireAdmin } from "@/lib/auth";
import { SCENARIOS } from "@/lib/evals/scenarios";
import { EvalRunner } from "./runner";

export default async function EvalsPage() {
  await requireAdmin();
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <Link href="/admin" className="text-sm text-gray-600 hover:underline">
        ← Administración
      </Link>
      <div className="mt-4">
        <PageHeader
          title="Prueba del vendedor IA"
          subtitle="Conversaciones típicas de clientes contra una tienda de prueba con catálogo fijo. Mide cuántas veces el vendedor hace lo correcto con el modelo elegido. Usa la IA real, así que tiene un pequeño costo."
        />
      </div>
      <EvalRunner
        scenarios={SCENARIOS.map((s) => ({ id: s.id, title: s.title }))}
        models={AI_MODELS.map((m) => ({ ...m }))}
        defaultModel={DEFAULT_MODEL}
        usdClp={usdToClp(1)}
      />
    </main>
  );
}
