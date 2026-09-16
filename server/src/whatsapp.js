/* Envio de WhatsApp com adaptadores. O padrão é dryrun: não envia nada. */
import { config } from "./config.js";

/*
 * Normaliza para o formato E.164 sem o sinal de mais, que é o aceito
 * tanto pela Cloud API quanto pela Z-API. Assume Brasil quando não há DDI.
 */
export function normalizePhone(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) return digits;
  if (digits.length === 10 || digits.length === 11) return "55" + digits;
  if (digits.length > 13) return digits.slice(-13);
  return digits.length >= 12 ? digits : null;
}

export function renderMessage(template, { nome, link }) {
  const firstName = String(nome || "").trim().split(/\s+/)[0] || "tudo bem";
  return template
    .replaceAll("{nome}", firstName)
    .replaceAll("{link}", link || "")
    .replace(/\s+$/, "");
}

async function sendViaCloud(phone, { nome, link, text }) {
  const { token, phoneId, template, lang } = config.whatsapp.cloud;
  if (!token || !phoneId) throw new Error("WHATSAPP_CLOUD_TOKEN ou WHATSAPP_CLOUD_PHONE_ID vazios");

  /*
   * Fora da janela de 24 horas a Meta só entrega template aprovado.
   * O template precisa ter duas variáveis: nome e link.
   */
  const body = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: template,
      language: { code: lang },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: String(nome || "tudo bem").split(/\s+/)[0] },
            { type: "text", text: String(link || "") }
          ]
        }
      ]
    }
  };

  const response = await fetch("https://graph.facebook.com/v21.0/" + phoneId + "/messages", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const payload = await response.text();
  if (!response.ok) throw new Error("Cloud API " + response.status + ": " + payload);
  return { provider: "cloud", response: payload, preview: text };
}

async function sendViaZapi(phone, { text }) {
  const { instance, token, clientToken } = config.whatsapp.zapi;
  if (!instance || !token) throw new Error("ZAPI_INSTANCE ou ZAPI_TOKEN vazios");

  const headers = { "Content-Type": "application/json" };
  if (clientToken) headers["Client-Token"] = clientToken;

  const url = "https://api.z-api.io/instances/" + instance + "/token/" + token + "/send-text";
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone, message: text })
  });
  const payload = await response.text();
  if (!response.ok) throw new Error("Z-API " + response.status + ": " + payload);
  return { provider: "zapi", response: payload, preview: text };
}

/*
 * Retorna sempre um objeto com o resultado. Quem chama decide o que registrar.
 * Nenhuma mensagem sai enquanto WHATSAPP_PROVIDER for dryrun.
 */
export async function sendWhatsApp({ phone, nome, link }) {
  const normalized = normalizePhone(phone);
  if (!normalized) return { sent: false, skipped: "telefone inválido ou ausente", phone };

  const text = renderMessage(config.whatsapp.message, { nome, link });

  if (config.whatsapp.provider === "dryrun") {
    console.log("[whatsapp:dryrun] para " + normalized + " -> " + text);
    return { sent: false, dryrun: true, phone: normalized, preview: text };
  }

  try {
    const result =
      config.whatsapp.provider === "cloud"
        ? await sendViaCloud(normalized, { nome, link, text })
        : config.whatsapp.provider === "zapi"
          ? await sendViaZapi(normalized, { text })
          : null;
    if (!result) return { sent: false, skipped: "provedor desconhecido: " + config.whatsapp.provider };
    return { sent: true, phone: normalized, ...result };
  } catch (error) {
    console.error("[whatsapp] falha ao enviar para " + normalized + ":", error.message);
    return { sent: false, error: error.message, phone: normalized };
  }
}
