import { ErrorNote, Field, PageHeader } from "@/components/ui";
import { formatAppointmentTime, hhmm } from "@/lib/agenda";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/orders";
import { addTimeOffAction, removeTimeOffAction, saveScheduleAction } from "../agenda-actions";

// Lunes primero, como se lee en Chile.
const DAYS: [number, string][] = [
  [1, "Lunes"],
  [2, "Martes"],
  [3, "Miércoles"],
  [4, "Jueves"],
  [5, "Viernes"],
  [6, "Sábado"],
  [0, "Domingo"],
];

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const user = await requireUser();
  const { error, ok } = await searchParams;
  const b = user.business;
  const [hours, blocks] = await Promise.all([
    db.workingHour.findMany({ where: { businessId: b.id }, orderBy: { startMin: "asc" } }),
    db.timeOff.findMany({ where: { businessId: b.id, endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } }),
  ]);
  const publicUrl = b.slug ? `${appUrl()}/reservar/${b.slug}` : null;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Horario" subtitle="Cuándo atiendes y las reglas para reservar. Todo en hora de Chile." />
      <ErrorNote message={error} />

      <form action={saveScheduleAction} className="card space-y-5">
        <div>
          <h2 className="font-bold">Horario semanal</h2>
          <p className="mt-1 text-sm text-gray-600">Hasta dos tramos por día (por ejemplo, mañana y tarde). Deja vacío el día que no atiendes.</p>
        </div>
        <div className="space-y-2">
          {DAYS.map(([weekday, label]) => {
            const ranges = hours.filter((h) => h.weekday === weekday);
            return (
              <div key={weekday} className="grid grid-cols-[6rem_1fr_1fr] items-center gap-3 text-sm">
                <span className="font-medium">{label}</span>
                {[1, 2].map((tramo) => (
                  <div key={tramo} className="flex items-center gap-1">
                    <input
                      className="input"
                      name={`d${weekday}_${tramo}_desde`}
                      type="time"
                      defaultValue={ranges[tramo - 1] ? hhmm(ranges[tramo - 1].startMin) : ""}
                      aria-label={`${label}, tramo ${tramo}, desde`}
                    />
                    <span className="text-gray-400">a</span>
                    <input
                      className="input"
                      name={`d${weekday}_${tramo}_hasta`}
                      type="time"
                      defaultValue={ranges[tramo - 1] ? hhmm(ranges[tramo - 1].endMin) : ""}
                      aria-label={`${label}, tramo ${tramo}, hasta`}
                    />
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        <div className="grid gap-4 border-t border-gray-100 pt-4 sm:grid-cols-3">
          <Field label="Horas cada (minutos)" name="bookingStepMin" type="number" defaultValue={b.bookingStepMin} hint="Ej: 30 → 09:00, 09:30, 10:00…" />
          <Field label="Anticipación mínima (horas)" name="bookingNoticeHours" type="number" defaultValue={Math.round(b.bookingNoticeMin / 60)} />
          <Field label="Reservas hasta (días adelante)" name="bookingMaxDays" type="number" defaultValue={b.bookingMaxDays} />
        </div>
        <Field label="Dirección donde atiendes" name="serviceAddress" defaultValue={b.serviceAddress} placeholder="Av. Central 123, Estación Central" hint="Va en la confirmación de la reserva." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Dirección de tu página de reservas"
            name="slug"
            defaultValue={b.slug}
            placeholder="gustavo-parra"
            hint={publicUrl ? `Tu página: ${publicUrl}` : "Solo letras, números y guiones."}
          />
          <Field
            label="Plantilla de recordatorio (Meta)"
            name="reminderTemplate"
            defaultValue={b.reminderTemplate}
            hint="Nombre de la plantilla aprobada en WhatsApp Manager."
          />
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-primary">Guardar</button>
          {ok && <span className="text-sm text-brand-700">✓ Guardado</span>}
        </div>
      </form>

      <div className="card space-y-4">
        <div>
          <h2 className="font-bold">Bloqueos</h2>
          <p className="mt-1 text-sm text-gray-600">Vacaciones, feriados o trámites: en esos días y horas no se ofrecen horas.</p>
        </div>
        {blocks.length > 0 && (
          <ul className="divide-y divide-gray-100 text-sm">
            {blocks.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {formatAppointmentTime(t.startsAt)} → {formatAppointmentTime(t.endsAt)}
                  {t.reason && <span className="text-gray-500"> · {t.reason}</span>}
                </span>
                <form action={removeTimeOffAction}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="text-xs text-red-600 hover:underline">Quitar</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addTimeOffAction} className="grid gap-3 sm:grid-cols-5">
          <Field label="Desde (día)" name="desde" type="date" required />
          <Field label="Hora (opcional)" name="horaDesde" type="time" />
          <Field label="Hasta (día)" name="hasta" type="date" />
          <Field label="Hora (opcional)" name="horaHasta" type="time" />
          <Field label="Motivo" name="reason" placeholder="Vacaciones" />
          <div className="sm:col-span-5">
            <button className="btn-secondary">Agregar bloqueo</button>
          </div>
        </form>
      </div>
    </div>
  );
}
