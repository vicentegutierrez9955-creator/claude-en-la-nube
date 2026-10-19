"use client";

import { useEffect, useState } from "react";

type Service = { id: string; name: string; durationMin: number; price: number; description: string };
type Day = { ymd: string; label: string; times: { iso: string; label: string }[] };
type Booked = { number: number; when: string; startsAt: string; endsAt: string; service: string };

const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

function icsDate(iso: string) {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Archivo de calendario con alarmas 1 día y 2 horas antes: el celular le recuerda la hora al paciente.
function icsFile(b: Booked, businessName: string, address: string) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pedidos al Toque//Agenda//ES",
    "BEGIN:VEVENT",
    `UID:cita-${b.number}-${icsDate(b.startsAt)}@agenda`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(b.startsAt)}`,
    `DTEND:${icsDate(b.endsAt)}`,
    `SUMMARY:${b.service} · ${businessName}`,
    address ? `LOCATION:${address.replace(/,/g, "\\,")}` : "",
    "BEGIN:VALARM",
    "TRIGGER:-P1D",
    "ACTION:DISPLAY",
    "DESCRIPTION:Mañana tienes hora",
    "END:VALARM",
    "BEGIN:VALARM",
    "TRIGGER:-PT2H",
    "ACTION:DISPLAY",
    "DESCRIPTION:Tu hora es en 2 horas",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join("\r\n"))}`;
}

function googleCalendarUrl(b: Booked, businessName: string, address: string) {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: `${b.service} · ${businessName}`,
    dates: `${icsDate(b.startsAt)}/${icsDate(b.endsAt)}`,
    location: address,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function BookingForm({
  slug,
  businessName,
  address,
  services,
  whatsappReminder,
}: {
  slug: string;
  businessName: string;
  address: string;
  services: Service[];
  whatsappReminder: boolean;
}) {
  const [serviceId, setServiceId] = useState(services.length === 1 ? services[0].id : "");
  const [days, setDays] = useState<Day[] | null>(null);
  const [day, setDay] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [booked, setBooked] = useState<Booked | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!serviceId) return;
    setDays(null);
    setDay("");
    setTime("");
    fetch(`/api/reservas/${slug}?servicio=${serviceId}`)
      .then((r) => r.json())
      .then((j: { days?: Day[]; error?: string }) => {
        if (j.error) setError(j.error);
        setDays(j.days ?? []);
        if (j.days?.length) setDay(j.days[0].ymd);
      })
      .catch(() => setError("No pudimos cargar las horas. Intenta de nuevo."));
  }, [serviceId, slug, reload]);

  async function submit(form: FormData) {
    setError("");
    setSending(true);
    try {
      const r = await fetch(`/api/reservas/${slug}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ servicio: serviceId, hora: time, nombre: form.get("nombre"), telefono: form.get("telefono"), web: form.get("web") }),
      });
      const j = await r.json();
      // La hora la tomó otra persona: se recargan las horas libres.
      if (r.status === 409) setReload((n) => n + 1);
      if (!r.ok || !j.ok) throw new Error(j.error ?? "No se pudo reservar. Intenta de nuevo.");
      setBooked(j);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo reservar.");
    } finally {
      setSending(false);
    }
  }

  if (booked) {
    return (
      <div className="card space-y-4 text-center">
        <div className="text-5xl">✅</div>
        <h2 className="text-xl font-bold">¡Hora reservada!</h2>
        <p className="text-gray-700">
          {booked.service} · <strong>{booked.when}</strong>
          {address && <span className="block text-sm text-gray-500">📍 {address}</span>}
        </p>
        <p className="text-sm text-gray-600">
          {whatsappReminder ? "Te enviaremos un recordatorio por WhatsApp el día anterior. " : ""}Guárdala en tu calendario para que tu
          celular te avise:
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <a className="btn-primary" href={icsFile(booked, businessName, address)} download={`hora-${booked.number}.ics`}>
            Agregar a mi calendario
          </a>
          <a className="btn-secondary" href={googleCalendarUrl(booked, businessName, address)} target="_blank" rel="noreferrer">
            Google Calendar
          </a>
        </div>
      </div>
    );
  }

  const selectedDay = days?.find((d) => d.ymd === day);
  return (
    <form action={submit} className="space-y-6">
      <section className="space-y-2">
        <h2 className="font-bold">1. Elige el servicio</h2>
        <div className="grid gap-2">
          {services.map((s) => (
            <label key={s.id} className={`card flex cursor-pointer items-start gap-3 p-4 ${serviceId === s.id ? "border-brand-500 bg-brand-50" : ""}`}>
              <input type="radio" name="servicio" value={s.id} checked={serviceId === s.id} onChange={() => setServiceId(s.id)} className="mt-1" />
              <span>
                <span className="font-semibold">{s.name}</span>
                <span className="block text-sm text-gray-600">
                  {s.durationMin} min{s.price > 0 ? ` · ${clp.format(s.price)}` : ""}
                </span>
                {s.description && <span className="mt-1 block text-sm text-gray-500">{s.description}</span>}
              </span>
            </label>
          ))}
        </div>
      </section>

      {serviceId && (
        <section className="space-y-3">
          <h2 className="font-bold">2. Elige día y hora</h2>
          {days === null && <p className="text-sm text-gray-500">Buscando horas libres…</p>}
          {days?.length === 0 && <p className="text-sm text-gray-600">No quedan horas libres en las próximas dos semanas.</p>}
          {days && days.length > 0 && (
            <>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {days.map((d) => (
                  <button
                    key={d.ymd}
                    type="button"
                    onClick={() => {
                      setDay(d.ymd);
                      setTime("");
                    }}
                    className={`min-w-28 rounded-lg border px-3 py-2 text-sm capitalize ${d.ymd === day ? "border-brand-500 bg-brand-50 font-semibold" : "border-gray-200 bg-white"}`}
                  >
                    {d.label.split(" ").slice(0, 2).join(" ")}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {selectedDay?.times.map((t) => (
                  <button
                    key={t.iso}
                    type="button"
                    onClick={() => setTime(t.iso)}
                    className={`rounded-lg border px-2 py-2 text-sm ${time === t.iso ? "border-brand-600 bg-brand-600 font-semibold text-white" : "border-gray-200 bg-white"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {time && (
        <section className="space-y-3">
          <h2 className="font-bold">3. Tus datos</h2>
          <div>
            <label className="label" htmlFor="nombre">
              Nombre y apellido
            </label>
            <input id="nombre" name="nombre" className="input" required autoComplete="name" maxLength={80} />
          </div>
          <div>
            <label className="label" htmlFor="telefono">
              Celular (WhatsApp)
            </label>
            <input id="telefono" name="telefono" className="input" required inputMode="tel" autoComplete="tel" placeholder="9 1234 5678" maxLength={20} />
          </div>
          <div className="hidden" aria-hidden="true">
            <input name="web" tabIndex={-1} autoComplete="off" />
          </div>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className="btn-primary w-full" disabled={sending}>
            {sending ? "Reservando…" : "Reservar hora"}
          </button>
        </section>
      )}
      {!time && error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
    </form>
  );
}
