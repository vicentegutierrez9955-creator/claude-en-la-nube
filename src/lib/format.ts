const clp = new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });

export function formatCLP(amount: number): string {
  return clp.format(amount);
}

export function formatDate(date: Date): string {
  return date.toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  BORRADOR: "Carrito",
  PENDIENTE_PAGO: "Esperando pago",
  PAGADO: "Pagado",
  ETIQUETA_LISTA: "Etiqueta lista",
  DESPACHADO: "Despachado",
  ENTREGADO: "Entregado",
  CANCELADO: "Cancelado",
};
