/* Leitura do .env sem dependências externas. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = process.env.ARQVIVA_DATA_DIR
  ? path.resolve(process.env.ARQVIVA_DATA_DIR)
  : path.join(ROOT, "data");

function loadEnvFile() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const rawLine of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile();

const str = (key, fallback = "") => (process.env[key] ?? fallback).trim();
const num = (key, fallback) => {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const bool = (key, fallback = false) => {
  const value = str(key).toLowerCase();
  if (!value) return fallback;
  return value === "true" || value === "1" || value === "sim";
};

export const config = {
  port: num("PORT", 3000),
  publicUrl: str("PUBLIC_URL").replace(/\/+$/, ""),
  serveSite: bool("SERVE_SITE", false),

  panel: {
    user: str("PANEL_USER"),
    password: str("PANEL_PASSWORD")
  },

  kiwify: {
    // Só troque em teste. Em produção o padrão é o endereço oficial.
    baseUrl: str("KIWIFY_BASE_URL", "https://public-api.kiwify.com/v1").replace(/\/+$/, ""),
    clientId: str("KIWIFY_CLIENT_ID"),
    clientSecret: str("KIWIFY_CLIENT_SECRET"),
    accountId: str("KIWIFY_ACCOUNT_ID"),
    productId: str("KIWIFY_PRODUCT_ID"),
    // A API devolve valores em centavos. Troque para false se o painel mostrar cem vezes mais.
    amountInCents: bool("KIWIFY_AMOUNT_IN_CENTS", true)
  },

  webhook: {
    token: str("KIWIFY_WEBHOOK_TOKEN"),
    algo: str("KIWIFY_SIGNATURE_ALGO", "sha1").toLowerCase(),
    allowUnsigned: bool("WEBHOOK_ALLOW_UNSIGNED", false)
  },

  whatsapp: {
    provider: str("WHATSAPP_PROVIDER", "dryrun").toLowerCase(),
    delayMinutes: num("WHATSAPP_DELAY_MINUTES", 0),
    cooldownHours: num("WHATSAPP_COOLDOWN_HOURS", 72),
    message: str("WHATSAPP_MESSAGE", "Oi {nome}, vi que você não finalizou sua inscrição. Posso ajudar? {link}"),
    cloud: {
      token: str("WHATSAPP_CLOUD_TOKEN"),
      phoneId: str("WHATSAPP_CLOUD_PHONE_ID"),
      template: str("WHATSAPP_CLOUD_TEMPLATE", "carrinho_abandonado"),
      lang: str("WHATSAPP_CLOUD_TEMPLATE_LANG", "pt_BR")
    },
    zapi: {
      instance: str("ZAPI_INSTANCE"),
      token: str("ZAPI_TOKEN"),
      clientToken: str("ZAPI_CLIENT_TOKEN")
    }
  }
};

/* Avisos de configuração incompleta, sem derrubar o servidor. */
export function configWarnings() {
  const warnings = [];
  if (!config.panel.user || !config.panel.password) {
    warnings.push("PANEL_USER/PANEL_PASSWORD vazios: o painel fica bloqueado até preencher.");
  }
  if (!config.kiwify.clientId || !config.kiwify.clientSecret || !config.kiwify.accountId) {
    warnings.push("Credenciais da API da Kiwify incompletas: o painel não vai carregar vendas.");
  }
  if (!config.webhook.token && !config.webhook.allowUnsigned) {
    warnings.push("KIWIFY_WEBHOOK_TOKEN vazio: os webhooks serão recusados por falta de assinatura.");
  }
  if (config.webhook.allowUnsigned) {
    warnings.push("WEBHOOK_ALLOW_UNSIGNED=true: qualquer um pode postar eventos falsos. Use só para depurar.");
  }
  if (config.whatsapp.provider === "dryrun") {
    warnings.push("WhatsApp em dryrun: as mensagens são apenas registradas, nada é enviado.");
  }
  return warnings;
}
