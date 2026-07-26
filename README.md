# Controle de Aulas — Gutierrez Ferreira

Progressive Web App (PWA) para controle de aulas de inglês: alunos, aulas, reposições, nivelamento e painel de acompanhamento.

## Funcionalidades

- **Alunos** — cadastro e gestão de alunos.
- **Aulas** — registro de aulas, presença e dificuldades.
- **Reposições** — controle de aulas a repor.
- **Nível** — nivelamento dos alunos.
- **Painel** — dashboard com exportação/importação de backup (`.json`).
- **IA** — resumo assistido.
- Tema claro/escuro.
- Funciona offline e pode ser instalado como app (Android/iOS) via `manifest.json` e `sw.js`.

## Uso

Abra `index.html` em um navegador, ou publique os arquivos estáticos (GitHub Pages, Vercel, etc.) — veja o passo a passo em [COMO_PUBLICAR.md](COMO_PUBLICAR.md).

## Dados

Os dados são armazenados **localmente no navegador** de cada dispositivo (não há sincronização em nuvem). Use a aba **Painel** para exportar/importar backups entre aparelhos.

## Estrutura

| Arquivo | Descrição |
|---|---|
| `index.html` | Marcação principal e navegação por abas |
| `app.js` | Lógica da aplicação |
| `style.css` | Estilos |
| `manifest.json` | Configuração do PWA |
| `sw.js` | Service worker (uso offline) |
| `icons/` | Ícones do app |
