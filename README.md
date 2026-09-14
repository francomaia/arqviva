# Landing Page – Arquitetando Processos (ArqViva)

Site estático, sem dependências. Basta abrir `index.html` ou publicar a pasta inteira em qualquer hospedagem (Netlify, Vercel, Hostinger, etc.).

## Estrutura
- `index.html` – página completa
- `assets/style.css` – estilos (cores e fontes extraídas do projeto `LP- ArqViva.pdf`)
- `assets/script.js` – vídeos, marquee de módulos, diagnóstico rápido (quiz), FAQ, scroll suave e todo o motor de animações
- `assets/fonts/` – Casagrande Casabau e Raleway
- `assets/img/` – fotos recortadas do projeto
- `assets/svg/` – logo, ícones, padrão geométrico de fundo, WhatsApp, Aurora
- `assets/video/compressed/` – VSL e provas sociais otimizados em H.264/AAC

## O que ajustar antes de publicar
Em `assets/script.js`, no topo, edite o objeto `LINKS`:
- `aluno` – link da área do aluno (Kiwify) do botão "JÁ SOU ALUNO"
- `comprar` – link do checkout do botão "QUERO FAZER PARTE"
- `whatsapp` – número no formato `https://wa.me/55DDDNUMERO`

## Vídeos
O site usa as cópias H.264/AAC em `assets/video/compressed/`, incluídas no repositório. Os três arquivos originais em `assets/video/` são preservados localmente e ignorados pelo Git. A VSL tenta iniciar automaticamente sem som, com opção para ativar áudio e barra de tempo restante. Se o navegador bloquear o autoplay, o botão de reprodução permanece disponível. Os depoimentos carregam quando o visitante inicia a reprodução.

```
assets/video/compressed/vsl.mp4
assets/video/compressed/prova-1.mp4
assets/video/compressed/prova-2.mp4
```

As fontes WOFF2 são usadas primeiro, com os TTF originais mantidos como alternativa.

## Animações
Todas são feitas em CSS + JS puro, sem bibliotecas, e ficam ativas por padrão:
- surgimento ao rolar (IntersectionObserver) com desfoque e deslocamento por direção
- títulos e citações entrando palavra por palavra; a headline da hero, letra por letra
- scroll suave com inércia no desktop, barra de progresso de leitura e brilho seguindo o cursor
- marquee infinito de módulos (arrastável, pausa no hover) e faixa de texto rolando antes da oferta
- transições do quiz, do FAQ (altura animada) e microinterações nos botões e cards

## Testar localmente
```bash
python -m http.server 8765 --directory "caminho/para/site"
```
Depois abra http://127.0.0.1:8765
