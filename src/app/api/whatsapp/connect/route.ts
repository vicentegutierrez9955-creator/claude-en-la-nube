import { Prisma } from "@prisma/client";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { connectWhatsApp, MetaError } from "@/lib/meta";

const Body = z.object({
  code: z.string().min(1),
  wabaId: z.string().min(1),
  phoneNumberId: z.string().nullish(),
  coexistence: z.boolean(),
});

// Lo llama el botón "Conectar WhatsApp" al terminar la ventana de Meta.
export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Sesión expirada, vuelve a entrar." }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Datos de conexión incompletos." }, { status: 400 });

  try {
    const result = await connectWhatsApp(parsed.data);
    await db.business.update({
      where: { id: user.businessId },
      data: {
        whatsappPhoneNumberId: result.phoneNumberId,
        whatsappAccessToken: encryptSecret(result.accessToken),
        whatsappWabaId: result.wabaId,
        whatsappDisplayPhone: result.displayPhone,
        whatsappCoexistence: parsed.data.coexistence,
        whatsappPin: result.pin ? encryptSecret(result.pin) : null,
        whatsappConnectedAt: new Date(),
      },
    });
    return NextResponse.json({ ok: true, displayPhone: result.displayPhone });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Ese número ya está conectado a otra cuenta." }, { status: 409 });
    }
    if (err instanceof MetaError) {
      return NextResponse.json({ error: `Meta no permitió la conexión: ${err.message}` }, { status: 502 });
    }
    console.error("[whatsapp] error conectando", err);
    return NextResponse.json({ error: "No se pudo conectar. Intenta de nuevo." }, { status: 500 });
  }
}
