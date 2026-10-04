import { after, NextResponse, type NextRequest } from "next/server";
import { processConversation, receiveCustomerMessage } from "@/lib/conversations";
import { db } from "@/lib/db";
import { parseWhatsAppWebhook, verifyWhatsAppSignature } from "@/lib/whatsapp";

export const maxDuration = 300;

// Verificación del webhook al configurarlo en Meta.
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === expected) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Token inválido", { status: 403 });
}

// Mensajes entrantes de todos los números conectados. Se responde 200 al tiro
// y el vendedor automático trabaja después (Meta reintenta si tardamos).
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (appSecret) {
    if (!verifyWhatsAppSignature(raw, req.headers.get("x-hub-signature-256"), appSecret)) {
      return new NextResponse("Firma inválida", { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    console.error("[whatsapp] WHATSAPP_APP_SECRET no está configurado; se rechaza el webhook");
    return new NextResponse("Webhook no configurado", { status: 500 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse("JSON inválido", { status: 400 });
  }

  const toProcess = new Set<string>();
  for (const msg of parseWhatsAppWebhook(body)) {
    const business = await db.business.findUnique({ where: { whatsappPhoneNumberId: msg.phoneNumberId } });
    if (!business) {
      console.warn(`[whatsapp] número ${msg.phoneNumberId} no pertenece a ningún negocio`);
      continue;
    }
    const conversationId = await receiveCustomerMessage({
      businessId: business.id,
      waId: msg.from,
      profileName: msg.profileName,
      text: msg.text,
      waMessageId: msg.waMessageId,
      channel: "WHATSAPP",
    });
    if (conversationId) toProcess.add(conversationId);
  }

  after(async () => {
    for (const id of toProcess) await processConversation(id);
  });
  return NextResponse.json({ ok: true });
}
