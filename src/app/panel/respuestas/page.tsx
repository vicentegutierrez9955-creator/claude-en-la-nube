import type { FaqEntry } from "@prisma/client";
import { ErrorNote, Field, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { deleteFaqAction, saveFaqAction } from "../actions";

function FaqForm({ faq }: { faq?: FaqEntry }) {
  return (
    <form action={saveFaqAction} className="space-y-3">
      {faq && <input type="hidden" name="id" value={faq.id} />}
      <Field label="Pregunta (como aparece en el menú)" name="question" defaultValue={faq?.question} required placeholder="¿Hacen envíos a regiones?" />
      <Field
        label="Palabras clave, separadas por coma"
        name="keywords"
        defaultValue={faq?.keywords}
        placeholder="envío, regiones, despacho, llega"
        hint="Si el mensaje del cliente contiene alguna, se responde con esta respuesta. No importan tildes, mayúsculas ni plurales."
      />
      <div>
        <label className="label" htmlFor={`answer-${faq?.id ?? "new"}`}>
          Respuesta
        </label>
        <textarea
          id={`answer-${faq?.id ?? "new"}`}
          name="answer"
          className="input min-h-24"
          defaultValue={faq?.answer}
          required
          placeholder="¡Sí! Enviamos a todo Chile con Blue Express. Llega en 2 a 5 días hábiles 🚚"
        />
      </div>
      <Field label="Orden en el menú" name="position" type="number" defaultValue={faq?.position ?? 0} />
      <button className="btn-primary">{faq ? "Guardar" : "Agregar respuesta"}</button>
    </form>
  );
}

export default async function FaqPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { error } = await searchParams;
  const faqs = await db.faqEntry.findMany({
    where: { businessId: user.businessId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });

  return (
    <>
      <PageHeader
        title="Respuestas rápidas"
        subtitle="Respuestas predeterminadas a las preguntas de siempre. Se envían al instante y no usan IA."
      />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {faqs.length === 0 && (
            <div className="card text-sm text-gray-600">
              Aún no hay respuestas. Ideas: horarios, plazos de envío, cambios y devoluciones, medios de pago, tallas, retiro en
              tienda.
            </div>
          )}
          {faqs.map((faq) => (
            <details key={faq.id} className="card">
              <summary className="cursor-pointer">
                <span className="font-semibold">{faq.question}</span>
                <span className="mt-1 block text-xs text-gray-500">Palabras clave: {faq.keywords || "—"}</span>
              </summary>
              <div className="mt-4 border-t border-gray-100 pt-4">
                <FaqForm faq={faq} />
                <form action={deleteFaqAction} className="mt-2">
                  <input type="hidden" name="id" value={faq.id} />
                  <button className="btn-danger">Eliminar</button>
                </form>
              </div>
            </details>
          ))}
        </div>
        <div className="space-y-3 lg:col-span-2">
          <h2 className="font-bold">Nueva respuesta</h2>
          <ErrorNote message={error} />
          <div className="card">
            <FaqForm />
          </div>
        </div>
      </div>
    </>
  );
}
