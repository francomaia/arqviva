/* Cliente da API pública da Kiwify: OAuth, vendas e estatísticas. */
import { config } from "./config.js";

const MAX_WINDOW_DAYS = 90; // limite de intervalo aceito pelo endpoint de vendas
const PAGE_SIZE = 100;

let tokenCache = { value: "", expiresAt: 0 };

export class KiwifyError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "KiwifyError";
    this.status = status;
    this.body = body;
  }
}

function assertCredentials() {
  const { clientId, clientSecret, accountId } = config.kiwify;
  if (!clientId || !clientSecret || !accountId) {
    throw new KiwifyError("Credenciais da Kiwify não configuradas no .env", 503, null);
  }
}

export async function getToken({ force = false } = {}) {
  assertCredentials();
  if (!force && tokenCache.value && Date.now() < tokenCache.expiresAt) return tokenCache.value;

  const body = new URLSearchParams({
    client_id: config.kiwify.clientId,
    client_secret: config.kiwify.clientSecret
  });
  const response = await fetch(config.kiwify.baseUrl + "/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const text = await response.text();
  if (!response.ok) throw new KiwifyError("Falha ao gerar token OAuth", response.status, text);

  const data = JSON.parse(text);
  const ttlSeconds = Number(data.expires_in) || 86400;
  tokenCache = {
    value: data.access_token,
    // Renova cinco minutos antes do vencimento real.
    expiresAt: Date.now() + Math.max(60, ttlSeconds - 300) * 1000
  };
  return tokenCache.value;
}

async function request(path, { query = {}, method = "GET", retryOnAuth = true } = {}) {
  assertCredentials();
  const token = await getToken();
  const url = new URL(config.kiwify.baseUrl + path);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      "x-kiwify-account-id": config.kiwify.accountId,
      Accept: "application/json"
    }
  });

  if (response.status === 401 && retryOnAuth) {
    await getToken({ force: true });
    return request(path, { query, method, retryOnAuth: false });
  }
  if (response.status === 429) {
    // O limite é de cem chamadas por minuto. Espera e tenta uma vez mais.
    const wait = Number(response.headers.get("retry-after")) || 5;
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    return request(path, { query, method, retryOnAuth: false });
  }

  const text = await response.text();
  if (!response.ok) {
    throw new KiwifyError("Kiwify respondeu " + response.status + " em " + path, response.status, text);
  }
  return text ? JSON.parse(text) : {};
}

/* A API aceita no máximo noventa dias por consulta; intervalos maiores viram fatias. */
function splitRange(startDate, endDate) {
  const ranges = [];
  let cursor = new Date(startDate);
  const end = new Date(endDate);
  while (cursor <= end) {
    const sliceEnd = new Date(cursor);
    sliceEnd.setUTCDate(sliceEnd.getUTCDate() + MAX_WINDOW_DAYS - 1);
    ranges.push({ start: new Date(cursor), end: sliceEnd > end ? end : sliceEnd });
    cursor = new Date(sliceEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return ranges;
}

const isoDay = (date) => new Date(date).toISOString().slice(0, 10);

export async function listSales({ start, end, status = "", pageLimit = 40 } = {}) {
  const sales = [];
  for (const range of splitRange(start, end)) {
    let page = 1;
    for (;;) {
      const payload = await request("/sales", {
        query: {
          start_date: isoDay(range.start),
          end_date: isoDay(range.end),
          status,
          product_id: config.kiwify.productId,
          page_number: page,
          page_size: PAGE_SIZE
        }
      });
      const batch = Array.isArray(payload.data) ? payload.data : [];
      sales.push(...batch);
      const total = payload && payload.pagination ? payload.pagination.count : batch.length;
      if (batch.length < PAGE_SIZE || page * PAGE_SIZE >= total || page >= pageLimit) break;
      page += 1;
    }
  }
  return sales;
}

export async function getStats({ start, end } = {}) {
  return request("/stats", {
    query: {
      start_date: isoDay(start),
      end_date: isoDay(end),
      product_id: config.kiwify.productId
    }
  });
}

export async function listProducts() {
  const payload = await request("/products", { query: { page_size: PAGE_SIZE } });
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function createWebhook({ name, url, triggers, token, products = "all" }) {
  const response = await fetch(config.kiwify.baseUrl + "/webhooks", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + (await getToken()),
      "x-kiwify-account-id": config.kiwify.accountId,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name, url, triggers, token, products })
  });
  const text = await response.text();
  if (!response.ok) {
    throw new KiwifyError("Falha ao criar webhook (" + response.status + ")", response.status, text);
  }
  return text ? JSON.parse(text) : {};
}
