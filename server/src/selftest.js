/* Teste de ponta a ponta sem tocar na Kiwify nem enviar WhatsApp de verdade. */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const SRC = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = "token-de-teste";
const PORT = 3999;
const BASE = "http://127.0.0.1:" + PORT;
const AUTH = "Basic " + Buffer.from("teste:senha").toString("base64");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "arqviva-test-"));
let falhas = 0;

function checar(nome, condicao, detalhe) {
  if (condicao) {
    console.log("  ok   " + nome);
  } else {
    falhas += 1;
    console.error("  FALHA " + nome + (detalhe ? " -> " + detalhe : ""));
  }
}

const assinar = (corpo) => crypto.createHmac("sha1", TOKEN).update(corpo).digest("hex");

async function postarWebhook(payload, opcoes) {
  const corpo = JSON.stringify(payload);
  const assinatura = opcoes && "assinatura" in opcoes ? opcoes.assinatura : assinar(corpo);
  const resposta = await fetch(BASE + "/webhooks/kiwify?signature=" + assinatura, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: corpo
  });
  return { status: resposta.status, corpo: await resposta.json().catch(() => ({})) };
}

async function esperarServidor(tentativas = 50) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const resposta = await fetch(BASE + "/healthz");
      if (resposta.ok) return true;
    } catch {
      /* ainda subindo */
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

const pausa = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const servidor = spawn(process.execPath, [path.join(SRC, "server.js")], {
  env: {
    ...process.env,
    PORT: String(PORT),
    PANEL_USER: "teste",
    PANEL_PASSWORD: "senha",
    KIWIFY_WEBHOOK_TOKEN: TOKEN,
    KIWIFY_SIGNATURE_ALGO: "sha1",
    WEBHOOK_ALLOW_UNSIGNED: "false",
    WHATSAPP_PROVIDER: "dryrun",
    WHATSAPP_DELAY_MINUTES: "0",
    KIWIFY_CLIENT_ID: "",
    KIWIFY_CLIENT_SECRET: "",
    KIWIFY_ACCOUNT_ID: "",
    ARQVIVA_DATA_DIR: dataDir
  },
  stdio: ["ignore", "pipe", "pipe"]
});
servidor.stdout.on("data", (chunk) => process.stdout.write("    [servidor] " + chunk));
servidor.stderr.on("data", (chunk) => process.stderr.write("    [servidor] " + chunk));

async function main() {
  if (!(await esperarServidor())) throw new Error("o servidor não respondeu em /healthz");

  console.log("\nAssinatura do webhook");
  const recusado = await postarWebhook({ order_id: "x" }, { assinatura: "assinaturaerrada" });
  checar("recusa assinatura inválida", recusado.status === 401, "status " + recusado.status);
  const semAssinatura = await postarWebhook({ order_id: "x" }, { assinatura: "" });
  checar("recusa requisição sem assinatura", semAssinatura.status === 401, "status " + semAssinatura.status);

  // Ana abandona e não compra: deve receber a mensagem.
  console.log("\nCarrinho abandonado sem compra");
  const abandono = await postarWebhook({
    name: "Ana Clara Ribeiro",
    email: "ana@example.com",
    phone: "(64) 99988-5321",
    product_name: "Arquitetando Processos",
    checkout_url: "https://pay.kiwify.com.br/uca7qGd"
  });
  checar("aceita evento assinado", abandono.status === 200, "status " + abandono.status);
  checar("classifica como carrinho_abandonado", abandono.corpo.tipo === "carrinho_abandonado", abandono.corpo.tipo);
  await pausa(900);

  // Maria abandona e compra em seguida: a mensagem não deve sair.
  console.log("\nCarrinho abandonado seguido de compra");
  await postarWebhook({
    name: "Maria Paula Souza",
    email: "maria@example.com",
    phone: "(11) 98888-7777",
    product_name: "Arquitetando Processos",
    checkout_url: "https://pay.kiwify.com.br/uca7qGd"
  });
  const aprovada = await postarWebhook({
    order_id: "ORD-123",
    order_status: "paid",
    webhook_event_type: "order_approved",
    payment_method: "credit_card",
    Product: { product_id: "p1", product_name: "Arquitetando Processos" },
    Customer: { full_name: "Maria Paula Souza", email: "maria@example.com", mobile: "11988887777" },
    Commissions: { charge_amount: "24700", currency: "BRL" }
  });
  checar("classifica como compra_aprovada", aprovada.corpo.tipo === "compra_aprovada", aprovada.corpo.tipo);
  await pausa(900);

  const estado = JSON.parse(await fsp.readFile(path.join(dataDir, "state.json"), "utf8"));
  checar("fila esvaziada", estado.queue.length === 0, JSON.stringify(estado.queue));
  checar("registra recuperação da compradora", estado.recovered.length === 1, JSON.stringify(estado.recovered));
  checar("abandono sem compra continua marcado", Boolean(estado.abandoned["ana@example.com"]), JSON.stringify(estado.abandoned));

  console.log("\nPainel");
  const semSenha = await fetch(BASE + "/api/events");
  checar("exige autenticação", semSenha.status === 401, "status " + semSenha.status);

  const eventos = await (await fetch(BASE + "/api/events", { headers: { Authorization: AUTH } })).json();
  checar("guarda os eventos recebidos", eventos.eventos.length >= 4, "total " + eventos.eventos.length);
  checar("valor convertido de centavos", eventos.eventos.some((evento) => evento.amount === 247));

  const visao = await fetch(BASE + "/api/overview", { headers: { Authorization: AUTH } });
  checar("avisa que falta credencial da Kiwify", visao.status === 503, "status " + visao.status);

  const painel = await fetch(BASE + "/painel", { headers: { Authorization: AUTH } });
  checar("serve o painel", painel.status === 200 && (await painel.text()).includes("Vendas e reembolsos"));

  console.log("\nWhatsApp");
  const dryrun = eventos.eventos.filter((evento) => evento.type === "whatsapp_dryrun");
  checar("uma mensagem simulada, nada enviado de verdade", dryrun.length === 1, "total " + dryrun.length);
  const mensagem = dryrun[0] || {};
  checar("só para quem não comprou", mensagem.nome === "Ana Clara Ribeiro", mensagem.nome);
  checar("usa o primeiro nome", String(mensagem.detalhe).includes("Oi Ana,"), mensagem.detalhe);
  checar("inclui o link do checkout", String(mensagem.detalhe).includes("pay.kiwify.com.br"), mensagem.detalhe);
  checar("telefone normalizado", mensagem.phone === "5564999885321", mensagem.phone);
}

main()
  .catch((error) => {
    falhas += 1;
    console.error("\nErro no teste:", error.message);
  })
  .finally(async () => {
    servidor.kill();
    await fsp.rm(dataDir, { recursive: true, force: true }).catch(() => {});
    console.log("\n" + (falhas === 0 ? "Todos os testes passaram." : falhas + " verificação(ões) falharam."));
    process.exit(falhas === 0 ? 0 : 1);
  });
