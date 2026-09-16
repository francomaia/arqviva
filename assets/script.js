/* ============================================================
   ArqViva – Arquitetando Processos | Interações
   ============================================================ */
(function () {
  "use strict";

  const REDUCED = false; // Animações sempre ativas neste site.
  document.documentElement.classList.add("js");

  /* ---------- Links configuráveis ---------- */
  const LINKS = {
    aluno: "https://dashboard.kiwify.com.br/courses", // login e cursos do aluno
    comprar: "https://pay.kiwify.com.br/uca7qGd",     // checkout
    whatsapp: "https://api.whatsapp.com/send/?phone=5564999885321" // número do WhatsApp
  };
  document.getElementById("btn-aluno").href = LINKS.aluno;
  document.getElementById("btn-comprar").href = LINKS.comprar;
  document.getElementById("btn-whatsapp").href = LINKS.whatsapp;

  /* ---------- Vídeos ---------- */

  /*
   * A barra da VSL cresce depressa no começo e vai arrastando no fim.
   * O expoente abaixo de 1 deixa a curva côncava: com 10% assistido a barra já
   * marca cerca de 45%, na metade marca 77%, e os últimos minutos quase não
   * andam. Diminua o número para exagerar o efeito, aumente para suavizar.
   */
  const CURVA_PROGRESSO = 0.38;

  function configurarVSL(box) {
    const video = box.querySelector("video");
    const palco = box.closest(".video-palco");
    const timer = palco.querySelector(".video-timer");
    const barra = timer.querySelector("span");
    const aviso = box.querySelector(".video-sound");
    const btnPlay = box.querySelector(".video-toggle");
    const btnSom = box.querySelector(".video-mudo");
    const btnTela = box.querySelector(".video-tela");
    let esperandoGesto = false;

    function sincronizarSom() {
      box.classList.toggle("com-som", !video.muted);
      btnSom.setAttribute("aria-label", video.muted ? "Ativar som" : "Desativar som");
      if (aviso) aviso.hidden = !(video.muted && !video.paused);
    }

    function liberarSom(evento) {
      if (evento && evento.type === "keydown" && evento.key !== "Enter" && evento.key !== " ") return;
      esperandoGesto = false;
      document.removeEventListener("click", liberarSom, true);
      document.removeEventListener("keydown", liberarSom, true);
      video.muted = false;
      sincronizarSom();
      tocar();
    }

    function tocar() {
      const tentativa = video.play();
      if (!tentativa) return;
      tentativa.catch(function (erro) {
        if (erro.name !== "NotAllowedError") return;
        // O navegador barrou o som. Toca mudo e espera um clique para liberar.
        if (!video.muted) {
          video.muted = true;
          sincronizarSom();
          tocar();
          return;
        }
        if (!esperandoGesto) {
          esperandoGesto = true;
          document.addEventListener("click", liberarSom, true);
          document.addEventListener("keydown", liberarSom, true);
        }
      });
    }

    function atualizarBarra() {
      const duracao = video.duration;
      const assistido = Number.isFinite(duracao) && duracao > 0
        ? Math.min(1, Math.max(0, video.currentTime / duracao))
        : 0;
      const mostrado = video.ended ? 1 : Math.pow(assistido, CURVA_PROGRESSO);
      barra.style.transform = "scaleX(" + mostrado + ")";
      timer.setAttribute("aria-valuenow", Math.round(mostrado * 100));
    }

    function alternar() {
      if (video.paused) tocar();
      else video.pause();
    }

    btnPlay.addEventListener("click", function (e) { e.stopPropagation(); alternar(); });
    video.addEventListener("click", alternar);
    btnSom.addEventListener("click", function (e) {
      e.stopPropagation();
      video.muted = !video.muted;
      sincronizarSom();
    });
    btnTela.addEventListener("click", function (e) {
      e.stopPropagation();
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      // Tela cheia no palco inteiro: a barra vai junto e o player nativo,
      // que mostraria a duração e deixaria avançar, não aparece.
      if (palco.requestFullscreen) palco.requestFullscreen();
      else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
    });

    // Sem controles nativos as setas não avançam o vídeo, mas o bloqueio
    // garante que nem pelo teclado dá para pular trecho.
    const TECLAS_BLOQUEADAS = ["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"];
    box.addEventListener("keydown", function (e) {
      if (TECLAS_BLOQUEADAS.indexOf(e.key) !== -1) e.preventDefault();
    });
    video.addEventListener("contextmenu", function (e) { e.preventDefault(); });

    video.addEventListener("play", function () {
      box.classList.add("playing");
      btnPlay.setAttribute("aria-label", "Pausar vídeo");
    });
    video.addEventListener("pause", function () {
      box.classList.remove("playing");
      btnPlay.setAttribute("aria-label", "Reproduzir vídeo");
      sincronizarSom();
    });
    video.addEventListener("playing", sincronizarSom);
    video.addEventListener("volumechange", sincronizarSom);
    ["loadedmetadata", "timeupdate", "seeked", "ended", "emptied"].forEach(function (evento) {
      video.addEventListener(evento, atualizarBarra);
    });
    if (aviso) aviso.addEventListener("click", function (e) { e.stopPropagation(); liberarSom(); });

    video.volume = 1;
    video.muted = false;
    sincronizarSom();
    atualizarBarra();
    tocar();
  }

  /* Depoimentos seguem com o player nativo, que ali não atrapalha. */
  function configurarDepoimento(box) {
    const video = box.querySelector("video");
    const play = box.querySelector(".play-btn");

    function iniciar() {
      box.classList.add("playing");
      video.controls = true;
      video.muted = false;
      const tentativa = video.play();
      if (tentativa) tentativa.catch(function () { box.classList.remove("playing"); });
    }

    if (play) {
      play.addEventListener("click", function (e) { e.stopPropagation(); iniciar(); });
      box.addEventListener("click", function () {
        if (!box.classList.contains("playing")) iniciar();
      });
    }
    video.addEventListener("playing", function () {
      box.classList.add("playing");
      video.controls = true;
    });
    video.addEventListener("ended", function () {
      box.classList.remove("playing");
      video.controls = false;
      video.currentTime = 0;
    });
  }

  document.querySelectorAll(".video-box").forEach(function (box) {
    if (box.classList.contains("video-vsl")) configurarVSL(box);
    else configurarDepoimento(box);
  });

  /* Indicadores que acompanham hover, toque e teclado. */
  document.querySelectorAll(".list, .stats").forEach(function (group) {
    const items = Array.from(group.children);
    let selected = items.find(function (item) { return item.classList.contains("active") || item.classList.contains("stat-white"); }) || items[0];
    let manualUntil = 0, scrollFrame = null;
    function select(item, manual) {
      if (manual) manualUntil = performance.now() + 1400;
      selected = item;
      items.forEach(function (entry) {
        const active = entry === item;
        entry.classList.toggle("active", active);
        entry.setAttribute("aria-pressed", String(active));
        const icon = entry.querySelector("img");
        if (icon) icon.src = "assets/svg/" + ((group.classList.contains("list-dark") === active) ? "icon.svg" : "icon-dark.svg");
      });
      measure();
    }
    function measure() {
      group.style.setProperty("--indicator-x", selected.offsetLeft + "px");
      group.style.setProperty("--indicator-y", selected.offsetTop + "px");
      group.style.setProperty("--indicator-w", selected.offsetWidth + "px");
      group.style.setProperty("--indicator-h", selected.offsetHeight + "px");
    }
    items.forEach(function (item) {
      item.tabIndex = 0; item.setAttribute("role", "button");
      item.addEventListener("pointerenter", function (e) { if (e.pointerType !== "touch") select(item, true); });
      item.addEventListener("click", function () { select(item, true); });
      item.addEventListener("focus", function () { select(item, true); });
      item.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(item, true); } });
    });
    group.classList.add("sliding-indicator");
    select(selected);
    if ("ResizeObserver" in window) {
      const observer = new ResizeObserver(measure);
      observer.observe(group);
      items.forEach(function (item) { observer.observe(item); });
    } else window.addEventListener("resize", measure);
    if (document.fonts) document.fonts.ready.then(measure);

    /* No mobile, o destaque percorre a lista conforme ela cruza a tela. */
    if (group.classList.contains("list")) {
      function followScroll() {
        scrollFrame = null;
        if (!window.matchMedia("(max-width: 760px)").matches || performance.now() < manualUntil) return;
        const rect = group.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;
        const focus = window.innerHeight * 0.62;
        let closest = items[0], distance = Infinity;
        items.forEach(function (item) {
          const itemRect = item.getBoundingClientRect();
          const nextDistance = Math.abs(itemRect.top + itemRect.height / 2 - focus);
          if (nextDistance < distance) { closest = item; distance = nextDistance; }
        });
        select(closest, false);
      }
      function queueFollowScroll() {
        if (scrollFrame === null) scrollFrame = requestAnimationFrame(followScroll);
      }
      window.addEventListener("scroll", queueFollowScroll, { passive: true });
      window.addEventListener("resize", queueFollowScroll);
      queueFollowScroll();
    }
  });

  /* ---------- Carrossel de módulos ---------- */
  const MODULES = [
    { key: "integracao",  label: "Integração<br>tecnológica",       img: "assets/img/mod-integracao.jpg" },
    { key: "mapeamento",  label: "Mapeamento do<br>ciclo do cliente", img: "assets/img/mod-mapeamento.jpg" },
    { key: "setorizacao", label: "Setorização",                      img: "assets/img/mod-setorizacao.jpg" },
    { key: "gestao",      label: "Gestão eficiente",                 img: "assets/img/mod-gestao-eficiente.jpg" },
    { key: "colab",       label: "Gestão de<br>colaboradores",       img: "assets/img/mod-gestao-colaboradores.jpg" }
  ];
  const track = document.getElementById("carousel-track");
  const carousel = document.getElementById("carousel");
  const REPEAT = 3;                       // uma cópia visível e uma de cada lado
  const cards = [];
  const fragment = document.createDocumentFragment();
  for (let r = 0; r < REPEAT; r++) {
    MODULES.forEach(function (m) {
      const card = document.createElement("div");
      card.className = "mod-card";
      card.innerHTML =
        '<img src="' + m.img + '" alt="' + m.label.replace(/<br>/g, " ") + '">' +
        '<img class="mod-icon" src="assets/svg/icon.svg" alt="">' +
        '<span class="mod-label">' + m.label + "</span>";
      card.addEventListener("click", function () {
        if (dragged) return;
        const r = card.getBoundingClientRect(), c = carousel.getBoundingClientRect();
        boost += (r.left + r.width / 2) - (c.left + c.width / 2);   // traz o card ao centro
      });
      fragment.appendChild(card); cards.push(card);
    });
  }
  track.appendChild(fragment);

  let offset = 0, boost = 0, speed = REDUCED ? 0 : 52, speedFactor = 1, targetFactor = 1;
  let last = performance.now(), setWidth = 0, carouselWidth = 0, firstCenter = 0, cardStep = 0;
  let activeCard = null, dragged = false, visible = false, frameId = null;
  function measure() {
    setWidth = cards[MODULES.length].offsetLeft - cards[0].offsetLeft;
    cardStep = setWidth / MODULES.length;
    firstCenter = cards[0].offsetLeft + cards[0].offsetWidth / 2;
    // Começa na segunda cópia, com cards disponíveis dos dois lados.
    carouselWidth = carousel.getBoundingClientRect().width;
    const centerCard = cards[MODULES.length + 2];
    offset = centerCard.offsetLeft + centerCard.offsetWidth / 2 - carouselWidth / 2;
  }
  function frame(now) {
    frameId = null;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    speedFactor += (targetFactor - speedFactor) * 0.08;
    offset += speed * speedFactor * dt;
    if (Math.abs(boost) > 0.3) { const step = boost * 0.11; offset += step; boost -= step; } else boost = 0;
    if (setWidth) { while (offset >= setWidth * 2) offset -= setWidth; while (offset < setWidth) offset += setWidth; }
    track.style.transform = "translate3d(" + (-offset).toFixed(2) + "px,0,0)";
    // Os cards têm largura fixa; o índice central não precisa medir o DOM a cada frame.
    const mid = offset + carouselWidth / 2;
    const bestIndex = Math.max(0, Math.min(cards.length - 1, Math.round((mid - firstCenter) / cardStep)));
    if (activeCard !== cards[bestIndex]) {
      if (activeCard) activeCard.classList.remove("active");
      activeCard = cards[bestIndex];
      activeCard.classList.add("active");
    }
    if (visible) frameId = requestAnimationFrame(frame);
  }
  function startFrame() {
    if (frameId === null) { last = performance.now(); frameId = requestAnimationFrame(frame); }
  }
  measure();
  window.addEventListener("resize", measure);
  window.addEventListener("load", measure);
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) startFrame();
      else if (frameId !== null) { cancelAnimationFrame(frameId); frameId = null; }
    }, { rootMargin: "120px" }).observe(carousel);
  } else { visible = true; startFrame(); }

  carousel.addEventListener("mouseenter", function () { targetFactor = 0; });
  carousel.addEventListener("mouseleave", function () { targetFactor = 1; });
  document.querySelector(".carousel-arrow.prev").addEventListener("click", function () { boost -= setWidth / MODULES.length; });
  document.querySelector(".carousel-arrow.next").addEventListener("click", function () { boost += setWidth / MODULES.length; });

  /* arrastar com o mouse / dedo */
  let dragX = null, dragStart = 0;
  track.addEventListener("pointerdown", function (e) { dragX = e.clientX; dragStart = e.clientX; dragged = false; targetFactor = 0; track.setPointerCapture(e.pointerId); });
  track.addEventListener("pointermove", function (e) {
    if (dragX === null) return;
    offset -= e.clientX - dragX; dragX = e.clientX;
    if (Math.abs(e.clientX - dragStart) > 6) dragged = true;
  });
  function endDrag() { dragX = null; targetFactor = carousel.matches(":hover") ? 0 : 1; setTimeout(function () { dragged = false; }, 50); }
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", endDrag);
  track.style.touchAction = "pan-y";

  /* ---------- Diagnóstico rápido (quiz) ---------- */
  const QUESTIONS = [
    {
      q: "1. Quando você não está no escritório,<br>o trabalho continua andando normalmente?",
      options: [
        { t: "Sim, a equipe resolve sozinha", s: 3 },
        { t: "Mais ou menos, sempre sobra algo pra mim", s: 2 },
        { t: "Não, quase tudo trava sem mim", s: 1 },
        { t: "Ainda quero abrir meu escritório", s: 0 }
      ]
    },
    {
      q: "2. Como os projetos são conduzidos<br>no seu escritório hoje?",
      options: [
        { t: "Temos processos claros que a equipe segue", s: 3 },
        { t: "Existe um padrão, mas nem sempre é seguido", s: 2 },
        { t: "Cada projeto é de um jeito, depende do momento", s: 1 },
        { t: "Ainda não tenho projetos rodando", s: 0 }
      ]
    },
    {
      q: "3. Quando um cliente pede uma informação,<br>onde ela está?",
      options: [
        { t: "Centralizada, toda a equipe acessa", s: 3 },
        { t: "Espalhada entre e-mail, planilhas e conversas", s: 2 },
        { t: "Na minha cabeça ou no meu WhatsApp", s: 1 },
        { t: "Ainda não tenho clientes", s: 0 }
      ]
    },
    {
      q: "4. Como você se sente em relação<br>ao crescimento do escritório?",
      options: [
        { t: "Crescer é tranquilo, a estrutura sustenta", s: 3 },
        { t: "Consigo crescer, mas com muito desgaste", s: 2 },
        { t: "Crescer significa mais trabalho pra mim", s: 1 },
        { t: "Quero crescer, mas não sei por onde começar", s: 0 }
      ]
    },
    {
      q: "5. Como está a recorrência<br>de clientes hoje?",
      options: [
        { t: "Tenho um fluxo constante e previsível", s: 3 },
        { t: "Alguns voltam, mas sem previsibilidade", s: 2 },
        { t: "Dependo de indicação e de sorte", s: 1 },
        { t: "Ainda estou começando", s: 0 }
      ]
    }
  ];

  const RESULTS = [
    {
      max: 4,
      tag: "PONTO DE PARTIDA",
      title: "Você está prestes a <span class=\"display\">começar do jeito certo.</span>",
      text: "Quem monta o escritório já com processo não precisa desfazer vícios depois. O Arquitetando Processos mostra a estrutura antes de o improviso virar rotina."
    },
    {
      max: 8,
      tag: "ESCRITÓRIO ARTESANAL",
      title: "Hoje, tudo passa <span class=\"display\">por você.</span>",
      text: "Seu escritório depende do seu esforço para funcionar. É o estágio em que crescer vira sobrecarga. Setorizar e mapear o ciclo do cliente é o primeiro passo para sair do improviso."
    },
    {
      max: 12,
      tag: "EM TRANSIÇÃO",
      title: "Você já tentou organizar, <span class=\"display\">mas ainda sobra pra você.</span>",
      text: "Existe padrão, mas ele não se sustenta sozinho. Com processos claros e integração tecnológica, a equipe passa a rodar sem você precisar segurar tudo."
    },
    {
      max: 15,
      tag: "ESCRITÓRIO EMPRESARIAL",
      title: "Sua estrutura já funciona. <span class=\"display\">Agora é escalar.</span>",
      text: "Você já opera com método. O Arquitetando Processos ajuda a refinar a gestão de colaboradores e a recorrência para crescer sem perder o controle."
    }
  ];

  const quizBody = document.getElementById("quiz-body");
  const progress = document.getElementById("quiz-progress");
  let step = 0;
  let answers = [];

  /* troca de conteúdo com saída → entrada animada */
  function swapQuiz(render) {
    if (REDUCED || !quizBody.children.length) { quizBody.classList.remove("q-leave"); render(); quizBody.classList.add("q-enter"); return; }
    quizBody.classList.remove("q-enter");
    quizBody.classList.add("q-leave");
    setTimeout(function () {
      quizBody.classList.remove("q-leave");
      render();
      void quizBody.offsetWidth;
      quizBody.classList.add("q-enter");
    }, 300);
  }

  function renderQuestion() { swapQuiz(paintQuestion); }
  function renderResult() { swapQuiz(paintResult); }

  function animateQuizText() {
    if (REDUCED) return;
    quizBody.querySelectorAll(".quiz-question, .quiz-result h3").forEach(function (el) {
      el.setAttribute("data-text", "words"); splitText(el, "words");
      requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add("is-in"); }); });
    });
  }
  function paintQuestion() {
    const item = QUESTIONS[step];
    progress.style.width = ((step + 0.5) / QUESTIONS.length * 100) + "%";
    quizBody.innerHTML =
      '<p class="quiz-question">' + item.q + "</p>" +
      '<div class="quiz-options">' +
      item.options.map(function (o, i) {
        return '<button class="quiz-option" data-i="' + i + '">' + o.t + "</button>";
      }).join("") +
      "</div>";

    quizBody.querySelectorAll(".quiz-option").forEach(function (btn) {
      btn.addEventListener("click", function () {
        quizBody.querySelectorAll(".quiz-option").forEach(function (b) { b.classList.remove("selected"); });
        btn.classList.add("selected");
        answers[step] = item.options[+btn.dataset.i].s;
        setTimeout(function () {
          step++;
          if (step < QUESTIONS.length) renderQuestion(); else renderResult();
        }, 450);
      });
    });
    animateQuizText();
  }

  function paintResult() {
    progress.style.width = "100%";
    const total = answers.reduce(function (a, b) { return a + b; }, 0);
    const r = RESULTS.find(function (x) { return total <= x.max; }) || RESULTS[RESULTS.length - 1];
    quizBody.innerHTML =
      '<div class="quiz-result">' +
      '<span class="result-tag">' + r.tag + "</span>" +
      "<h3>" + r.title + "</h3>" +
      "<p>" + r.text + "</p>" +
      '<a href="#oferta" class="btn btn-cta btn-red">QUERO FAZER PARTE</a>' +
      '<a href="#diagnostico" class="restart" id="quiz-restart">Refazer o diagnóstico</a>' +
      "</div>";
    document.getElementById("quiz-restart").addEventListener("click", function () {
      step = 0; answers = []; renderQuestion();
    });
    animateQuizText();
  }
  paintQuestion();
  quizBody.classList.add("q-enter");

  /* ---------- Botão voltar ao topo + header compacto ---------- */
  const topBtn = document.getElementById("btn-top");
  const header = document.querySelector(".header");
  let bar = null, scrollFrame = null;
  function updateScrollUI() {
    scrollFrame = null;
    const y = window.scrollY;
    topBtn.classList.toggle("show", y > 600);
    header.classList.toggle("is-scrolled", y > 80);
    if (bar) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.transform = "scaleX(" + (max > 0 ? y / max : 0) + ")";
    }
  }
  function queueScrollUI() {
    if (scrollFrame === null) scrollFrame = requestAnimationFrame(updateScrollUI);
  }
  window.addEventListener("scroll", queueScrollUI, { passive: true });
  updateScrollUI();

  /* ---------- FAQ: abre/fecha com altura animada e fecha os outros ---------- */
  document.querySelectorAll(".faq-item").forEach(function (d) {
    const summary = d.querySelector("summary");
    const answer = d.querySelector(".faq-answer");
    let busy = false;

    function open() {
      d.open = true;
      const h = answer.scrollHeight;
      answer.style.height = "0px";
      requestAnimationFrame(function () {
        answer.style.transition = "height .45s cubic-bezier(.16,1,.3,1)";
        answer.style.height = h + "px";
      });
      answer.addEventListener("transitionend", function te() {
        answer.style.height = ""; answer.style.transition = ""; busy = false;
        answer.removeEventListener("transitionend", te);
      });
    }
    function close() {
      const h = answer.scrollHeight;
      answer.style.height = h + "px";
      requestAnimationFrame(function () {
        answer.style.transition = "height .35s cubic-bezier(.16,1,.3,1)";
        answer.style.height = "0px";
      });
      answer.addEventListener("transitionend", function te() {
        d.open = false; answer.style.height = ""; answer.style.transition = ""; busy = false;
        answer.removeEventListener("transitionend", te);
      });
    }

    summary.addEventListener("click", function (e) {
      e.preventDefault();
      if (busy) return;
      if (REDUCED) { d.open = !d.open; if (d.open) closeOthers(); return; }
      busy = true;
      if (d.open) close(); else { closeOthers(); open(); }
    });
    function closeOthers() {
      document.querySelectorAll(".faq-item[open]").forEach(function (o) {
        if (o !== d) o.querySelector("summary").click();
      });
    }
  });

  /* ============================================================
     ANIMAÇÕES DE TEXTO — divide em palavras / letras
     ============================================================ */
  function splitText(el, mode) {
    if (el.dataset.split) return;
    el.dataset.split = mode;
    let i = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (node) {
      if (!node.nodeValue.trim()) return;
      const frag = document.createDocumentFragment();
      if (mode === "chars") {
        node.nodeValue.split("").forEach(function (ch) {
          if (ch === " ") { frag.appendChild(document.createTextNode(" ")); return; }
          const sp = document.createElement("span");
          sp.className = "c"; sp.textContent = ch; sp.style.setProperty("--i", i++);
          frag.appendChild(sp);
        });
      } else {
        node.nodeValue.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
          const sp = document.createElement("span");
          sp.className = "w"; sp.textContent = part; sp.style.setProperty("--i", i++);
          frag.appendChild(sp);
        });
      }
      node.parentNode.replaceChild(frag, node);
    });
  }
  if (!REDUCED) {
    document.querySelectorAll("[data-text]").forEach(function (el) { splitText(el, el.dataset.text); });
  } else {
    document.querySelectorAll("[data-text]").forEach(function (el) { el.removeAttribute("data-text"); });
  }

  /* ============================================================
     ANIMAÇÕES DE SURGIMENTO (reveal on scroll)
     ============================================================ */
  /* Stagger: cada filho direto vira um reveal "up" com atraso incremental */
  document.querySelectorAll("[data-stagger]").forEach(function (group) {
    const step = +group.dataset.staggerStep || 90;
    const base = +group.dataset.delay || 0;
    let i = 0;
    Array.prototype.forEach.call(group.children, function (child) {
      if (child.matches("ul, ol")) {
        Array.prototype.forEach.call(child.children, function (li) {
          if (!li.hasAttribute("data-reveal")) li.setAttribute("data-reveal", "left");
          li.style.setProperty("--d", (base + step * i++) + "ms");
        });
        return;
      }
      if (!child.hasAttribute("data-reveal") && !child.hasAttribute("data-text")) child.setAttribute("data-reveal", "up");
      child.style.setProperty("--d", (base + step * i++) + "ms");
    });
  });
  document.querySelectorAll("[data-reveal][data-delay]").forEach(function (el) {
    el.style.setProperty("--d", el.dataset.delay + "ms");
  });

  const revealEls = document.querySelectorAll("[data-reveal], [data-text]");

  /* Contadores numéricos (10, 300+, 247) */
  function runCounter(el) {
    if (el.dataset.counted) return;
    el.dataset.counted = "1";
    const target = +el.dataset.count;
    const suffix = el.dataset.suffix || "";
    if (REDUCED) { el.textContent = target + suffix; return; }
    const dur = 1400;
    const t0 = performance.now();
    (function tick(now) {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(target * eased) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    })(t0);
  }

  function show(el) {
    el.classList.add("is-in");
    el.querySelectorAll("[data-count]").forEach(runCounter);
    if (el.hasAttribute("data-count")) runCounter(el);
    /* ao terminar, devolve o elemento ao CSS normal (hover etc. voltam a valer) */
    setTimeout(function () {
      el.classList.add("is-done");
      if (el.hasAttribute("data-text")) return;
      el.removeAttribute("data-reveal");
      el.style.removeProperty("--d");
    }, 1500 + (parseInt(el.style.getPropertyValue("--d")) || 0));
  }

  document.querySelectorAll(".hero h1 [data-text]").forEach(function (el) { el.classList.add("is-in"); });

  if ("IntersectionObserver" in window && !REDUCED) {
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { show(en.target); io.unobserve(en.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.1 });
    revealEls.forEach(function (el) { io.observe(el); });
    /* no fim da página (rodapé), revela tudo que ainda restar */
    function revealAtBottom() {
      if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4) {
        revealEls.forEach(function (el) { if (!el.classList.contains("is-in")) { show(el); io.unobserve(el); } });
        window.removeEventListener("scroll", revealAtBottom);
      }
    }
    window.addEventListener("scroll", revealAtBottom, { passive: true });
    /* segurança: nada fica escondido se algo falhar */
    setTimeout(function () {
      revealEls.forEach(function (el) {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0) show(el);
      });
    }, 2500);
  } else {
    revealEls.forEach(show);
  }

  /* Parallax sutil nas fotos dos cards */
  const parallaxEls = Array.prototype.map.call(document.querySelectorAll("[data-parallax]"), function (el) {
    return { element: el, image: el.querySelector("img"), amount: +el.dataset.parallax || -20 };
  });
  if (parallaxEls.length && !REDUCED && window.matchMedia("(min-width: 761px)").matches) {
    let ticking = false;
    function parallax() {
      ticking = false;
      const vh = window.innerHeight;
      parallaxEls.forEach(function (item) {
        const r = item.element.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) return;
        const center = (r.top + r.height / 2 - vh / 2) / vh; // -0.5 .. 0.5
        if (item.image) item.image.style.transform = "translate3d(0," + (center * item.amount * 2).toFixed(1) + "px,0)";
      });
    }
    window.addEventListener("scroll", function () {
      if (!ticking) { ticking = true; requestAnimationFrame(parallax); }
    }, { passive: true });
    parallax();
  }

  /* ---------- Barra de progresso de leitura ---------- */
  bar = document.createElement("div");
  bar.className = "scroll-progress"; document.body.appendChild(bar);
  updateScrollUI();

  /* ---------- Brilho que acompanha o cursor (desktop) ---------- */
  if (!REDUCED && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    const glow = document.createElement("div");
    glow.className = "cursor-glow"; document.body.appendChild(glow);
    let gx = innerWidth / 2, gy = innerHeight / 2, tx = gx, ty = gy, gRaf = null;
    function glowLoop() {
      gx += (tx - gx) * 0.12; gy += (ty - gy) * 0.12;
      glow.style.transform = "translate3d(" + gx.toFixed(1) + "px," + gy.toFixed(1) + "px,0)";
      if (Math.abs(tx - gx) > .3 || Math.abs(ty - gy) > .3) gRaf = requestAnimationFrame(glowLoop); else gRaf = null;
    }
    window.addEventListener("mousemove", function (e) {
      tx = e.clientX; ty = e.clientY; glow.classList.add("on");
      if (!gRaf) gRaf = requestAnimationFrame(glowLoop);
    }, { passive: true });
    document.addEventListener("mouseleave", function () { glow.classList.remove("on"); });
  }

  /* ---------- Scroll suave com inércia (desktop / roda do mouse) ---------- */
  let smoothScrollTo = null;
  if (!REDUCED && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    document.documentElement.classList.add("smooth");
    const EASE = 0.14;
    let target = window.scrollY, current = target, raf = null, previousFrame = performance.now();
    function maxScroll() { return document.documentElement.scrollHeight - window.innerHeight; }
    function loop(now) {
      const blend = 1 - Math.pow(1 - EASE, Math.min(now - previousFrame, 50) / 16.67);
      previousFrame = now;
      current += (target - current) * blend;
      if (Math.abs(target - current) < 0.4) { current = target; raf = null; }
      else raf = requestAnimationFrame(loop);
      window.scrollTo(0, current);
    }
    function start() { if (!raf) { previousFrame = performance.now(); raf = requestAnimationFrame(loop); } }
    window.addEventListener("wheel", function (e) {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      let d = e.deltaY;
      if (e.deltaMode === 1) d *= 16; else if (e.deltaMode === 2) d *= window.innerHeight;
      d = Math.max(-220, Math.min(220, d));
      target = Math.max(0, Math.min(maxScroll(), target + d * 1.15));
      start();
    }, { passive: false });
    /* rolagem por teclado / barra: sincroniza a posição */
    window.addEventListener("scroll", function () { if (!raf) target = current = window.scrollY; }, { passive: true });
    window.addEventListener("resize", function () { target = Math.min(target, maxScroll()); });
    smoothScrollTo = function (y) { current = window.scrollY; target = Math.max(0, Math.min(maxScroll(), y)); start(); };
  }

  /* Rolagem suave com offset para âncoras internas */
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (e) {
      const id = a.getAttribute("href");
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 70;
      if (smoothScrollTo) smoothScrollTo(top);
      else window.scrollTo({ top: top, behavior: REDUCED ? "auto" : "smooth" });
    });
  });
})();
