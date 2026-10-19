import type { AppointmentSource, Prisma } from "@prisma/client";
import { db } from "./db";

// Agenda de los negocios que atienden con hora (podólogos, kinesiólogos, barberías...).
// Todo horario se interpreta en la hora de Chile, con su cambio de horario de verano.

export const TIME_ZONE = "America/Santiago";

export class AgendaError extends Error {}

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

// Fecha (AAAA-MM-DD), día de la semana y minutos desde la medianoche, en hora de Chile.
export function localParts(date: Date): { ymd: string; weekday: number; minutes: number } {
  const p = Object.fromEntries(parts.formatToParts(date).map((x) => [x.type, x.value]));
  return {
    ymd: `${p.year}-${p.month}-${p.day}`,
    weekday: WEEKDAYS[p.weekday],
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

function offsetMs(date: Date): number {
  const { ymd, minutes } = localParts(date);
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 0, minutes) - Math.floor(date.getTime() / 60000) * 60000;
}

// Instante que corresponde a una fecha y hora de Chile.
export function localToUtc(ymd: string, minutes: number): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  let result = guess - offsetMs(new Date(guess));
  result = guess - offsetMs(new Date(result));
  return new Date(result);
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function weekdayOf(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function todayYmd(now = new Date()): string {
  return localParts(now).ymd;
}

export function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function parseHhmm(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2})(?::|\.|h)?(\d{2})?\s*(?:hrs?|horas?)?$/i);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// "martes 21 de octubre"
export function dayLabel(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number);
  return `${DIAS[weekdayOf(ymd)]} ${d} de ${MESES[m - 1]}`;
}

// "martes 21 de octubre a las 10:30"
export function formatAppointmentTime(date: Date): string {
  const { ymd, minutes } = localParts(date);
  return `${dayLabel(ymd)} a las ${hhmm(minutes)}`;
}

export type DaySlots = { ymd: string; times: Date[] };

type Busy = { startsAt: Date; endsAt: Date };

function overlaps(a: Busy, start: Date, end: Date) {
  return a.startsAt < end && a.endsAt > start;
}

// Horas libres para un servicio, día por día, desde `fromYmd` durante `days` días.
export async function availableSlots(opts: {
  businessId: string;
  serviceId: string;
  fromYmd?: string;
  days?: number;
  now?: Date;
  tx?: Prisma.TransactionClient;
}): Promise<DaySlots[]> {
  const client = opts.tx ?? db;
  const now = opts.now ?? new Date();
  const business = await client.business.findUniqueOrThrow({ where: { id: opts.businessId } });
  const service = await client.service.findFirst({ where: { id: opts.serviceId, businessId: opts.businessId, active: true } });
  if (!service) throw new AgendaError("Ese servicio no existe o ya no está disponible.");

  const today = todayYmd(now);
  const lastDay = addDays(today, business.bookingMaxDays);
  const from = opts.fromYmd && opts.fromYmd > today ? opts.fromYmd : today;
  if (from > lastDay) return [];
  const until = [addDays(from, Math.min(Math.max(opts.days ?? 7, 1), 31)), addDays(lastDay, 1)].sort()[0];

  const rangeStart = localToUtc(from, 0);
  const rangeEnd = localToUtc(until, 0);
  const [hours, appointments, blocks] = await Promise.all([
    client.workingHour.findMany({ where: { businessId: business.id } }),
    client.appointment.findMany({
      where: { businessId: business.id, status: { not: "CANCELADA" }, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
      select: { startsAt: true, endsAt: true },
    }),
    client.timeOff.findMany({
      where: { businessId: business.id, startsAt: { lt: rangeEnd }, endsAt: { gt: rangeStart } },
      select: { startsAt: true, endsAt: true },
    }),
  ]);
  const busy: Busy[] = [...appointments, ...blocks];
  const earliest = new Date(now.getTime() + business.bookingNoticeMin * 60000);
  const step = Math.max(5, business.bookingStepMin);

  const out: DaySlots[] = [];
  for (let ymd = from; ymd < until; ymd = addDays(ymd, 1)) {
    const weekday = weekdayOf(ymd);
    const times: Date[] = [];
    const ranges = hours.filter((h) => h.weekday === weekday).sort((a, b) => a.startMin - b.startMin);
    for (const range of ranges) {
      for (let t = range.startMin; t + service.durationMin <= range.endMin; t += step) {
        const start = localToUtc(ymd, t);
        const end = new Date(start.getTime() + service.durationMin * 60000);
        if (start < earliest) continue;
        if (busy.some((b) => overlaps(b, start, end))) continue;
        times.push(start);
      }
    }
    out.push({ ymd, times });
  }
  return out;
}

// Reserva una hora. Revisa dentro de una transacción con candado por negocio que la hora
// siga libre, para que dos clientes no tomen la misma.
export async function bookAppointment(input: {
  businessId: string;
  customerId: string;
  conversationId?: string | null;
  serviceId: string;
  startsAt: Date;
  source: AppointmentSource;
  patientName?: string | null;
  notes?: string;
  now?: Date;
  // El panel puede agendar fuera de la anticipación mínima o sobre un bloqueo (lo decide el dueño).
  force?: boolean;
}) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.businessId}))`;
    const service = await tx.service.findFirst({ where: { id: input.serviceId, businessId: input.businessId } });
    if (!service) throw new AgendaError("Ese servicio no existe.");
    const endsAt = new Date(input.startsAt.getTime() + service.durationMin * 60000);

    if (input.force) {
      const clash = await tx.appointment.findFirst({
        where: { businessId: input.businessId, status: { not: "CANCELADA" }, startsAt: { lt: endsAt }, endsAt: { gt: input.startsAt } },
      });
      if (clash) throw new AgendaError(`Esa hora choca con la cita #${clash.number}.`);
    } else {
      const { ymd } = localParts(input.startsAt);
      const [day] = await availableSlots({
        businessId: input.businessId,
        serviceId: service.id,
        fromYmd: ymd,
        days: 1,
        now: input.now,
        tx,
      });
      const free = day && day.ymd === ymd && day.times.some((t) => t.getTime() === input.startsAt.getTime());
      if (!free) throw new AgendaError("Esa hora ya no está disponible. Elige otra, por favor.");
    }

    const business = await tx.business.update({
      where: { id: input.businessId },
      data: { appointmentSeq: { increment: 1 } },
    });
    return tx.appointment.create({
      data: {
        businessId: input.businessId,
        number: business.appointmentSeq,
        customerId: input.customerId,
        conversationId: input.conversationId ?? null,
        serviceId: service.id,
        serviceName: service.name,
        price: service.price,
        startsAt: input.startsAt,
        endsAt,
        source: input.source,
        patientName: input.patientName?.trim().slice(0, 80) || null,
        notes: input.notes?.slice(0, 500) ?? "",
      },
    });
  });
}

export async function cancelAppointment(appointmentId: string) {
  return db.appointment.update({
    where: { id: appointmentId },
    data: { status: "CANCELADA", cancelledAt: new Date() },
  });
}

// Próximas citas de un cliente (no canceladas).
export function upcomingAppointments(customerId: string, now = new Date()) {
  return db.appointment.findMany({
    where: { customerId, startsAt: { gte: now }, status: { in: ["RESERVADA", "CONFIRMADA"] } },
    orderBy: { startsAt: "asc" },
    take: 5,
  });
}

// El último nombre con que el cliente reservó, para ofrecer reusarlo.
export async function lastPatientName(customerId: string): Promise<string | null> {
  const last = await db.appointment.findFirst({
    where: { customerId, patientName: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  return last?.patientName ?? null;
}

export const APPOINTMENT_STATUS_LABEL: Record<string, string> = {
  RESERVADA: "Reservada",
  CONFIRMADA: "Confirmada",
  CANCELADA: "Cancelada",
  ASISTIO: "Asistió",
  NO_ASISTIO: "No asistió",
};

// Texto de confirmación que recibe el cliente.
export function confirmationText(a: { number: number; serviceName: string; startsAt: Date; patientName: string | null }, business: { name: string; serviceAddress: string }): string {
  return [
    `✅ *¡Hora reservada!* (#${a.number})`,
    `${a.serviceName} en *${business.name}*`,
    `📅 ${formatAppointmentTime(a.startsAt)}`,
    a.patientName ? `👤 A nombre de ${a.patientName}` : null,
    business.serviceAddress ? `📍 ${business.serviceAddress}` : null,
    "",
    "El día anterior te enviaremos un recordatorio. Si necesitas cancelar, escríbenos por aquí.",
  ]
    .filter((l) => l !== null)
    .join("\n");
}
