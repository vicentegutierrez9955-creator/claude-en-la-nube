import type { Business, Customer, FaqEntry, Prisma, Product } from "@prisma/client";
import { contentWords, normalize, searchCatalog, stem } from "./catalog";
import { db } from "./db";
import { formatCLP } from "./format";
import { sendToCustomer } from "./messaging";
import {
  checkout,
  formatAddress,
  getOrCreateCart,
  lastShippingData,
  OrderError,
  orderSummary,
  recalcTotals,
  recentOrdersText,
  REGIONES_CHILE,
  setCartItem,
  setShippingData,
  type OrderWithItems,
} from "./orders";

// Vendedor de respuestas predeterminadas: un menú con números que lleva al cliente
// desde el saludo hasta el link de pago sin usar IA (costo cero por mensaje).

type Step =
  | "MENU"
  | "CATALOGO"
  | "PRODUCTO"
  | "CARRITO"
  | "REUSAR_DIRECCION"
  | "NOMBRE"
  | "DIRECCION"
  | "NUMERO"
  | "DEPTO"
  | "COMUNA"
  | "REGION"
  | "CONFIRMAR"
  | "FAQ";

export type MenuState = {
  step?: Step;
  // Quién atiende en modo híbrido: el menú o la IA.
  engine?: "menu" | "ia";
  // ids de lo que se mostró numerado, para saber qué eligió el cliente.
  options?: string[];
  productId?: string;
  misses?: number;
  // "envio": la IA le pasó al sistema la toma de datos de envío; al terminar, vuelve a la IA.
  flow?: "envio";
  updatedAt?: string;
};

// Pasos de la toma de datos de envío. Lo que se conversa aquí es privado: la IA no lo ve.
export const SHIPPING_FLOW_STEPS: Step[] = ["REUSAR_DIRECCION", "NOMBRE", "DIRECCION", "NUMERO", "DEPTO", "COMUNA", "REGION", "CONFIRMAR"];

export function inShippingFlow(state: MenuState): boolean {
  if (state.flow !== "envio" || !state.step || !SHIPPING_FLOW_STEPS.includes(state.step)) return false;
  return !!state.updatedAt && Date.now() - new Date(state.updatedAt).getTime() < STATE_TTL_MS;
}

// Pasos donde el cliente escribe datos libres: no se buscan palabras clave ahí.
const FREE_TEXT_STEPS: Step[] = ["NOMBRE", "DIRECCION", "NUMERO", "DEPTO", "COMUNA"];
const STATE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_LIST = 15;

function parseNumber(text: string): number | null {
  const m = normalize(text).match(/^(?:opcion |numero |el |la )?(\d{1,3})$/);
  return m ? Number(m[1]) : null;
}

const MENU_WORDS = ["menu", "inicio", "volver", "volver al menu", "atras", "cancelar", "salir"];
const HUMAN_WORDS = ["persona", "humano", "ejecutivo", "ejecutiva", "asesor", "asesora", "hablar con alguien", "operador"];
const GREETINGS = /^(hola|holi|holaa+|buenas|buenos dias|buenas tardes|buenas noches|alo|hey|wena|wenas|que tal)\b/;
const YES = /^(si|sii+|sip|ya|dale|ok|okay|bueno|claro|confirmo|1)$/;
const NO = /^(no|nop|nones|2)$/;

function contentWordsAfterGreeting(n: string): string[] {
  return contentWords(n.replace(GREETINGS, "").trim());
}

function isGreetingOnly(n: string) {
  return GREETINGS.test(n) && contentWordsAfterGreeting(n).length === 0;
}

function containsPhrase(n: string, phrase: string) {
  const p = stem(normalize(phrase));
  return p.length > 0 && ` ${stem(n)} `.includes(` ${p} `);
}

export function matchFaq(text: string, faqs: FaqEntry[]): FaqEntry | null {
  const n = normalize(text);
  for (const faq of faqs) {
    const keywords = faq.keywords.split(",").map((k) => k.trim()).filter(Boolean);
    if (keywords.some((k) => containsPhrase(n, k))) return faq;
  }
  return null;
}

function searchProducts(businessId: string, text: string): Promise<Product[]> {
  if (contentWordsAfterGreeting(normalize(text)).length === 0) return Promise.resolve([]);
  return searchCatalog(businessId, text, MAX_LIST);
}

type Ctx = {
  business: Business;
  customer: Customer;
  conversationId: string;
  state: MenuState;
  faqs: FaqEntry[];
  allowAi: boolean;
};

type Reply = { text: string; state: MenuState } | { useAi: true };

function menuOptions(faqs: FaqEntry[]) {
  const options: [string, string][] = [
    ["catalogo", "🛍️ Ver productos"],
    ["carrito", "🛒 Mi carrito y pagar"],
    ["pedidos", "📦 Estado de mi pedido"],
  ];
  if (faqs.length > 0) options.push(["faq", "❓ Preguntas frecuentes"]);
  options.push(["persona", "🙋 Hablar con una persona"]);
  return options;
}

function menuText(ctx: Ctx, intro?: string): Reply {
  const options = menuOptions(ctx.faqs);
  const lines = options.map(([, label], i) => `*${i + 1}.* ${label}`);
  return {
    text: `${intro ? `${intro}\n\n` : ""}Responde con el número de lo que necesitas:\n${lines.join("\n")}\n\n_Escribe *menú* cuando quieras volver aquí._`,
    state: { step: "MENU", options: options.map(([k]) => k), engine: "menu" },
  };
}

function welcome(ctx: Ctx): string {
  return ctx.business.welcomeMessage.trim() || `¡Hola! 👋 Bienvenido/a a *${ctx.business.name}*.`;
}

function productList(products: Product[], intro: string): Reply {
  const lines = products.map((p, i) => `*${i + 1}.* ${p.name} — ${formatCLP(p.price)}${p.stock <= 0 ? " _(agotado)_" : ""}`);
  return {
    text: `${intro}\n${lines.join("\n")}\n\nResponde con el número del producto, o escribe lo que buscas.`,
    state: { step: "CATALOGO", options: products.map((p) => p.id) },
  };
}

async function catalog(ctx: Ctx, intro = "🛍️ *Nuestros productos:*"): Promise<Reply> {
  const products = await db.product.findMany({
    where: { businessId: ctx.business.id, active: true, stock: { gt: 0 } },
    orderBy: { name: "asc" },
    take: MAX_LIST,
  });
  if (products.length === 0) {
    return menuText(ctx, "Por ahora no tenemos productos disponibles 😕");
  }
  const total = await db.product.count({ where: { businessId: ctx.business.id, active: true, stock: { gt: 0 } } });
  const more = total > products.length ? `\n_(Mostrando ${products.length} de ${total}. Escribe el nombre de lo que buscas para filtrar.)_` : "";
  const reply = productList(products, intro + more);
  return reply;
}

function productDetail(p: Product): Reply {
  return {
    text: `*${p.name}*\n${formatCLP(p.price)}${p.description ? `\n${p.description}` : ""}\nStock disponible: ${p.stock}\n\n¿Cuántas unidades quieres? Responde con un número (o *0* para volver a los productos).`,
    state: { step: "PRODUCTO", productId: p.id },
  };
}

function cartText(cart: OrderWithItems, intro = "🛒 *Tu carrito:*"): Reply {
  return {
    text: `${intro}\n${orderSummary(cart)}\n\n*1.* Seguir comprando\n*2.* Finalizar compra\n*3.* Vaciar carrito`,
    state: { step: "CARRITO" },
  };
}

function regionsText(): string {
  return `¿En qué región? Responde con el número:\n${REGIONES_CHILE.map((r, i) => `*${i + 1}.* ${r}`).join("\n")}`;
}

function parseRegion(text: string): string | null {
  const num = parseNumber(text);
  if (num && num >= 1 && num <= REGIONES_CHILE.length) return REGIONES_CHILE[num - 1];
  const n = normalize(text);
  if (/\b(rm|santiago|metropolitana|stgo)\b/.test(n)) return "Metropolitana de Santiago";
  if (/\b(ohiggins|o higgins|rancagua)\b/.test(n)) return "Libertador General Bernardo O'Higgins";
  if (/\b(aysen|aisen|coyhaique)\b/.test(n)) return "Aysén del General Carlos Ibáñez del Campo";
  if (/\b(magallanes|punta arenas)\b/.test(n)) return "Magallanes y de la Antártica Chilena";
  if (/\b(araucania|temuco)\b/.test(n)) return "La Araucanía";
  if (/\b(bio ?bio|concepcion)\b/.test(n)) return "Biobío";
  return REGIONES_CHILE.find((r) => n.length >= 4 && (normalize(r).includes(n) || n.includes(normalize(r)))) ?? null;
}

// "Av. Libertad 870" → calle "Av. Libertad", número "870"
export function splitStreet(text: string): { street: string; number: string | null } {
  const clean = text.trim().replace(/\s+/g, " ");
  // Primero, número al final ("Calle 5 Oriente 1234"); si no, el primer número ("Los Aromos 45, Viña").
  const m = clean.match(/^(.*?\D)\s*(\d+[a-zA-Z]?)$/) ?? clean.match(/^(.*?\D)\s*(\d+[a-zA-Z]?)\b/);
  if (m) {
    const street = m[1].replace(/[\s,#°º.]+$/, "").replace(/\s+n$/i, "").trim();
    if (street.length >= 2) return { street, number: m[2] };
  }
  return { street: clean, number: null };
}

async function confirmText(ctx: Ctx): Promise<Reply> {
  const cart = await getOrCreateCart(ctx.conversationId);
  return {
    text: `Revisa tu pedido 👇\n${orderSummary(cart)}\n\n📦 Envío a *${cart.recipientName}*\n${formatAddress(cart)}\n\n*1.* Confirmar y pagar\n*2.* Cambiar datos de envío\n*3.* Seguir comprando`,
    state: { step: "CONFIRMAR" },
  };
}

async function startCheckout(ctx: Ctx): Promise<Reply> {
  const cart = await getOrCreateCart(ctx.conversationId);
  if (cart.items.length === 0) return catalog(ctx, "Tu carrito está vacío. Mira nuestros productos 👇");
  const prev = await lastShippingData(ctx.customer.id);
  if (prev) {
    return {
      text: `¿Enviamos a la misma dirección de tu compra anterior?\n*${prev.recipientName}*\n${formatAddress({ ...prev })}\n\n*1.* Sí, a esa dirección\n*2.* No, a otra`,
      state: { step: "REUSAR_DIRECCION" },
    };
  }
  return { text: "¡Vamos! 📦 ¿A nombre de quién va el envío? (nombre y apellido)", state: { step: "NOMBRE" } };
}

async function handleMenuChoice(ctx: Ctx, key: string): Promise<Reply> {
  switch (key) {
    case "catalogo":
      return catalog(ctx);
    case "carrito": {
      const cart = await getOrCreateCart(ctx.conversationId);
      if (cart.items.length === 0) return catalog(ctx, "Tu carrito está vacío. Mira nuestros productos 👇");
      return cartText(cart);
    }
    case "pedidos": {
      const text = await recentOrdersText(ctx.customer.id);
      return menuText(ctx, `📦 ${text}`);
    }
    case "faq": {
      const lines = ctx.faqs.map((f, i) => `*${i + 1}.* ${f.question}`);
      return {
        text: `❓ *Preguntas frecuentes*\n${lines.join("\n")}\n\nResponde con el número de tu pregunta.`,
        state: { step: "FAQ", options: ctx.faqs.map((f) => f.id) },
      };
    }
    default:
      return menuText(ctx);
  }
}

async function handOff(ctx: Ctx, reason: string): Promise<Reply> {
  await db.conversation.update({
    where: { id: ctx.conversationId },
    data: { mode: "HUMANO", needsHuman: true, humanUntil: null, handoffReason: reason },
  });
  return { text: "¡Listo! Una persona del equipo te va a responder por aquí en breve 🙌", state: { step: "MENU" } };
}

// Cuando el menú no entiende: busca productos por las palabras, deriva a la IA
// (en modo híbrido) o vuelve a mostrar las opciones.
async function notUnderstood(ctx: Ctx, text: string, again: () => Promise<Reply> | Reply): Promise<Reply> {
  if (ctx.state.flow !== "envio") {
    const found = await searchProducts(ctx.business.id, text);
    if (found.length > 0) return productList(found, "Encontré esto 👇");
    if (ctx.allowAi) return { useAi: true };
  }
  const misses = (ctx.state.misses ?? 0) + 1;
  const base = await again();
  if ("useAi" in base) return base;
  const hint = misses >= 2 ? "\n\nSi prefieres, escribe *persona* y te atiende alguien del equipo." : "";
  return { text: `No te entendí 🙈 ${base.text}${hint}`, state: { ...base.state, misses } };
}

// Devuelve la conversación a la IA (fin de la toma de datos de envío).
function backToAi(text: string): Reply {
  return { text, state: { engine: "ia" } };
}

async function step(ctx: Ctx, text: string): Promise<Reply> {
  const n = normalize(text);
  const num = parseNumber(text);
  const current = ctx.state.step;
  const flow = ctx.state.flow === "envio";

  // Comandos que funcionan en cualquier momento.
  if (flow && MENU_WORDS.includes(n)) {
    return backToAi("Listo, dejamos los datos de envío para después. ¿En qué más te puedo ayudar?");
  }
  if (MENU_WORDS.includes(n)) return menuText(ctx);
  if (HUMAN_WORDS.some((w) => containsPhrase(n, w))) return handOff(ctx, "El cliente pidió hablar con una persona");

  // Primer mensaje (o conversación retomada después de un día).
  if (!current) {
    if (num === null) {
      const faq = matchFaq(text, ctx.faqs);
      if (faq) return menuText(ctx, `${welcome(ctx)}\n\n${faq.answer}`);
      if (!isGreetingOnly(n)) {
        const found = await searchProducts(ctx.business.id, text);
        if (found.length > 0) return productList(found, `${welcome(ctx)}\n\nEncontré esto 👇`);
        if (ctx.allowAi) return { useAi: true };
      }
    }
    return menuText(ctx, welcome(ctx));
  }

  // En el carrito, "pagar" o "finalizar" cierran la compra (antes que la pregunta frecuente de pagos).
  if (current === "CARRITO" && /^(quiero )?(pagar|finalizar|comprar|terminar|listo)$/.test(n)) return startCheckout(ctx);

  // Preguntas frecuentes por palabra clave (salvo cuando el cliente escribe datos de envío).
  if (num === null && !flow && !FREE_TEXT_STEPS.includes(current)) {
    const faq = matchFaq(text, ctx.faqs);
    if (faq) {
      return { text: `${faq.answer}\n\n_Escribe *menú* para ver las opciones._`, state: ctx.state };
    }
  }

  switch (current) {
    case "MENU": {
      const options = menuOptions(ctx.faqs).map(([k]) => k);
      if (num !== null && num >= 1 && num <= options.length) {
        const key = options[num - 1];
        if (key === "persona") return handOff(ctx, "El cliente pidió hablar con una persona");
        return handleMenuChoice(ctx, key);
      }
      if (isGreetingOnly(n)) return menuText(ctx, welcome(ctx));
      return notUnderstood(ctx, text, () => menuText(ctx));
    }

    case "CATALOGO": {
      const ids = ctx.state.options ?? [];
      if (num !== null && num >= 1 && num <= ids.length) {
        const product = await db.product.findFirst({ where: { id: ids[num - 1], businessId: ctx.business.id, active: true } });
        if (!product) return catalog(ctx, "Ese producto ya no está disponible. Mira los que tenemos 👇");
        if (product.stock <= 0) return catalog(ctx, `😕 *${product.name}* está agotado. Mira los demás 👇`);
        return productDetail(product);
      }
      if (num === 0) return menuText(ctx);
      const found = await searchProducts(ctx.business.id, text);
      if (found.length > 0) return productList(found, "Encontré esto 👇");
      if (ctx.allowAi && num === null) return { useAi: true };
      return catalog(ctx, `No encontré productos con "${text.slice(0, 40)}". Estos son los que tenemos 👇`);
    }

    case "PRODUCTO": {
      if (num === 0) return catalog(ctx);
      const product = ctx.state.productId
        ? await db.product.findFirst({ where: { id: ctx.state.productId, businessId: ctx.business.id } })
        : null;
      if (!product) return catalog(ctx);
      if (num === null || num < 1) {
        return notUnderstood(ctx, text, () => productDetail(product));
      }
      try {
        const cart = await setCartItem(ctx.conversationId, product.id, num);
        return cartText(cart, `✅ Agregado: ${num} x ${product.name}\n\n🛒 *Tu carrito:*`);
      } catch (err) {
        if (err instanceof OrderError) {
          return { text: `${err.message} ¿Cuántas quieres? (o *0* para volver)`, state: ctx.state };
        }
        throw err;
      }
    }

    case "CARRITO": {
      if (num === 1) return catalog(ctx);
      if (num === 2) return startCheckout(ctx);
      if (num === 3) {
        const cart = await getOrCreateCart(ctx.conversationId);
        await db.orderItem.deleteMany({ where: { orderId: cart.id } });
        await recalcTotals(cart.id);
        return menuText(ctx, "🗑️ Vaciamos tu carrito.");
      }
      return notUnderstood(ctx, text, async () => cartText(await getOrCreateCart(ctx.conversationId)));
    }

    case "REUSAR_DIRECCION": {
      if (YES.test(n)) {
        const prev = await lastShippingData(ctx.customer.id);
        if (prev) {
          await setShippingData(ctx.conversationId, prev);
          return confirmText(ctx);
        }
      }
      if (NO.test(n) || YES.test(n)) {
        return { text: "📦 ¿A nombre de quién va el envío? (nombre y apellido)", state: { step: "NOMBRE" } };
      }
      return notUnderstood(ctx, text, async () => (await startCheckout(ctx)) as Reply);
    }

    case "NOMBRE": {
      if (text.trim().length < 3) return { text: "¿Me escribes el nombre y apellido de quien recibe?", state: ctx.state };
      await setShippingData(ctx.conversationId, {
        recipientName: text.trim().slice(0, 80),
        recipientPhone: ctx.customer.waId,
      });
      return { text: "¿Cuál es la *calle y número*? Ej: Av. Libertad 870", state: { step: "DIRECCION" } };
    }

    case "DIRECCION": {
      const { street, number } = splitStreet(text);
      if (street.length < 2) return { text: "¿Me escribes la calle y el número? Ej: Av. Libertad 870", state: ctx.state };
      await setShippingData(ctx.conversationId, { street: street.slice(0, 120), streetNumber: number ?? undefined });
      if (!number) return { text: `¿Y cuál es el *número* de ${street}?`, state: { step: "NUMERO" } };
      return { text: "¿Es depto, casa o block? Escribe el detalle (ej: *Depto 302*) o *no* si no aplica.", state: { step: "DEPTO" } };
    }

    case "NUMERO": {
      const m = text.match(/\d+[a-zA-Z]?/);
      if (!m && !/^s\/?n$/i.test(text.trim())) return { text: "¿Cuál es el número de la dirección? (o *S/N* si no tiene)", state: ctx.state };
      await setShippingData(ctx.conversationId, { streetNumber: m ? m[0] : "S/N" });
      return { text: "¿Es depto, casa o block? Escribe el detalle (ej: *Depto 302*) o *no* si no aplica.", state: { step: "DEPTO" } };
    }

    case "DEPTO": {
      const none = /^(no|n|nop|no aplica|ninguno|-|casa|0)$/.test(n);
      await setShippingData(ctx.conversationId, { apartment: none ? null : text.trim().slice(0, 60) });
      return { text: "¿En qué *comuna*?", state: { step: "COMUNA" } };
    }

    case "COMUNA": {
      if (n.length < 3) return { text: "¿Me escribes la comuna?", state: ctx.state };
      const comuna = text.trim().replace(/\s+/g, " ").slice(0, 60);
      await setShippingData(ctx.conversationId, { comuna });
      return { text: regionsText(), state: { step: "REGION" } };
    }

    case "REGION": {
      const region = parseRegion(text);
      if (!region) return { text: `No reconocí la región. ${regionsText()}`, state: ctx.state };
      await setShippingData(ctx.conversationId, { region });
      return confirmText(ctx);
    }

    case "CONFIRMAR": {
      if (num === 1 || /^(confirmo|confirmar|si|pagar)$/.test(n)) {
        try {
          await checkout(ctx.conversationId, "MENU");
          if (flow) return backToAi("Cuando se confirme tu pago te avisaremos por aquí 🙌");
          return {
            text: "Cuando se confirme tu pago te avisaremos por aquí 🙌 Escribe *menú* si necesitas algo más.",
            state: { step: "MENU", options: menuOptions(ctx.faqs).map(([k]) => k) },
          };
        } catch (err) {
          if (err instanceof OrderError) {
            if (flow) return backToAi(`😕 ${err.message} ¿Quieres cambiar algo de tu pedido?`);
            return cartText(await getOrCreateCart(ctx.conversationId), `😕 ${err.message}\n\n🛒 *Tu carrito:*`);
          }
          throw err;
        }
      }
      if (num === 2) return { text: "📦 ¿A nombre de quién va el envío? (nombre y apellido)", state: { step: "NOMBRE" } };
      if (num === 3) return flow ? backToAi("¡Dale! ¿Qué más te gustaría agregar?") : catalog(ctx);
      return notUnderstood(ctx, text, () => confirmText(ctx));
    }

    case "FAQ": {
      const ids = ctx.state.options ?? [];
      if (num !== null && num >= 1 && num <= ids.length) {
        const faq = ctx.faqs.find((f) => f.id === ids[num - 1]);
        if (faq) {
          return { text: `${faq.answer}\n\n_Elige otra pregunta con su número o escribe *menú*._`, state: ctx.state };
        }
      }
      return notUnderstood(ctx, text, () => handleMenuChoice(ctx, "faq"));
    }
  }
}

export type MenuResult = { result: "handled" | "use_ai"; private: boolean };

// Atiende un mensaje del cliente con el menú. Devuelve "use_ai" cuando el menú no
// entiende y el negocio está en modo híbrido.
export async function runMenuBot(opts: {
  business: Business;
  customer: Customer;
  conversationId: string;
  state: MenuState;
  text: string;
  allowAi: boolean;
}): Promise<MenuResult> {
  const faqs = await db.faqEntry.findMany({
    where: { businessId: opts.business.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  const expired = !opts.state.updatedAt || Date.now() - new Date(opts.state.updatedAt).getTime() > STATE_TTL_MS;
  const state: MenuState = expired ? {} : opts.state;

  const reply = await step(
    { business: opts.business, customer: opts.customer, conversationId: opts.conversationId, state, faqs, allowAi: opts.allowAi },
    opts.text,
  );
  const wasInFlow = state.flow === "envio";
  if ("useAi" in reply) {
    await saveMenuState(opts.conversationId, { ...state, engine: "ia" });
    return { result: "use_ai", private: wasInFlow };
  }
  // Mientras se toman los datos de envío, el estado conserva la marca del flujo.
  const keepFlow = wasInFlow && !!reply.state.step && SHIPPING_FLOW_STEPS.includes(reply.state.step);
  const next: MenuState = { ...reply.state, engine: reply.state.engine ?? "menu", ...(keepFlow ? { flow: "envio" } : {}) };
  await saveMenuState(opts.conversationId, next);
  await sendToCustomer(opts.conversationId, reply.text, "MENU", { private: wasInFlow || keepFlow });
  return { result: "handled", private: wasInFlow };
}

// La IA le pide al sistema que tome los datos de envío. Devuelve la primera pregunta,
// que se envía después de la respuesta de la IA.
export async function beginShippingFlow(conversationId: string): Promise<string> {
  const conversation = await db.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { business: true, customer: true },
  });
  const cart = await getOrCreateCart(conversationId);
  if (cart.items.length === 0) throw new OrderError("El carrito está vacío: primero agrega productos.");
  const reply = await startCheckout({
    business: conversation.business,
    customer: conversation.customer,
    conversationId,
    state: { flow: "envio" },
    faqs: [],
    allowAi: false,
  });
  if ("useAi" in reply) throw new Error("Respuesta inesperada del flujo de envío");
  await saveMenuState(conversationId, { ...reply.state, engine: "menu", flow: "envio" });
  return reply.text;
}

export async function saveMenuState(conversationId: string, state: MenuState) {
  await db.conversation.update({
    where: { id: conversationId },
    data: { botState: { ...state, updatedAt: new Date().toISOString() } as Prisma.InputJsonValue },
  });
}

export function isMenuCommand(text: string): boolean {
  return MENU_WORDS.includes(normalize(text));
}
