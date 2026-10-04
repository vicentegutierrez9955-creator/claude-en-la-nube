import { after, NextResponse, type NextRequest } from "next/server";
import { decryptSecret } from "@/lib/crypto";
import { db } from "@/lib/db";
import { getPayment, verifyMercadoPagoSignature } from "@/lib/mercadopago";
import { markOrderPaid } from "@/lib/orders";

export const maxDuration = 120;

// Notificaciones de pago de Mercado Pago. Cada pyme tiene su propia URL
// para saber con qué credenciales consultar el pago.
export async function POST(req: NextRequest, { params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const business = await db.business.findUnique({ where: { id: businessId } });
  if (!business) return new NextResponse("Negocio no encontrado", { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { type?: string; data?: { id?: string | number } };
  const search = req.nextUrl.searchParams;
  const type = body.type ?? search.get("type") ?? search.get("topic");
  const dataId = search.get("data.id") ?? (body.data?.id != null ? String(body.data.id) : null) ?? search.get("id");

  const secret = decryptSecret(business.mpWebhookSecret);
  if (secret) {
    const valid = verifyMercadoPagoSignature({
      xSignature: req.headers.get("x-signature"),
      xRequestId: req.headers.get("x-request-id"),
      dataId,
      secret,
    });
    if (!valid) return new NextResponse("Firma inválida", { status: 401 });
  }

  if (type !== "payment" || !dataId) return NextResponse.json({ ok: true, ignored: true });

  const accessToken = decryptSecret(business.mpAccessToken);
  if (!accessToken) return new NextResponse("Mercado Pago no configurado", { status: 409 });

  after(async () => {
    // El estado se consulta directo a Mercado Pago: la notificación por sí sola no se considera prueba de pago.
    const payment = await getPayment(accessToken, dataId);
    if (payment.status !== "approved" || !payment.external_reference) return;
    const order = await db.order.findFirst({ where: { id: payment.external_reference, businessId } });
    if (!order) return;
    if (Math.round(payment.transaction_amount) < order.total) {
      console.error(`[mercadopago] pago ${payment.id} por ${payment.transaction_amount} menor al total del pedido ${order.id}`);
      return;
    }
    await markOrderPaid(order.id, String(payment.id));
  });
  return NextResponse.json({ ok: true });
}
