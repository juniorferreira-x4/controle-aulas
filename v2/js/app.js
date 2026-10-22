import { FIREBASE_CONFIG, EMAIL_AUTORIZADO } from "../config.js";
import { carregarBanco } from "./banco.js";
import { LocalStore, FirebaseStore, novoId } from "./store.js";
import {
  S, ACOES, CAMPOS, TELA, esc, toast, erro, navegar, abrirModal, fecharModal, config, nomeAluno, tagNivel, tagSituacao,
  resolverAula, materializar, copiar, linkWhats, ICONES
} from "./ctx.js";
import {
  hojeISO, addDays, segundaDaSemana, fmtData, fmtDataLonga, diaSemana, DIAS_CURTO, DIAS_LONGO, NIVEIS, DIFS, DIF_LABEL,
  aulasNoPeriodo, semRegistro, jaPassou, mapaCobranca, simularCusto, situacaoGratisDoMes, prazoReposicao, reposicoesPendentes,
  faltasNoPeriodo, aulasDadasDoAluno, sugerirPlano, mesDe, VALOR_REMARCACAO, ehVirtual, STATUS_LABEL
} from "./regras.js";
import { renderAula, renderPos } from "./aula.js";
import * as TTS from "./tts.js";
import { criarDocHomework } from "./drive.js";

const view = () => document.getElementById("view");

// ===================== Inicialização =====================
function aplicarTema(t) {
  if (t === "claro") document.documentElement.dataset.tema = "claro"; else delete document.documentElement.dataset.tema;
  try { localStorage.setItem("ca2_tema", t); } catch {}
}
try { aplicarTema(localStorage.getItem("ca2_tema") || "escuro"); } catch {}

function avisoModo(texto) {
  const el = document.getElementById("aviso-modo");
  if (!texto) { el.hidden = true; return; }
  el.hidden = false; el.innerHTML = texto;
}

async function boot() {
  try {
    S.banco = await carregarBanco();
  } catch (e) {
    view().innerHTML = `<div class="carregando">Não consegui carregar o banco de exercícios. Verifique a conexão e recarregue.</div>`;
    return;
  }
  const demo = new URLSearchParams(location.search).has("demo");
  if (demo) {
    S.store = new LocalStore("ca2demo_");
    await S.store.init();
    if (!S.store.alunos.length) await semearDemo();
    avisoModo(`<b>Demonstração:</b> dados de exemplo, salvos só neste navegador. <a href="./">Sair da demonstração</a>`);
    iniciarApp();
    return;
  }
  if (FIREBASE_CONFIG) {
    try {
      const { iniciarFirebase } = await import("./firebase.js");
      S.fb = await iniciarFirebase(FIREBASE_CONFIG);
    } catch (e) {
      view().innerHTML = `<div class="carregando">Não consegui conectar ao Firebase (${esc(e.message)}). Verifique a internet e recarregue.</div>`;
      return;
    }
    S.fb.aoMudarUsuario(async user => {
      if (!user) { telaLogin(); return; }
      if ((user.email || "").toLowerCase() !== EMAIL_AUTORIZADO.toLowerCase()) { telaLogin(`A conta ${esc(user.email)} não tem acesso. Entre com ${esc(EMAIL_AUTORIZADO)}.`); await S.fb.sair(); return; }
      S.usuario = user;
      try {
        S.store = new FirebaseStore(S.fb, user.uid);
        await S.store.init();
      } catch (e) {
        view().innerHTML = `<div class="carregando">Erro ao ler seus dados: ${esc(e.message)}.<br>Confira se as regras do Firestore foram publicadas (veja o guia).</div>`;
        return;
      }
      avisoModo("");
      iniciarApp();
    });
    return;
  }
  S.store = new LocalStore("ca2_");
  await S.store.init();
  avisoModo(`<b>Modo local:</b> os dados ficam só neste navegador até o Firebase ser configurado. <a href="#/config">Ver Ajustes</a>`);
  iniciarApp();
}

function telaLogin(msg = "") {
  document.getElementById("topo-dir").innerHTML = "";
  view().innerHTML = `
    <div class="login">
      <h1 style="font-size:22px">Controle de Aulas</h1>
      <p class="sub">Entre com a sua conta Google. O mesmo login permite criar e atualizar os documentos de homework no seu Drive.</p>
      ${msg ? `<p class="txt-perigo">${msg}</p>` : ""}
      <button class="btn btn-primario btn-lg" id="btn-login">Entrar com Google</button>
    </div>`;
  document.getElementById("btn-login").onclick = async () => {
    try { await S.fb.entrar(); } catch (e) { if (e.code !== "auth/popup-closed-by-user") erro(e); }
  };
}

let iniciado = false;
function iniciarApp() {
  aplicarTema(config().tema);
  S.rerender = render;
  if (!iniciado) {
    iniciado = true;
    window.addEventListener("hashchange", render);
    document.addEventListener("click", ev => {
      const el = ev.target.closest("[data-a]");
      if (!el || el.closest("#modal-raiz")) return;
      const fn = ACOES[el.dataset.a];
      if (!fn) return;
      if (!fn.semPrevent) ev.preventDefault();
      Promise.resolve(fn(el, ev)).catch(erro);
    });
    const onCampo = ev => {
      const el = ev.target.closest("[data-i]");
      if (!el || el.closest("#modal-raiz")) return;
      const fn = CAMPOS[el.dataset.i];
      if (fn) Promise.resolve(fn(el, ev)).catch(erro);
    };
    document.addEventListener("input", onCampo);
    document.addEventListener("change", onCampo);
  }
  render();
}

function rota() {
  const h = location.hash.replace(/^#\/?/, "") || "semana";
  const [nome, ...resto] = h.split("/");
  return { nome, arg: decodeURIComponent(resto.join("/")) };
}

function render() {
  if (TELA.limpar) { try { TELA.limpar(); } catch {} TELA.limpar = null; }
  const { nome, arg } = rota();
  document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("ativo", a.dataset.nav === nome || (nome === "aluno" && a.dataset.nav === "alunos")));
  topoDireita();
  const v = view();
  try {
    if (nome === "aula") return renderAula(v, arg);
    if (nome === "pos") return renderPos(v, arg);
    const telas = { semana: telaSemana, alunos: telaAlunos, aluno: telaCadastro, biblioteca: telaBiblioteca, config: telaConfig };
    (telas[nome] || telaSemana)(v, arg);
  } catch (e) { erro(e); v.innerHTML = `<div class="carregando">Algo deu errado nesta tela: ${esc(e.message)}</div>`; }
}

function topoDireita() {
  const el = document.getElementById("topo-dir");
  if (S.usuario) el.innerHTML = `<span class="mini">${esc(S.usuario.email)}</span>`;
  else el.innerHTML = "";
}

// ===================== SEMANA =====================
function estadoSlot(a) {
  if (a.status === "dada") return { cls: "dada", st: "✓ dada", cor: "txt-ok" };
  if (a.status === "falta") return { cls: "falta", st: a.abonada ? "falta abonada" : "falta", cor: "txt-perigo" };
  if (a.status === "remarcada") {
    const filho = S.store.aulas.find(x => x.reposicaoDe === a.id);
    return { cls: "remarcada", st: filho ? `→ ${fmtData(filho.data)}` : "remarcada", cor: "txt-acento" };
  }
  if (a.status === "prof_faltou") return { cls: "prof_faltou", st: "prof. faltou", cor: "txt-muted" };
  if (a.status === "feriado") return { cls: "feriado", st: "feriado", cor: "txt-muted" };
  if (semRegistro(a)) return { cls: "pendente", st: "sem registro", cor: "txt-alerta" };
  return { cls: "", st: a.tipo === "reposicao" ? "reposição" : "", cor: "txt-acento" };
}

function proximaAula() {
  const hoje = hojeISO();
  const lista = aulasNoPeriodo(S.store.alunos, S.store.aulas, hoje, addDays(hoje, 14));
  return lista.find(a => a.status === "agendada" && !jaPassou(a)) || null;
}

function telaSemana(v) {
  const ini = segundaDaSemana(S.semanaOffset);
  const fimSex = addDays(ini, 4), sab = addDays(ini, 5);
  const todas = aulasNoPeriodo(S.store.alunos, S.store.aulas, ini, sab);
  const temSabado = todas.some(a => a.data === sab);
  const dias = []; for (let i = 0; i < (temSabado ? 6 : 5); i++) dias.push(addDays(ini, i));
  const hoje = hojeISO();
  const prox = proximaAula();
  const colunas = dias.map(d => {
    const doDia = todas.filter(a => a.data === d);
    const slots = doDia.length ? doDia.map(a => {
      const e = estadoSlot(a);
      const al = S.store.aluno(a.alunoId);
      const ehProx = prox && prox.key === a.key;
      return `<button class="slot ${e.cls} ${ehProx ? "proxima" : ""}" data-a="slot" data-k="${esc(a.key)}">
          <span class="s1"><span class="hora">${esc(a.hora || "—")}</span><span class="st ${ehProx ? "txt-acento" : e.cor}">${ehProx ? "próxima" : esc(e.st)}</span></span>
          <span class="nome">${esc(al ? al.nome : "?")} ${al && al.nivel ? `<span class="mini nv-${esc(al.nivel)}">${esc(al.nivel)}</span>` : ""}</span>
        </button>`;
    }).join("") : `<div class="dia-vazio">sem aulas</div>`;
    return `<section class="dia ${d === hoje ? "hoje" : ""}">
      <h2 class="dia-cab"><span class="d1">${DIAS_LONGO[diaSemana(d)]}${d === hoje ? " · hoje" : ""}</span><br><span class="d2">${fmtData(d)}</span></h2>
      ${slots}</section>`;
  }).join("");

  const al = S.store.alunos;
  const cont = s => al.filter(a => a.situacao === s).length;
  const daSemana = todas.filter(a => a.data <= fimSex || temSabado);
  const nDadas = daSemana.filter(a => a.status === "dada").length;
  const nFaltas = daSemana.filter(a => a.status === "falta").length;

  v.innerHTML = `
    <div class="barra">
      <button class="btn btn-icone" data-a="sem-ant" aria-label="Semana anterior">${ICONES.voltar}</button>
      <b style="min-width:150px;text-align:center">${fmtData(ini)} – ${fmtData(dias[dias.length - 1])}</b>
      <button class="btn btn-icone" data-a="sem-prox" aria-label="Próxima semana">${ICONES.prox}</button>
      <button class="btn" data-a="sem-hoje">Hoje</button>
      <div class="flex1"></div>
      <button class="btn" data-a="aula-extra">${ICONES.mais} Aula avulsa</button>
    </div>
    <div class="cols">
      <div class="col-main">
        ${al.length ? "" : `<div class="card destaque"><b>Comece cadastrando seus alunos</b><span class="sub">Cadastre cada aluno com os horários fixos, ou importe o backup do app antigo em Ajustes.</span><div class="linha"><a class="btn" href="#/aluno/novo">Novo aluno</a><a class="btn" href="#/config">Importar backup</a></div></div>`}
        <div class="semana" style="--ndias:${dias.length}">${colunas}</div>
        <div class="kpis">
          <a class="kpi" href="#/alunos" data-a="filtro-alunos" data-f="ativo"><span class="mini">Ativos</span><span class="v">${cont("ativo")}</span></a>
          <a class="kpi" href="#/alunos" data-a="filtro-alunos" data-f="trancado"><span class="mini">Trancados</span><span class="v">${cont("trancado")}</span></a>
          <a class="kpi" href="#/alunos" data-a="filtro-alunos" data-f="inativo"><span class="mini">Inativos</span><span class="v">${cont("inativo")}</span></a>
          <div class="kpi"><span class="mini">Aulas na semana</span><span class="v">${daSemana.length} <span class="sub" style="font-size:13px;font-weight:500">· ${nDadas} dadas${nFaltas ? ` · <span class="txt-perigo">${nFaltas} falta${nFaltas > 1 ? "s" : ""}</span>` : ""}</span></span></div>
        </div>
      </div>
      <aside class="col-side side-primeiro">${cardProxima(prox)}${blocoPendencias()}${blocoReposicoes()}</aside>
    </div>`;
}

function cardProxima(prox) {
  if (!prox) return `<section class="card"><span class="rotulo">Próxima aula</span><span class="sub">Nenhuma aula nos próximos 14 dias.</span></section>`;
  const al = S.store.aluno(prox.alunoId);
  const plano = sugerirPlano(S.banco, al, S.store.aulas, prox.id);
  const t = S.banco.topicos[plano.topicoId];
  const dadas = aulasDadasDoAluno(S.store.aulas, al.id);
  const ultHw = dadas.find(a => a.homework);
  const dif = contarDificuldades(dadas.slice(0, 4));
  const quando = prox.data === hojeISO() ? `hoje ${prox.hora || ""}` : `${DIAS_CURTO[diaSemana(prox.data)]} ${fmtData(prox.data)} ${prox.hora || ""}`;
  return `<section class="card destaque">
    <div class="linha"><span class="rotulo acento">Próxima aula</span><span class="flex1"></span><span class="mono mini">${esc(quando)}</span></div>
    <div class="linha"><span style="font-size:20px;font-weight:700">${esc(al.nome)}</span>${tagNivel(al.nivel)}</div>
    <div class="pilha" style="font-size:13px">
      <div><span class="txt-muted">Homework a corrigir:</span> ${ultHw ? `${esc(ultHw.homework.topicoNome)} (${fmtData(ultHw.data)})` : "nenhum"}</div>
      <div><span class="txt-muted">Tema sugerido:</span> ${t ? esc(t.nome) + ` · ${DIF_LABEL[plano.dif]}` : "—"}</div>
      <div><span class="txt-muted">Dificuldades recentes:</span> ${dif.length ? esc(dif.slice(0, 3).map(d => d[0]).join(", ")) : "—"}</div>
    </div>
    ${linksDocs(al)}
    <button class="btn btn-primario btn-lg" data-a="entrar" data-k="${esc(prox.key)}">${ICONES.play} Entrar na aula</button>
  </section>`;
}

export function linksDocs(al) {
  const a = al.docAlunoUrl ? `<a class="btn btn-sm flex1" href="${esc(al.docAlunoUrl)}" target="_blank" rel="noopener">Doc do aluno ${ICONES.externo}</a>` : "";
  const b = al.docHomeworkUrl ? `<a class="btn btn-sm flex1" href="${esc(al.docHomeworkUrl)}" target="_blank" rel="noopener">Doc homework ${ICONES.externo}</a>` : "";
  return a || b ? `<div class="linha">${a}${b}</div>` : `<span class="mini">Sem links de documentos. <a href="#/aluno/${esc(al.id)}">Adicionar no cadastro</a></span>`;
}

export function contarDificuldades(aulas) {
  const c = {};
  aulas.forEach(a => (a.dificuldades || []).forEach(d => { c[d] = (c[d] || 0) + 1; }));
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
}

function blocoPendencias() {
  const hoje = hojeISO();
  const lista = aulasNoPeriodo(S.store.alunos, S.store.aulas, addDays(hoje, -21), hoje).filter(semRegistro).reverse();
  const semNivel = S.store.alunos.filter(a => a.situacao === "ativo" && !a.nivel);
  if (!lista.length && !semNivel.length) return "";
  return `<section class="pilha"><h2 class="rotulo">Pendências</h2>
    ${lista.slice(0, 10).map(a => `<div class="item alerta"><span class="flex1">Registrar aula de <b>${esc(nomeAluno(a.alunoId))}</b> (${DIAS_CURTO[diaSemana(a.data)]} ${fmtData(a.data)} ${esc(a.hora || "")})</span>
      <button class="btn-link txt-alerta" data-a="registrar" data-k="${esc(a.key)}">Registrar</button>
      <button class="btn-link txt-perigo" data-a="faltou" data-k="${esc(a.key)}">Faltou</button></div>`).join("")}
    ${semNivel.length ? `<div class="item"><span class="flex1">Definir nível de <b>${esc(semNivel.map(a => a.nome.split(" ")[0]).join(", "))}</b></span><a href="#/alunos">Ver</a></div>` : ""}
  </section>`;
}

function blocoReposicoes() {
  const pend = reposicoesPendentes(S.store.aulas).filter(p => S.store.aluno(p.aula.alunoId));
  const hoje = hojeISO();
  const futuras = S.store.aulas.filter(a => a.tipo === "reposicao" && a.status === "agendada" && a.data >= hoje);
  if (!pend.length && !futuras.length) return "";
  const mapa = mapaCobranca(S.store.aulas);
  return `<section class="pilha"><h2 class="rotulo">Reposições</h2>
    ${futuras.map(r => {
      const orig = S.store.aula(r.reposicaoDe); const c = orig ? mapa[orig.id] : null;
      return `<div class="item"><span class="flex1"><b>${esc(nomeAluno(r.alunoId))}</b> · ${DIAS_CURTO[diaSemana(r.data)]} ${fmtData(r.data)} ${esc(r.hora || "")}<br><span class="mini">${c ? (c.valor ? "R$ " + c.valor : "grátis") + " · " + esc(c.motivo) : ""}</span></span></div>`;
    }).join("")}
    ${pend.map(p => `<div class="item ${p.expirada ? "" : "alerta"}"><span class="flex1"><b>${esc(nomeAluno(p.aula.alunoId))}</b> · aula de ${fmtData(p.aula.data)}<br><span class="mini">${p.expirada ? `prazo venceu em ${fmtData(p.prazo)}` : `repor até ${fmtData(p.prazo)}`}</span></span>
      ${p.expirada ? "" : `<button class="btn-link" data-a="marcar-reposicao" data-k="${esc(p.aula.id)}">Marcar</button>`}</div>`).join("")}
  </section>`;
}

Object.assign(ACOES, {
  "sem-ant": () => { S.semanaOffset--; render(); },
  "sem-prox": () => { S.semanaOffset++; render(); },
  "sem-hoje": () => { S.semanaOffset = 0; render(); },
  "filtro-alunos": el => { S.filtroAlunos = el.dataset.f; navegar("#/alunos"); },
  "entrar": async el => { const a = await materializar(el.dataset.k); navegar(`#/aula/${a.id}`); },
  "registrar": async el => { const a = await materializar(el.dataset.k); navegar(`#/pos/${a.id}`); },
  "faltou": el => modalFalta(el.dataset.k),
  "slot": el => modalSlot(el.dataset.k),
  "marcar-reposicao": el => modalRemarcar(el.dataset.k, { soReposicao: true }),
  "aula-extra": () => modalAulaExtra()
});

// ===================== Modais da agenda =====================
function cabAula(a) {
  const al = S.store.aluno(a.alunoId);
  return `${esc(al ? al.nome : "?")} · ${al && al.nivel ? `<span class="nv-${esc(al.nivel)}">${esc(al.nivel)}</span> · ` : ""}${DIAS_CURTO[diaSemana(a.data)]} ${fmtDataLonga(a.data)} · ${esc(a.hora || "")}${a.tipo === "reposicao" ? " · reposição" : ""}`;
}

function modalSlot(key) {
  const a = resolverAula(key);
  if (!a) return;
  const passou = jaPassou(a);
  const filho = a.id ? S.store.aulas.find(x => x.reposicaoDe === a.id) : null;
  const mapa = mapaCobranca(S.store.aulas);
  const c = a.id ? mapa[a.id] : null;
  let corpo = "", botoes = "";
  if (a.status === "agendada") {
    botoes = passou
      ? `<button class="btn btn-primario" data-m="registrar">Registrar aula dada</button>`
      : `<button class="btn btn-primario" data-m="entrar">${ICONES.play} Entrar na aula</button>`;
    botoes += `<button class="btn" data-m="remarcar">Remarcar</button><button class="btn btn-perigo" data-m="faltou">Faltou</button>
      <button class="btn" data-m="prof">Professor faltou</button><button class="btn" data-m="feriado">Feriado</button>`;
    if (!passou) botoes += `<button class="btn" data-m="registrar">Registrar sem o modo aula</button>`;
    if (a.tipo !== "regular" && a.id) botoes += `<button class="btn btn-perigo" data-m="apagar">Apagar esta aula</button>`;
  } else if (a.status === "dada") {
    corpo = `<div class="sub">${a.topicoId && S.banco.topicos[a.topicoId] ? "Tópico: " + esc(S.banco.topicos[a.topicoId].nome) + " · " : ""}${(a.dificuldades || []).length ? "Dificuldades: " + esc(a.dificuldades.join(", ")) : "Sem dificuldades marcadas"}</div>`;
    botoes = `<button class="btn btn-primario" data-m="registrar">Ver / editar registro</button><button class="btn" data-m="desfazer">Desfazer (voltar para agendada)</button>`;
  } else {
    corpo = `<div class="pilha" style="font-size:13px">
      <div><b>Situação:</b> ${esc(STATUS_LABEL[a.status])}${a.status === "falta" ? (a.faltaTipo === "sem_aviso" ? " sem aviso" : " com aviso < 24h") + (a.abonada ? " · abonada" : "") : ""}</div>
      ${c ? `<div><b>Reposição:</b> ${c.valor ? "R$ " + c.valor : "grátis"} — ${esc(c.motivo)}</div>` : ""}
      ${filho ? `<div><b>Reposta em:</b> ${fmtDataLonga(filho.data)} ${esc(filho.hora || "")}</div>` : (a.status !== "feriado" ? `<div><b>Prazo para repor:</b> até ${fmtDataLonga(prazoReposicao(a))}</div>` : "")}
      ${a.observacao ? `<div><b>Obs.:</b> ${esc(a.observacao)}</div>` : ""}</div>`;
    if (!filho && a.status !== "feriado") botoes += `<button class="btn btn-primario" data-m="repor">Marcar reposição</button>`;
    botoes += `<button class="btn" data-m="desfazer">Desfazer</button>`;
  }
  abrirModal(`<section class="modal" role="dialog" aria-labelledby="mt">
      <div class="modal-cab"><h2 id="mt">Aula</h2><span class="sub">${cabAula(a)}</span></div>
      <div class="modal-corpo">${corpo}<div class="pilha">${botoes.replace(/class="btn/g, 'class="btn btn-bloco')}</div></div>
      <div class="modal-rod"><button class="btn" data-m="fechar">Fechar</button></div></section>`, {
    onAction: async (acao) => {
      try {
        if (acao === "fechar") return fecharModal();
        if (acao === "entrar") { const x = await materializar(key); fecharModal(); return navegar(`#/aula/${x.id}`); }
        if (acao === "registrar") { const x = await materializar(key); fecharModal(); return navegar(`#/pos/${x.id}`); }
        if (acao === "remarcar") return modalRemarcar(key);
        if (acao === "repor") return modalRemarcar(a.id, { soReposicao: true });
        if (acao === "faltou") return modalFalta(key);
        if (acao === "prof") return modalProfFeriado(key, "prof_faltou");
        if (acao === "feriado") return modalProfFeriado(key, "feriado");
        if (acao === "apagar") {
          if (!confirm("Apagar esta aula?")) return;
          await S.store.apagarAula(a.id); fecharModal(); toast("Aula apagada."); return render();
        }
        if (acao === "desfazer") {
          if (filho && !confirm(`Isso também apaga a reposição marcada para ${fmtData(filho.data)}. Continuar?`)) return;
          if (filho) await S.store.apagarAula(filho.id);
          const x = { ...S.store.aula(a.id) };
          ["faltaTipo", "abonada", "abonoMotivo"].forEach(k => delete x[k]);
          x.status = "agendada";
          await S.store.salvarAula(x); fecharModal(); toast("Desfeito."); render();
        }
      } catch (e) { erro(e); }
    }
  });
}

function conflitoHorario(data, hora, ignorarIds = []) {
  if (!data || !hora) return null;
  const lista = aulasNoPeriodo(S.store.alunos, S.store.aulas, data, data)
    .filter(a => a.hora === hora && !ignorarIds.includes(a.id) && ["agendada", "dada"].includes(a.status));
  return lista[0] || null;
}

function msgRemarcacao(al, orig, nova, custo) {
  return `Oi, ${al.nome.split(" ")[0]}! Confirmando: a aula de ${DIAS_LONGO[diaSemana(orig.data)].toLowerCase()} ${fmtData(orig.data)} foi remarcada para ${DIAS_LONGO[diaSemana(nova.data)].toLowerCase()} ${fmtData(nova.data)}, às ${nova.hora}.${custo && custo.valor ? ` Lembrando que, pelo contrato, esta remarcação tem custo de R$ ${custo.valor}.` : ""} Até lá!`;
}

export function modalRemarcar(key, { soReposicao = false } = {}) {
  const orig = resolverAula(key);
  if (!orig) return;
  const al = S.store.aluno(orig.alunoId);
  const mes = mesDe(orig.data);
  const st = { aviso: "24h", data: "", hora: orig.hora || "", depois: false, whats: true };
  const prazo = prazoReposicao(orig);

  const desenhar = () => {
    const gratis = situacaoGratisDoMes(S.store.aulas.filter(a => a.id !== orig.id), al.id, mes);
    const custo = soReposicao
      ? mapaCobranca(S.store.aulas)[orig.id]
      : simularCusto(S.store.aulas, orig.id ? orig : { ...orig, id: "__v__" }, st.aviso === "24h" ? "remarcada" : "falta");
    const conf = st.data && st.hora ? conflitoHorario(st.data, st.hora, [orig.id]) : null;
    const foraPrazo = st.data && st.data > prazo;
    return `<section class="modal" role="dialog" aria-labelledby="rt">
      <div class="modal-cab"><h2 id="rt">${soReposicao ? "Marcar reposição" : "Remarcar aula"}</h2><span class="sub">${cabAula(orig)}</span></div>
      <div class="modal-corpo">
        ${soReposicao ? "" : `<div class="pilha"><span class="rotulo">Quando o aluno avisou?</span>
          <div class="seg bloco" role="group" aria-label="Antecedência do aviso">
            <button data-m="aviso" data-v="24h" aria-pressed="${st.aviso === "24h"}">24h ou mais antes</button>
            <button data-m="aviso" data-v="menos" aria-pressed="${st.aviso === "menos"}">Menos de 24h</button></div>
          ${st.aviso === "menos" ? `<span class="mini txt-alerta">Pelo contrato: a aula conta como dada, o aluno perde a remarcação grátis do mês e repor esta aula custa R$ ${VALOR_REMARCACAO}.</span>` : ""}</div>`}
        <div class="grid-2">
          <div class="card ${gratis.disponivel ? "" : "alerta"}" style="padding:12px 14px;gap:2px"><span class="mini">Remarcação grátis do mês</span>
            <b class="${gratis.disponivel ? "txt-ok" : "txt-alerta"}">${gratis.disponivel ? "Disponível" : gratis.perdida ? "Perdida" : "Já usada"}</b></div>
          <div class="card" style="padding:12px 14px;gap:2px"><span class="mini">Prazo para repor (21 dias)</span><b>até ${fmtData(prazo)}</b></div>
        </div>
        <div class="grid-2">
          <div class="campo"><label for="r-data">Nova data</label><input type="date" id="r-data" data-campo="data" value="${esc(st.data)}" min="${hojeISO()}" ${st.depois ? "disabled" : ""}></div>
          <div class="campo"><label for="r-hora">Horário</label><input type="time" id="r-hora" data-campo="hora" value="${esc(st.hora)}" step="900" ${st.depois ? "disabled" : ""}></div>
        </div>
        ${soReposicao ? "" : `<label class="check"><input type="checkbox" data-campo="depois" ${st.depois ? "checked" : ""}>Definir a nova data depois</label>`}
        ${conf ? `<span class="mini txt-alerta">Atenção: ${esc(nomeAluno(conf.alunoId))} já tem aula nesse horário.</span>` : (st.data && st.hora ? `<span class="mini txt-ok">✓ Horário livre na sua agenda</span>` : "")}
        ${foraPrazo ? `<span class="mini txt-alerta">Essa data passa do prazo de 21 dias do contrato.</span>` : ""}
        <div class="card" style="flex-direction:row;justify-content:space-between;align-items:center;padding:14px"><b>Custo desta ${soReposicao ? "reposição" : "remarcação"}</b>
          <b style="font-size:18px" class="${custo && custo.valor ? "txt-alerta" : "txt-ok"}">${custo && custo.valor ? "R$ " + custo.valor : "Grátis"}</b></div>
        ${custo ? `<span class="mini">${esc(custo.motivo)}</span>` : ""}
        <details class="regras"><summary class="txt-alerta" style="font-weight:600;cursor:pointer;font-size:13px">Regras do contrato aplicadas</summary>
          <ul style="margin:6px 0 0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:13px">
            <li>1 remarcação grátis por mês; as demais, R$ ${VALOR_REMARCACAO} cada.</li>
            <li>Repor em até 21 dias corridos da data original; depois disso, perde a validade.</li>
            <li>Aviso com menos de 24h: a aula conta como dada, perde-se a remarcação grátis do mês e repor essa aula custa R$ ${VALOR_REMARCACAO}.</li>
            <li>Remarcações nunca abatem a mensalidade seguinte.</li></ul></details>
        <label class="check"><input type="checkbox" data-campo="whats" ${st.whats ? "checked" : ""}>Gerar mensagem de confirmação para o WhatsApp</label>
      </div>
      <div class="modal-rod"><button class="btn" data-m="fechar">Cancelar</button><button class="btn" data-m="ok">Confirmar</button></div></section>`;
  };
  const redesenhar = () => {
    const raiz = document.querySelector("#modal-raiz .modal-fundo");
    if (raiz) { const sc = raiz.scrollTop; raiz.innerHTML = desenhar(); raiz.scrollTop = sc; }
  };
  abrirModal(desenhar(), {
    onInput: (el) => {
      const c = el.dataset.campo; if (!c) return;
      st[c] = el.type === "checkbox" ? el.checked : el.value;
      if (c === "depois" || c === "data" || c === "hora") { if (el.type === "checkbox" || el.type === "date" || el.type === "time") redesenharSeguro(); }
    },
    onAction: async (acao, el) => {
      try {
        if (acao === "fechar") return fecharModal();
        if (acao === "aviso") { st.aviso = el.dataset.v; return redesenhar(); }
        if (acao === "ok") {
          if (!st.depois && (!st.data || !st.hora)) { toast("Informe a nova data e o horário (ou marque “definir depois”)."); return; }
          if (!soReposicao && st.aviso === "menos" && st.depois === false && !confirm(`Com aviso de menos de 24h a reposição custa R$ ${VALOR_REMARCACAO}. Confirmar?`)) return;
          const o = await materializar(orig.id || orig.key);
          if (!soReposicao) {
            const x = { ...S.store.aula(o.id) };
            if (st.aviso === "24h") { x.status = "remarcada"; delete x.faltaTipo; x.abonada = false; }
            else { x.status = "falta"; x.faltaTipo = "menos_24h"; x.abonada = false; }
            await S.store.salvarAula(x);
          }
          let nova = null;
          if (!st.depois) {
            nova = { alunoId: o.alunoId, data: st.data, hora: st.hora, tipo: "reposicao", status: "agendada", reposicaoDe: o.id };
            await S.store.salvarAula(nova);
          }
          const custo = mapaCobranca(S.store.aulas)[o.id];
          fecharModal(); render();
          toast(nova ? "Remarcação registrada." : "Remarcação registrada. A reposição fica pendente.");
          if (st.whats && nova) modalMensagem(al, msgRemarcacao(al, o, nova, custo));
        }
      } catch (e) { erro(e); }
    }
  });
  let timer;
  function redesenharSeguro() { clearTimeout(timer); timer = setTimeout(() => { const foco = document.activeElement && document.activeElement.dataset.campo; redesenhar(); if (foco) { const f = document.querySelector(`#modal-raiz [data-campo="${foco}"]`); if (f) f.focus(); } }, 250); }
}

export function modalMensagem(al, texto, titulo = "Mensagem para o aluno") {
  const wa = linkWhats(al, texto);
  abrirModal(`<section class="modal" role="dialog" aria-labelledby="mm">
    <div class="modal-cab"><h2 id="mm">${esc(titulo)}</h2><span class="sub">${esc(al.nome)}</span></div>
    <div class="modal-corpo"><textarea id="msg-txt" style="min-height:140px">${esc(texto)}</textarea>
      ${wa ? "" : `<span class="mini">Cadastre o WhatsApp do aluno para abrir a conversa direto.</span>`}</div>
    <div class="modal-rod"><button class="btn" data-m="fechar">Fechar</button><button class="btn" data-m="copiar">Copiar</button>${wa ? `<button class="btn" data-m="wa">Abrir no WhatsApp</button>` : ""}</div></section>`, {
    onAction: (acao) => {
      const t = document.getElementById("msg-txt").value;
      if (acao === "fechar") fecharModal();
      if (acao === "copiar") copiar(t);
      if (acao === "wa") window.open(linkWhats(al, t), "_blank", "noopener");
    }
  });
}

export function modalFalta(key) {
  const a0 = resolverAula(key);
  if (!a0) return;
  const al = S.store.aluno(a0.alunoId);
  const st = { tipo: a0.faltaTipo || "sem_aviso", decisao: a0.abonada ? "abonar" : "aplicar", obs: a0.observacao || "", repor: false, whats: false };
  const [h, m] = (a0.hora || "00:00").split(":").map(Number);
  const tol = `${String(h + Math.floor((m + 15) / 60)).padStart(2, "0")}:${String((m + 15) % 60).padStart(2, "0")}`;
  const desenhar = () => {
    const tresMeses = faltasNoPeriodo(S.store.aulas.filter(x => x.id !== a0.id), al.id, addDays(hojeISO(), -92));
    const mes = faltasNoPeriodo(S.store.aulas.filter(x => x.id !== a0.id), al.id, mesDe(a0.data) + "-01").filter(x => mesDe(x.data) === mesDe(a0.data));
    const abonadas = tresMeses.filter(x => x.abonada);
    const ap = st.decisao === "aplicar";
    return `<section class="modal" role="dialog" aria-labelledby="ft">
      <div class="modal-cab"><h2 id="ft">Marcar falta</h2><span class="sub">${cabAula(a0)} · tolerância até ${tol}</span></div>
      <div class="modal-corpo">
        <div class="pilha"><span class="rotulo">O que aconteceu?</span>
          <div class="seg bloco" role="group" aria-label="Tipo de falta">
            <button data-m="tipo" data-v="sem_aviso" aria-pressed="${st.tipo === "sem_aviso"}">Não veio, sem aviso</button>
            <button data-m="tipo" data-v="menos_24h" aria-pressed="${st.tipo === "menos_24h"}">Avisou com menos de 24h</button></div>
          <span class="mini">Avisou com 24h ou mais? Isso é remarcação, não falta. <button class="btn-link" data-m="ir-remarcar">Remarcar</button></span></div>
        <div class="pilha"><span class="rotulo">Sua decisão</span>
          <div class="seg bloco" role="group" aria-label="Decisão sobre a falta">
            <button data-m="decisao" data-v="aplicar" aria-pressed="${ap}">Aplicar regras do contrato</button>
            <button data-m="decisao" data-v="abonar" aria-pressed="${!ap}">Abonar</button></div>
          <span class="mini">Abonar = falta registrada sem consequência: não conta como dada e não mexe na remarcação grátis.</span></div>
        <div class="regras">
          <span style="font-size:13px;font-weight:700" class="txt-alerta">${ap ? "O que acontece pelo contrato" : "Falta abonada"}</span>
          <div class="r"><span>Aula conta como dada (consome a mensalidade)</span><b>${ap ? "Sim" : "Não"}</b></div>
          <div class="r"><span>Remarcação grátis do mês</span><b class="${ap ? "txt-alerta" : ""}">${ap ? "Perdida" : "Mantida"}</b></div>
          <div class="r"><span>Repor esta aula</span><b>${ap ? `R$ ${VALOR_REMARCACAO} (opcional)` : `Grátis, até ${fmtData(prazoReposicao(a0))}`}</b></div>
          <div class="r"><span>Homework da aula anterior</span><b>Passa para a próxima aula</b></div>
        </div>
        <div class="campo"><label for="f-obs">Observação${ap ? " (opcional)" : " — motivo do abono"}</label>
          <input type="text" id="f-obs" data-campo="obs" value="${esc(st.obs)}" placeholder="${ap ? "ex.: não respondeu no WhatsApp" : "ex.: problema de internet"}"></div>
        <div class="pilha" style="gap:2px">
          <label class="check"><input type="checkbox" data-campo="repor" ${st.repor ? "checked" : ""}>${ap ? `Oferecer reposição paga (R$ ${VALOR_REMARCACAO})` : "Marcar a reposição agora"}</label>
          <label class="check"><input type="checkbox" data-campo="whats" ${st.whats ? "checked" : ""}>Gerar mensagem para o WhatsApp</label>
        </div>
        <div class="item">Faltas de ${esc(al.nome.split(" ")[0])} neste mês: <b>${mes.length + 1}</b> (esta) · nos últimos 3 meses: <b>${tresMeses.length + 1}</b>${abonadas.length ? `, sendo <b>${abonadas.length} abonada${abonadas.length > 1 ? "s" : ""}</b> (${abonadas.map(x => `${fmtData(x.data)}${x.observacao ? ": “" + esc(x.observacao) + "”" : ""}`).join("; ")})` : ""}</div>
      </div>
      <div class="modal-rod"><button class="btn" data-m="fechar">Cancelar</button><button class="btn" data-m="ok">Confirmar falta</button></div></section>`;
  };
  const redesenhar = () => { const r = document.querySelector("#modal-raiz .modal-fundo"); if (r) { const sc = r.scrollTop; r.innerHTML = desenhar(); r.scrollTop = sc; } };
  abrirModal(desenhar(), {
    onInput: el => { const c = el.dataset.campo; if (c) { st[c] = el.type === "checkbox" ? el.checked : el.value; if (el.type === "checkbox") redesenhar(); } },
    onAction: async (acao, el) => {
      try {
        if (acao === "fechar") return fecharModal();
        if (acao === "tipo") { st.tipo = el.dataset.v; return redesenhar(); }
        if (acao === "decisao") { st.decisao = el.dataset.v; return redesenhar(); }
        if (acao === "ir-remarcar") return modalRemarcar(key);
        if (acao === "ok") {
          const o = await materializar(a0.id || key);
          const x = { ...S.store.aula(o.id), status: "falta", faltaTipo: st.tipo, abonada: st.decisao === "abonar", observacao: st.obs.trim() };
          await S.store.salvarAula(x);
          fecharModal(); render(); toast(x.abonada ? "Falta abonada registrada." : "Falta registrada.");
          const nome = al.nome.split(" ")[0];
          const msg = x.abonada
            ? `Oi, ${nome}! Senti sua falta na aula de ${fmtData(x.data)}. Sem problema, vamos repor: me diga um horário que fique bom para você até ${fmtData(prazoReposicao(x))}.`
            : `Oi, ${nome}! Senti sua falta na aula de ${fmtData(x.data)}. Pelo contrato, a aula conta como dada. Se quiser repor, a reposição custa R$ ${VALOR_REMARCACAO}. É só me dizer um horário. Até a próxima!`;
          if (st.repor) modalRemarcar(x.id, { soReposicao: true });
          else if (st.whats) modalMensagem(al, msg);
        }
      } catch (e) { erro(e); }
    }
  });
}

function modalProfFeriado(key, status) {
  const a = resolverAula(key);
  const ehProf = status === "prof_faltou";
  abrirModal(`<section class="modal" role="dialog" aria-labelledby="pf">
    <div class="modal-cab"><h2 id="pf">${ehProf ? "Professor faltou" : "Feriado"}</h2><span class="sub">${cabAula(a)}</span></div>
    <div class="modal-corpo"><span class="sub">${ehProf ? "A reposição é grátis e não conta na cota de remarcação do aluno." : "Feriado combinado: a aula não acontece e não gera reposição."}</span>
      ${ehProf ? `<label class="check"><input type="checkbox" id="pf-repor" checked>Marcar a reposição agora</label>` : ""}</div>
    <div class="modal-rod"><button class="btn" data-m="fechar">Cancelar</button><button class="btn" data-m="ok">Confirmar</button></div></section>`, {
    onAction: async acao => {
      try {
        if (acao === "fechar") return fecharModal();
        const o = await materializar(a.id || key);
        await S.store.salvarAula({ ...S.store.aula(o.id), status });
        const repor = ehProf && document.getElementById("pf-repor")?.checked;
        fecharModal(); render(); toast("Registrado.");
        if (repor) modalRemarcar(o.id, { soReposicao: true });
      } catch (e) { erro(e); }
    }
  });
}

function modalAulaExtra() {
  const ativos = S.store.alunos.filter(a => a.situacao !== "inativo").sort((a, b) => a.nome.localeCompare(b.nome));
  if (!ativos.length) { toast("Cadastre um aluno primeiro."); return; }
  abrirModal(`<section class="modal" role="dialog" aria-labelledby="ax">
    <div class="modal-cab"><h2 id="ax">Aula avulsa</h2><span class="sub">Aula fora do horário fixo (extra ou experimental).</span></div>
    <div class="modal-corpo">
      <div class="campo"><label for="ax-al">Aluno</label><select id="ax-al">${ativos.map(a => `<option value="${esc(a.id)}">${esc(a.nome)}</option>`).join("")}</select></div>
      <div class="grid-2"><div class="campo"><label for="ax-d">Data</label><input type="date" id="ax-d" value="${hojeISO()}"></div>
      <div class="campo"><label for="ax-h">Horário</label><input type="time" id="ax-h" step="900"></div></div>
    </div>
    <div class="modal-rod"><button class="btn" data-m="fechar">Cancelar</button><button class="btn" data-m="ok">Criar aula</button></div></section>`, {
    onAction: async acao => {
      if (acao === "fechar") return fecharModal();
      const d = document.getElementById("ax-d").value, h = document.getElementById("ax-h").value;
      if (!d || !h) return toast("Informe data e horário.");
      await S.store.salvarAula({ alunoId: document.getElementById("ax-al").value, data: d, hora: h, tipo: "extra", status: "agendada" });
      fecharModal(); render(); toast("Aula criada.");
    }
  });
}

// ===================== ALUNOS =====================
function horariosTexto(al) {
  return (al.horarios || []).slice().sort((a, b) => a.dia - b.dia).map(h => `${DIAS_CURTO[h.dia]} ${h.hora}`).join(" · ") || "—";
}

function telaAlunos(v) {
  const f = S.filtroAlunos;
  const busca = (S.buscaAluno || "").toLowerCase();
  const todos = S.store.alunos;
  const cont = s => todos.filter(a => a.situacao === s).length;
  let lista = f === "todos" ? todos.slice() : todos.filter(a => a.situacao === f);
  if (busca) lista = lista.filter(a => a.nome.toLowerCase().includes(busca));
  lista.sort((a, b) => a.nome.localeCompare(b.nome));
  const mesAtual = hojeISO().slice(0, 7);
  const mapa = mapaCobranca(S.store.aulas);
  const linhas = lista.map(al => {
    const dadas = aulasDadasDoAluno(S.store.aulas, al.id);
    const ultima = S.store.aulas.filter(a => a.alunoId === al.id && ["dada", "falta"].includes(a.status)).sort((a, b) => b.data.localeCompare(a.data))[0];
    const g = situacaoGratisDoMes(S.store.aulas, al.id, mesAtual);
    const faltas = faltasNoPeriodo(S.store.aulas, al.id, mesAtual + "-01").length;
    const ultHw = dadas.find(a => a.homeworkFeito);
    const hwTxt = ultHw ? { sim: "em dia", parcial: "parcial", nao: "não fez" }[ultHw.homeworkFeito] : "—";
    return `<tr>
      <td><a class="nome-link" href="#/aluno/${esc(al.id)}">${esc(al.nome)}</a></td>
      <td>${tagSituacao(al.situacao)}</td><td>${tagNivel(al.nivel)}</td><td>${esc(al.plano ? al.plano + "/sem" : "—")}</td>
      <td class="mono" style="font-size:12px">${esc(horariosTexto(al))}</td>
      <td>${ultima ? fmtData(ultima.data) : "—"}</td>
      <td class="${g.disponivel ? "txt-ok" : "txt-alerta"}">${al.situacao === "ativo" ? (g.disponivel ? "disponível" : g.perdida ? "perdida" : "usada") : "—"}</td>
      <td class="${faltas ? "txt-perigo" : "txt-muted"}">${al.situacao === "ativo" ? faltas : "—"}</td>
      <td class="${hwTxt === "em dia" ? "txt-ok" : hwTxt === "—" ? "txt-muted" : "txt-alerta"}">${hwTxt}</td>
      <td>${al.docAlunoUrl ? `<a href="${esc(al.docAlunoUrl)}" target="_blank" rel="noopener" aria-label="Abrir documento de ${esc(al.nome)}">${ICONES.externo}</a>` : ""}</td></tr>`;
  }).join("");
  const filtroBtn = (k, rot, n) => `<button class="kpi" style="cursor:pointer;text-align:left;${f === k ? "border-color:var(--acento);background:var(--acento-fundo)" : ""}" data-a="alunos-filtro" data-f="${k}" aria-pressed="${f === k}"><span class="mini">${rot}</span><span class="v">${n}</span></button>`;
  v.innerHTML = `
    <div class="cols">
      <div class="col-main">
        <div class="linha"><h1 style="font-size:20px">Alunos</h1><span class="flex1"></span>
          <label for="busca-aluno" hidden>Buscar aluno</label><input type="search" id="busca-aluno" data-i="busca-aluno" placeholder="Buscar…" value="${esc(S.buscaAluno || "")}" style="width:220px">
          <a class="btn" href="#/aluno/novo">${ICONES.mais} Novo aluno</a></div>
        <div class="kpis" role="group" aria-label="Filtrar por situação">
          ${filtroBtn("ativo", "Ativos", cont("ativo"))}${filtroBtn("trancado", "Trancados", cont("trancado"))}
          ${filtroBtn("inativo", "Inativos", cont("inativo"))}${filtroBtn("experimental", "Experimental", cont("experimental"))}${filtroBtn("todos", "Todos", todos.length)}
        </div>
        ${lista.length ? `<div class="tabela-caixa"><table><thead><tr><th>Aluno</th><th>Situação</th><th>Nível</th><th>Plano</th><th>Horários</th><th>Última aula</th><th>Remarcação grátis (mês)</th><th>Faltas (mês)</th><th>Homework</th><th>Doc</th></tr></thead><tbody>${linhas}</tbody></table></div>`
          : `<div class="vazio">Nenhum aluno nesta lista.</div>`}
      </div>
      <aside class="col-side">${blocoReengajar()}</aside>
    </div>`;
}

function blocoReengajar() {
  const cfg = config();
  const alvo = S.store.alunos.filter(a => a.situacao === "inativo" || a.situacao === "trancado").sort((a, b) => a.nome.localeCompare(b.nome));
  const ultimaDe = al => { const u = S.store.aulas.filter(a => a.alunoId === al.id && a.status === "dada").sort((a, b) => b.data.localeCompare(a.data))[0]; return u ? u.data : null; };
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `<h2 class="card-titulo">Reengajar inativos e trancados</h2>
    <p class="sub" style="margin:0">Cada botão abre um e-mail pronto no seu aplicativo de e-mail. Você revisa e envia. Nada é enviado sozinho.</p>
    ${alvo.length ? alvo.map(al => {
      const u = ultimaDe(al);
      const sub = (s) => s.replaceAll("{nome}", al.nome.split(" ")[0]).replaceAll("{ultima}", u ? meses[Number(u.slice(5, 7)) - 1] : "algum tempo atrás");
      const href = al.email ? `mailto:${encodeURIComponent(al.email)}?subject=${encodeURIComponent(sub(cfg.emailAssunto))}&body=${encodeURIComponent(sub(cfg.emailCorpo))}` : null;
      return `<div class="item"><span class="flex1"><b>${esc(al.nome)}</b> ${tagSituacao(al.situacao)}<br><span class="mini">${u ? "última aula " + fmtDataLonga(u) : "sem aulas registradas"}${al.email ? "" : " · sem e-mail"}</span></span>
        ${href ? `<a class="btn btn-sm" href="${esc(href)}">Abrir e-mail</a>` : `<a class="btn btn-sm" href="#/aluno/${esc(al.id)}">Add e-mail</a>`}</div>`;
    }).join("") : `<div class="vazio">Nenhum aluno inativo ou trancado.</div>`}
    <a class="mini" href="#/config">Editar o texto do e-mail em Ajustes</a>`;
}

Object.assign(ACOES, { "alunos-filtro": el => { S.filtroAlunos = el.dataset.f; render(); } });
Object.assign(CAMPOS, {
  "busca-aluno": el => {
    S.buscaAluno = el.value; const pos = el.selectionStart; render();
    const n = document.getElementById("busca-aluno"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch {} }
  }
});

// ===================== CADASTRO =====================
function telaCadastro(v, id) {
  const novo = id === "novo" || !id;
  const al0 = novo ? { nome: "", situacao: "ativo", nivel: "", plano: "2x", horarios: [], inicioAgenda: hojeISO() } : S.store.aluno(id);
  if (!al0) { v.innerHTML = `<div class="carregando">Aluno não encontrado. <a href="#/alunos">Voltar</a></div>`; return; }
  const al = JSON.parse(JSON.stringify(al0));
  S.cadastro = al;
  const dadas = novo ? [] : aulasDadasDoAluno(S.store.aulas, al.id);
  const ult8 = dadas.slice(0, 8);
  const difs = contarDificuldades(ult8);
  const comHw = dadas.filter(a => a.homeworkFeito);
  const hwOk = comHw.filter(a => a.homeworkFeito === "sim").length;
  const g = novo ? null : situacaoGratisDoMes(S.store.aulas, al.id, hojeISO().slice(0, 7));
  const f3 = novo ? [] : faltasNoPeriodo(S.store.aulas, al.id, addDays(hojeISO(), -92));
  const ultimas = novo ? [] : S.store.aulas.filter(a => a.alunoId === al.id && a.status !== "agendada").sort((a, b) => b.data.localeCompare(a.data)).slice(0, 10);
  const opt = (val, rot, sel) => `<option value="${esc(val)}" ${sel === val ? "selected" : ""}>${esc(rot)}</option>`;
  v.innerHTML = `
    <div class="barra">
      <a class="btn" href="#/alunos">${ICONES.voltar} Alunos</a>
      <b style="font-size:18px">${novo ? "Novo aluno" : esc(al.nome)}</b>${novo ? "" : tagSituacao(al.situacao)}
      <span class="flex1"></span>
      <a class="btn" href="#/alunos">Descartar</a><button class="btn" data-a="salvar-aluno">Salvar</button>
    </div>
    <div class="rolavel"><div class="grid-2" style="grid-template-columns:minmax(0,3fr) minmax(0,2fr)">
      <div class="pilha-16">
        <section class="card"><h2 class="card-titulo">Dados</h2>
          <div class="grid-2">
            <div class="campo"><label for="c-nome">Nome</label><input type="text" id="c-nome" data-c="nome" value="${esc(al.nome)}" required></div>
            <div class="campo"><label for="c-email">E-mail</label><input type="email" id="c-email" data-c="email" value="${esc(al.email || "")}"></div>
            <div class="campo"><label for="c-whats">WhatsApp</label><input type="tel" id="c-whats" data-c="whatsapp" value="${esc(al.whatsapp || "")}" placeholder="21 99999-9999"></div>
            <div class="campo"><label for="c-sit">Situação</label><select id="c-sit" data-c="situacao">${opt("ativo", "Ativo", al.situacao)}${opt("trancado", "Trancado", al.situacao)}${opt("inativo", "Inativo", al.situacao)}${opt("experimental", "Aula experimental", al.situacao)}</select></div>
            <div class="campo"><label for="c-niv">Nível</label><select id="c-niv" data-c="nivel">${opt("", "A definir", al.nivel || "")}${NIVEIS.map(n => opt(n, n, al.nivel)).join("")}</select></div>
            <div class="campo"><label for="c-plano">Plano</label><select id="c-plano" data-c="plano">${opt("1x", "1x por semana", al.plano)}${opt("2x", "2x por semana", al.plano)}${opt("3x", "3x por semana", al.plano)}</select></div>
          </div>
          <div class="campo"><span class="campo-rotulo">Horários fixos</span>
            <div class="pilha" id="horarios">${(al.horarios || []).map((h, i) => linhaHorario(h, i)).join("")}</div>
            <div><button class="btn btn-sm" data-a="add-horario">${ICONES.mais} Horário</button></div></div>
          <div class="grid-2">
            <div class="campo"><label for="c-ini">Agenda começa em</label><input type="date" id="c-ini" data-c="inicioAgenda" value="${esc(al.inicioAgenda || "")}"></div>
            <div class="campo"><label for="c-aniv">Aniversário (dd/mm)</label><input type="text" id="c-aniv" data-c="aniversario" value="${esc(al.aniversario || "")}" placeholder="15/03"></div>
          </div>
        </section>
        <section class="card"><h2 class="card-titulo">Documentos no Drive</h2>
          <div class="campo"><label for="c-doc">Documento do aluno (compartilhado)</label>
            <div class="linha"><input type="url" id="c-doc" data-c="docAlunoUrl" value="${esc(al.docAlunoUrl || "")}" placeholder="https://docs.google.com/document/d/…" class="flex1" style="flex:1;min-width:0">
            ${al.docAlunoUrl ? `<a class="btn" href="${esc(al.docAlunoUrl)}" target="_blank" rel="noopener">Abrir ${ICONES.externo}</a>` : ""}</div></div>
          <div class="campo"><label for="c-hw">Documento de homework</label>
            <div class="linha"><input type="url" id="c-hw" data-c="docHomeworkUrl" value="${esc(al.docHomeworkUrl || "")}" placeholder="Ainda não existe" style="flex:1;min-width:0">
            ${al.docHomeworkUrl ? `<a class="btn" href="${esc(al.docHomeworkUrl)}" target="_blank" rel="noopener">Abrir ${ICONES.externo}</a>` : `<button class="btn" data-a="criar-doc-hw">Criar no Drive</button>`}</div>
            <span class="mini">${S.fb ? "Cria “Homework — nome do aluno” no seu Drive, compartilha com o e-mail do aluno e passa a receber o homework de cada aula." : "Criar e preencher automaticamente funciona depois que o Firebase estiver configurado. Até lá, cole aqui o link de um documento seu."}</span></div>
        </section>
        <section class="card"><label class="card-titulo" for="c-obs">Observações</label>
          <textarea id="c-obs" data-c="observacoes">${esc(al.observacoes || "")}</textarea></section>
        ${novo ? "" : `<div><button class="btn btn-perigo" data-a="excluir-aluno">Excluir aluno e histórico</button></div>`}
      </div>
      <div class="pilha-16">
        ${novo ? `<section class="card"><span class="sub">O histórico aparece aqui depois das primeiras aulas.</span></section>` : `
        <section class="card"><h2 class="card-titulo">Dificuldades nas últimas ${ult8.length} aulas</h2>
          ${difs.length ? difs.map(([d, n]) => `<div class="pilha" style="gap:4px"><div class="linha" style="justify-content:space-between;font-size:13px"><span>${esc(d)}</span><span>${n}</span></div><div class="barra-h"><i style="width:${Math.round(n / ult8.length * 100)}%"></i></div></div>`).join("") : `<span class="sub">Nenhuma marcada ainda.</span>`}
        </section>
        <section class="card grid-3" style="display:grid">
          <div class="pilha" style="gap:2px"><span class="mini">Homework feito</span><b style="font-size:20px">${hwOk} de ${comHw.length}</b></div>
          <div class="pilha" style="gap:2px"><span class="mini">Remarcação (mês)</span><b style="font-size:20px">${g.disponivel ? "livre" : g.perdida ? "perdida" : "usada"}</b></div>
          <div class="pilha" style="gap:2px"><span class="mini">Faltas (3 meses)</span><b style="font-size:20px">${f3.length}${f3.filter(x => x.abonada).length ? ` <span class="mini">(${f3.filter(x => x.abonada).length} abon.)</span>` : ""}</b></div>
        </section>
        <section class="card"><h2 class="card-titulo">Últimas aulas</h2>
          ${ultimas.length ? ultimas.map(a => `<a href="${a.status === "dada" ? `#/pos/${esc(a.id)}` : "#/semana"}" class="linha" style="justify-content:space-between;font-size:13px;padding:8px 0;border-bottom:1px solid var(--linha);color:var(--texto);text-decoration:none">
            <span>${fmtData(a.data)} · ${a.status === "dada" ? esc(a.topicoId && S.banco.topicos[a.topicoId] ? S.banco.topicos[a.topicoId].nome : "aula dada") : esc(STATUS_LABEL[a.status])}</span>
            <span class="txt-muted">${esc((a.dificuldades || []).join(", "))}</span></a>`).join("") : `<span class="sub">Sem aulas registradas.</span>`}
        </section>`}
      </div>
    </div></div>`;
  v.querySelectorAll("[data-c]").forEach(el => el.addEventListener("input", () => { S.cadastro[el.dataset.c] = el.value; }));
  v.querySelectorAll("[data-c]").forEach(el => el.addEventListener("change", () => { S.cadastro[el.dataset.c] = el.value; }));
  ligarHorarios(v);
}

function linhaHorario(h, i) {
  return `<div class="linha" data-h="${i}">
    <label class="sr" for="h-dia-${i}" hidden>Dia</label><select id="h-dia-${i}" data-hc="dia" style="width:150px">${[1, 2, 3, 4, 5, 6].map(d => `<option value="${d}" ${Number(h.dia) === d ? "selected" : ""}>${DIAS_LONGO[d]}</option>`).join("")}</select>
    <label for="h-hora-${i}" hidden>Hora</label><input type="time" id="h-hora-${i}" data-hc="hora" value="${esc(h.hora || "")}" step="900" style="width:130px">
    <button class="btn btn-sm" data-a="rem-horario" data-i2="${i}" aria-label="Remover horário">Remover</button></div>`;
}
function ligarHorarios(v) {
  v.querySelectorAll("[data-h]").forEach(row => {
    const i = Number(row.dataset.h);
    row.querySelectorAll("[data-hc]").forEach(el => el.addEventListener("change", () => {
      S.cadastro.horarios[i][el.dataset.hc] = el.dataset.hc === "dia" ? Number(el.value) : el.value;
    }));
  });
}
function redesenharHorarios() {
  const box = document.getElementById("horarios");
  box.innerHTML = S.cadastro.horarios.map((h, i) => linhaHorario(h, i)).join("");
  ligarHorarios(document);
}

Object.assign(ACOES, {
  "add-horario": () => { S.cadastro.horarios = S.cadastro.horarios || []; S.cadastro.horarios.push({ dia: 2, hora: "19:00" }); redesenharHorarios(); },
  "rem-horario": el => { S.cadastro.horarios.splice(Number(el.dataset.i2), 1); redesenharHorarios(); },
  "salvar-aluno": async () => {
    const a = S.cadastro;
    a.nome = (a.nome || "").trim();
    if (!a.nome) { toast("Informe o nome."); document.getElementById("c-nome")?.focus(); return; }
    if (!a.nivel) a.nivel = null;
    a.horarios = (a.horarios || []).filter(h => h.hora);
    const novo = !a.id;
    await S.store.salvarAluno(a);
    toast(novo ? "Aluno cadastrado." : "Alterações salvas.");
    navegar(`#/aluno/${a.id}`);
  },
  "excluir-aluno": async () => {
    const a = S.cadastro;
    if (!confirm(`Excluir ${a.nome} e todo o histórico de aulas? Isso não pode ser desfeito.\n\nSe a ideia é só parar as aulas, mude a situação para Inativo.`)) return;
    await S.store.apagarAluno(a.id); toast("Aluno excluído."); navegar("#/alunos");
  },
  "criar-doc-hw": async el => {
    const a = S.cadastro;
    if (!S.fb) { toast("Configure o Firebase para criar documentos automaticamente."); return; }
    if (!a.id) { toast("Salve o aluno primeiro."); return; }
    if (!a.email && !confirm("O aluno está sem e-mail: o documento será criado, mas não será compartilhado. Continuar?")) return;
    el.disabled = true; el.textContent = "Criando…";
    try {
      const token = await S.fb.tokenGoogle();
      const doc = await criarDocHomework(token, a);
      a.docHomeworkUrl = doc.url; a.docHomeworkId = doc.id;
      await S.store.salvarAluno(a);
      toast(a.email ? "Documento criado e compartilhado com o aluno." : "Documento criado.");
      render();
    } catch (e) { el.disabled = false; el.textContent = "Criar no Drive"; erro(e); }
  }
});

// ===================== BIBLIOTECA =====================
function telaBiblioteca(v) {
  const B = S.banco;
  if (!S.bib.topicoId) S.bib.topicoId = B.ordem[0];
  const t = B.topicos[S.bib.topicoId];
  const d = S.bib.dif;
  const arvore = Object.keys(B.porNivel).map(n => `<div class="grupo"><span class="grupo-t nv-${n}">${n}</span>
    ${B.porNivel[n].map(x => `<button data-a="bib-top" data-t="${esc(x.id)}" aria-current="${x.id === t.id}"><span>${esc(x.nome)}</span></button>`).join("")}</div>`).join("");
  const textos = B.textos.filter(x => x.topicos.includes(t.id));
  const mostrar = !!S.bib.respostas;
  const sec = (titulo, html) => `<section class="card"><h2 class="card-titulo">${titulo}</h2>${html}</section>`;
  const x = t[d];
  v.innerHTML = `<div class="cols">
    <nav class="arvore" aria-label="Tópicos">${arvore}<span class="mini" style="padding:0 12px">${Object.keys(B.topicos).length} tópicos · ${B.totalItens.toLocaleString("pt-BR")} itens · ${B.textos.length} textos</span></nav>
    <div class="col-main">
      <div class="linha"><div class="pilha flex1" style="gap:2px;min-width:240px"><span class="tag nv-${t.nivel}" style="align-self:flex-start">${t.nivel} · ${esc(t.categoria)}</span><h1 style="font-size:22px">${esc(t.nome)}</h1>
        <span class="mini">Subtópicos: ${esc(t.sub.join(" · "))}</span></div>
        <div class="seg" role="group" aria-label="Dificuldade">${DIFS.map(k => `<button data-a="bib-dif" data-d="${k}" aria-pressed="${k === d}">${DIF_LABEL[k]}</button>`).join("")}</div>
        <button class="btn" data-a="bib-resp" aria-pressed="${mostrar}">${mostrar ? "Esconder respostas" : "Mostrar respostas"}</button></div>
      <div class="grid-2">
        ${sec("Perguntas e respostas", `<ol class="lista-num">${x.p.map(p => `<li>${esc(p)}</li>`).join("")}</ol>`)}
        ${sec("Tradução PT → EN", `<ol class="lista-num">${x.t.map(p => `<li>${esc(p[0])}${mostrar ? `<span class="resp">${esc(p[1])}</span>` : ""}</li>`).join("")}</ol>`)}
        ${sec("Complete", `<ol class="lista-num">${x.c.map(p => `<li>${esc(p[0])}${mostrar ? `<span class="resp">${esc(p[1])}</span>` : ""}</li>`).join("")}</ol>`)}
        ${sec("Reescreva", `<ol class="lista-num">${x.r.map(p => `<li>${esc(p[0])} <span class="mini">(${esc(p[1])})</span>${mostrar ? `<span class="resp">${esc(p[2])}</span>` : ""}</li>`).join("")}</ol>`)}
        ${sec("Fala (aplicação)", `<ol class="lista-num">${t.fala.map(p => `<li>${esc(p)}</li>`).join("")}</ol>`)}
        ${sec("Escrita (homework)", `<ol class="lista-num">${t.escrita.map(p => `<li>${esc(p)}</li>`).join("")}</ol>`)}
      </div>
      ${sec("Fique de ouvido: erros comuns", t.fique.map(f => `<div class="fique">${esc(f)}</div>`).join(""))}
      ${sec(`Textos com áudio ligados a este tópico`, textos.length ? textos.map(tx => `<div class="item"><button class="play" style="width:40px;height:40px" data-a="bib-ouvir" data-x="${esc(tx.id)}" aria-label="Ouvir ${esc(tx.titulo)}">${ICONES.play}</button>
        <span class="flex1"><b>${esc(tx.titulo)}</b><br><span class="mini">${tx.nivel} · ${DIF_LABEL[tx.dif]} · ${tx.perguntas.length} perguntas + ${tx.pessoais.length} pessoais</span></span></div>`).join("") : `<span class="sub">Nenhum texto ligado a este tópico. Na aula, o app escolhe um texto do mesmo nível.</span>`)}
    </div></div>`;
}
Object.assign(ACOES, {
  "bib-top": el => { S.bib.topicoId = el.dataset.t; render(); },
  "bib-dif": el => { S.bib.dif = el.dataset.d; render(); },
  "bib-resp": () => { S.bib.respostas = !S.bib.respostas; render(); },
  "bib-ouvir": el => {
    const tx = S.banco.textosPorId[el.dataset.x];
    if (!TTS.suportado()) { toast("Este navegador não tem leitura em voz alta."); return; }
    if (window.speechSynthesis.speaking) { window.speechSynthesis.cancel(); return; }
    TTS.falarUma(tx.texto, tx.nivel === "A1" ? 0.85 : 1);
  }
});

// ===================== AJUSTES =====================
function telaConfig(v) {
  const cfg = config();
  const modo = S.store.modo === "nuvem" ? `Nuvem (Firebase) · ${esc(S.usuario?.email || "")}` : (S.store.p === "ca2demo_" ? "Demonstração" : "Local (só neste navegador)");
  const soma = cfg.etapas.reduce((s, e) => s + Number(e.min || 0), 0);
  v.innerHTML = `<div class="rolavel" style="max-width:980px">
    <h1 style="font-size:20px">Ajustes</h1>
    <div class="grid-2">
      <section class="card"><h2 class="card-titulo">Dados</h2>
        <div class="sub">Modo atual: <b>${modo}</b></div>
        ${S.store.modo === "nuvem" ? `<div><button class="btn" data-a="sair">Sair da conta</button></div>` : `<div class="sub">Para usar em qualquer aparelho, siga o <a href="https://github.com/juniorferreira-x4/controle-aulas/blob/main/v2/GUIA_FIREBASE.md" target="_blank" rel="noopener">guia do Firebase</a>.</div>`}
        <div class="sep"></div>
        <span class="rotulo">Backup</span>
        <div class="linha"><button class="btn" data-a="exportar">Exportar backup (.json)</button><button class="btn" data-a="importar-v2">Importar backup (.json)</button></div>
        <span class="rotulo">Trazer dados do app antigo</span>
        <span class="sub">No app antigo, vá em Painel → “Exportar backup (.json)”. Depois importe o arquivo aqui. Alunos já importados não são duplicados.</span>
        <div><button class="btn" data-a="importar-v1">Importar backup do app antigo</button></div>
        <input type="file" id="arq" accept=".json,application/json" hidden>
      </section>
      <section class="card"><h2 class="card-titulo">Aparência</h2>
        <div class="seg" role="group" aria-label="Tema"><button data-a="tema" data-t="escuro" aria-pressed="${cfg.tema === "escuro"}">Escuro</button><button data-a="tema" data-t="claro" aria-pressed="${cfg.tema === "claro"}">Claro</button></div>
        <div class="sep"></div>
        <h2 class="card-titulo">Etapas da aula <span class="mini">(total ${soma} min)</span></h2>
        <div class="pilha">${cfg.etapas.map((e, i) => `<div class="linha"><label for="et-${i}" style="flex:1">${esc(e.nome)}</label><input type="text" inputmode="numeric" id="et-${i}" data-et="${i}" value="${esc(e.min)}" style="width:80px"> <span class="mini">min</span></div>`).join("")}</div>
        <div><button class="btn" data-a="salvar-etapas">Salvar etapas</button></div>
      </section>
      <section class="card"><h2 class="card-titulo">Checklist de dificuldades (pós-aula)</h2>
        <label class="mini" for="cfg-dif">Uma por linha</label>
        <textarea id="cfg-dif" style="min-height:200px">${esc(cfg.dificuldades.join("\n"))}</textarea>
        <div><button class="btn" data-a="salvar-dif">Salvar lista</button></div>
      </section>
      <section class="card"><h2 class="card-titulo">E-mail para inativos</h2>
        <span class="mini">Use {nome} e {ultima} (mês da última aula).</span>
        <div class="campo"><label for="cfg-ass">Assunto</label><input type="text" id="cfg-ass" value="${esc(cfg.emailAssunto)}"></div>
        <div class="campo"><label for="cfg-corpo">Texto</label><textarea id="cfg-corpo" style="min-height:200px">${esc(cfg.emailCorpo)}</textarea></div>
        <div><button class="btn" data-a="salvar-email">Salvar texto</button></div>
      </section>
    </div>
    <span class="mini">Banco de exercícios: ${Object.keys(S.banco.topicos).length} tópicos, ${S.banco.totalItens.toLocaleString("pt-BR")} itens e ${S.banco.textos.length} textos.</span>
  </div>`;
}

async function salvarCfg(parcial) { await S.store.salvarConfig({ ...(S.store.config || {}), ...parcial }); toast("Salvo."); }
function baixar(nome, conteudo) {
  const blob = new Blob([conteudo], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function escolherArquivo() {
  return new Promise(res => {
    const inp = document.getElementById("arq");
    inp.value = "";
    inp.onchange = () => { const f = inp.files[0]; if (!f) return res(null); const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(f); };
    inp.click();
  });
}

Object.assign(ACOES, {
  "tema": async el => { aplicarTema(el.dataset.t); await salvarCfg({ tema: el.dataset.t }); render(); },
  "sair": async () => { await S.fb.sair(); location.reload(); },
  "salvar-etapas": async () => {
    const etapas = config().etapas.map((e, i) => ({ ...e, min: Math.max(1, parseInt(document.getElementById(`et-${i}`).value, 10) || e.min) }));
    await salvarCfg({ etapas }); render();
  },
  "salvar-dif": async () => {
    const lista = document.getElementById("cfg-dif").value.split("\n").map(s => s.trim()).filter(Boolean);
    await salvarCfg({ dificuldades: lista });
  },
  "salvar-email": async () => salvarCfg({ emailAssunto: document.getElementById("cfg-ass").value, emailCorpo: document.getElementById("cfg-corpo").value }),
  "exportar": () => {
    baixar(`controle-aulas-v2-${hojeISO()}.json`, JSON.stringify({ versao: 2, exportadoEm: new Date().toISOString(), alunos: S.store.alunos, aulas: S.store.aulas, config: S.store.config }, null, 2));
    toast("Backup exportado.");
  },
  "importar-v2": async () => {
    const txt = await escolherArquivo(); if (!txt) return;
    let d; try { d = JSON.parse(txt); } catch { toast("Arquivo inválido."); return; }
    if (d.versao !== 2) { toast("Este não é um backup do app novo. Use “Importar backup do app antigo”."); return; }
    if (!confirm(`Importar ${d.alunos.length} alunos e ${d.aulas.length} aulas? Registros com o mesmo id serão substituídos.`)) return;
    await S.store.importarTudo({ alunos: d.alunos, aulas: d.aulas });
    if (d.config) await S.store.salvarConfig(d.config);
    toast("Backup importado."); render();
  },
  "importar-v1": async () => {
    const txt = await escolherArquivo(); if (!txt) return;
    let d; try { d = JSON.parse(txt); } catch { toast("Arquivo inválido."); return; }
    if (!Array.isArray(d.students)) { toast("Este arquivo não parece ser do app antigo."); return; }
    const r = converterV1(d);
    if (!confirm(`Encontrei ${r.alunos.length} alunos novos (${r.pulados} já existiam) e ${r.aulas.length} aulas. Importar?`)) return;
    await S.store.importarTudo(r);
    toast("Dados do app antigo importados."); navegar("#/alunos");
  }
});

// Converte o backup do app antigo (localStorage gf_*) para o formato novo.
export function converterV1(d) {
  const DIA = { Seg: 1, Ter: 2, Qua: 3, Qui: 4, Sex: 5, Sab: 6, "Sáb": 6 };
  const DIF = { "Confiança/Fluência": "Fluência" };
  const existentes = new Set(S.store.alunos.map(a => a.legacyId).filter(Boolean));
  const mapaId = {};
  S.store.alunos.forEach(a => { if (a.legacyId) mapaId[a.legacyId] = a.id; });
  const alunos = [];
  let pulados = 0;
  d.students.forEach(s => {
    if (existentes.has(s.id)) { pulados++; return; }
    const id = novoId();
    mapaId[s.id] = id;
    const dias = (s.diasSemana || []).map(x => DIA[x]).filter(Boolean);
    alunos.push({
      id, legacyId: s.id, nome: (s.nome || "").trim() || "(sem nome)",
      nivel: s.nivel || null, situacao: ({ Ativo: "ativo", Inativo: "inativo", Trancado: "trancado" })[s.status] || "ativo",
      plano: dias.length >= 3 ? "3x" : dias.length === 2 ? "2x" : dias.length === 1 ? "1x" : null,
      horarios: s.horarioSlot ? dias.map(dia => ({ dia, hora: s.horarioSlot })) : [],
      whatsapp: s.contato || "", aniversario: s.aniversario || "", inicioAgenda: hojeISO()
    });
  });
  const novosAlunos = new Set(alunos.map(a => a.legacyId));
  const lessons = (d.lessons || []).filter(l => novosAlunos.has(l.alunoId));
  const lessonId = {};
  const aulas = [];
  lessons.forEach(l => {
    const id = novoId(); lessonId[l.id] = id;
    const status = { Presente: "dada", "Reposição": "dada", Falta: (l.aviso24h === "Sim" ? "remarcada" : "falta"), "Professor faltou": "prof_faltou", Feriado: "feriado" }[l.presenca] || "dada";
    const temas = [...(l.temposVerbais || []), ...(l.subtemas || [])].filter(Boolean);
    if (l.subtemaOutro) temas.push(l.subtemaOutro);
    const difs = (l.dificuldades || []).map(x => DIF[x] || x);
    if (l.dificuldadeOutra) difs.push(l.dificuldadeOutra);
    aulas.push({
      id, alunoId: mapaId[l.alunoId], data: l.data, hora: l.horario || "", tipo: l.presenca === "Reposição" ? "reposicao" : "regular", status,
      faltaTipo: status === "falta" ? "menos_24h" : undefined, abonada: false, dificuldades: difs,
      observacao: temas.length ? "Tema (app antigo): " + temas.join(", ") : "", legacy: { id: l.id, habilidades: l.habilidades || [] }
    });
  });
  // Liga reposições do app antigo à aula original e traz as reposições futuras já agendadas.
  (d.makeups || []).filter(m => novosAlunos.has(m.alunoId)).forEach(m => {
    const orig = lessons.find(l => l.alunoId === m.alunoId && l.data === m.dataPerdida);
    const origId = orig ? lessonId[orig.id] : null;
    if (!m.dataAgendada) return;
    const feita = lessons.find(l => l.alunoId === m.alunoId && l.data === m.dataAgendada && l.presenca === "Reposição");
    if (feita) { const a = aulas.find(x => x.id === lessonId[feita.id]); if (a && origId) a.reposicaoDe = origId; return; }
    if (m.dataAgendada >= hojeISO()) aulas.push({ id: novoId(), alunoId: mapaId[m.alunoId], data: m.dataAgendada, hora: m.horario || "", tipo: "reposicao", status: "agendada", reposicaoDe: origId || undefined });
  });
  return { alunos, aulas, pulados };
}

// ===================== Demonstração =====================
async function semearDemo() {
  const hoje = hojeISO();
  const ini = addDays(segundaDaSemana(0), -14);
  const al = [
    { nome: "Lais", nivel: "A1", plano: "2x", horarios: [{ dia: 1, hora: "19:15" }, { dia: 3, hora: "19:15" }], email: "lais@exemplo.com", whatsapp: "21999990001" },
    { nome: "Adriano", nivel: "A1", plano: "2x", horarios: [{ dia: 1, hora: "20:30" }, { dia: 3, hora: "20:30" }] },
    { nome: "Fabrizia", nivel: "B2", plano: "2x", horarios: [{ dia: 2, hora: "07:00" }, { dia: 4, hora: "07:00" }], email: "fabrizia@exemplo.com", docAlunoUrl: "https://docs.google.com/document/d/exemplo" },
    { nome: "Daiane", nivel: null, plano: "2x", horarios: [{ dia: 2, hora: "08:15" }, { dia: 4, hora: "08:15" }] },
    { nome: "Nilson", nivel: null, plano: "2x", horarios: [{ dia: 2, hora: "17:30" }, { dia: 4, hora: "17:30" }] },
    { nome: "Alessandro", nivel: "A2", plano: "2x", horarios: [{ dia: 2, hora: "19:15" }, { dia: 4, hora: "19:15" }] },
    { nome: "Juliana", nivel: "B1", plano: "2x", horarios: [{ dia: 2, hora: "20:15" }, { dia: 4, hora: "20:15" }] },
    { nome: "Luiz Eduardo Braga", nivel: null, plano: "1x", horarios: [{ dia: 3, hora: "16:15" }] },
    { nome: "Aluno Inativo Exemplo", nivel: "A2", situacao: "inativo", email: "inativo@exemplo.com" },
    { nome: "Aluno Trancado Exemplo", nivel: "B1", situacao: "trancado" }
  ].map(a => ({ situacao: "ativo", inicioAgenda: ini, ...a, id: novoId() }));
  const aulas = [];
  const fab = al[2], jul = al[6], lai = al[0];
  for (let d = ini; d < hoje; d = addDays(d, 1)) {
    al.forEach(a => {
      const h = (a.horarios || []).find(x => x.dia === diaSemana(d));
      if (!h || a.situacao !== "ativo") return;
      if (d >= addDays(hoje, -2)) return; // deixa as últimas como “sem registro”
      aulas.push({ id: novoId(), alunoId: a.id, data: d, hora: h.hora, tipo: "regular", status: "dada", dificuldades: [["Gramática"], ["Pronúncia", "Vocabulário"], ["Construção de frases"]][aulas.length % 3], homeworkFeito: "sim", avaliacaoMaterial: "adequado", nivelMaterial: "medio" });
    });
  }
  const ultFab = aulas.filter(x => x.alunoId === fab.id).pop();
  if (ultFab) { ultFab.topicoId = "b2-second-conditional"; ultFab.homework = { topicoId: "b2-second-conditional", topicoNome: "Second Conditional", nivel: "B2", dif: "medio", completar: [["If I ___ (have) time, I would study more.", "had"]], reescrever: [], traducao: [], escrita: "Write 5 sentences about your dream life.", texto: null }; }
  const ultJul = aulas.filter(x => x.alunoId === jul.id).pop();
  if (ultJul) { ultJul.status = "falta"; ultJul.faltaTipo = "sem_aviso"; ultJul.abonada = false; delete ultJul.dificuldades; }
  const ultLai = aulas.filter(x => x.alunoId === lai.id).pop();
  if (ultLai) { ultLai.status = "remarcada"; delete ultLai.dificuldades; aulas.push({ id: novoId(), alunoId: lai.id, data: addDays(hoje, 2), hora: "18:00", tipo: "reposicao", status: "agendada", reposicaoDe: ultLai.id }); }
  await S.store.importarTudo({ alunos: al, aulas });
}

boot();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
