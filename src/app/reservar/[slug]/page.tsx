import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { BookingForm } from "./booking-form";

async function load(slug: string) {
  return db.business.findFirst({
    where: { slug, kind: "AGENDA" },
    select: {
      name: true,
      serviceAddress: true,
      whatsappPhoneNumberId: true,
      services: { where: { active: true }, orderBy: [{ position: "asc" }, { name: "asc" }], select: { id: true, name: true, durationMin: true, price: true, description: true } },
    },
  });
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const business = await load((await params).slug);
  return { title: business ? `Reserva tu hora · ${business.name}` : "Reserva tu hora" };
}

// Página pública para reservar: se enlaza desde la web del negocio, Instagram o Google Maps.
export default async function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await load(slug);
  if (!business) notFound();
  return (
    <main className="mx-auto min-h-screen max-w-xl px-4 py-10">
      <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">Reserva tu hora</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{business.name}</h1>
      {business.serviceAddress && <p className="mt-2 text-gray-600">📍 {business.serviceAddress}</p>}
      <div className="mt-8">
        {business.services.length === 0 ? (
          <p className="card text-gray-600">Por ahora no hay horas disponibles para reservar en línea.</p>
        ) : (
          <BookingForm
            slug={slug}
            businessName={business.name}
            address={business.serviceAddress}
            services={business.services}
            whatsappReminder={Boolean(business.whatsappPhoneNumberId)}
          />
        )}
      </div>
      <p className="mt-10 text-center text-xs text-gray-400">
        Tus datos se usan solo para gestionar tu hora. <a href="/privacidad" className="underline">Privacidad</a>
      </p>
    </main>
  );
}
