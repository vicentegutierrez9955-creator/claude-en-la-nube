import { NextResponse, type NextRequest } from "next/server";
import { AgendaError, availableSlots, bookAppointment, dayLabel, formatAppointmentTime, hhmm, localParts } from "@/lib/agenda";
import { db } from "@/lib/db";

// API de la página pública de reservas (/reservar/<slug>).
// GET ?servicio=<id>&desde=AAAA-MM-DD → horas libres. POST → reserva.

const MAX_ACTIVE_PER_PHONE = 3;

async function findBusiness(slug: string) {
  return db.business.findFirst({ where: { slug, kind: "AGENDA" } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const business = await findBusiness((await params).slug);
  if (!business) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });
  const serviceId = req.nextUrl.searchParams.get("servicio") ?? "";
  const desde = req.nextUrl.searchParams.get("desde") ?? undefined;
  try {
    const days = await availableSlots({ businessId: business.id, serviceId, fromYmd: desde, days: 14 });
    return NextResponse.json({
      days: days
        .filter((d) => d.times.length > 0)
        .map((d) => ({ ymd: d.ymd, label: dayLabel(d.ymd), times: d.times.map((t) => ({ iso: t.toISOString(), label: hhmm(localParts(t).minutes) })) })),
    });
  } catch (err) {
    if (err instanceof AgendaError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== req.nextUrl.origin) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const business = await findBusiness((await params).slug);
  if (!business) return NextResponse.json({ error: "Negocio no encontrado" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  // Trampa para bots: el campo oculto "web" debe venir vacío.
  if (String(body.web ?? "").trim()) return NextResponse.json({ ok: true });
  const name = String(body.nombre ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 80);
  const digits = String(body.telefono ?? "").replace(/\D/g, "");
  const waId = digits.length === 9 ? `56${digits}` : digits;
  const startsAt = new Date(String(body.hora ?? ""));
  if (name.length < 3) return NextResponse.json({ error: "Escribe tu nombre y apellido." }, { status: 400 });
  if (!/^569\d{8}$/.test(waId)) return NextResponse.json({ error: "Revisa tu celular: debe ser chileno, como 9 1234 5678." }, { status: 400 });
  if (Number.isNaN(startsAt.getTime())) return NextResponse.json({ error: "Elige una hora." }, { status: 400 });

  const customer = await db.customer.upsert({
    where: { businessId_waId: { businessId: business.id, waId } },
    create: { businessId: business.id, waId, name },
    update: {},
  });
  const active = await db.appointment.count({
    where: { customerId: customer.id, status: { in: ["RESERVADA", "CONFIRMADA"] }, startsAt: { gte: new Date() } },
  });
  if (active >= MAX_ACTIVE_PER_PHONE) {
    return NextResponse.json({ error: "Ya tienes varias horas reservadas. Escríbenos por WhatsApp si necesitas otra." }, { status: 429 });
  }

  try {
    const appointment = await bookAppointment({
      businessId: business.id,
      customerId: customer.id,
      serviceId: String(body.servicio ?? ""),
      startsAt,
      source: "WEB",
      patientName: name,
    });
    return NextResponse.json({
      ok: true,
      number: appointment.number,
      when: formatAppointmentTime(appointment.startsAt),
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
      service: appointment.serviceName,
    });
  } catch (err) {
    if (err instanceof AgendaError) return NextResponse.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
