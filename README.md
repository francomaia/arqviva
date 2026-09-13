# Landing Page – Arquitetando Processos (ArqViva)

Site estático, sem dependências. Basta abrir `index.html` ou publicar a pasta inteira em qualquer hospedagem (Netlify, Vercel, Hostinger, etc.).

## Estrutura
- `index.html` – página completa
- `assets/style.css` – estilos (cores e fontes extraídas do projeto `LP- ArqViva.pdf`)
- `assets/script.js` – vídeos, marquee de módulos, diagnóstico rápido (quiz), FAQ, scroll suave e todo o motor de animações
- `assets/fonts/` – Casagrande Casabau e Raleway
- `assets/img/` – fotos recortadas do projeto
- `assets/svg/` – logo, ícones, padrão geométrico de fundo, WhatsApp, Aurora
- `assets/video/` – VSL e provas sociais (**não versionados**, ver abaixo)

## O que ajustar antes de publicar
Em `assets/script.js`, no topo, edite o objeto `LINKS`:
- `aluno` – link da área do aluno (Kiwify) do botão "JÁ SOU ALUNO"
- `comprar` – link do checkout do botão "QUERO FAZER PARTE"
- `whatsapp` – número no formato `https://wa.me/55DDDNUMERO`

## Vídeos
Os arquivos de `assets/video/` **não estão no repositório**: o GitHub limita cada arquivo a 100 MB e a VSL tem ≈ 970 MB (as provas, ≈ 120 MB e 200 MB). Para rodar o site completo, copie os três `.mp4` para `assets/video/`:

```
assets/video/vsl.mp4
assets/video/prova-1.mp4
assets/video/prova-2.mp4
```

Antes de publicar, comprima (ex.: HandBrake, 1080p H.264) ou hospede no YouTube/Vimeo/Panda Video e troque as tags `<video>` pelo player do serviço.

## Animações
Todas são feitas em CSS + JS puro, sem bibliotecas, e desligam automaticamente para quem usa "reduzir movimento" no sistema operacional:
- surgimento ao rolar (IntersectionObserver) com desfoque e deslocamento por direção
- títulos e citações entrando palavra por palavra; a headline da hero, letra por letra
- scroll suave com inércia no desktop, barra de progresso de leitura e brilho seguindo o cursor
- marquee infinito de módulos (arrastável, pausa no hover) e faixa de texto rolando antes da oferta
- se o sistema estiver configurado para reduzir movimento, o botão **Ativar animações** permite habilitar os efeitos só neste site; a escolha fica salva no navegador
- transições do quiz, do FAQ (altura animada) e microinterações nos botões e cards

## Testar localmente
```bash
python -m http.server 8765 --directory "caminho/para/site"
```
Depois abra http://127.0.0.1:8765
