# Servidor ArqViva

Dois recursos num processo só, em Node puro e sem dependências externas:

1. **Webhook da Kiwify**, que recebe os eventos e dispara a mensagem de carrinho abandonado no WhatsApp.
2. **Painel de vendas e reembolsos**, que lê a API da Kiwify. É somente leitura e não emite reembolsos.

Precisa de Node 20 ou mais novo. Não tem `npm install`.

## Subir local

```bash
cp .env.example .env
node src/server.js
```

O painel fica em http://localhost:3000/painel e o webhook em `/webhooks/kiwify`.

Para conferir que tudo funciona sem tocar na Kiwify e sem enviar mensagem nenhuma:

```bash
node src/selftest.js
```

O teste sobe o servidor num diretório temporário, simula carrinho abandonado, compra aprovada e assinatura inválida, e confere o resultado.

## Configuração

Tudo fica no `.env`. Os campos estão comentados no `.env.example`. Os essenciais:

| Variável | Para que serve |
|---|---|
| `PUBLIC_URL` | endereço público do servidor, usado para montar a URL do webhook |
| `PANEL_USER` e `PANEL_PASSWORD` | acesso ao painel |
| `KIWIFY_CLIENT_ID`, `KIWIFY_CLIENT_SECRET`, `KIWIFY_ACCOUNT_ID` | credenciais da API, em Apps > API na Kiwify |
| `KIWIFY_WEBHOOK_TOKEN` | o mesmo token informado ao criar o webhook |
| `WHATSAPP_PROVIDER` | `dryrun`, `cloud` ou `zapi` |

O painel mostra no topo uma faixa amarela listando o que ainda falta configurar.

## Cadastrar o webhook

Com `PUBLIC_URL` e `KIWIFY_WEBHOOK_TOKEN` preenchidos:

```bash
node src/register-webhook.js
```

Se preferir fazer à mão, vá em Apps > Webhooks na Kiwify, aponte para `PUBLIC_URL/webhooks/kiwify`, use o mesmo token e marque os eventos: carrinho abandonado, compra aprovada, compra recusada, compra reembolsada, chargeback, boleto gerado, pix gerado e os três de assinatura.

### Como a assinatura é verificada

A Kiwify assina o corpo bruto da requisição com HMAC e envia o resultado em `?signature=`. O servidor recalcula com `KIWIFY_WEBHOOK_TOKEN` e compara em tempo constante. Assinatura errada ou ausente devolve 401 e o evento é registrado como recusado.

O padrão é SHA-1. Se os logs da Kiwify mostrarem recusa constante, teste `KIWIFY_SIGNATURE_ALGO=sha256`. Para depurar, `WEBHOOK_ALLOW_UNSIGNED=true` aceita qualquer corpo. Desligue logo em seguida: com isso ligado qualquer pessoa consegue injetar eventos falsos.

## Carrinho abandonado no WhatsApp

O fluxo é este:

1. A Kiwify reconhece o abandono de dez a quinze minutos depois e chama o webhook.
2. O servidor registra o abandono e coloca a mensagem numa fila persistente.
3. Passado `WHATSAPP_DELAY_MINUTES`, a mensagem é enviada pelo provedor escolhido.
4. Se a compra for aprovada antes do envio, a mensagem é cancelada e a pessoa entra na conta de recuperados.

Proteções embutidas:

- **`dryrun` é o padrão.** Nada é enviado até você trocar o provedor de propósito. As mensagens simuladas aparecem no log e no painel.
- **Janela de espera.** `WHATSAPP_COOLDOWN_HOURS` impede mandar de novo para o mesmo número.
- **Sem duplicidade.** As mensagens vencidas são retiradas da fila numa transação única, então dois processamentos simultâneos não enviam duas vezes.
- **Lista de exclusão.** `POST /api/optout` com `{"phone":"5564999885321"}` bloqueia o número para sempre.
- **Tentativas limitadas.** Falha de envio tenta de novo em dez minutos, no máximo três vezes.

### Provedores

`WHATSAPP_PROVIDER=cloud` usa a Cloud API da Meta. Fora da janela de 24 horas a Meta só entrega template aprovado, então crie um template com duas variáveis, nome e link, e coloque o nome dele em `WHATSAPP_CLOUD_TEMPLATE`.

`WHATSAPP_PROVIDER=zapi` usa a Z-API e envia texto livre, montado a partir de `WHATSAPP_MESSAGE`. Os marcadores `{nome}` e `{link}` são substituídos.

Antes de trocar para um provedor real, rode alguns dias em `dryrun` e leia no painel o que teria sido enviado.

## Painel

- Receita aprovada, vendas aprovadas, reembolsos, chargebacks, taxa de reembolso e ticket médio.
- Receita por dia, com gráfico e alternativa em tabela.
- Funil de carrinho abandonado, com quantos voltaram a comprar.
- Lista de vendas com filtro de situação.
- Últimos eventos recebidos do webhook.

O acesso é por usuário e senha. **Publique sempre atrás de HTTPS**, porque a autenticação básica manda a senha em cada requisição.

Se os valores aparecerem cem vezes maiores ou menores que o esperado, troque `KIWIFY_AMOUNT_IN_CENTS`. A API devolve centavos na maioria dos casos, e é isso que o padrão assume.

## Publicar

Este servidor é um processo que precisa ficar de pé, então não roda em hospedagem estática. Funciona em qualquer VPS, no Render, no Railway ou parecidos. O que importa:

- Rodar `node src/server.js` com um supervisor que reinicie sozinho.
- Expor por HTTPS, com o domínio em `PUBLIC_URL`.
- Manter a pasta `data/` em disco que persista, senão a fila e o histórico somem a cada reinício.
- Rodar **uma instância só**. O estado é guardado em arquivo, e duas instâncias competindo podem duplicar mensagens.

A landing page continua separada e pode seguir em hospedagem estática. Para servir as duas coisas pelo mesmo processo durante o desenvolvimento, use `SERVE_SITE=true`.

## Limites conhecidos

- A API da Kiwify aceita no máximo noventa dias por consulta. Períodos maiores são fatiados automaticamente, o que gasta mais chamadas. O limite é de cem chamadas por minuto.
- Os nomes de campo do evento de carrinho abandonado não estão na documentação pública. A leitura é tolerante e tenta vários formatos, e o payload bruto fica salvo em `data/events.jsonl`. Se algum campo vier diferente, dá para ajustar em `src/webhooks.js` olhando o que foi gravado.
- Se o processo cair entre a retirada da fila e o envio, aquela mensagem se perde. É de propósito: para um lembrete de carrinho, perder é melhor que mandar duas vezes.
