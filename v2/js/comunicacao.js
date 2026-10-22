// Aba Comunicação: mensagens por e-mail e WhatsApp para um, vários ou todos os alunos.
// O app monta a mensagem de cada aluno e abre o WhatsApp ou o e-mail pronto; o professor clica em enviar.
import { S, ACOES, CAMPOS, esc, toast, erro, config, tagSituacao, linkWhats, ICONES } from "./ctx.js";
import { hojeISO, addDays, fmtDataLonga, fmtData, aulasNoPeriodo, jaPassou, feriadoEm, brl, precoTabela, MODALIDADE_LABEL, DIAS_LONGO, diaSemana } from "./regras.js";
import { linkDoAluno } from "./sessao.js";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export const MODELOS_MSG = {
  livre: { nome: "Mensagem livre", assunto: "", texto: "Oi, {nome}!\n\n\n\nAbraço,\n{assinatura}" },
  lembrete: { nome: "Lembrete de aula", assunto: "Nossa aula {proxima_aula}", texto: "Oi, {nome}! Passando para lembrar da nossa aula {proxima_aula}.\n\nLink da reunião: {link_meet}\nTela de exercícios: {link_tela}\n\nAté lá!\n{assinatura}" },
  feriado: { nome: "Aviso de feriado", assunto: "Sem aula no feriado ({proximo_feriado})", texto: "Oi, {nome}! Aviso que no dia {proximo_feriado} não teremos aula por causa do feriado. Como está no contrato, aula em feriado não é reposta nem transferida.\n\nNos vemos na aula seguinte, {aula_depois_feriado}.\n\nAbraço,\n{assinatura}" },
  vencimento: { nome: "Lembrete de mensalidade", assunto: "Mensalidade de {mes}", texto: "Oi, {nome}! Passando para lembrar que a mensalidade de {mes} ({valor}, plano {plano}) vence no dia 5.\n\nQualquer dúvida, é só me chamar.\n{assinatura}" },
  links: { nome: "Links da aula", assunto: "Seus links das aulas de inglês", texto: "Oi, {nome}! Estes são os seus links fixos das aulas. Salve nos favoritos:\n\nReunião (Google Meet): {link_meet}\nTela de exercícios (abra no computador na hora da aula): {link_tela}\n\nAbraço,\n{assinatura}" },
  reposicao: { nome: "Reposição marcada", assunto: "Reposição marcada: {reposicao}", texto: "Oi, {nome}! Sua reposição ficou marcada para {reposicao}. Ela tem 30 minutos e acontece na sala de reposição:\n\n{link_reposicao}\n\nAté lá!\n{assinatura}" },
  inativos: { nome: "Convite para voltar (inativos)", assunto: null, texto: null }
};
const VARIAVEIS = ["{nome}", "{proxima_aula}", "{link_meet}", "{link_tela}", "{link_reposicao}", "{proximo_feriado}", "{aula_depois_feriado}", "{mes}", "{valor}", "{plano}", "{reposicao}", "{ultima}", "{assinatura}"];

function estado() {
  if (!S.com) {
    const m = MODELOS_MSG.lembrete;
    S.com = { grupo: "ativos", marcados: null, modelo: "lembrete", assunto: m.assunto, texto: m.texto, envioId: null };
  }
  return S.com;
}

function destinatarios() {
  const c = estado();
  const todos = S.store.alunos.slice().sort((a, b) => a.nome.localeCompare(b.nome));
  const doGrupo = c.grupo === "ativos" ? todos.filter(a => a.situacao === "ativo" || a.situacao === "experimental")
    : c.grupo === "inativos" ? todos.filter(a => a.situacao === "inativo" || a.situacao === "trancado")
    : todos;
  return { todos, doGrupo, escolhidos: doGrupo.filter(a => !c.marcados || c.marcados.has(a.id)) };
}

function quando(a) { return `${DIAS_LONGO[diaSemana(a.data)].toLowerCase()}, ${fmtDataLonga(a.data)}${a.hora ? ` às ${a.hora}` : ""}`; }
function proximasDoAluno(al, dias = 45) {
  const hoje = hojeISO();
  return aulasNoPeriodo(S.store.alunos, S.store.aulas, hoje, addDays(hoje, dias))
    .filter(a => a.alunoId === al.id && a.status === "agendada" && !jaPassou(a));
}
function proximoFeriado() {
  const hoje = hojeISO();
  for (let i = 0; i <= 120; i++) { const d = addDays(hoje, i); const n = feriadoEm(d); if (n) return { data: d, nome: n }; }
  return null;
}

// Troca as variáveis pelos dados do aluno.
export function preencher(texto, al) {
  const cfg = config();
  const prox = proximasDoAluno(al);
  const fer = proximoFeriado();
  const depoisFer = fer ? prox.find(a => a.data > fer.data) : null;
  const rep = prox.find(a => a.tipo === "reposicao");
  const ult = S.store.aulas.filter(a => a.alunoId === al.id && a.status === "dada").sort((a, b) => b.data.localeCompare(a.data))[0];
  const hoje = new Date();
  const total = al.valorPlano != null && al.valorPlano !== "" ? Number(al.valorPlano) : precoTabela(al.plano, al.modalidade);
  const v = {
    nome: (al.nome || "").split(" ")[0],
    proxima_aula: prox[0] ? quando(prox[0]) : "(sem aula agendada)",
    link_meet: al.linkMeet || "(link da reunião)",
    link_tela: al.sessaoFixa ? linkDoAluno(al.sessaoFixa) : "(link da tela)",
    link_reposicao: cfg.linkReposicao || "(link da sala de reposição)",
    proximo_feriado: fer ? `${fmtDataLonga(fer.data)} (${fer.nome})` : "(sem feriado próximo)",
    aula_depois_feriado: depoisFer ? quando(depoisFer) : "na próxima semana",
    mes: MESES[hoje.getMonth()],
    valor: brl(total),
    plano: `${al.plano || ""} ${MODALIDADE_LABEL[al.modalidade || "mensal"] ? MODALIDADE_LABEL[al.modalidade || "mensal"].split(" ")[0].toLowerCase() : ""}`.trim(),
    reposicao: rep ? quando(rep) : "(data da reposição)",
    ultima: ult ? MESES[Number(ult.data.slice(5, 7)) - 1] : "algum tempo atrás",
    assinatura: cfg.assinatura
  };
  return (texto || "").replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
}

function previaHTML(al) { const c = estado(); return `<b>${esc(preencher(c.assunto, al))}</b>\n\n${esc(preencher(c.texto, al))}`; }
function atualizarPrevia() { const el = document.getElementById("com-previa"); const al = destinatarios().escolhidos[0]; if (el && al) el.innerHTML = previaHTML(al); }

function historico() { return ((S.store.config || {}).comunicacoes || []).slice().sort((a, b) => (b.em || "").localeCompare(a.em || "")); }

export function telaComunicacao(v) {
  const c = estado();
  const { doGrupo, escolhidos } = destinatarios();
  const envio = c.envioId ? historico().find(h => h.id === c.envioId) : null;
  const feitos = envio ? envio.envios || {} : {};
  const ex = escolhidos[0];
  const grupos = [["ativos", "Ativos"], ["inativos", "Inativos e trancados"], ["todos", "Todos"]];
  v.innerHTML = `<div class="rolavel"><div class="grid-com">
    <section class="card"><h2 class="card-titulo">Nova comunicação</h2>
      <div class="campo"><label for="com-mod">Modelo</label><select id="com-mod" data-i="com-modelo">${Object.entries(MODELOS_MSG).map(([k, m]) => `<option value="${k}" ${c.modelo === k ? "selected" : ""}>${esc(m.nome)}</option>`).join("")}</select></div>
      <div class="campo"><label for="com-ass">Assunto (e-mail)</label><input type="text" id="com-ass" data-i="com-assunto" value="${esc(c.assunto)}"></div>
      <div class="campo"><label for="com-txt">Mensagem</label><textarea id="com-txt" data-i="com-texto" style="min-height:220px">${esc(c.texto)}</textarea></div>
      <span class="mini">Variáveis: ${VARIAVEIS.map(x => `<button class="btn-link mini" data-a="com-var" data-v="${x}">${x}</button>`).join(" ")}</span>
      <div class="sep"></div>
      <div class="linha"><span class="rotulo flex1">Destinatários · ${escolhidos.length} de ${doGrupo.length}</span>
        <div class="seg" role="group" aria-label="Grupo">${grupos.map(([k, r]) => `<button class="btn-sm" data-a="com-grupo" data-g="${k}" aria-pressed="${c.grupo === k}">${r}</button>`).join("")}</div></div>
      <div class="linha"><button class="btn btn-sm" data-a="com-marcar" data-v="1">Marcar todos</button><button class="btn btn-sm" data-a="com-marcar" data-v="0">Desmarcar todos</button></div>
      <div class="com-dest">${doGrupo.map(a => `<label class="check"><input type="checkbox" data-a="com-aluno" data-id="${esc(a.id)}" ${!c.marcados || c.marcados.has(a.id) ? "checked" : ""}>${esc(a.nome)} ${tagSituacao(a.situacao)}</label>`).join("") || `<span class="sub">Nenhum aluno neste grupo.</span>`}</div>
    </section>
    <section class="card"><div class="linha"><h2 class="card-titulo flex1">Enviar</h2>
        ${envio ? `<button class="btn btn-sm" data-a="com-nova">Nova comunicação</button>` : ""}</div>
      <span class="mini">Cada botão abre a mensagem pronta para aquele aluno no WhatsApp ou no seu e-mail. Você revisa e envia. O que você abriu fica marcado com ✓ e vai para o histórico.</span>
      ${ex ? `<details class="com-previa" open><summary class="rotulo">Prévia para ${esc(ex.nome.split(" ")[0])}</summary>
        <div class="item" id="com-previa" style="display:block;white-space:pre-line;font-size:13px">${previaHTML(ex)}</div></details>` : ""}
      <div class="pilha" style="gap:6px">${escolhidos.map(a => {
        const f = feitos[a.id] || {};
        return `<div class="item com-linha"><span class="flex1"><b>${esc(a.nome)}</b><br><span class="mini">${esc(a.whatsapp || "sem WhatsApp")} · ${esc(a.email || "sem e-mail")}</span></span>
          <button class="btn btn-sm ${f.whats ? "feito" : ""}" data-a="com-enviar" data-c="whats" data-id="${esc(a.id)}" ${a.whatsapp ? "" : "disabled"}>${f.whats ? "✓ " : ""}WhatsApp</button>
          <button class="btn btn-sm ${f.email ? "feito" : ""}" data-a="com-enviar" data-c="email" data-id="${esc(a.id)}" ${a.email ? "" : "disabled"}>${f.email ? "✓ " : ""}E-mail</button></div>`;
      }).join("") || `<span class="sub">Marque pelo menos um aluno.</span>`}</div>
      ${escolhidos.some(a => a.email) ? `<div class="linha"><button class="btn btn-sm" data-a="com-copiar-emails">Copiar e-mails (para Cco)</button></div>` : ""}
    </section>
  </div>
  <section class="card" style="margin-top:16px"><h2 class="card-titulo">Histórico</h2>
    ${historico().length ? historico().slice(0, 30).map(h => {
      const ids = Object.keys(h.envios || {});
      const nomes = ids.map(id => { const al = S.store.aluno(id); const e = h.envios[id]; return `${esc(al ? al.nome.split(" ")[0] : "?")}${e.whats ? " (WhatsApp)" : ""}${e.email ? " (e-mail)" : ""}`; });
      return `<div class="item"><span class="mono mini">${fmtData(h.em.slice(0, 10))} ${h.em.slice(11, 16)}</span><span class="flex1"><b>${esc(h.titulo)}</b><br><span class="mini">${nomes.join(", ")}</span></span></div>`;
    }).join("") : `<span class="sub">Nada enviado ainda.</span>`}
  </section></div>`;
}

async function registrar(al, canal) {
  const c = estado();
  const cfg = S.store.config || {};
  const lista = (cfg.comunicacoes || []).slice();
  let h = c.envioId ? lista.find(x => x.id === c.envioId) : null;
  const agora = new Date();
  const em = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}T${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  if (!h) {
    h = { id: "c" + Date.now().toString(36), em, modelo: c.modelo, titulo: c.assunto || MODELOS_MSG[c.modelo]?.nome || "Mensagem", texto: c.texto.slice(0, 600), envios: {} };
    lista.push(h); c.envioId = h.id;
  }
  h.envios[al.id] = { ...(h.envios[al.id] || {}), [canal]: em };
  await S.store.salvarConfig({ ...cfg, comunicacoes: lista.slice(-200) });
}

Object.assign(ACOES, {
  "com-grupo": el => { const c = estado(); c.grupo = el.dataset.g; c.marcados = null; S.rerender(); },
  "com-marcar": el => { const c = estado(); c.marcados = el.dataset.v === "1" ? null : new Set(); S.rerender(); },
  "com-var": el => {
    const t = document.getElementById("com-txt"); if (!t) return;
    const i = t.selectionStart ?? t.value.length;
    t.value = t.value.slice(0, i) + el.dataset.v + t.value.slice(t.selectionEnd ?? i);
    estado().texto = t.value; atualizarPrevia(); t.focus(); t.setSelectionRange(i + el.dataset.v.length, i + el.dataset.v.length);
  },
  "com-nova": () => { estado().envioId = null; S.rerender(); },
  "com-enviar": async el => {
    const al = S.store.aluno(el.dataset.id); if (!al) return;
    const c = estado(), canal = el.dataset.c;
    const texto = preencher(c.texto, al), assunto = preencher(c.assunto, al);
    const url = canal === "whats" ? linkWhats(al, texto) : `mailto:${encodeURIComponent(al.email)}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(texto)}`;
    if (!url) return toast("Aluno sem contato para este canal.");
    window.open(url, canal === "whats" ? "_blank" : "_self", "noopener");
    try { await registrar(al, canal); } catch (e) { erro(e); }
    S.rerender();
  },
  "com-copiar-emails": async () => {
    const lista = destinatarios().escolhidos.map(a => a.email).filter(Boolean).join(", ");
    try { await navigator.clipboard.writeText(lista); toast("E-mails copiados. Cole no campo Cco."); } catch { toast(lista); }
  }
});
ACOES["com-aluno"] = el => {
  const c = estado();
  const { doGrupo } = destinatarios();
  if (!c.marcados) c.marcados = new Set(doGrupo.map(a => a.id));
  el.checked ? c.marcados.add(el.dataset.id) : c.marcados.delete(el.dataset.id);
  S.rerender();
};
ACOES["com-aluno"].semPrevent = true;

Object.assign(CAMPOS, {
  "com-modelo": el => {
    const c = estado(); if (el.value === c.modelo) return;
    const m = MODELOS_MSG[el.value]; const cfg = config();
    c.modelo = el.value; c.envioId = null;
    if (el.value === "inativos") { c.assunto = cfg.emailAssunto; c.texto = cfg.emailCorpo; c.grupo = "inativos"; c.marcados = null; }
    else { c.assunto = m.assunto; c.texto = m.texto; }
    S.rerender();
  },
  "com-assunto": el => { estado().assunto = el.value; atualizarPrevia(); },
  "com-texto": el => { estado().texto = el.value; atualizarPrevia(); }
});
