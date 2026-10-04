import { NextResponse, type NextRequest } from "next/server";
import { PDFDocument } from "pdf-lib";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

// Junta las etiquetas de los pedidos seleccionados en un solo PDF para imprimir de una vez.
export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return new NextResponse("No autorizado", { status: 401 });

  const ids = req.nextUrl.searchParams.getAll("ids").flatMap((v) => v.split(",")).filter(Boolean);
  const orders = await db.order.findMany({
    where: { businessId: user.businessId, id: { in: ids }, labelPdf: { not: null } },
    orderBy: { number: "asc" },
  });
  if (orders.length === 0) {
    return new NextResponse("Ninguno de los pedidos seleccionados tiene etiqueta todavía.", { status: 404 });
  }

  const merged = await PDFDocument.create();
  for (const order of orders) {
    const src = await PDFDocument.load(order.labelPdf!);
    const pages = await merged.copyPages(src, src.getPageIndices());
    pages.forEach((p) => merged.addPage(p));
  }
  await db.order.updateMany({ where: { id: { in: orders.map((o) => o.id) } }, data: { labelPrintedAt: new Date() } });

  const bytes = await merged.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="etiquetas-${new Date().toISOString().slice(0, 10)}.pdf"`,
    },
  });
}
