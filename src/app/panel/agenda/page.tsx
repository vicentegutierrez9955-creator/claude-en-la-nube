import Link from "next/link";
import { ErrorNote, Field, PageHeader } from "@/components/ui";
import { addDays, APPOINTMENT_STATUS_LABEL, dayLabel, hhmm, localParts, localToUtc, todayYmd } from "@/lib/agenda";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatCLP } from "@/lib/format";
import { createAppointmentAction, setAppointmentStatusAction } from "../agenda-actions";

const STATUS_COLORS: Record<string, string> = {
  RESERVADA: "bg-amber-100 text-amber-800",
  CONFIRMADA: "bg-blue-100 text-blue-800",
  ASISTIO: "bg-brand-600 text-white",
  NO_ASISTIO: "bg-gray-200 text-gray-700",
  CANCELADA: "bg-red-100 text-red-700",
};

const ACTIONS: [string, string][] = [
  ["CONFIRMADA", "Confirmada"],
  ["ASISTIO", "Asistió"],
  ["NO_ASISTIO", "No asistió"],
  ["CANCELADA", "Cancelar"],
];

function StatusButton({ id, status, label }: { id: string; status: string; label: string }) {
  return (
    <form action={setAppointmentStatusAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button className={`rounded-md border px-2 py-1 text-xs ${status === "CANCELADA" ? "border-red-200 text-red-700 hover:bg-red-50" : "border-gray-200 hover:bg-gray-50"}`}>
        {label}
      </button>
    </form>
  );
}

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ dia?: string; error?: string }> }) {
  const user = await requireUser();
  const { dia, error } = await searchParams;
  const today = todayYmd();
  const day = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : today;
  const b = user.business;

  const [appointments, services, upcoming] = await Promise.all([
    db.appointment.findMany({
      where: { businessId: b.id, startsAt: { gte: localToUtc(day, 0), lt: localToUtc(addDays(day, 1), 0) } },
      orderBy: { startsAt: "asc" },
      include: { customer: true },
    }),
    db.service.findMany({ where: { businessId: b.id, active: true }, orderBy: [{ position: "asc" }, { name: "asc" }] }),
    db.appointment.findMany({
      where: { businessId: b.id, status: { in: ["RESERVADA", "CONFIRMADA"] }, startsAt: { gte: localToUtc(today, 0), lt: localToUtc(addDays(today, 7), 0) } },
      select: { startsAt: true },
    }),
  ]);
  const perDay = new Map<string, number>();
  for (const a of upcoming) perDay.set(localParts(a.startsAt).ymd, (perDay.get(localParts(a.startsAt).ymd) ?? 0) + 1);
  const active = appointments.filter((a) => a.status === "RESERVADA" || a.status === "CONFIRMADA");

  const reminderText = (a: (typeof appointments)[number]) =>
    `Hola${a.patientName ? ` ${a.patientName.split(" ")[0]}` : ""}! Te recordamos tu hora de ${a.serviceName} en ${b.name} el ${dayLabel(day)} a las ${hhmm(localParts(a.startsAt).minutes)}.${b.serviceAddress ? ` Dirección: ${b.serviceAddress}.` : ""} ¿Nos confirmas tu asistencia?`;

  return (
    <>
      <PageHeader title="Agenda" subtitle={`${dayLabel(day).replace(/^./, (c) => c.toUpperCase())}${day === today ? " · hoy" : ""}`}>
        <Link href={`/panel/agenda?dia=${addDays(day, -1)}`} className="btn-secondary">
          ← Día anterior
        </Link>
        {day !== today && (
          <Link href="/panel/agenda" className="btn-secondary">
            Hoy
          </Link>
        )}
        <Link href={`/panel/agenda?dia=${addDays(day, 1)}`} className="btn-secondary">
          Día siguiente →
        </Link>
      </PageHeader>

      <div className="mb-6 flex gap-2 overflow-x-auto">
        {Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d) => (
          <Link
            key={d}
            href={`/panel/agenda?dia=${d}`}
            className={`min-w-24 rounded-lg border px-3 py-2 text-center text-xs ${d === day ? "border-brand-500 bg-brand-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}
          >
            <span className="block font-semibold">{dayLabel(d).split(" ").slice(0, 2).join(" ")}</span>
            <span className="text-gray-600">
              {perDay.get(d) ?? 0} {(perDay.get(d) ?? 0) === 1 ? "hora" : "horas"}
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Hora</th>
                  <th className="px-3 py-2">Paciente</th>
                  <th className="px-3 py-2">Servicio</th>
                  <th className="px-3 py-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {appointments.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-10 text-center text-gray-500">
                      No hay horas reservadas este día.
                    </td>
                  </tr>
                )}
                {appointments.map((a) => (
                  <tr key={a.id} className={`border-t border-gray-100 align-top ${a.status === "CANCELADA" ? "opacity-60" : ""}`}>
                    <td className="px-3 py-3 font-semibold">
                      {hhmm(localParts(a.startsAt).minutes)}
                      <span className="block text-xs font-normal text-gray-500">#{a.number}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-medium">{a.patientName ?? a.customer.name ?? "Sin nombre"}</span>
                      <a href={`https://wa.me/${a.customer.waId}`} target="_blank" rel="noreferrer" className="block text-xs text-brand-700 hover:underline">
                        +{a.customer.waId}
                      </a>
                      {a.notes && <span className="block text-xs text-gray-500">{a.notes}</span>}
                    </td>
                    <td className="px-3 py-3">
                      {a.serviceName}
                      {a.price > 0 && <span className="block text-xs text-gray-500">{formatCLP(a.price)}</span>}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[a.status]}`}>
                        {APPOINTMENT_STATUS_LABEL[a.status]}
                      </span>
                      {a.reminderSentAt && <span className="mt-1 block text-xs text-gray-500">Recordatorio enviado</span>}
                      {a.reminderError && <span className="mt-1 block text-xs text-red-600">Recordatorio: {a.reminderError}</span>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {ACTIONS.filter(([s]) => s !== a.status).map(([s, label]) => (
                          <StatusButton key={s} id={a.id} status={s} label={label} />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {active.length > 0 && (
            <div className="card">
              <h2 className="font-bold">Recordatorios en 1 toque</h2>
              <p className="mt-1 text-sm text-gray-600">
                Se abre tu WhatsApp con el mensaje listo: solo aprietas enviar. No tiene costo.
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {active.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3">
                    <span>
                      {hhmm(localParts(a.startsAt).minutes)} · {a.patientName ?? a.customer.name ?? `+${a.customer.waId}`}
                    </span>
                    <a
                      className="btn-secondary text-xs"
                      target="_blank"
                      rel="noreferrer"
                      href={`https://wa.me/${a.customer.waId}?text=${encodeURIComponent(reminderText(a))}`}
                    >
                      Enviar recordatorio
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h2 className="font-bold">Agendar una hora</h2>
          <p className="text-sm text-gray-600">Para reservas que te llegan por teléfono o en persona.</p>
          <ErrorNote message={error} />
          {services.length === 0 ? (
            <p className="card text-sm">
              Primero agrega tus{" "}
              <Link href="/panel/servicios" className="font-semibold text-brand-700">
                servicios
              </Link>
              .
            </p>
          ) : (
            <form action={createAppointmentAction} className="card space-y-3">
              <div>
                <label className="label" htmlFor="serviceId">
                  Servicio
                </label>
                <select id="serviceId" name="serviceId" className="input">
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.durationMin} min)
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Fecha" name="fecha" type="date" defaultValue={day} required />
                <Field label="Hora" name="hora" type="time" required />
              </div>
              <Field label="Nombre" name="nombre" required />
              <Field label="Celular" name="telefono" placeholder="9 1234 5678" required />
              <Field label="Notas (opcional)" name="notas" />
              <button className="btn-primary w-full">Agendar</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
