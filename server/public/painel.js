/* Painel de vendas e reembolsos. Somente leitura. */
(function () {
  "use strict";

  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const inteiro = new Intl.NumberFormat("pt-BR");
  const percentual = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
  const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

  const $ = (id) => document.getElementById(id);
  const inicio = $("inicio");
  const fim = $("fim");
  const dica = $("dica");

  const isoDia = (date) => date.toISOString().slice(0, 10);

  function definirPeriodo(dias) {
    const hoje = new Date();
    const de = new Date(hoje.getTime() - (dias - 1) * 86400000);
    inicio.value = isoDia(de);
    fim.value = isoDia(hoje);
  }

  /* As situações ganham rótulo em português e um papel da paleta de estado. */
  const SITUACOES = {
    paid: ["Aprovada", "good"],
    approved: ["Aprovada", "good"],
    authorized: ["Autorizada", "good"],
    waiting_payment: ["Aguardando", ""],
    pending: ["Pendente", ""],
    processing: ["Processando", ""],
    refused: ["Recusada", "warning"],
    refunded: ["Reembolsada", "serious"],
    pending_refund: ["Reembolso em análise", "serious"],
    refund_requested: ["Reembolso pedido", "serious"],
    chargedback: ["Chargeback", "critical"]
  };

  const METODOS = {
    credit_card: "Cartão", pix: "Pix", boleto: "Boleto",
    credit: "Cartão", card: "Cartão", paypal: "PayPal"
  };

  function situacao(status) {
    const [rotulo, papel] = SITUACOES[status] || [status || "—", ""];
    const span = document.createElement("span");
    span.className = "situacao " + papel;
    span.textContent = rotulo;
    return span;
  }

  async function buscar(rota, parametros) {
    const url = new URL(rota, window.location.origin);
    for (const [chave, valor] of Object.entries(parametros || {})) {
      if (valor) url.searchParams.set(chave, valor);
    }
    const resposta = await fetch(url, { headers: { Accept: "application/json" } });
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(corpo.erro || "Falha ao consultar " + rota);
    return corpo;
  }

  function mostrarErro(mensagem) {
    const caixa = $("erro");
    caixa.textContent = mensagem;
    caixa.hidden = !mensagem;
  }

  function mostrarAvisos(avisos) {
    const caixa = $("avisos");
    if (!avisos || avisos.length === 0) { caixa.hidden = true; return; }
    caixa.innerHTML = "<strong>Configuração pendente</strong><ul>" +
      avisos.map((aviso) => "<li>" + aviso.replace(/</g, "&lt;") + "</li>").join("") + "</ul>";
    caixa.hidden = false;
  }

  /* ---------- Gráfico de receita por dia ---------- */

  let serieAtual = [];

  function desenharGrafico(serie) {
    serieAtual = serie;
    const alvo = $("grafico");
    alvo.innerHTML = "";
    if (!serie.length) {
      alvo.innerHTML = '<p class="vazio">Sem vendas no período.</p>';
      return;
    }

    const largura = 960, altura = 260;
    const margem = { topo: 24, direita: 12, baixo: 30, esquerda: 64 };
    const areaL = largura - margem.esquerda - margem.direita;
    const areaA = altura - margem.topo - margem.baixo;
    const maximo = Math.max(...serie.map((d) => d.receita), 1);
    const passo = areaL / serie.length;
    const larguraBarra = Math.max(2, Math.min(28, passo - 2)); // 2px de respiro entre barras
    const svgNS = "http://www.w3.org/2000/svg";

    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("viewBox", "0 0 " + largura + " " + altura);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Receita líquida por dia no período selecionado");

    // Grade e escala vertical
    for (let i = 0; i <= 4; i++) {
      const y = margem.topo + (areaA / 4) * i;
      const linha = document.createElementNS(svgNS, "line");
      linha.setAttribute("class", "grade");
      linha.setAttribute("x1", margem.esquerda); linha.setAttribute("x2", largura - margem.direita);
      linha.setAttribute("y1", y); linha.setAttribute("y2", y);
      svg.appendChild(linha);

      const texto = document.createElementNS(svgNS, "text");
      texto.setAttribute("class", "eixo-texto");
      texto.setAttribute("x", margem.esquerda - 8);
      texto.setAttribute("y", y + 4);
      texto.setAttribute("text-anchor", "end");
      texto.textContent = brl.format((maximo / 4) * (4 - i)).replace(/\s/g, " ");
      svg.appendChild(texto);
    }

    const indiceMaximo = serie.reduce((melhor, item, i) => (item.receita > serie[melhor].receita ? i : melhor), 0);

    serie.forEach((ponto, i) => {
      const alturaBarra = (ponto.receita / maximo) * areaA;
      const x = margem.esquerda + passo * i + (passo - larguraBarra) / 2;
      const y = margem.topo + areaA - alturaBarra;
      const raio = Math.min(4, larguraBarra / 2, Math.max(0, alturaBarra));

      // Alvo de toque maior que a barra, para o ponteiro pegar fácil.
      const alvoBarra = document.createElementNS(svgNS, "rect");
      alvoBarra.setAttribute("class", "barra-alvo");
      alvoBarra.setAttribute("x", margem.esquerda + passo * i);
      alvoBarra.setAttribute("y", margem.topo);
      alvoBarra.setAttribute("width", passo);
      alvoBarra.setAttribute("height", areaA);
      svg.appendChild(alvoBarra);

      const barra = document.createElementNS(svgNS, "path");
      barra.setAttribute("class", "barra");
      barra.setAttribute("d",
        "M" + x + " " + (margem.topo + areaA) +
        " V" + (y + raio) +
        " a" + raio + " " + raio + " 0 0 1 " + raio + " " + -raio +
        " h" + (larguraBarra - raio * 2) +
        " a" + raio + " " + raio + " 0 0 1 " + raio + " " + raio +
        " V" + (margem.topo + areaA) + " Z");
      svg.appendChild(barra);

      const mostrar = (evento) => {
        barra.classList.add("ativa");
        dica.innerHTML = "<strong>" + new Date(ponto.dia + "T12:00:00").toLocaleDateString("pt-BR") + "</strong>" +
          brl.format(ponto.receita) + "<br>" + inteiro.format(ponto.aprovadas) + " aprovada(s)" +
          (ponto.reembolsos ? "<br>" + inteiro.format(ponto.reembolsos) + " reembolso(s)" : "");
        dica.hidden = false;
        const limite = window.innerWidth - dica.offsetWidth - 12;
        dica.style.left = Math.min(evento.clientX + 12, limite) + "px";
        dica.style.top = Math.max(8, evento.clientY - dica.offsetHeight - 12) + "px";
      };
      const esconder = () => { barra.classList.remove("ativa"); dica.hidden = true; };
      alvoBarra.addEventListener("mousemove", mostrar);
      alvoBarra.addEventListener("mouseleave", esconder);
      alvoBarra.addEventListener("touchstart", (e) => mostrar(e.touches[0]), { passive: true });
      alvoBarra.addEventListener("touchend", esconder);

      // Rótulo direto apenas no melhor dia, para não poluir.
      if (i === indiceMaximo && ponto.receita > 0) {
        const rotulo = document.createElementNS(svgNS, "text");
        rotulo.setAttribute("class", "rotulo-direto");
        rotulo.setAttribute("x", x + larguraBarra / 2);
        rotulo.setAttribute("y", y - 6);
        rotulo.setAttribute("text-anchor", "middle");
        rotulo.textContent = brl.format(ponto.receita);
        svg.appendChild(rotulo);
      }

      // Datas espaçadas no eixo horizontal
      const cada = Math.ceil(serie.length / 10);
      if (i % cada === 0) {
        const texto = document.createElementNS(svgNS, "text");
        texto.setAttribute("class", "eixo-texto");
        texto.setAttribute("x", x + larguraBarra / 2);
        texto.setAttribute("y", altura - 10);
        texto.setAttribute("text-anchor", "middle");
        texto.textContent = ponto.dia.slice(8) + "/" + ponto.dia.slice(5, 7);
        svg.appendChild(texto);
      }
    });

    alvo.appendChild(svg);
  }

  function desenharTabelaDoGrafico() {
    const alvo = $("grafico-tabela");
    const linhas = serieAtual.map((ponto) =>
      "<tr><td>" + new Date(ponto.dia + "T12:00:00").toLocaleDateString("pt-BR") + "</td>" +
      "<td class='num'>" + brl.format(ponto.receita) + "</td>" +
      "<td class='num'>" + inteiro.format(ponto.aprovadas) + "</td>" +
      "<td class='num'>" + inteiro.format(ponto.reembolsos) + "</td></tr>").join("");
    alvo.innerHTML = "<table><thead><tr><th>Dia</th><th class='num'>Receita</th>" +
      "<th class='num'>Aprovadas</th><th class='num'>Reembolsos</th></tr></thead><tbody>" +
      (linhas || "<tr><td colspan='4' class='vazio'>Sem dados.</td></tr>") + "</tbody></table>";
  }

  $("alternar-tabela").addEventListener("click", function () {
    const tabela = $("grafico-tabela");
    const mostrando = tabela.hidden;
    if (mostrando) desenharTabelaDoGrafico();
    tabela.hidden = !mostrando;
    $("grafico").hidden = mostrando;
    this.textContent = mostrando ? "Ver como gráfico" : "Ver como tabela";
  });

  /* ---------- Carregamento ---------- */

  async function carregarResumo() {
    const dados = await buscar("/api/overview", { start: inicio.value, end: fim.value });
    const r = dados.resumo;

    $("kpi-receita").textContent = brl.format(r.receita);
    $("kpi-ticket").textContent = "Ticket médio " + brl.format(r.ticket_medio);
    $("kpi-aprovadas").textContent = inteiro.format(r.aprovadas);
    $("kpi-pendentes").textContent = inteiro.format(r.pendentes) + " aguardando pagamento";
    $("kpi-reembolsos").textContent = inteiro.format(r.reembolsos);
    $("kpi-reembolsado").textContent = brl.format(r.reembolsado) + " devolvidos";
    $("kpi-chargebacks").textContent = inteiro.format(r.chargebacks);
    $("kpi-recusadas").textContent = inteiro.format(r.recusadas) + " compras recusadas";
    $("kpi-taxa").textContent = percentual.format(r.taxa_reembolso);

    const f = dados.funil;
    $("fn-abandonados").textContent = inteiro.format(f.carrinhos_abandonados);
    $("fn-enviados").textContent = inteiro.format(f.whatsapp_enviados);
    $("fn-recuperados").textContent = inteiro.format(f.recuperados);
    $("fn-fila").textContent = inteiro.format(f.na_fila);

    const observacoes = [];
    if (f.whatsapp_dryrun) observacoes.push(inteiro.format(f.whatsapp_dryrun) + " mensagem(ns) apenas simulada(s) em modo dryrun.");
    if (f.whatsapp_falhas) observacoes.push(inteiro.format(f.whatsapp_falhas) + " falha(s) de envio.");
    $("fn-observacao").textContent = observacoes.join(" ");

    mostrarAvisos(dados.avisos);
    desenharGrafico(dados.serie);
  }

  async function carregarVendas() {
    const corpo = document.querySelector("#tabela-vendas tbody");
    const dados = await buscar("/api/sales", {
      start: inicio.value, end: fim.value, status: $("filtro-status").value
    });
    corpo.innerHTML = "";
    $("contagem-vendas").textContent = dados.total > dados.vendas.length
      ? "Mostrando " + inteiro.format(dados.vendas.length) + " de " + inteiro.format(dados.total)
      : inteiro.format(dados.total) + " venda(s)";
    if (!dados.vendas.length) {
      corpo.innerHTML = "<tr><td colspan='6' class='vazio'>Nenhuma venda no período.</td></tr>";
      return;
    }
    for (const venda of dados.vendas) {
      const linha = document.createElement("tr");
      const celula = (texto) => { const td = document.createElement("td"); td.textContent = texto; return td; };
      linha.appendChild(celula(venda.data ? dataHora.format(new Date(venda.data)) : "—"));
      linha.appendChild(celula(venda.cliente || venda.email || "—"));
      linha.appendChild(celula(venda.produto || "—"));
      linha.appendChild(celula(METODOS[venda.metodo] || venda.metodo || "—"));
      const tdSituacao = document.createElement("td");
      tdSituacao.appendChild(situacao(venda.status));
      linha.appendChild(tdSituacao);
      const tdValor = celula(brl.format(venda.valor));
      tdValor.className = "num";
      linha.appendChild(tdValor);
      corpo.appendChild(linha);
    }
  }

  async function carregarEventos() {
    const corpo = document.querySelector("#tabela-eventos tbody");
    const dados = await buscar("/api/events", { limit: 60 });
    corpo.innerHTML = "";
    if (!dados.eventos.length) {
      corpo.innerHTML = "<tr><td colspan='4' class='vazio'>Nenhum evento recebido ainda.</td></tr>";
      return;
    }
    for (const evento of dados.eventos) {
      const linha = document.createElement("tr");
      const celula = (texto, classe) => {
        const td = document.createElement("td");
        td.textContent = texto;
        if (classe) td.className = classe;
        return td;
      };
      linha.appendChild(celula(dataHora.format(new Date(evento.received_at))));
      linha.appendChild(celula(dados.rotulos[evento.type] || evento.type || "—"));
      linha.appendChild(celula(evento.customer?.name || evento.nome || evento.customer?.email || "—"));
      linha.appendChild(celula(evento.detalhe || evento.motivo || evento.product || "—", "detalhe"));
      corpo.appendChild(linha);
    }
  }

  async function carregarTudo() {
    mostrarErro("");
    try {
      await carregarResumo();
    } catch (error) {
      mostrarErro(error.message);
    }
    try {
      await carregarVendas();
    } catch (error) {
      document.querySelector("#tabela-vendas tbody").innerHTML =
        "<tr><td colspan='6' class='vazio'>" + error.message + "</td></tr>";
    }
    try {
      await carregarEventos();
    } catch (error) {
      document.querySelector("#tabela-eventos tbody").innerHTML =
        "<tr><td colspan='4' class='vazio'>" + error.message + "</td></tr>";
    }
  }

  document.querySelectorAll(".periodo button").forEach((botao) => {
    botao.addEventListener("click", function () {
      document.querySelectorAll(".periodo button").forEach((outro) => outro.classList.remove("ativo"));
      this.classList.add("ativo");
      definirPeriodo(Number(this.dataset.dias));
      carregarTudo();
    });
  });
  $("atualizar").addEventListener("click", carregarTudo);
  $("filtro-status").addEventListener("change", () => carregarVendas().catch((e) => mostrarErro(e.message)));

  definirPeriodo(90);
  carregarTudo();
})();
