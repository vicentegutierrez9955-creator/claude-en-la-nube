"use client";

import { useState } from "react";
import type { EvalResult } from "@/lib/evals/run";

type Model = { id: string; label: string; note: string };

const AUTHOR = { CLIENTE: "Cliente", BOT: "Vendedor IA", MENU: "Sistema", HUMANO: "Equipo", SISTEMA: "Aviso" } as Record<string, string>;

export function EvalRunner({
  scenarios,
  models,
  defaultModel,
  usdClp,
}: {
  scenarios: { id: string; title: string }[];
  models: Model[];
  defaultModel: string;
  usdClp: number;
}) {
  const [model, setModel] = useState(defaultModel);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Resumen en texto para pegarlo en el chat con Claude: aciertos y el chat completo de cada falla.
  async function copyResults() {
    const ok = results.filter((r) => r.passed).length;
    const total = results.reduce((s, r) => s + r.costUsd, 0);
    const lines = [
      `Prueba del vendedor IA — modelo ${model}`,
      `Aciertos: ${ok}/${results.length} · costo US$${total.toFixed(4)}`,
      "",
      ...results.map((r) => `${r.passed ? "OK " : "FALLA"} ${r.title}${r.passed ? "" : ` — ${r.failures.join(" · ")}`}`),
    ];
    for (const r of results.filter((x) => !x.passed)) {
      lines.push("", `--- ${r.title} ---`, ...r.transcript.map((m) => `${AUTHOR[m.author] ?? m.author}: ${m.text}`));
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      window.prompt("Copia este texto:", lines.join("\n"));
    }
  }

  async function run() {
    setRunning(true);
    setResults([]);
    for (const s of scenarios) {
      setCurrent(s.title);
      try {
        const res = await fetch("/api/admin/evals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scenarioId: s.id, model }),
        });
        const data = await res.json();
        const result: EvalResult = res.ok
          ? data
          : { id: s.id, title: s.title, passed: false, failures: [data.error ?? `Error ${res.status}`], transcript: [], costUsd: 0, ms: 0, error: data.error };
        setResults((r) => [...r, result]);
      } catch (err) {
        setResults((r) => [...r, { id: s.id, title: s.title, passed: false, failures: [String(err)], transcript: [], costUsd: 0, ms: 0, error: String(err) }]);
      }
    }
    setCurrent(null);
    setRunning(false);
  }

  const passed = results.filter((r) => r.passed).length;
  const cost = results.reduce((s, r) => s + r.costUsd, 0);
  const avgSeconds = results.length ? results.reduce((s, r) => s + r.ms, 0) / results.length / 1000 : 0;
  const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-end gap-3">
        <div>
          <label className="label" htmlFor="model">
            Modelo a probar
          </label>
          <select id="model" className="input w-auto" value={model} onChange={(e) => setModel(e.target.value)} disabled={running}>
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} — {m.note}
              </option>
            ))}
          </select>
        </div>
        <button className="btn-primary" onClick={run} disabled={running}>
          {running ? "Probando…" : `Correr ${scenarios.length} conversaciones de prueba`}
        </button>
        {running && current && <p className="text-sm text-gray-600">Ahora: {current}</p>}
        {!running && results.length > 0 && (
          <button className="btn-secondary" onClick={copyResults}>
            {copied ? "✓ Copiado: pégalo en el chat" : "📋 Copiar resultados"}
          </button>
        )}
      </div>

      {results.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card">
            <p className="text-sm text-gray-600">Aciertos</p>
            <p className="mt-1 text-3xl font-bold">
              {passed}/{results.length}
              <span className="ml-2 text-lg text-gray-500">({Math.round((passed / results.length) * 100)}%)</span>
            </p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-600">Costo de la prueba</p>
            <p className="mt-1 text-3xl font-bold">{clp.format(Math.round(cost * usdClp))}</p>
            <p className="text-xs text-gray-500">US${cost.toFixed(4)}</p>
          </div>
          <div className="card">
            <p className="text-sm text-gray-600">Tiempo promedio por conversación</p>
            <p className="mt-1 text-3xl font-bold">{avgSeconds.toFixed(1)} s</p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {results.map((r) => (
          <details key={r.id} className={`card p-4 ${r.passed ? "" : "border-red-200"}`}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2">
              <span>{r.passed ? "✅" : "❌"}</span>
              <span className="font-medium">{r.title}</span>
              {!r.passed && <span className="text-sm text-red-700">— {r.failures.join(" · ")}</span>}
            </summary>
            <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
              {r.transcript.map((m, i) => (
                <p key={i} className="whitespace-pre-wrap">
                  <span className="font-semibold">{AUTHOR[m.author] ?? m.author}:</span> {m.text}
                </p>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
