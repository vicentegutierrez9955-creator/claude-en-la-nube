import Link from "next/link";
import { ErrorNote, Field, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCLP } from "@/lib/format";
import { saveServiceAction } from "../agenda-actions";

export default async function ServicesPage({ searchParams }: { searchParams: Promise<{ error?: string; id?: string }> }) {
  const user = await requireUser();
  const { error, id } = await searchParams;
  const services = await db.service.findMany({ where: { businessId: user.businessId }, orderBy: [{ position: "asc" }, { name: "asc" }] });
  const editing = id ? services.find((s) => s.id === id) : undefined;

  return (
    <>
      <PageHeader title="Servicios" subtitle="Lo que tus clientes pueden reservar. El asistente solo ofrece estos servicios, con estos precios y duraciones." />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card overflow-x-auto p-0 lg:col-span-3">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Servicio</th>
                <th className="px-3 py-2">Duración</th>
                <th className="px-3 py-2">Precio</th>
              </tr>
            </thead>
            <tbody>
              {services.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-10 text-center text-gray-500">
                    Agrega tu primer servicio →
                  </td>
                </tr>
              )}
              {services.map((s) => (
                <tr key={s.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <Link href={`/panel/servicios?id=${s.id}`} className="font-medium text-brand-700 hover:underline">
                      {s.name}
                    </Link>
                    {!s.active && <span className="ml-2 text-xs text-gray-500">(oculto)</span>}
                  </td>
                  <td className="px-3 py-2">{s.durationMin} min</td>
                  <td className="px-3 py-2">{s.price > 0 ? formatCLP(s.price) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-3 lg:col-span-2">
          <h2 className="font-bold">{editing ? `Editar: ${editing.name}` : "Nuevo servicio"}</h2>
          <ErrorNote message={error} />
          <form action={saveServiceAction} className="card space-y-4" key={editing?.id ?? "nuevo"}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Nombre" name="name" defaultValue={editing?.name} required placeholder="Podología general" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Duración (min)" name="durationMin" type="number" defaultValue={editing?.durationMin ?? 45} />
              <Field label="Precio (CLP)" name="price" type="number" defaultValue={editing?.price ?? 0} hint="0 = no mostrar" />
              <Field label="Orden" name="position" type="number" defaultValue={editing?.position ?? services.length + 1} />
            </div>
            <div>
              <label className="label" htmlFor="description">
                Descripción para el asistente
              </label>
              <textarea
                id="description"
                name="description"
                className="input min-h-24"
                defaultValue={editing?.description}
                placeholder="Qué incluye, para quién es, cómo prepararse..."
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} /> Se puede reservar
            </label>
            <div className="flex gap-2">
              <button className="btn-primary">{editing ? "Guardar cambios" : "Agregar servicio"}</button>
              {editing && (
                <Link href="/panel/servicios" className="btn-secondary">
                  Cancelar
                </Link>
              )}
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
