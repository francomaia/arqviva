/* Cadastra o webhook na Kiwify apontando para este servidor. */
import { config } from "./config.js";
import { createWebhook } from "./kiwify.js";

const TRIGGERS = [
  "carrinho_abandonado",
  "compra_aprovada",
  "compra_recusada",
  "compra_reembolsada",
  "chargeback",
  "boleto_gerado",
  "pix_gerado",
  "subscription_canceled",
  "subscription_late",
  "subscription_renewed"
];

async function main() {
  if (!config.publicUrl) {
    console.error("Defina PUBLIC_URL no .env com o endereço público deste servidor.");
    process.exit(1);
  }
  if (!config.webhook.token) {
    console.error("Defina KIWIFY_WEBHOOK_TOKEN no .env antes de cadastrar o webhook.");
    process.exit(1);
  }

  const url = config.publicUrl + "/webhooks/kiwify";
  console.log("Cadastrando webhook para " + url);
  console.log("Eventos: " + TRIGGERS.join(", "));

  try {
    const resposta = await createWebhook({
      name: "ArqViva - painel e carrinho abandonado",
      url,
      triggers: TRIGGERS,
      token: config.webhook.token,
      products: config.kiwify.productId || "all"
    });
    console.log("Webhook criado:", JSON.stringify(resposta, null, 2));
  } catch (error) {
    console.error("Falhou:", error.message);
    if (error.body) console.error(error.body);
    console.error("\nSe a API recusar, dá para cadastrar na mão em Apps > Webhooks no painel da Kiwify,");
    console.error("usando exatamente a URL acima e o mesmo token do .env.");
    process.exit(1);
  }
}

main();
