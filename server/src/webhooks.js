/* Verificação da assinatura e normalização dos eventos da Kiwify. */
import crypto from "node:crypto";
import { config } from "./config.js";

/*
 * A Kiwify assina o corpo bruto com HMAC e envia o resultado em ?signature=.
 * O segredo é o mesmo token informado ao criar o webhook no painel deles.
 */
export function verifySignature(rawBody, signature) {
  if (config.webhook.allowUnsigned) return { ok: true, reason: "verificação desligada" };
  if (!config.webhook.token) return { ok: false, reason: "KIWIFY_WEBHOOK_TOKEN não configurado" };
  if (!signature) return { ok: false, reason: "requisição sem parâmetro signature" };

  const expected = crypto
    .createHmac(config.webhook.algo, config.webhook.token)
    .update(rawBody)
    .digest("hex");

  const received = Buffer.from(String(signature).trim().toLowerCase(), "utf8");
  const computed = Buffer.from(expected.toLowerCase(), "utf8");
  if (received.length !== computed.length) return { ok: false, reason: "assinatura com tamanho inesperado" };
  if (!crypto.timingSafeEqual(received, computed)) return { ok: false, reason: "assinatura não confere" };
  return { ok: true, reason: "" };
}

/* Os nomes variam entre o cadastro do webhook e o corpo do evento. */
const TYPE_ALIASES = {
  order_approved: "compra_aprovada",
  order_approved_recurrent: "compra_aprovada",
  paid: "compra_aprovada",
  compra_aprovada: "compra_aprovada",

  order_rejected: "compra_recusada",
  refused: "compra_recusada",
  compra_recusada: "compra_recusada",

  order_refunded: "compra_reembolsada",
  refunded: "compra_reembolsada",
  compra_reembolsada: "compra_reembolsada",

  chargeback: "chargeback",
  chargedback: "chargeback",

  billet_created: "boleto_gerado",
  boleto_gerado: "boleto_gerado",
  pix_created: "pix_gerado",
  pix_gerado: "pix_gerado",

  cart_abandoned: "carrinho_abandonado",
  abandoned_cart: "carrinho_abandonado",
  carrinho_abandonado: "carrinho_abandonado",

  subscription_canceled: "assinatura_cancelada",
  subscription_late: "assinatura_atrasada",
  subscription_renewed: "assinatura_renovada"
};

export const EVENT_LABELS = {
  compra_aprovada: "Compra aprovada",
  compra_recusada: "Compra recusada",
  compra_reembolsada: "Reembolso",
  chargeback: "Chargeback",
  boleto_gerado: "Boleto gerado",
  pix_gerado: "Pix gerado",
  carrinho_abandonado: "Carrinho abandonado",
  assinatura_cancelada: "Assinatura cancelada",
  assinatura_atrasada: "Assinatura atrasada",
  assinatura_renovada: "Assinatura renovada",
  desconhecido: "Evento não identificado",
  // Registros internos do próprio servidor
  whatsapp_enviado: "WhatsApp enviado",
  whatsapp_dryrun: "WhatsApp simulado",
  whatsapp_falhou: "WhatsApp falhou",
  whatsapp_ignorado: "WhatsApp não enviado",
  webhook_recusado: "Webhook recusado"
};

/* Procura o primeiro caminho existente dentro do objeto. */
function pick(payload, paths) {
  for (const path of paths) {
    let node = payload;
    let found = true;
    for (const key of path.split(".")) {
      if (node && typeof node === "object" && key in node) node = node[key];
      else { found = false; break; }
    }
    if (found && node !== null && node !== undefined && node !== "") return node;
  }
  return undefined;
}

export function detectType(payload, queryEvent) {
  const raw =
    pick(payload, ["webhook_event_type", "event", "event_type", "type"]) ||
    queryEvent ||
    pick(payload, ["order_status", "status"]);
  const normalized = String(raw || "").toLowerCase();
  if (TYPE_ALIASES[normalized]) return TYPE_ALIASES[normalized];

  // O carrinho abandonado costuma vir sem identificação de evento e sem pedido.
  const hasOrder = pick(payload, ["order_id", "order_ref", "id"]);
  const hasContact = pick(payload, ["Customer.email", "customer.email", "email"]);
  if (!hasOrder && hasContact) return "carrinho_abandonado";
  return "desconhecido";
}

/* Valores monetários chegam em centavos na maior parte dos eventos. */
function parseAmount(value) {
  if (value === undefined || value === null || value === "") return null;
  const digits = Number(String(value).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(digits)) return null;
  return digits / 100;
}

export function normalizeEvent(payload, { type }) {
  const name = pick(payload, [
    "Customer.full_name", "customer.full_name", "Customer.first_name",
    "customer.name", "name", "full_name", "buyer_name"
  ]);
  const email = pick(payload, ["Customer.email", "customer.email", "email", "buyer_email"]);
  const phone = pick(payload, [
    "Customer.mobile", "customer.mobile", "customer.phone",
    "mobile", "phone", "phone_number", "telefone"
  ]);
  const productName = pick(payload, [
    "Product.product_name", "product.name", "product_name", "Products.0.product_name"
  ]);
  const checkoutUrl = pick(payload, [
    "checkout_url", "checkout_link", "cart_url", "url", "payment_url", "boleto_URL"
  ]);
  const orderId = pick(payload, ["order_id", "order_ref", "id", "reference"]);
  const amount = parseAmount(pick(payload, [
    "Commissions.charge_amount", "commissions.charge_amount", "charge_amount", "amount", "net_amount"
  ]));

  return {
    type,
    label: EVENT_LABELS[type] || type,
    order_id: orderId ? String(orderId) : null,
    customer: {
      name: name ? String(name) : null,
      email: email ? String(email) : null,
      phone: phone ? String(phone) : null
    },
    product: productName ? String(productName) : null,
    amount,
    payment_method: pick(payload, ["payment_method", "payment_type"]) || null,
    checkout_url: checkoutUrl ? String(checkoutUrl) : null,
    tracking: pick(payload, ["TrackingParameters", "tracking_parameters", "tracking"]) || null,
    raw: payload
  };
}
