# Como publicar e instalar seu app — Controle de Aulas

## Caminho mais simples: GitHub Pages (gratuito)

1. Crie uma conta em https://github.com (se ainda não tiver).
2. Clique em "New repository". Nome sugerido: `controle-aulas`. Marque como **Public**. Crie.
3. Na página do repositório, clique em "uploading an existing file" (ou "Add file" → "Upload files").
4. Arraste TODOS os arquivos desta pasta (index.html, style.css, app.js, manifest.json, sw.js, e a pasta icons/ com os dois arquivos dentro). Clique em "Commit changes".
5. Vá em **Settings** (do repositório) → **Pages** (menu lateral esquerdo).
6. Em "Branch", selecione `main` e a pasta `/ (root)`. Clique em **Save**.
7. Espere ~1 minuto. O GitHub vai te dar uma URL parecida com:
   `https://SEU-USUARIO.github.io/controle-aulas/`
8. Abra essa URL no celular Android, no Chrome.

## Instalar como app no Android

1. Abra a URL no Chrome do Android.
2. Toque nos 3 pontinhos (menu) → **"Instalar app"** ou **"Adicionar à tela inicial"**.
3. Pronto — vai aparecer um ícone como qualquer outro app, abre em tela cheia, sem barra do navegador.

## Importante sobre os dados

Este app guarda os dados **no navegador daquele dispositivo** (não em nuvem). Isso significa:

- Celular e notebook, cada um guarda os dados separadamente.
- Para levar os dados de um aparelho para o outro: na aba **Painel**, use **"Exportar backup (.json)"** no aparelho de origem e **"Importar backup"** no aparelho de destino.
- Recomendo criar o hábito de exportar 1x por semana e guardar o arquivo no Google Drive, como segurança.

Se no futuro você quiser sincronização automática entre dispositivos sem precisar exportar/importar manualmente, o próximo passo é plugar um banco de dados gratuito (ex: Firebase). Isso muda a arquitetura do app — me avise quando quiser esse upgrade.

## Alternativa sem GitHub: Vercel

Se preferir não usar GitHub diretamente:
1. Acesse https://vercel.com, crie conta gratuita.
2. Arraste a pasta do app na área de deploy (drag-and-drop).
3. Vercel te dá uma URL pronta na hora.

Qualquer um dos dois caminhos funciona igual — GitHub Pages é o mais usado por ser 100% gratuito e permanente.
