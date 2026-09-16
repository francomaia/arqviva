/* Servidor HTTP: webhook da Kiwify e painel de vendas e reembolsos. */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { config, configWarnings, ROOT } from "./config.js";
import { appendEvent, readEvents, readState, updateState, countEventsByType } from "./store.js";
import { verifySignature, detectType, normalizeEvent, EVENT_LABELS } from "./webhooks.js";
import { scheduleAbandonedCart, cancelPending, startQueue } from "./queue.js";
import { listSales, KiwifyError } from "./kiwify.js";

const PUBLIC_DIR = path.join(ROOT, "public");
const SITE_DIR = path.join(ROOT, "..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4"
};

const json = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(payload);
};

/* ---------- Autenticação do painel ---------- */

function safeEqual(a, b) {
  const left = Buffer.from(String(a), "utf8");
  const right = Buffer.from(String(b), "utf8");
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function requireAuth(req, res) {
  if (!config.panel.user || !config.panel.password) {
    json(res, 503, { erro: "Painel sem usuário e senha definidos no .env" });
    return false;
  }
  const header = req.headers.authorization || "";
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    const user = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    if (safeEqual(user, config.panel.user) && safeEqual(password, config.panel.password)) return true;
  }
  res.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="Painel ArqViva", charset="UTF-8"',
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end("Acesso restrito");
  return false;
}

/* ---------- Webhook ---------- */

function readRawBody(req, limitBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limitBytes) {
        reject(new Error("corpo maior que o limite aceito"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleWebhook(req, res, url) {
  let raw;
  try {
    raw = await readRawBody(req);
  } catch (error) {
    return json(res, 413, { erro: error.message });
  }

  const check = verifySignature(raw, url.searchParams.get("signature"));
  if (!check.ok) {
    console.warn("[webhook] recusado:", check.reason);
    await appendEvent({ type: "webhook_recusado", motivo: check.reason });
    return json(res, 401, { erro: check.reason });
  }

  let payload;
  try {
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return json(res, 400, { erro: "corpo não é JSON válido" });
  }

  const type = detectType(payload, url.searchParams.get("event"));
  const event = normalizeEvent(payload, { type });
  await appendEvent(event);

  // Responde rápido; o processamento pesado fica para a fila.
  json(res, 200, { ok: true, tipo: type });

  try {
    if (type === "carrinho_abandonado") {
      const result = await scheduleAbandonedCart(event);
      console.log("[webhook] carrinho abandonado:", result.queued ? "na fila" : result.reason);
    } else if (type === "compra_aprovada") {
      const result = await cancelPending(event);
      if (result.cancelled > 0) console.log("[webhook] compra aprovada cancelou", result.cancelled, "mensagem(ns)");
    }
  } catch (error) {
    console.error("[webhook] falha no pós-processamento:", error.message);
  }
}

/* ---------- Painel ---------- */

const APPROVED = new Set(["paid", "approved", "authorized"]);
const REFUNDED = new Set(["refunded", "pending_refund", "refund_requested"]);
const REFUSED = new Set(["refused"]);
const CHARGEBACK = new Set(["chargedback"]);

const toMoney = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return config.kiwify.amountInCents ? amount / 100 : amount;
};

function parseRange(url) {
  const end = url.searchParams.get("end") ? new Date(url.searchParams.get("end")) : new Date();
  const start = url.searchParams.get("start")
    ? new Date(url.searchParams.get("start"))
    : new Date(end.getTime() - 29 * 86400_000);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error("datas inválidas");
  return { start, end };
}

function summarize(sales) {
  const summary = {
    receita: 0, reembolsado: 0,
    aprovadas: 0, reembolsos: 0, chargebacks: 0, recusadas: 0, pendentes: 0,
    total: sales.length
  };
  for (const sale of sales) {
    const status = String(sale.status || "").toLowerCase();
    const amount = toMoney(sale.net_amount);
    if (APPROVED.has(status)) { summary.aprovadas += 1; summary.receita += amount; }
    else if (REFUNDED.has(status)) { summary.reembolsos += 1; summary.reembolsado += amount; }
    else if (CHARGEBACK.has(status)) { summary.chargebacks += 1; summary.reembolsado += amount; }
    else if (REFUSED.has(status)) { summary.recusadas += 1; }
    else { summary.pendentes += 1; }
  }
  const base = summary.aprovadas + summary.reembolsos + summary.chargebacks;
  summary.taxa_reembolso = base > 0 ? (summary.reembolsos + summary.chargebacks) / base : 0;
  summary.ticket_medio = summary.aprovadas > 0 ? summary.receita / summary.aprovadas : 0;
  return summary;
}

function toRow(sale) {
  return {
    id: sale.id || sale.reference || null,
    data: sale.created_at || null,
    atualizado: sale.updated_at || null,
    status: String(sale.status || "").toLowerCase(),
    metodo: sale.payment_method || null,
    valor: toMoney(sale.net_amount),
    produto: sale.product?.name || null,
    cliente: sale.customer?.name || null,
    email: sale.customer?.email || null
  };
}

/* Série diária para o gráfico do painel. */
function daily(sales, start, end) {
  const buckets = new Map();
  for (const sale of sales) {
    if (!sale.created_at) continue;
    const day = String(sale.created_at).slice(0, 10);
    const status = String(sale.status || "").toLowerCase();
    const entry = buckets.get(day) || { dia: day, receita: 0, aprovadas: 0, reembolsos: 0 };
    if (APPROVED.has(status)) { entry.aprovadas += 1; entry.receita += toMoney(sale.net_amount); }
    if (REFUNDED.has(status) || CHARGEBACK.has(status)) entry.reembolsos += 1;
    buckets.set(day, entry);
  }
  // Dias sem venda entram com zero para o eixo do tempo não ficar com buracos.
  const cursor = new Date(start);
  while (cursor <= end) {
    const dia = cursor.toISOString().slice(0, 10);
    if (!buckets.has(dia)) buckets.set(dia, { dia, receita: 0, aprovadas: 0, reembolsos: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return [...buckets.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}

async function handleOverview(res, url) {
  const { start, end } = parseRange(url);
  const sales = await listSales({ start, end });
  const state = await readState();
  const contagem = await countEventsByType({ since: start });

  json(res, 200, {
    periodo: { inicio: start.toISOString(), fim: end.toISOString() },
    resumo: summarize(sales),
    serie: daily(sales, start, end),
    funil: {
      carrinhos_abandonados: contagem.carrinho_abandonado || 0,
      whatsapp_enviados: contagem.whatsapp_enviado || 0,
      whatsapp_dryrun: contagem.whatsapp_dryrun || 0,
      whatsapp_falhas: contagem.whatsapp_falhou || 0,
      recuperados: state.recovered.filter((item) => new Date(item.at) >= start).length,
      na_fila: state.queue.length
    },
    avisos: configWarnings()
  });
}

async function handleSales(res, url) {
  const { start, end } = parseRange(url);
  const status = url.searchParams.get("status") || "";
  const sales = await listSales({ start, end, status });
  const rows = sales.map(toRow).sort((a, b) => String(b.data).localeCompare(String(a.data)));
  json(res, 200, { total: rows.length, vendas: rows.slice(0, 500) });
}

/* ---------- Arquivos estáticos ---------- */

async function serveFile(res, baseDir, relativePath) {
  const target = path.join(baseDir, relativePath);
  const resolved = path.resolve(target);
  if (!resolved.startsWith(path.resolve(baseDir))) {
    res.writeHead(403).end("Caminho não permitido");
    return true;
  }
  try {
    const data = await fsp.readFile(resolved);
    res.writeHead(200, { "Content-Type": MIME[path.extname(resolved).toLowerCase()] || "application/octet-stream" });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

/* ---------- Roteamento ---------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  const route = url.pathname.replace(/\/+$/, "") || "/";

  try {
    if (route === "/healthz") return json(res, 200, { ok: true, hora: new Date().toISOString() });

    if (route === "/webhooks/kiwify") {
      if (req.method !== "POST") return json(res, 405, { erro: "use POST" });
      return handleWebhook(req, res, url);
    }

    if (route === "/" ) {
      res.writeHead(302, { Location: "/painel" });
      return res.end();
    }

    if (route === "/painel") {
      if (!requireAuth(req, res)) return;
      if (await serveFile(res, PUBLIC_DIR, "index.html")) return;
      return json(res, 500, { erro: "painel não encontrado em public/index.html" });
    }

    if (route.startsWith("/painel/")) {
      if (!requireAuth(req, res)) return;
      if (await serveFile(res, PUBLIC_DIR, route.slice("/painel/".length))) return;
      return json(res, 404, { erro: "arquivo não encontrado" });
    }

    if (route.startsWith("/api/")) {
      if (!requireAuth(req, res)) return;

      if (route === "/api/overview") return await handleOverview(res, url);
      if (route === "/api/sales") return await handleSales(res, url);
      if (route === "/api/events") {
        const eventos = await readEvents({
          limit: Number(url.searchParams.get("limit")) || 100,
          type: url.searchParams.get("type") || ""
        });
        return json(res, 200, { rotulos: EVENT_LABELS, eventos });
      }
      if (route === "/api/optout" && req.method === "POST") {
        const body = JSON.parse((await readRawBody(req)).toString("utf8") || "{}");
        const phone = String(body.phone || "").replace(/\D/g, "");
        if (!phone) return json(res, 400, { erro: "informe o telefone" });
        await updateState(async (state) => {
          if (!state.optOut.includes(phone)) state.optOut.push(phone);
          state.queue = state.queue.filter((item) => item.phone !== phone);
        });
        return json(res, 200, { ok: true, phone });
      }
      return json(res, 404, { erro: "rota de API desconhecida" });
    }

    // Opcional: servir a landing page pelo mesmo processo, útil no desenvolvimento.
    if (config.serveSite) {
      const relative = route === "/" ? "index.html" : route.slice(1);
      if (await serveFile(res, SITE_DIR, relative)) return;
    }

    return json(res, 404, { erro: "rota não encontrada" });
  } catch (error) {
    if (error instanceof KiwifyError) {
      console.error("[api] " + error.message, error.body || "");
      return json(res, error.status === 503 ? 503 : 502, { erro: error.message, detalhe: error.body });
    }
    console.error("[servidor] erro inesperado:", error);
    return json(res, 500, { erro: error.message });
  }
});

if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

server.listen(config.port, () => {
  console.log("ArqViva no ar em http://localhost:" + config.port);
  console.log("  painel:  http://localhost:" + config.port + "/painel");
  const base = config.publicUrl || "http://localhost:" + config.port;
  console.log("  webhook: " + base + "/webhooks/kiwify");
  for (const warning of configWarnings()) console.warn("  aviso: " + warning);
  startQueue();
});

export { server };
