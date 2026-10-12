import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ShipmentRequest } from "./types";

// Etiqueta 10x15 cm (4x6"), el formato de las impresoras térmicas.
const W = 288;
const H = 432;

// Las fuentes estándar de PDF solo soportan WinAnsi: quitamos emojis y otros símbolos.
function clean(text: string): string {
  return text.replace(/[^\x20-\x7E -ÿ]/g, "").trim();
}

export async function renderLabelPdf(req: ShipmentRequest, carrier: string, trackingNumber: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Etiqueta pedido ${req.orderNumber}`);
  const page = pdf.addPage([W, H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);

  // y es la parte de arriba de la próxima línea; cada línea baja según su propio tamaño.
  let y = H - 14;
  const line = (text: string, size = 10, f = font, x = 14) => {
    for (const chunk of wrap(clean(text), f, size, W - x - 14)) {
      y -= size;
      page.drawText(chunk, { x, y, size, font: f, color: black });
      y -= 4;
    }
  };
  const rule = () => {
    y -= 2;
    page.drawLine({ start: { x: 10, y }, end: { x: W - 10, y }, thickness: 1, color: black });
    y -= 8;
  };

  page.drawRectangle({ x: 6, y: 6, width: W - 12, height: H - 12, borderColor: black, borderWidth: 1.5 });
  line(carrier.toUpperCase(), 16, bold);
  line(`Pedido #${req.orderNumber}  ·  ${req.packages.pieces} bulto(s)  ·  ${(req.packages.weightGrams / 1000).toFixed(1)} kg`, 9);
  rule();

  line("DESTINATARIO", 8, bold);
  line(req.recipient.name, 14, bold);
  line(`${req.recipient.street} ${req.recipient.number}${req.recipient.apartment ? `, ${req.recipient.apartment}` : ""}`, 12);
  line(`${req.recipient.comuna.toUpperCase()}`, 18, bold);
  line(req.recipient.region, 10);
  line(`Tel: ${req.recipient.phone}${req.recipient.rut ? `   RUT: ${req.recipient.rut}` : ""}`, 10);
  if (req.recipient.notes) line(`Ref: ${req.recipient.notes}`, 9);
  rule();

  line("REMITENTE", 8, bold);
  line(req.origin.name || req.businessName, 10, bold);
  line(`${req.origin.address}, ${req.origin.comuna}`, 9);
  if (req.origin.phone) line(`Tel: ${req.origin.phone}`, 9);
  rule();

  line("N° DE SEGUIMIENTO", 8, bold);
  line(trackingNumber, 22, bold);
  drawPseudoBarcode(page, trackingNumber, 14, y - 44, W - 28, 40);

  return pdf.save();
}

function wrap(text: string, font: { widthOfTextAtSize(t: string, s: number): number }, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

// Barras decorativas para la etiqueta de prueba (no es un código escaneable).
function drawPseudoBarcode(
  page: import("pdf-lib").PDFPage,
  seed: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  let cursor = x;
  let i = 0;
  while (cursor < x + width) {
    const code = seed.charCodeAt(i % seed.length) + i;
    const bar = 1 + (code % 3);
    const gap = 1 + ((code >> 2) % 2);
    page.drawRectangle({ x: cursor, y, width: bar, height, color: rgb(0, 0, 0) });
    cursor += bar + gap;
    i++;
  }
}
