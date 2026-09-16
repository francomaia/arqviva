/* Fila persistente das mensagens de carrinho abandonado. */
import crypto from "node:crypto";
import { config } from "./config.js";
import { readState, updateState, appendEvent } from "./store.js";
import { sendWhatsApp, normalizePhone } from "./whatsapp.js";

const TICK_MS = 30_000;
const ABANDONO_TTL_MS = 30 * 86400_000; // um mês de memória para contar recuperações
let timer = null;

const keyOf = (event) =>
  (event.customer?.email || "").toLowerCase() || normalizePhone(event.customer?.phone) || "";

/*
 * Registra o abandono e agenda a mensagem. A Kiwify já demora de dez a quinze
 * minutos para reconhecer o abandono, então o atraso extra costuma ser zero.
 */
export async function scheduleAbandonedCart(event) {
  const phone = normalizePhone(event.customer?.phone);
  const key = keyOf(event);
  const sendAt = Date.now() + Math.max(0, config.whatsapp.delayMinutes) * 60_000;

  const resultado = await updateState(async (state) => {
    // O abandono fica anotado mesmo quando a mensagem não pode sair,
    // para a taxa de recuperação continuar correta.
    if (key || phone) {
      state.abandoned[key || phone] = { at: Date.now(), phone: phone || null };
      for (const [registro, dados] of Object.entries(state.abandoned)) {
        if (Date.now() - dados.at > ABANDONO_TTL_MS) delete state.abandoned[registro];
      }
    }

    if (!phone) return { queued: false, reason: "sem telefone" };
    if (state.optOut.includes(phone)) return { queued: false, reason: "número na lista de exclusão" };

    const lastSent = state.lastMessageByPhone[phone];
    if (lastSent && Date.now() - lastSent < config.whatsapp.cooldownHours * 3600_000) {
      return { queued: false, reason: "dentro da janela de espera" };
    }
    if (state.queue.some((item) => item.phone === phone)) {
      return { queued: false, reason: "já existe mensagem na fila" };
    }

    state.queue.push({
      id: crypto.randomUUID(),
      phone,
      key,
      nome: event.customer?.name || "",
      link: event.checkout_url || "",
      sendAt,
      tries: 0
    });
    return { queued: true, sendAt: new Date(sendAt).toISOString() };
  });

  if (!resultado.queued) {
    await appendEvent({ type: "whatsapp_ignorado", motivo: resultado.reason, order_id: event.order_id || null });
  } else {
    // Não espera o próximo tique de trinta segundos quando já está na hora.
    setTimeout(() => {
      processDue().catch((error) => console.error("[queue] falha ao processar:", error.message));
    }, Math.max(0, sendAt - Date.now()) + 50).unref?.();
  }
  return resultado;
}

/* Quem comprou não recebe cobrança de carrinho e entra na conta de recuperados. */
export async function cancelPending(event) {
  const phone = normalizePhone(event.customer?.phone);
  const key = keyOf(event);
  if (!phone && !key) return { cancelled: 0, recovered: false };

  return updateState(async (state) => {
    const antes = state.queue.length;
    state.queue = state.queue.filter((item) => item.phone !== phone && item.key !== key);
    const cancelled = antes - state.queue.length;

    const registro = state.abandoned[key] || (phone ? state.abandoned[phone] : null);
    let recovered = false;
    if (registro) {
      delete state.abandoned[key];
      if (phone) delete state.abandoned[phone];
      state.recovered.push({
        key: key || phone,
        phone: phone || null,
        at: new Date().toISOString(),
        order_id: event.order_id || null
      });
      state.recovered = state.recovered.slice(-500);
      recovered = true;
    }
    return { cancelled, recovered };
  });
}

let processando = false;
let repetir = false;

/*
 * Retira da fila as mensagens vencidas dentro de uma única transação. Sem isso,
 * duas execuções simultâneas leem a mesma mensagem e o cliente recebe duplicado.
 */
async function processDue() {
  if (processando) { repetir = true; return; }
  processando = true;
  try {
    for (;;) {
      const lote = await updateState(async (state) => {
        const agora = Date.now();
        const vencidas = state.queue.filter((item) => item.sendAt <= agora);
        state.queue = state.queue.filter((item) => item.sendAt > agora);
        return vencidas;
      });
      if (lote.length === 0) break;

      for (const item of lote) {
        // Se a compra entrou entre a reserva e o envio, a mensagem não sai.
        const atual = await readState();
        if (item.key && !atual.abandoned[item.key] && !atual.abandoned[item.phone]) {
          await appendEvent({ type: "whatsapp_ignorado", motivo: "cliente comprou antes do envio", phone: item.phone });
          continue;
        }

        const resultado = await sendWhatsApp({ phone: item.phone, nome: item.nome, link: item.link });
        const entregue = resultado.sent === true;
        // O dryrun sai da fila mas não consome a janela de espera, para não mascarar testes.
        const encerrar = entregue || resultado.dryrun || resultado.skipped || item.tries >= 2;

        await updateState(async (state) => {
          if (entregue) state.lastMessageByPhone[item.phone] = Date.now();
          if (!encerrar) {
            // Devolve para a fila com nova tentativa em dez minutos.
            state.queue.push({ ...item, tries: item.tries + 1, sendAt: Date.now() + 10 * 60_000 });
          }
        });

        await appendEvent({
          type: entregue ? "whatsapp_enviado" : resultado.dryrun ? "whatsapp_dryrun" : "whatsapp_falhou",
          phone: item.phone,
          nome: item.nome,
          detalhe: resultado.error || resultado.skipped || resultado.preview || ""
        });
      }
    }
  } finally {
    processando = false;
    if (repetir) {
      repetir = false;
      setTimeout(() => processDue().catch(() => {}), 20).unref?.();
    }
  }
}

export function startQueue() {
  if (timer) return;
  timer = setInterval(() => {
    processDue().catch((error) => console.error("[queue] erro ao processar fila:", error.message));
  }, TICK_MS);
  timer.unref?.();
  processDue().catch(() => {});
}

export function stopQueue() {
  if (timer) clearInterval(timer);
  timer = null;
}

export { processDue };
