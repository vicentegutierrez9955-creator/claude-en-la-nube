"use server";

import type { AppointmentStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AgendaError, bookAppointment, localToUtc, parseHhmm } from "@/lib/agenda";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

function str(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}
function int(form: FormData, key: string, fallback = 0) {
  const n = Number(str(form, key).replace(/[.$\s]/g, ""));
  return Number.isFinite(n) && str(form, key) !== "" ? Math.round(n) : fallback;
}
const back = (path: string, error?: string) => redirect(error ? `${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}` : path);

// ---------- Servicios ----------

export async function saveServiceAction(form: FormData) {
  const user = await requireUser();
  const id = str(form, "id");
  const data = {
    name: str(form, "name").slice(0, 80),
    description: str(form, "description").slice(0, 1000),
    durationMin: Math.min(Math.max(int(form, "durationMin", 45), 5), 600),
    price: Math.max(int(form, "price"), 0),
    position: int(form, "position"),
    active: form.get("active") === "on",
  };
  if (!data.name) back("/panel/servicios", "El nombre del servicio es obligatorio");
  if (id) await db.service.updateMany({ where: { id, businessId: user.businessId }, data });
  else await db.service.create({ data: { ...data, businessId: user.businessId } });
  revalidatePath("/panel/servicios");
  back("/panel/servicios");
}

// ---------- Horario y reglas de reserva ----------

export async function saveScheduleAction(form: FormData) {
  const user = await requireUser();
  const hours: { weekday: number; startMin: number; endMin: number }[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    for (const tramo of [1, 2]) {
      const start = parseHhmm(str(form, `d${weekday}_${tramo}_desde`));
      const end = parseHhmm(str(form, `d${weekday}_${tramo}_hasta`));
      if (start === null && end === null) continue;
      if (start === null || end === null || end <= start) {
        back("/panel/horario", "Revisa los horarios: cada tramo necesita hora de inicio y de término (ej: 09:00 a 13:00).");
      }
      hours.push({ weekday, startMin: start!, endMin: end! });
    }
  }
  const slug = str(form, "slug")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  try {
    await db.$transaction([
      db.workingHour.deleteMany({ where: { businessId: user.businessId } }),
      db.workingHour.createMany({ data: hours.map((h) => ({ ...h, businessId: user.businessId })) }),
      db.business.update({
        where: { id: user.businessId },
        data: {
          bookingStepMin: Math.min(Math.max(int(form, "bookingStepMin", 30), 5), 240),
          bookingNoticeMin: Math.min(Math.max(int(form, "bookingNoticeHours", 2) * 60, 0), 14 * 24 * 60),
          bookingMaxDays: Math.min(Math.max(int(form, "bookingMaxDays", 30), 1), 180),
          serviceAddress: str(form, "serviceAddress").slice(0, 200),
          reminderTemplate: str(form, "reminderTemplate").slice(0, 100) || "recordatorio_hora",
          slug: slug || null,
        },
      }),
    ]);
  } catch {
    back("/panel/horario", "No se pudo guardar. ¿Esa dirección de la página de reservas ya la usa otro negocio?");
  }
  revalidatePath("/panel/horario");
  back("/panel/horario?ok=1");
}

export async function addTimeOffAction(form: FormData) {
  const user = await requireUser();
  const desde = str(form, "desde");
  const hasta = str(form, "hasta") || desde;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || hasta < desde) {
    back("/panel/horario", "Revisa las fechas del bloqueo.");
  }
  const startTime = parseHhmm(str(form, "horaDesde")) ?? 0;
  const endTime = parseHhmm(str(form, "horaHasta")) ?? 24 * 60;
  const startsAt = localToUtc(desde, startTime);
  const endsAt = localToUtc(hasta, endTime);
  if (endsAt <= startsAt) back("/panel/horario", "El bloqueo debe terminar después de empezar.");
  await db.timeOff.create({ data: { businessId: user.businessId, startsAt, endsAt, reason: str(form, "reason").slice(0, 120) } });
  revalidatePath("/panel/horario");
  back("/panel/horario");
}

export async function removeTimeOffAction(form: FormData) {
  const user = await requireUser();
  await db.timeOff.deleteMany({ where: { id: str(form, "id"), businessId: user.businessId } });
  revalidatePath("/panel/horario");
}

// ---------- Citas ----------

export async function setAppointmentStatusAction(form: FormData) {
  const user = await requireUser();
  const status = str(form, "status") as AppointmentStatus;
  if (!["RESERVADA", "CONFIRMADA", "CANCELADA", "ASISTIO", "NO_ASISTIO"].includes(status)) return;
  await db.appointment.updateMany({
    where: { id: str(form, "id"), businessId: user.businessId },
    data: { status, cancelledAt: status === "CANCELADA" ? new Date() : null },
  });
  revalidatePath("/panel/agenda");
}

// Cita agendada por el profesional (por teléfono o en persona).
export async function createAppointmentAction(form: FormData) {
  const user = await requireUser();
  const day = str(form, "fecha");
  const minutes = parseHhmm(str(form, "hora"));
  const path = `/panel/agenda?dia=${day}`;
  const phone = str(form, "telefono").replace(/\D/g, "");
  const waId = phone.length === 9 ? `56${phone}` : phone;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || minutes === null) back(path, "Revisa la fecha y la hora.");
  if (!/^569\d{8}$/.test(waId)) back(path, "El teléfono debe ser un celular chileno, como 9 1234 5678.");
  const name = str(form, "nombre");
  if (name.length < 2) back(path, "Escribe el nombre de quien se atiende.");
  const customer = await db.customer.upsert({
    where: { businessId_waId: { businessId: user.businessId, waId } },
    create: { businessId: user.businessId, waId, name },
    update: {},
  });
  try {
    await bookAppointment({
      businessId: user.businessId,
      customerId: customer.id,
      serviceId: str(form, "serviceId"),
      startsAt: localToUtc(day, minutes!),
      source: "PANEL",
      patientName: name,
      notes: str(form, "notas"),
      force: true,
    });
  } catch (err) {
    if (err instanceof AgendaError) back(path, err.message);
    throw err;
  }
  revalidatePath("/panel/agenda");
  back(path);
}
