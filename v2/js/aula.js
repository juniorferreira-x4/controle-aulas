// Modo aula (roteiro guiado com cronômetro) e pós-aula (registro + homework automático).
import { S, ACOES, CAMPOS, TELA, esc, toast, erro, navegar, config, tagNivel, copiar, ICONES } from "./ctx.js";
import {
  fmtData, fmtDataLonga, diaSemana, DIAS_CURTO, DIFS, DIF_LABEL, hojeISO, aulasDadasDoAluno, sugerirPlano, sugerirTexto,
  gerarHomework, gerarHomeworkConversa, homeworkComoTexto, aulasNoPeriodo, addDays, jaPassou, modeloDaAula, sugerirTema, MODELOS
} from "./regras.js";
import * as TTS from "./tts.js";
import { inserirNoTopo } from "./drive.js";
import { modalFalta, linksDocs, contarDificuldades, modalMensagem } from "./app.js";
import { Sessao, novoSid, linkDoAluno, baseApp } from "./sessao.js";

// ---------- utilidades ----------
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
const mmss = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
function hash(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
function opcoesTopicos(sel) {
  return Object.keys(S.banco.porNivel).map(n => `<optgroup label="${n}">${S.banco.porNivel[n].map(t => `<option value="${esc(t.id)}" ${t.id === sel ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}</optgroup>`).join("");
}
function opcoesTemas(sel) {
  return S.banco.temas.map(t => `<option value="${esc(t.id)}" ${t.id === sel ? "selected" : ""}>${esc(t.tema)} (${t.niveis.join("–")})</option>`).join("");
}
function anteriores(aula) {
  return aulasDadasDoAluno(S.store.aulas, aula.alunoId).filter(a => a.id !== aula.id && (a.data + (a.hora || "")) <= (aula.data + (aula.hora || "")));
}
function etapasDoModelo(modelo) { const c = config(); return modelo === "conversa" ? c.etapasConversa : c.etapas; }
function vizinha(d) { return d === "facil" ? "medio" : d === "medio" ? "dificil" : "medio"; }
const lista = (itens, inicio = 1, cls = "") => `<ol class="lista-num ${cls}" start="${inicio}">${itens.join("")}</ol>`;
const li = (txt, resp, mostrar) => `<li>${esc(txt)}${mostrar && resp ? `<span class="resp">${esc(resp)}</span>` : ""}</li>`;

const NIVEIS_ALTOS = ["B2", "C1", "C2"];
function faixa(nivel) { return nivel === "A1" || nivel === "A2" || !nivel ? "basico" : nivel === "B1" ? "intermediario" : "avancado"; }
function normalizar(x) { return (x || "").toLowerCase().replace(/[’']/g, "'").replace(/\([^)]*\)/g, "").replace(/[.,!?;:"]/g, "").replace(/\s+/g, " ").trim(); }
function confere(resp, gab, enunciado = "") {
  const r = normalizar((resp || "").replace(/\s*[/,]\s*/g, " "));
  if (!r) return false;
  const lacunas = (enunciado.match(/_{2,}/g) || []).length;
  const opcoes = lacunas >= 2 ? [gab.split("/").map(x => x.trim()).join(" ")] : gab.split("/");
  const exp = x => x.replace(/'s\b/g, " is").replace(/n't\b/g, " not").replace(/'m\b/g, " am").replace(/'re\b/g, " are");
  return opcoes.map(normalizar).some(g => g && (g === r || exp(g) === exp(r)));
}

// ===================== MODO AULA =====================
let A = null; // estado da tela de aula

export function renderAula(v, id) {
  const aula = S.store.aula(id);
  if (!aula) { v.innerHTML = `<div class="carregando">Aula não encontrada. <a href="#/semana">Voltar</a></div>`; return; }
  const al = S.store.aluno(aula.alunoId);
  if (!aula.modelo) aula.modelo = modeloDaAula(al, S.store.aulas, aula.id);
  const etapas = etapasDoModelo(aula.modelo);
  const kTimer = `ca2_timer_${aula.id}`;
  const timer = LS.get(kTimer, null) || { etapa: 0, seg: etapas.map(() => 0), rodando: false, ultimo: 0, iniciada: false, encerrada: false, prIdx: 0 };
  if (timer.iniciada === undefined) timer.iniciada = timer.rodando || timer.seg.some(x => x >= 1);
  if (timer.seg.length !== etapas.length) timer.seg = etapas.map((_, i) => timer.seg[i] || 0);
  if (timer.etapa >= etapas.length) timer.etapa = 0;
  A = { aula, al, etapas, kTimer, timer, resp: false, mostrarTexto: false, aqIdx: hash(aula.id) % 7, maisEx: false, rate: al.nivel === "A1" ? 0.85 : 1,
    dicas: {}, exercicio: null, respostas: {}, comentario: "", vendo: null };
  // Exercício que estava aberto (se a página recarregou) e respostas já recebidas.
  (aula.exercicios || []).forEach(x => { if (x.resposta) A.respostas[x.id] = x.resposta; });
  if (aula.exercicioAtivo) A.exercicio = (aula.exercicios || []).find(x => x.id === aula.exercicioAtivo) || null;
  Sessao.ligar(S.fb, { aoResponder: receberResposta, aoPedirEstado: () => enviarTela() });
  prepararPlano();
  S.store.salvarAula(aula).catch(erro);
  desenharAula(v);
  // Aula já registrada no pós-aula: não liga o link (só se o professor reabrir).
  if (aula.status !== "dada") ativarLink().catch(falhaLink);
  const tick = setInterval(() => { atualizarRelogio(); atualizarStatus(); }, 1000);
  TELA.limpar = () => {
    clearInterval(tick); salvarTimer(); TTS.parar();
    const atual = S.store.aula(A.aula.id);
    if (atual && (A.aula.notaRapida || "") !== (atual.notaRapida || "")) S.store.salvarAula({ ...atual, notaRapida: A.aula.notaRapida }).catch(erro);
    A = null;
  };
}

// Plano automático (tópico/tema e texto), salvo na aula na primeira entrada.
function prepararPlano() {
  const { aula, al } = A;
  if (aula.modelo === "conversa") {
    if (!aula.temaId) aula.temaId = sugerirTema(S.banco, al, S.store.aulas, aula.id);
    return;
  }
  if (!aula.topicoId) {
    const p = sugerirPlano(S.banco, al, S.store.aulas, aula.id);
    aula.topicoId = p.topicoId; aula.nivelMaterial = p.dif; aula.motivoPlano = p.motivo;
  }
  if (!aula.textoId) {
    const usados = new Set(S.store.aulas.filter(a => a.alunoId === al.id && a.id !== aula.id && a.textoId).map(a => a.textoId));
    const t = S.banco.topicos[aula.topicoId];
    const tx = sugerirTexto(S.banco, t ? t.nivel : (al.nivel || "A2"), aula.topicoId, aula.nivelMaterial, usados);
    aula.textoId = tx ? tx.id : null;
  }
}

function falhaLink(e) {
  if (!A) return;
  A.erroLink = e.message || String(e); atualizarStatus();
  toast("Não consegui ligar o link do aluno. Confira se as regras do Firestore do guia foram publicadas.");
}
function temNuvem() { return !!(S.fb && S.store.modo === "nuvem"); }
// Salva só estes campos sobre a versão mais recente da aula.
function salvarCampos(campos) {
  if (!A) return; const atual = S.store.aula(A.aula.id); if (!atual) return;
  S.store.salvarAula({ ...atual, ...campos }).catch(erro);
}
// Liga o link fixo do aluno a esta aula. Cria o link na primeira vez.
async function ativarLink() {
  if (!A || !temNuvem() || A.timer.encerrada) return;
  const aulaId = A.aula.id;
  let al = S.store.aluno(A.al.id) || A.al;
  if (!al.sessaoFixa) { al = { ...al, sessaoFixa: novoSid() }; await S.store.salvarAluno(al); }
  if (!A || A.aula.id !== aulaId) return;
  A.al = { ...A.al, sessaoFixa: al.sessaoFixa };
  await Sessao.ativar(A.aula, al.nome.split(" ")[0], al.sessaoFixa);
  if (A && A.aula.id === aulaId) { A.erroLink = null; Sessao.ultimo = ""; enviarTela(); atualizarPainelAluno(); }
}

function salvarTimer() {
  if (!A) return;
  const t = A.timer;
  if (t.rodando) { const agora = Date.now(); t.seg[t.etapa] += (agora - t.ultimo) / 1000; t.ultimo = agora; }
  LS.set(A.kTimer, t);
}
function atualizarRelogio() {
  if (!A) return;
  salvarTimer();
  const t = A.timer;
  const total = t.seg.reduce((s, x) => s + x, 0);
  const el2 = document.getElementById("cr-total");
  if (el2) el2.textContent = mmss(total);
  A.etapas.forEach((et, i) => {
    const b = document.getElementById(`et-bar-${i}`), l = document.getElementById(`et-t-${i}`), card = document.getElementById(`et-card-${i}`);
    if (b) b.style.width = Math.min(100, (t.seg[i] / (et.min * 60)) * 100) + "%";
    if (l) l.textContent = mmss(t.seg[i]);
    if (card) card.classList.toggle("estourou", t.seg[i] > et.min * 60);
  });
}

// Layout: etapas e controles à esquerda; um quadro grande com o conteúdo da etapa à direita.
function desenharAula(v = document.getElementById("view")) {
  const { aula, al, etapas, timer } = A;
  const idx = A.vendo ?? timer.etapa;
  const e = etapas[idx];
  const ultima = timer.etapa === etapas.length - 1;
  const meta = etapas.reduce((s, x) => s + Number(x.min), 0) * 60;
  const total = timer.seg.reduce((s, x) => s + x, 0);
  const quando = `${DIAS_CURTO[diaSemana(aula.data)]} ${fmtData(aula.data)} · ${esc(aula.hora || "")}`;
  const sc = document.getElementById("q-corpo")?.scrollTop || 0;
  const docs = [al.docAlunoUrl ? `<a class="btn btn-sm" href="${esc(al.docAlunoUrl)}" target="_blank" rel="noopener">Doc do aluno ${ICONES.externo}</a>` : "",
    al.docHomeworkUrl ? `<a class="btn btn-sm" href="${esc(al.docHomeworkUrl)}" target="_blank" rel="noopener">Doc homework ${ICONES.externo}</a>` : ""].join("");
  const st = statusConexao();
  const acoes = !timer.iniciada
    ? `<button class="btn" data-a="aula-tela" id="btn-tela">Tela do aluno <span class="dot ${st.cls}" id="dot-aluno">●</span></button>
       <button class="btn btn-primario" data-a="aula-iniciar">${ICONES.play} Iniciar aula</button>
       <button class="btn btn-perigo" data-a="aula-faltou" style="grid-column:1 / -1">Aluno faltou</button>`
    : timer.encerrada
    ? `<button class="btn" data-a="aula-tela" id="btn-tela">Tela do aluno <span class="dot ${st.cls}" id="dot-aluno">●</span></button>
       <button class="btn" data-a="aula-reabrir">Reabrir aula</button>
       <button class="btn btn-primario" data-a="aula-pos" style="grid-column:1 / -1">Ir para o pós-aula ${ICONES.prox}</button>`
    : `<button class="btn" data-a="aula-tela" id="btn-tela">Tela do aluno <span class="dot ${st.cls}" id="dot-aluno">●</span></button>
       <button class="btn" data-a="aula-play">${timer.rodando ? `${ICONES.pausa} Pausar` : `${ICONES.play} Continuar`}</button>
       <button class="btn" data-a="aula-prox" ${ultima ? "disabled" : ""}>Próxima etapa ${ICONES.prox}</button>
       <button class="btn ${ultima ? "btn-primario" : ""}" data-a="aula-encerrar">Encerrar aula</button>`;
  const c = conteudoEtapa(e.id);
  v.innerHTML = `
    <div class="cab-aula">
      <a class="btn btn-sm" href="#/semana">${ICONES.voltar} Semana</a>
      <b style="font-size:17px">${esc(al.nome)}</b>${tagNivel(al.nivel)}<span class="sub">${quando}${aula.tipo === "reposicao" ? " · reposição" : ""}</span>
      <div class="seg" role="group" aria-label="Modelo da aula">${Object.entries(MODELOS).map(([k, r]) => `<button class="btn-sm" data-a="aula-modelo" data-m="${k}" aria-pressed="${aula.modelo === k}">${r}</button>`).join("")}</div>
      <span class="flex1"></span>
      ${docs}
      <div class="cron"><span class="mini">Aula</span><span class="grande" id="cr-total">${mmss(total)}</span><span class="peq">/ ${mmss(meta)}</span></div>
    </div>
    <div class="lay-aula">
      <aside class="esq-aula">
        <div class="acoes-aula">${acoes}</div>
        <span class="mini" id="status-aluno">${st.txt}</span>
        <ol class="etv">
          ${etapas.map((et, i) => `<li><button class="etapa ${i === timer.etapa ? "atual" : ""} ${i === A.vendo ? "vendo" : ""} ${i < timer.etapa ? "feita" : ""} ${timer.seg[i] > et.min * 60 ? "estourou" : ""}" id="et-card-${i}" data-a="aula-etapa" data-e="${i}">
            <span class="et-nome"><b>${i + 1} · ${esc(et.nome)}</b>${i === timer.etapa && timer.iniciada && !timer.encerrada ? ` <span class="olho">aluno aqui</span>` : ""}</span>
            <span class="et-t mono"><span id="et-t-${i}">${mmss(timer.seg[i])}</span><span class="txt-muted"> / ${mmss(et.min * 60)}</span></span>
            <span class="barra-p"><i id="et-bar-${i}" style="width:${Math.min(100, timer.seg[i] / (et.min * 60) * 100)}%"></i></span></button></li>`).join("")}
        </ol>
        <section class="card compacto"><label class="rotulo acento" for="corr-aluno">Correções para o aluno</label>
          <textarea id="corr-aluno" data-i="correcoes-aluno" placeholder="Uma por linha. Ex.: I have 30 years → I am 30" style="min-height:80px">${esc((aula.correcoesAluno || []).join("\n"))}</textarea>
          <span class="mini">Aparecem na tela do aluno enquanto você digita.</span></section>
        <section class="card compacto"><label class="rotulo" for="nota-rapida">Nota rápida (só você vê)</label>
          <textarea id="nota-rapida" data-i="nota-rapida" placeholder="Erros e observações…" style="min-height:70px">${esc(aula.notaRapida || "")}</textarea></section>
      </aside>
      <section class="quadro">
        <div class="q-cab"><b class="q-titulo">${idx + 1} · ${esc(e.nome)}</b>${c.cab || ""}<span class="flex1"></span><span class="linha" id="q-acoes">${acoesEtapaHTML()}</span>${fiqueHTML()}</div>
        ${A.vendo !== null ? avisoPrevia() : ""}
        <div class="q-corpo ${A.exercicio ? "com-ex" : ""}" id="q-corpo"><div class="q-conteudo">${c.corpo}</div>${A.exercicio ? `<aside class="card destaque painel-ex" id="painel-ex">${painelExHTML()}</aside>` : ""}</div>
      </section>
    </div>`;
  const qc = document.getElementById("q-corpo"); if (qc && sc) qc.scrollTop = sc;
  if (e.id === "listening") atualizarPlayer();
  enviarTela();
}

function avisoPrevia() {
  const c = A.etapas[A.timer.etapa];
  return `<div class="aviso-previa linha"><span class="flex1">Prévia. A tela do aluno continua em <b>${esc(c.nome)}</b>.</span>
    <button class="btn btn-sm btn-primario" data-a="previa-ir">Ir para esta etapa</button><button class="btn btn-sm" data-a="previa-voltar">Voltar</button></div>`;
}

// Botões que mexem na tela do aluno (só para a etapa em que ele está, com a aula em andamento).
function acoesEtapaHTML() {
  if (!A || A.vendo !== null || !A.timer.iniciada || A.timer.encerrada) return "";
  const etapa = A.etapas[A.timer.etapa];
  const dc = dicasDaEtapa(), lib = !!A.dicas[A.timer.etapa];
  let h = "";
  if (etapa.id === "listening" && A.aula.textoId) h += `<button class="btn btn-sm ${A.timer.textoLiberado ? "" : "btn-primario"}" data-a="texto-toggle" aria-pressed="${!!A.timer.textoLiberado}">${A.timer.textoLiberado ? "Ocultar texto do aluno" : "Liberar texto para o aluno"}</button>`;
  if (dc) h += `<button class="btn btn-sm" data-a="dicas-toggle" aria-pressed="${lib}">${lib ? "Ocultar dicas" : "Liberar dicas"}</button>`;
  if (etapa.id !== "listening" && !A.exercicio) h += `<details class="menu"><summary class="btn btn-sm">Exercício escrito ▾</summary><div class="menu-lista">${tiposExercicio().map(([k, r]) => `<button class="btn btn-sm" data-a="ex-enviar" data-t="${k}">${r}</button>`).join("")}</div></details>`;
  return h;
}
function fiqueHTML() {
  const { aula } = A;
  const t = aula.modelo === "conversa" ? null : S.banco.topicos[aula.topicoId];
  const ant = anteriores(aula);
  const dif = contarDificuldades(ant.slice(0, 4)).slice(0, 3);
  const itens = [...(t ? t.fique.map(f => esc(f)) : []),
    ...dif.map(([d, n]) => `${esc(d)} <span class="txt-muted">· ${n} das últimas ${Math.min(4, ant.length)}</span>`),
    ...(ant[0] && ant[0].observacao ? [`<span class="mini">Nota da aula passada</span><br>${esc(ant[0].observacao)}`] : [])];
  if (!itens.length) return "";
  return `<details class="menu fique-menu"><summary class="chip-f">Fique de ouvido (${itens.length})</summary><div class="menu-lista largo">${itens.map(i => `<div class="fique">${i}</div>`).join("")}</div></details>`;
}

// ---------- conteúdo de cada etapa: { cab (controles no cabeçalho do quadro), corpo } ----------
function conteudoEtapa(id) {
  const { aula, al } = A;
  const t = S.banco.topicos[aula.topicoId];
  const tema = S.banco.temasPorId[aula.temaId];
  const nivel = t ? t.nivel : (al.nivel || "A2");
  const r = A.resp;

  if (id === "aquecimento") {
    const perguntas = S.banco.aquecimento[al.nivel] || S.banco.aquecimento[nivel] || S.banco.aquecimento.A2;
    const ant = anteriores(aula)[0];
    return { cab: `<button class="btn btn-sm" data-a="aq-outra">Outra pergunta</button>`, corpo: `<div class="grid-2">
      <section class="card destaque"><span class="rotulo acento">Pergunta</span>
        <div style="font-size:22px;font-weight:600;line-height:1.35">${esc(perguntas[A.aqIdx % perguntas.length])}</div></section>
      <section class="card"><span class="rotulo">Retome o combinado da última aula</span>
        ${ant ? `<span class="sub">${fmtDataLonga(ant.data)}${ant.topicoId && S.banco.topicos[ant.topicoId] ? " · " + esc(S.banco.topicos[ant.topicoId].nome) : ""}${ant.temaId && S.banco.temasPorId[ant.temaId] ? " · " + esc(S.banco.temasPorId[ant.temaId].tema) : ""}</span>
          ${ant.observacao ? `<div>${esc(ant.observacao)}</div>` : ""}
          ${(ant.dificuldades || []).length ? `<div class="chips">${ant.dificuldades.map(d => `<span class="tag">${esc(d)}</span>`).join("")}</div>` : ""}` : `<span class="sub">Primeira aula registrada com este aluno.</span>`}</section>
    </div>` };
  }

  if (id === "homework") {
    const ant = anteriores(aula).find(a => a.homework);
    if (!ant) return { corpo: `<span class="sub">Nenhum homework enviado na aula anterior. Use o tempo para estender o aquecimento ou revisar as dificuldades da última aula.</span>` };
    const hw = ant.homework;
    const cab = `<span class="sub">${esc(hw.topicoNome)} · enviado em ${fmtData(ant.data)}${hw.dif ? " · " + DIF_LABEL[hw.dif] : ""}</span>
      <button class="btn btn-sm" data-a="aula-resp" aria-pressed="${r}">${r ? "Esconder gabarito" : "Mostrar gabarito"}</button>`;
    if (hw.tipo === "conversa") {
      return { cab, corpo: caixaTextoAluno() + `<div class="grid-2">
        <section class="card"><h2 class="rotulo">Frases com as expressões</h2>${lista(hw.vocab.map(v => li(v[0], v[1], r)))}</section>
        <section class="card"><h2 class="rotulo">Escrita</h2><div>${esc(hw.escrita)}</div>
          <h2 class="rotulo">Preparação para a conversa</h2>${lista(hw.preparar.map(p => li(p)))}</section></div>` };
    }
    return { cab, corpo: caixaTextoAluno() + `<div class="grid-2">
      <section class="card">
        ${hw.completar?.length ? `<h2 class="rotulo">Complete</h2>${lista(hw.completar.map(c => li(c[0], c[1], r)))}` : ""}
        ${hw.reescrever?.length ? `<h2 class="rotulo">Reescreva</h2>${lista(hw.reescrever.map(c => li(`${c[0]} (${c[1]})`, c[2], r)))}` : ""}
      </section>
      <section class="card">
        ${hw.traducao?.length ? `<h2 class="rotulo">Tradução</h2>${lista(hw.traducao.map(c => li(c[0], c[1], r)))}` : ""}
        ${hw.escrita ? `<h2 class="rotulo">Escrita</h2><div>${esc(hw.escrita)}</div>` : ""}
        ${hw.texto ? `<h2 class="rotulo">Texto: ${esc(hw.texto.titulo)}</h2>${lista(hw.texto.perguntas.map(p => li(p)))}` : ""}
      </section></div>` };
  }

  if (id === "pratica") {
    if (!t) return { corpo: `<span class="sub">Selecione um tópico.</span>` };
    const d = aula.nivelMaterial || "medio", x = t[d], dv = vizinha(d);
    const itens = itensPratica(), cur = Math.min(A.timer.prIdx || 0, itens.length - 1);
    const grupo = (tipo, extra) => itens.map((it, n) => ({ it, n })).filter(o => o.it.tipo === tipo && o.it.extra === extra)
      .map(({ it, n }) => `<li class="clicavel ${n === cur ? "item-atual" : ""}" data-a="pr-ir" data-n="${n}">${esc(it.txt)}${it.resp && r ? `<span class="resp">${esc(it.resp)}</span>` : ""}</li>`);
    const atual = itens[cur];
    return {
      cab: `<label for="sel-top" hidden>Tópico</label><select id="sel-top" data-i="aula-topico" style="max-width:280px">${opcoesTopicos(t.id)}</select>
        <div class="seg" role="group" aria-label="Dificuldade">${DIFS.map(k => `<button class="btn-sm" data-a="aula-dif" data-d="${k}" aria-pressed="${k === d}">${DIF_LABEL[k]}</button>`).join("")}</div>
        <button class="btn btn-sm" data-a="aula-resp" aria-pressed="${r}">${r ? "Esconder respostas" : "Mostrar respostas"}</button>`,
      corpo: `<div class="linha nav-item"><button class="btn btn-sm" data-a="pr-ant" ${cur <= 0 ? "disabled" : ""}>${ICONES.voltar} Anterior</button>
        <span class="flex1">Na tela do aluno: <b>${cur + 1} de ${itens.length}</b> · ${atual ? (atual.tipo === "p" ? "pergunta" : "tradução oral") : ""}</span>
        <button class="btn btn-sm btn-primario" data-a="pr-prox" ${cur >= itens.length - 1 ? "disabled" : ""}>Próxima ${ICONES.prox}</button></div>
      <div class="grid-2">
        <div><h2 class="rotulo">Perguntas · ${DIF_LABEL[d]}</h2>${lista(grupo("p", false))}
          <h2 class="rotulo txt-muted" style="margin-top:12px">Se sobrar tempo · ${DIF_LABEL[dv]}</h2>${lista(grupo("p", true), x.p.length + 1, "lista-extra")}</div>
        <div><h2 class="rotulo">Tradução oral PT → EN · ${DIF_LABEL[d]}</h2>${lista(grupo("t", false))}
          <h2 class="rotulo txt-muted" style="margin-top:12px">Se sobrar tempo · ${DIF_LABEL[dv]}</h2>${lista(grupo("t", true), x.t.length + 1, "lista-extra")}</div>
      </div>
      <div><button class="btn btn-sm" data-a="aula-mais">${A.maisEx ? "Esconder exercícios extras" : "Mais exercícios (completar e reescrever)"}</button></div>
      ${A.maisEx ? `<div class="grid-2">
        <div><h2 class="rotulo">Complete</h2>${lista(x.c.map(p => li(p[0], p[1], r)))}</div>
        <div><h2 class="rotulo">Reescreva</h2>${lista(x.r.map(p => li(`${p[0]} (${p[1]})`, p[2], r)))}</div></div>` : ""}` };
  }

  if (id === "listening") {
    const tx = aula.textoId ? S.banco.textosPorId[aula.textoId] : null;
    const doNivel = S.banco.textos.filter(x => x.nivel === nivel);
    if (!tx) return { corpo: `<span class="sub">Nenhum texto disponível para ${nivel}.</span>` };
    const dica = nivel === "A1" || nivel === "A2"
      ? "Níveis iniciais: ouçam uma vez em 0.85×, pergunte o que ele entendeu, depois libere o texto e ouçam de novo."
      : "Níveis mais altos: ouçam duas vezes sem o texto e faça as perguntas de interpretação antes de liberar o texto.";
    return {
      cab: `<label for="sel-tx" hidden>Texto</label><select id="sel-tx" data-i="aula-texto" style="max-width:320px">${doNivel.map(x => `<option value="${esc(x.id)}" ${x.id === tx.id ? "selected" : ""}>${esc(x.titulo)} (${DIF_LABEL[x.dif]})</option>`).join("")}</select>`,
      corpo: `<div class="grid-2">
      <div class="pilha" style="gap:12px">
        ${TTS.suportado() ? `<div class="card destaque" style="gap:12px">
          <div class="player"><button class="play" data-a="tts-play" id="tts-btn" aria-label="Tocar">${ICONES.play}</button>
            <div class="flex1 pilha" style="gap:6px"><div class="progresso"><i id="tts-prog" style="width:0%"></i></div><span class="mini" id="tts-info">Pronto para tocar (no seu computador)</span></div></div>
          <div class="linha">
            <button class="btn btn-sm" data-a="tts-voltar">↺ Frase anterior</button>
            <div class="seg" role="group" aria-label="Velocidade">${[0.75, 0.85, 1, 1.15].map(v => `<button class="btn-sm" data-a="tts-rate" data-r="${v}" aria-pressed="${A.rate === v}">${v}×</button>`).join("")}</div>
            <button class="btn btn-sm" data-a="tts-parar">Recomeçar</button></div></div>` : ""}
        <div class="item" id="status-listening">${statusListening()}</div>
        <span class="sub">${dica}</span>
        <p class="texto-leitura" style="margin:0">${esc(tx.texto)}</p>
      </div>
      <div><h2 class="rotulo">Perguntas de interpretação</h2>${lista(tx.perguntas.map(p => li(p)))}
        <h2 class="rotulo acento" style="margin-top:12px">Perguntas pessoais</h2>${lista(tx.pessoais.map(p => `<li class="txt-acento">${esc(p)}</li>`), tx.perguntas.length + 1)}</div>
    </div>` };
  }

  if (id === "fala") {
    return { corpo: `<div class="grid-2">
      <div><h2 class="rotulo acento">Aplicação oral${t ? " · " + esc(t.nome) : ""}</h2>${lista((t ? t.fala : []).map(p => li(p)))}</div>
      <div><h2 class="rotulo">Desafios extras</h2>
        ${lista(["Mudança de perspectiva: defenda o lado oposto por 1 minuto.", "Fale por 60 segundos sem parar sobre o tema.", "Faça 3 perguntas para mim sobre o mesmo assunto.", "Conte uma história real usando a estrutura do dia."].map(p => li(p)))}</div></div>` };
  }

  if (id === "fechamento" || id === "devolutiva") {
    const conv = id === "devolutiva";
    const hw = garantirHwPrevia();
    return {
      cab: `<button class="btn btn-sm" data-a="hw-sortear">Sortear outro homework</button>`,
      corpo: `<div class="grid-2">
      <div class="pilha" style="gap:12px">
        ${lista((conv
          ? ["Leia 3 a 5 erros anotados e peça para o aluno reformular cada frase.", "Reforce 2 expressões novas que ele usou bem.", "Elogie algo específico da conversa.", "Combine o tema da próxima aula e mostre o homework."]
          : ["Devolva as 2 ou 3 correções mais importantes da aula.", "Elogie algo específico que o aluno fez bem.", "Combine o foco da próxima aula e mostre o homework."]).map(p => li(p)))}
        <div><button class="btn btn-primario" data-a="aula-encerrar">Encerrar aula ${ICONES.prox}</button></div></div>
      <div class="pilha" style="gap:8px"><h2 class="rotulo">Homework desta aula · na tela do aluno</h2>
        ${hw ? `<div class="item hw-previa">${esc(homeworkComoTexto(hw, al, aula.data))}</div>` : `<span class="sub">Escolha ${conv ? "um tema" : "um tópico"} para gerar o homework.</span>`}</div></div>` };
  }

  // ----- Conversação -----
  if (!tema) return { corpo: `<span class="sub">Selecione um tema.</span>` };
  const avancado = ["B2", "C1", "C2"].includes(al.nivel);
  if (id === "tema") {
    return {
      cab: `<label for="sel-tema" hidden>Tema</label><select id="sel-tema" data-i="aula-tema" style="max-width:360px">${opcoesTemas(tema.id)}</select>
        <button class="btn btn-sm" data-a="aula-resp" aria-pressed="${r}">${r ? "Esconder tradução" : "Mostrar tradução"}</button>`,
      corpo: `<div class="grid-2">
      <div><h2 class="rotulo">Vocabulário útil</h2>${lista(tema.vocab.map(v => `<li><button class="btn-link" data-a="falar" data-txt="${esc(v[0])}" title="Ouvir">${esc(v[0])}</button>${r ? `<span class="resp">${esc(v[1])}</span>` : ""}</li>`))}</div>
      <div><h2 class="rotulo">Perguntas de abertura</h2>${lista(tema.perguntas.slice(0, 4).map(p => li(p)))}</div></div>` };
  }
  if (id === "discussao") {
    return { cab: `<span class="sub">${esc(tema.tema)}</span>`, corpo: `<div class="grid-2">
      <div><h2 class="rotulo">Discussão</h2>${lista(tema.perguntas.slice(4).map(p => li(p)), 5)}</div>
      <div><h2 class="rotulo ${avancado ? "acento" : ""}">Aprofundar${avancado ? "" : " (se o aluno estiver confortável)"}</h2>${lista(tema.aprofundar.map(p => li(p)), tema.perguntas.length + 1)}
        <span class="mini">Peça sempre: um motivo, um exemplo e uma consequência.</span></div></div>` };
  }
  if (id === "debate") {
    return { cab: `<span class="sub">${esc(tema.tema)}</span>`, corpo: `<div class="grid-2">
      <div class="pilha" style="gap:10px"><h2 class="rotulo acento">Debate</h2>
        ${tema.debate.map(d => `<div style="font-size:18px;font-weight:600">“${esc(d)}”</div>`).join("")}
        ${lista(["Aluno escolhe um lado: posição em 1 minuto, com 2 motivos e 1 exemplo.", "Você contra-argumenta; ele responde (2 minutos).", "Mudança de perspectiva: ele defende o lado oposto por 1 minuto.", "Conclusão em 30 segundos: “To sum up…”"].map(p => li(p)))}</div>
      <div class="pilha" style="gap:10px"><h2 class="rotulo">Roleplay</h2>
        ${tema.roleplay.map(rp => `<div class="pilha" style="gap:4px"><b>${esc(rp.titulo)}</b><span>${esc(rp.situacao)}</span><span class="mini">${esc(rp.papeis)}</span></div>`).join('<div class="sep"></div>')}</div></div>` };
  }
  return { corpo: `<span class="sub">Etapa sem conteúdo.</span>` };
}

// ---------- Tela do aluno ----------
function caixaTextoAluno() {
  return `<section class="card destaque"><label class="rotulo acento" for="hw-texto">Texto do aluno (cole aqui para mostrar na tela dele)</label>
    <textarea id="hw-texto" data-i="hw-texto-aluno" placeholder="Cole aqui o homework que o aluno escreveu…" style="min-height:120px">${esc(A.aula.hwTextoAluno || "")}</textarea>
    <span class="mini">Na tela do aluno aparece a estrutura trabalhada no topo e este texto logo abaixo.</span></section>`;
}

function perguntasAquecimento() {
  const { al } = A; const t = S.banco.topicos[A.aula.topicoId];
  const n = S.banco.aquecimento[al.nivel] ? al.nivel : (t && S.banco.aquecimento[t.nivel] ? t.nivel : "A2");
  return { n, lista: S.banco.aquecimento[n] };
}

// Dicas que o professor pode liberar na etapa atual.
function dicasDaEtapa() {
  const { aula, al } = A;
  const e = A.etapas[A.timer.etapa];
  const D = S.banco.dicas || {};
  const est = (D.estruturas || {})[aula.topicoId];
  const F = D.frases || {}; const fx = faixa(al.nivel);
  if (e.id === "aquecimento") {
    const { n, lista } = perguntasAquecimento();
    const arr = (D.aquecimento || {})[n];
    const itens = arr ? arr[A.aqIdx % lista.length] : null;
    return itens ? { itens } : null;
  }
  if (e.id === "pratica" && est) return { forma: est.forma, exemplo: est.exemplo, itens: [] };
  if (e.id === "fala") return { forma: est ? est.forma : "", exemplo: est ? est.exemplo : "", itens: (F.fala || {})[fx] || [] };
  if (e.id === "tema" || e.id === "discussao") return { itens: (F.discussao || {})[fx] || [] };
  if (e.id === "debate") return { itens: (F.debate || {})[fx] || [] };
  return null;
}

function itensPratica() {
  const t = S.banco.topicos[A.aula.topicoId]; if (!t) return [];
  const d = A.aula.nivelMaterial || "medio", dv = vizinha(d);
  return [
    ...t[d].p.map(x => ({ tipo: "p", txt: x, extra: false })), ...t[dv].p.map(x => ({ tipo: "p", txt: x, extra: true })),
    ...t[d].t.map(x => ({ tipo: "t", txt: x[0], resp: x[1], extra: false })), ...t[dv].t.map(x => ({ tipo: "t", txt: x[0], resp: x[1], extra: true }))
  ];
}
function gerarHwPrevia(difHw) {
  const { aula, al } = A;
  if (aula.modelo === "conversa") return aula.temaId ? gerarHomeworkConversa(S.banco, aula.temaId, al.nivel) : null;
  return aula.topicoId ? gerarHomework(S.banco, aula.topicoId, difHw || aula.nivelMaterial || "medio", "adequado", aula.textoId) : null;
}
function garantirHwPrevia() {
  const hw = A.aula.homeworkPrevia;
  const assunto = A.aula.modelo === "conversa" ? A.aula.temaId : A.aula.topicoId;
  if (hw && (hw.topicoId === assunto || hw.temaId === assunto)) return hw;
  const novo = gerarHwPrevia();
  if (!novo) return null;
  A.aula.homeworkPrevia = novo; salvarCampos({ homeworkPrevia: novo });
  return novo;
}
function proximaAula(al, aula) {
  const hoje = hojeISO();
  return aulasNoPeriodo(S.store.alunos, S.store.aulas, hoje, addDays(hoje, 21))
    .find(a => a.alunoId === al.id && a.status === "agendada" && a.key !== aula.id && a.id !== aula.id && (a.data + (a.hora || "")) > (aula.data + (aula.hora || "")) && !jaPassou(a)) || null;
}
function dataEmIngles(p) {
  const d = new Date(p.data + "T12:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) + (p.hora ? ` · ${p.hora}` : "");
}
// Tela final do aluno (também usada pelo pós-aula, quando o homework muda).
export function estadoFim(aula, al, hw) {
  const p = proximaAula(al, aula);
  return { tipo: "estado", fase: "fim", aulaId: aula.id, aluno: al.nome.split(" ")[0], correcoes: aula.correcoesAluno || [],
    homeworkTexto: hw ? homeworkComoTexto(hw, al, aula.data) : "", proxima: p ? dataEmIngles(p) : "" };
}
function marcaItem(ex, i) {
  const m = ex.marcas ? ex.marcas[i] : null;
  if (m === true || m === false) return m;
  const resp = A.respostas[ex.id];
  if (ex.tipo === "completar" && resp && (resp.itens[i] || "").trim()) return confere(resp.itens[i], ex.gabarito[i] || "", ex.itens[i]);
  return null;
}

function estadoAluno() {
  if (!A) return null;
  const { aula, al } = A;
  if (A.timer.encerrada) return estadoFim(aula, al, aula.homeworkPrevia);
  if (!A.timer.iniciada) return { tipo: "estado", fase: "espera", aulaId: aula.id, aluno: al.nome.split(" ")[0] };
  const e = A.etapas[A.timer.etapa];
  const t = S.banco.topicos[aula.topicoId];
  const tema = S.banco.temasPorId[aula.temaId];
  const blocos = [];
  const B = (titulo, itens, extra = {}) => blocos.push({ titulo, itens, ...extra });
  let homework = null;
  const correcoes = aula.correcoesAluno || [];
  if (e.id === "aquecimento") {
    const { lista } = perguntasAquecimento();
    B("", [lista[A.aqIdx % lista.length]], { grande: true });
  } else if (e.id === "homework") {
    const ant = anteriores(aula).find(a => a.homework);
    const hw = ant && ant.homework;
    if (!hw) B("", ["Let's talk about your week!"], { grande: true });
    else if (hw.tipo === "conversa") homework = { titulo: hw.topicoNome, forma: "Expressions: " + hw.vocab.map(v => v[0]).join(" · "), exemplo: "", texto: aula.hwTextoAluno || "" };
    else { const est = (S.banco.dicas?.estruturas || {})[hw.topicoId] || {}; homework = { titulo: hw.topicoNome, forma: est.forma || "", exemplo: est.exemplo || "", texto: aula.hwTextoAluno || "" }; }
  } else if (e.id === "pratica" && t) {
    // Um item por vez: o professor avança.
    const itens = itensPratica(), n = Math.min(A.timer.prIdx || 0, itens.length - 1), it = itens[n];
    if (it) {
      const doTipo = itens.filter(x => x.tipo === it.tipo).length, pos = itens.slice(0, n + 1).filter(x => x.tipo === it.tipo).length;
      B(it.tipo === "p" ? `Question ${pos} of ${doTipo}` : `Say it in English · ${pos} of ${doTipo}`, [it.txt], { grande: true });
    }
  } else if (e.id === "listening") {
    const tx = S.banco.textosPorId[aula.textoId];
    // Só o áudio; o texto aparece quando o professor libera. As perguntas nunca vão para o aluno.
    if (tx) B(tx.titulo, [], { audio: true, corpo: tx.texto, rate: A.rate, textoAluno: A.timer.textoLiberado ? tx.texto : "" });
  } else if (e.id === "fala" && t) {
    B("Let's talk", t.fala);
  } else if (e.id === "tema" && tema) {
    B(tema.tema, tema.vocab.map(v => v[0]), { titulo2: "Useful expressions" });
    B("Questions", tema.perguntas.slice(0, 4));
  } else if (e.id === "discussao" && tema) {
    B("Questions", tema.perguntas.slice(4), { inicio: 5 });
    if (NIVEIS_ALTOS.includes(al.nivel)) B("Going deeper", tema.aprofundar, { inicio: tema.perguntas.length + 1 });
  } else if (e.id === "debate" && tema) {
    B("Debate", tema.debate.map(d => `“${d}”`), { grande: true });
    tema.roleplay.forEach(rp => B(`Role-play: ${rp.titulo}`, [rp.situacao]));
  } else {
    B("", ["Great class! See you next time."], { grande: true });
    const hw = garantirHwPrevia();
    if (hw) B("Your homework", [homeworkComoTexto(hw, al, aula.data)], { texto: true });
  }
  const dc = dicasDaEtapa();
  const ex = A.exercicio;
  const EN = { aquecimento: "Warm-up", homework: "Homework check", pratica: "Practice", listening: "Listening", fala: "Speaking", fechamento: "Wrap-up", tema: "Today's topic", discussao: "Discussion", debate: "Debate & role-play", devolutiva: "Feedback" };
  return {
    tipo: "estado", aulaId: aula.id, aluno: al.nome.split(" ")[0], etapa: EN[e.id] || e.nome, etapaId: e.id, blocos,
    dicas: dc ? { mostrar: !!A.dicas[A.timer.etapa], ...(A.dicas[A.timer.etapa] ? dc : { itens: [] }) } : null,
    exercicio: ex ? {
      id: ex.id, tipo: ex.tipo, titulo: ex.titulo, instrucao: ex.instrucao, itens: ex.itens, minutos: ex.minutos || 0, inicio: ex.inicio || 0,
      correcao: ex.correcaoLiberada ? { gabarito: ex.gabarito || [], comparar: ex.tipo === "completar", marcas: ex.itens.map((_, i) => marcaItem(ex, i)), comentario: ex.comentario || "" } : null
    } : null,
    homework, correcoes
  };
}
function enviarTela() { if (A) Sessao.publicar(estadoAluno()); }
function linkOuvir(textoId) { return `${baseApp()}aluno.html?t=${encodeURIComponent(textoId)}&v=${A ? A.rate : 1}`; }

// ---------- exercícios escritos ----------
function tiposExercicio() {
  if (A.aula.modelo === "conversa") return [["frases", "Frases com o vocabulário"], ["escrita5", "Escrita · 5 min"], ["escrita10", "Escrita · 10 min"]];
  return [["traducao", "Traduzir escrevendo"], ["completar", "Completar"], ["reescrever", "Reescrever"], ["escrita5", "Escrita · 5 min"], ["escrita10", "Escrita · 10 min"]];
}
function criarExercicio(tipo) {
  const { aula } = A;
  const t = S.banco.topicos[aula.topicoId];
  const tema = S.banco.temasPorId[aula.temaId];
  const d = aula.nivelMaterial || "medio";
  const id = `${tipo}-${Date.now().toString(36)}`;
  const n = (aula.exercicios || []).length;
  if (tipo === "frases" && tema) return { id, tipo: "frases", titulo: "Write a sentence with each expression", instrucao: "Use each expression in a sentence about your own life.", itens: tema.vocab.slice(0, 6).map(v => `${v[0]}`), gabarito: tema.vocab.slice(0, 6).map(v => v[1]) };
  if (tipo.startsWith("escrita")) {
    const min = tipo === "escrita10" ? 10 : 5;
    const prompt = aula.modelo === "conversa" && tema ? tema.escrita : t ? t.escrita[n % t.escrita.length] : "Write about your week.";
    return { id, tipo: "escrita", titulo: `Writing · ${min} minutes`, instrucao: "Write as much as you can. Don't worry about mistakes — your teacher will help.", itens: [prompt], gabarito: [], minutos: min, inicio: Date.now() };
  }
  if (!t) return null;
  const x = t[d];
  if (tipo === "traducao") return { id, tipo, titulo: "Translate into English", instrucao: "Write each sentence in English.", itens: x.t.map(i => i[0]), gabarito: x.t.map(i => i[1]) };
  if (tipo === "completar") return { id, tipo, titulo: "Complete the sentences", instrucao: "Write only the missing word(s).", itens: x.c.map(i => i[0]), gabarito: x.c.map(i => i[1]) };
  if (tipo === "reescrever") return { id, tipo, titulo: "Rewrite the sentences", instrucao: "Rewrite each sentence as asked in brackets.", itens: x.r.map(i => `${i[0]} (${i[1]})`), gabarito: x.r.map(i => i[2]) };
  return null;
}
function salvarExercicioNaAula() {
  const atual = S.store.aula(A.aula.id); if (!atual) return;
  clearTimeout(A.timerSalvarEx);
  const lista = (A.aula.exercicios || []).map(x => ({ ...x, ...(A.exercicio && A.exercicio.id === x.id ? A.exercicio : {}), resposta: A.respostas[x.id] || x.resposta || null }));
  A.aula.exercicios = lista; A.aula.exercicioAtivo = A.exercicio ? A.exercicio.id : null;
  S.store.salvarAula({ ...atual, exercicios: lista, exercicioAtivo: A.aula.exercicioAtivo }).catch(erro);
}
// Rascunhos chegam a cada pausa na digitação: salva no máximo a cada 4 segundos.
function salvarExercicioDepois() { clearTimeout(A.timerSalvarEx); const id = A.aula.id; A.timerSalvarEx = setTimeout(() => { if (A && A.aula.id === id) salvarExercicioNaAula(); }, 4000); }
function receberResposta(r) {
  if (!A) return;
  if (r.presenca) { atualizarStatus(); return; }
  if (r.exercicioId === "homework") {
    A.aula.hwTextoAluno = r.texto;
    const t = document.getElementById("hw-texto"); if (t && document.activeElement !== t) t.value = r.texto;
    clearTimeout(A.timerHw); A.timerHw = setTimeout(() => salvarCampos({ hwTextoAluno: r.texto }), 1500);
    enviarTela(); return;
  }
  A.respostas[r.exercicioId] = { itens: r.itens, texto: r.texto, enviadoEm: r.enviadoEm || Date.now(), rascunho: !!r.rascunho };
  const atual = A.exercicio && A.exercicio.id === r.exercicioId;
  if (atual) atualizarRespostas();
  if (r.rascunho) salvarExercicioDepois();
  else { salvarExercicioNaAula(); if (atual) toast("O aluno terminou e enviou."); }
}

function statusConexao() {
  let cls = "off", txt;
  if (Sessao.ativa(A.aula.id)) {
    const visto = Sessao.alunoVistoEm;
    if (visto && Date.now() - visto < 50000) { cls = "on"; txt = `<span class="txt-ok">● Aluno conectado pelo link</span>`; }
    else { cls = "espera"; txt = `<span class="txt-alerta">● Link ativo — esperando o aluno abrir</span>`; }
  } else if (Sessao.janelaVistaEm && Date.now() - Sessao.janelaVistaEm < 50000) { cls = "on"; txt = `<span class="txt-ok">● Janela do aluno aberta neste computador</span>`; }
  else if (A.erroLink) { cls = "erro"; txt = `<span class="txt-perigo">● O link do aluno não ligou (${esc(A.erroLink)}). Confira as regras do Firestore.</span>`; }
  else if (temNuvem() && !A.timer.encerrada && A.aula.status !== "dada") txt = `<span class="txt-muted">● Ligando o link do aluno…</span>`;
  else txt = `<span class="txt-muted">● Sem link ao vivo (só a janela local, se aberta)</span>`;
  return { cls, txt };
}
function statusListening() {
  const l = Sessao.listening;
  const lib = A.timer.textoLiberado ? "texto liberado para ele" : "o texto está oculto para ele";
  if (!l || !l.total) return `<span class="mini">Aluno ainda não deu play · ${lib}</span>`;
  return `<span class="txt-acento">🎧 Aluno: ${l.idx >= l.total ? "ouviu até o fim" : `${l.tocando ? "ouvindo" : "pausado na"} frase ${l.idx + 1} de ${l.total}`}</span> <span class="mini">· ${lib}</span>`;
}
function atualizarStatus() {
  if (!A) return;
  const st = statusConexao();
  const el = document.getElementById("status-aluno"); if (el && el.innerHTML !== st.txt) el.innerHTML = st.txt;
  const d = document.getElementById("dot-aluno"); if (d) d.className = "dot " + st.cls;
  const l = document.getElementById("status-listening"); if (l) { const h = statusListening(); if (l.innerHTML !== h) l.innerHTML = h; }
}

function statusResposta(ex) {
  const resp = A.respostas[ex.id];
  if (!resp) return "aguardando…";
  return resp.rascunho ? `<span class="txt-alerta">✎ escrevendo…</span>` : `<span class="txt-ok">✓ terminou e enviou</span>`;
}
function respostasHTML() {
  const ex = A.exercicio; if (!ex) return "";
  const resp = A.respostas[ex.id];
  if (ex.tipo === "escrita") {
    const texto = resp ? (resp.texto || resp.itens[0] || "") : "";
    const palavras = texto.trim() ? texto.trim().split(/\s+/).length : 0;
    return `<span class="mini">${esc(ex.itens[0])}</span>
      ${texto ? `<div class="item resp-ao-vivo">${esc(texto)}</div><span class="mini">${palavras} palavra${palavras === 1 ? "" : "s"}</span>` : `<span class="sub">O aluno ainda não escreveu.</span>`}`;
  }
  return `<ol class="lista-num" style="font-size:13px;gap:8px">${ex.itens.map((it, i) => {
    const r = resp ? (resp.itens[i] || "") : "";
    const m = r.trim() ? marcaItem(ex, i) : null;
    return `<li>${esc(it)}
      <span class="resp">${r.trim() ? `<b class="${m === true ? "txt-ok" : m === false ? "txt-perigo" : ""}">${esc(r)}</b> · ` : ""}${esc(ex.gabarito[i] || "")}</span>
      ${r.trim() ? `<span class="linha marcas"><button class="btn-marca ${m === true ? "on" : ""}" data-a="ex-marca" data-n="${i}" data-v="1" aria-label="Certo">✓</button><button class="btn-marca ${m === false ? "on" : ""}" data-a="ex-marca" data-n="${i}" data-v="0" aria-label="Errado">✗</button>${m === false ? `<button class="btn-link" data-a="ex-corr" data-n="${i}">→ correções</button>` : ""}</span>` : ""}</li>`;
  }).join("")}</ol>`;
}
function atualizarRespostas() {
  const el = document.getElementById("painel-ex-resp"); if (el) el.innerHTML = respostasHTML();
  const s = document.getElementById("ex-status"); if (s && A.exercicio) s.innerHTML = statusResposta(A.exercicio);
}
// Painel do exercício aberto (dentro do quadro, à direita).
function painelExHTML() {
  const ex = A.exercicio; if (!ex) return "";
  return `<div class="linha"><b class="flex1" style="font-size:13px">${esc(ex.titulo)}</b><span class="mini" id="ex-status">${statusResposta(ex)}</span></div>
    <div id="painel-ex-resp" class="pilha" style="gap:6px">${respostasHTML()}</div>
    ${ex.tipo === "escrita" && !ex.correcaoLiberada ? `<label class="mini" for="ex-coment">Comentário para o aluno (vai junto com a correção)</label><textarea id="ex-coment" data-i="ex-comentario" style="min-height:60px">${esc(A.comentario)}</textarea>` : ""}
    <div class="linha">${ex.correcaoLiberada ? `<span class="mini txt-ok">Correção liberada</span>` : `<button class="btn btn-sm" data-a="ex-liberar">Liberar correção</button>`}<button class="btn btn-sm" data-a="ex-encerrar">Encerrar exercício</button></div>`;
}
function atualizarPainelAluno() {
  if (!A) return;
  const pe = document.getElementById("painel-ex");
  if (!!pe !== !!A.exercicio) return desenharAula();
  if (pe) pe.innerHTML = painelExHTML();
  const qa = document.getElementById("q-acoes"); if (qa) qa.innerHTML = acoesEtapaHTML();
  atualizarStatus();
}

function modalTelaAluno() {
  const nuvem = temNuvem();
  import("./ctx.js").then(({ abrirModal, fecharModal, linkWhats }) => {
    const desenhar = () => {
      const link = nuvem && A.al.sessaoFixa ? linkDoAluno(A.al.sessaoFixa) : null;
      return `<section class="modal" role="dialog" aria-labelledby="ta"><div class="modal-cab"><h2 id="ta">Tela do aluno</h2><span class="sub">${esc(A.al.nome)}</span></div>
      <div class="modal-corpo">
        <div class="card destaque"><b>Link fixo do aluno</b>
          <span class="sub">É sempre o mesmo link para este aluno: mande uma vez e peça para ele salvar nos favoritos. Quando você entra na aula, a tela dele abre sozinha; o áudio do listening toca no computador dele, e você vê o que ele escreve enquanto escreve.</span>
          ${!nuvem ? `<span class="txt-alerta mini">Disponível depois do login com o Google (modo nuvem).</span>`
            : link ? `<input type="text" readonly value="${esc(link)}" id="ta-link"><div class="linha"><button class="btn btn-sm" data-m="copiar">Copiar link</button>${linkWhats(A.al, "x") ? `<button class="btn btn-sm" data-m="whats">Enviar no WhatsApp</button>` : ""}</div>`
            : `<div><button class="btn" data-m="gerar">Criar o link deste aluno</button></div>`}
        </div>
        <div class="card"><b>Janela para compartilhar a tela</b>
          <span class="sub">Abre uma janela no seu computador só com o conteúdo do aluno. Compartilhe só ela e ative o áudio do sistema na chamada.</span>
          <div><button class="btn btn-sm" data-m="janela">Abrir janela</button></div></div>
      </div><div class="modal-rod"><button class="btn" data-m="fechar">Fechar</button></div></section>`;
    };
    abrirModal(desenhar(), { onAction: async (acao) => {
      try {
        if (acao === "fechar") return fecharModal();
        if (acao === "janela") { const w = window.open(`${baseApp()}aluno.html`, "ca2-tela-aluno", "width=1280,height=800"); if (!w) toast("O navegador bloqueou a janela. Permita pop-ups para este site."); setTimeout(enviarTela, 800); return; }
        if (acao === "gerar") { await ativarLink(); document.querySelector("#modal-raiz .modal-fundo").innerHTML = desenhar(); return; }
        const link = linkDoAluno(A.al.sessaoFixa);
        if (acao === "copiar") return copiar(link);
        if (acao === "whats") return window.open(linkWhats(A.al, `Oi, ${A.al.nome.split(" ")[0]}! Este é o seu link fixo das aulas. Salve nos favoritos e abra no computador no horário da aula: ${link}`), "_blank", "noopener");
      } catch (e) { erro(e); }
    } });
  });
}

// ---------- player ----------
function atualizarPlayer(est = TTS.estado()) {
  const btn = document.getElementById("tts-btn"), prog = document.getElementById("tts-prog"), info = document.getElementById("tts-info");
  if (!btn) return;
  btn.innerHTML = est.tocando ? ICONES.pausa : ICONES.play;
  btn.setAttribute("aria-label", est.tocando ? "Pausar" : "Tocar");
  if (prog) prog.style.width = Math.round((est.total ? est.idx / est.total : 0) * 100) + "%";
  if (info) info.textContent = est.total && (est.tocando || est.idx > 0) ? `Frase ${Math.min(est.idx + 1, est.total)} de ${est.total}${est.tocando ? "" : (est.idx >= est.total ? " · fim" : " · pausado")}` : "Pronto para tocar";
}
function prepararTTS() {
  const tx = S.banco.textosPorId[A.aula.textoId];
  if (!tx) return false;
  if (A.ttsTexto !== tx.id) { TTS.carregar(tx.texto, atualizarPlayer); TTS.definirVelocidade(A.rate); A.ttsTexto = tx.id; }
  return true;
}

function irItemPratica(n) {
  const total = itensPratica().length; if (!total) return;
  A.timer.prIdx = Math.max(0, Math.min(total - 1, n)); LS.set(A.kTimer, A.timer); desenharAula();
}
function trocarEtapa(i) {
  salvarTimer(); A.timer.etapa = i; A.vendo = null; A.resp = false; TTS.parar(); A.ttsTexto = null;
  LS.set(A.kTimer, A.timer); desenharAula(); const qc = document.getElementById("q-corpo"); if (qc) qc.scrollTop = 0;
}

Object.assign(ACOES, {
  "aula-play": () => {
    const t = A.timer;
    if (t.rodando) { salvarTimer(); t.rodando = false; } else { t.rodando = true; t.ultimo = Date.now(); }
    LS.set(A.kTimer, t); desenharAula();
  },
  "aula-prox": () => { if (A.timer.etapa >= A.etapas.length - 1) return ACOES["aula-encerrar"](); trocarEtapa(A.timer.etapa + 1); },
  // Com a aula em andamento, clicar numa etapa só mostra uma prévia: a tela do aluno não muda.
  "aula-etapa": el => {
    const i = Number(el.dataset.e);
    if (!A.timer.iniciada || A.timer.encerrada) return trocarEtapa(i);
    A.vendo = i === A.timer.etapa ? null : i; TTS.parar(); A.ttsTexto = null; desenharAula();
    const qc = document.getElementById("q-corpo"); if (qc) qc.scrollTop = 0;
  },
  "previa-ir": () => { if (A.vendo !== null) trocarEtapa(A.vendo); },
  "previa-voltar": () => { A.vendo = null; desenharAula(); },
  "aula-iniciar": () => {
    const t = A.timer; t.iniciada = true; t.encerrada = false; t.rodando = true; t.ultimo = Date.now();
    LS.set(A.kTimer, t); desenharAula();
    if (temNuvem() && !Sessao.ativa(A.aula.id)) ativarLink().catch(falhaLink);
  },
  "aula-encerrar": async () => {
    salvarTimer(); const t = A.timer; t.rodando = false; t.encerrada = true; LS.set(A.kTimer, t);
    A.exercicio = null; salvarExercicioNaAula();
    const hw = garantirHwPrevia();
    const fim = estadoFim(A.aula, A.al, hw);
    await Sessao.encerrar(fim);
    navegar(`#/pos/${A.aula.id}`);
  },
  "aula-reabrir": () => { A.timer.encerrada = false; LS.set(A.kTimer, A.timer); desenharAula(); ativarLink().catch(falhaLink); },
  "pr-ir": el => irItemPratica(Number(el.dataset.n)),
  "pr-prox": () => irItemPratica((A.timer.prIdx || 0) + 1),
  "pr-ant": () => irItemPratica((A.timer.prIdx || 0) - 1),
  "hw-sortear": () => {
    const atual = A.aula.homeworkPrevia;
    A.aula.homeworkPrevia = gerarHwPrevia(atual && atual.dif); salvarCampos({ homeworkPrevia: A.aula.homeworkPrevia }); desenharAula();
  },
  "ex-marca": el => {
    const ex = A.exercicio; if (!ex) return;
    const i = Number(el.dataset.n), v = el.dataset.v === "1";
    ex.marcas = ex.marcas || ex.itens.map(() => null);
    ex.marcas[i] = marcaItem(ex, i) === v && ex.marcas[i] === v ? null : v;
    salvarExercicioNaAula(); atualizarRespostas();
    if (ex.correcaoLiberada) enviarTela();
  },
  "ex-corr": el => {
    const ex = A.exercicio; if (!ex) return;
    const i = Number(el.dataset.n), resp = A.respostas[ex.id];
    const g = ex.gabarito[i] || "", partes = g.split("/").map(x => x.trim());
    const certo = (ex.itens[i].match(/_{2,}/g) || []).length >= 2 ? partes.join(" ") : partes[0];
    const linha = `${(resp && resp.itens[i] || "").trim()} → ${certo}`;
    const lista = A.aula.correcoesAluno || [];
    if (lista.includes(linha)) return toast("Essa correção já está na lista.");
    A.aula.correcoesAluno = [...lista, linha];
    const ta = document.getElementById("corr-aluno"); if (ta) ta.value = A.aula.correcoesAluno.join("\n");
    salvarCampos({ correcoesAluno: A.aula.correcoesAluno }); enviarTela(); toast("Adicionada às correções do aluno.");
  },
  "aula-pos": () => { salvarTimer(); A.timer.rodando = false; LS.set(A.kTimer, A.timer); navegar(`#/pos/${A.aula.id}`); },
  "aula-faltou": () => modalFalta(A.aula.id),
  "aula-resp": () => { A.resp = !A.resp; desenharAula(); },
  "aula-mais": () => { A.maisEx = !A.maisEx; desenharAula(); },
  "aq-outra": () => { A.aqIdx++; desenharAula(); },
  "aula-dif": async el => { A.aula.nivelMaterial = el.dataset.d; A.aula.motivoPlano = ""; A.timer.prIdx = 0; LS.set(A.kTimer, A.timer); await S.store.salvarAula(A.aula); desenharAula(); },
  "aula-modelo": async el => {
    const m = el.dataset.m;
    if (m === A.aula.modelo) return;
    const usado = A.timer.seg.some(s => s >= 1);
    if (usado && !confirm("Trocar o modelo reinicia o cronômetro das etapas. Continuar?")) return;
    A.aula.modelo = m;
    prepararPlano();
    A.etapas = etapasDoModelo(m);
    A.timer = { etapa: 0, seg: A.etapas.map(() => 0), rodando: A.timer.rodando, ultimo: Date.now() };
    LS.set(A.kTimer, A.timer);
    await S.store.salvarAula(A.aula); desenharAula();
  },
  "aula-tela": () => modalTelaAluno(),
  "dicas-toggle": () => { A.dicas[A.timer.etapa] = !A.dicas[A.timer.etapa]; enviarTela(); atualizarPainelAluno(); },
  "ex-enviar": el => {
    const ex = criarExercicio(el.dataset.t);
    if (!ex) { toast("Escolha um tópico ou tema primeiro."); return; }
    A.exercicio = ex; A.comentario = "";
    A.aula.exercicios = [...(A.aula.exercicios || []), ex];
    salvarExercicioNaAula(); enviarTela(); atualizarPainelAluno();
    if (!Sessao.ativa(A.aula.id) && !temNuvem()) toast("Exercício na janela do aluno. O link fixo do aluno funciona depois do login com o Google.");
  },
  "ex-liberar": () => {
    if (!A.exercicio) return;
    A.exercicio.correcaoLiberada = true; A.exercicio.comentario = A.comentario || "";
    A.exercicio.marcas = A.exercicio.itens.map((_, i) => marcaItem(A.exercicio, i));
    salvarExercicioNaAula(); enviarTela(); atualizarPainelAluno();
  },
  "ex-encerrar": () => { A.exercicio = null; salvarExercicioNaAula(); enviarTela(); atualizarPainelAluno(); },
  "texto-toggle": () => { A.timer.textoLiberado = !A.timer.textoLiberado; LS.set(A.kTimer, A.timer); enviarTela(); atualizarPainelAluno(); },
  "tts-play": () => { if (!prepararTTS()) return; const e = TTS.estado(); if (e.tocando) TTS.pausar(); else TTS.tocar(); },
  "tts-parar": () => { TTS.parar(); A.ttsTexto = null; prepararTTS(); },
  "tts-voltar": () => { if (prepararTTS()) TTS.voltarFrase(); },
  "tts-rate": el => { A.rate = Number(el.dataset.r); TTS.definirVelocidade(A.rate); document.querySelectorAll('[data-a="tts-rate"]').forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.r) === A.rate))); },
  "tts-link": () => copiar(linkOuvir(A.aula.textoId)),
  "falar": el => TTS.falarUma(el.dataset.txt, 0.9)
});

Object.assign(CAMPOS, {
  "aula-topico": async el => {
    if (!A || el.value === A.aula.topicoId) return;
    A.aula.topicoId = el.value; A.aula.motivoPlano = ""; A.timer.prIdx = 0; LS.set(A.kTimer, A.timer);
    const t = S.banco.topicos[el.value];
    const usados = new Set(S.store.aulas.filter(a => a.alunoId === A.al.id && a.id !== A.aula.id && a.textoId).map(a => a.textoId));
    const tx = sugerirTexto(S.banco, t.nivel, t.id, A.aula.nivelMaterial, usados);
    if (tx) A.aula.textoId = tx.id;
    await S.store.salvarAula(A.aula); desenharAula();
  },
  "ex-comentario": el => { if (A) A.comentario = el.value; },
  "hw-texto-aluno": (() => { let t; return el => {
    if (!A) return; A.aula.hwTextoAluno = el.value; enviarTela();
    clearTimeout(t); const id = A.aula.id, v = el.value;
    t = setTimeout(() => { const atual = S.store.aula(id); if (atual) S.store.salvarAula({ ...atual, hwTextoAluno: v }).catch(erro); }, 600);
  }; })(),
  "correcoes-aluno": (() => { let t; return el => {
    if (!A) return; const lista = el.value.split("\n").map(x => x.trim()).filter(Boolean); A.aula.correcoesAluno = lista; enviarTela();
    clearTimeout(t); const id = A.aula.id;
    t = setTimeout(() => { const atual = S.store.aula(id); if (atual) S.store.salvarAula({ ...atual, correcoesAluno: lista }).catch(erro); }, 600);
  }; })(),
  "aula-tema": async el => { if (!A || el.value === A.aula.temaId) return; A.aula.temaId = el.value; await S.store.salvarAula(A.aula); desenharAula(); },
  "aula-texto": async el => { if (!A) return; A.aula.textoId = el.value; A.timer.textoLiberado = false; LS.set(A.kTimer, A.timer); TTS.parar(); A.ttsTexto = null; await S.store.salvarAula(A.aula); desenharAula(); },
  // Salva só o campo da nota, sobre a versão mais recente da aula (nunca sobrescreve o pós-aula).
  "nota-rapida": (() => { let t; return el => {
    if (!A) return; const id = A.aula.id, valor = el.value; A.aula.notaRapida = valor;
    clearTimeout(t);
    t = setTimeout(() => { const atual = S.store.aula(id); if (atual && atual.notaRapida !== valor) S.store.salvarAula({ ...atual, notaRapida: valor }).catch(erro); }, 500);
  }; })()
});

// ===================== PÓS-AULA =====================
let P = null;

export function renderPos(v, id) {
  const aula = S.store.aula(id);
  if (!aula) { v.innerHTML = `<div class="carregando">Aula não encontrada. <a href="#/semana">Voltar</a></div>`; return; }
  const al = S.store.aluno(aula.alunoId);
  const modelo = aula.modelo || modeloDaAula(al, S.store.aulas, aula.id);
  let topicoId = aula.topicoId, dif = aula.nivelMaterial, temaId = aula.temaId;
  if (modelo === "conversa") { if (!temaId) temaId = sugerirTema(S.banco, al, S.store.aulas, aula.id); }
  else if (!topicoId) { const p = sugerirPlano(S.banco, al, S.store.aulas, aula.id); topicoId = p.topicoId; dif = p.dif; }
  const temHwAnterior = anteriores(aula).some(a => a.homework);
  P = {
    aula, al, modelo,
    dificuldades: [...(aula.dificuldades || [])],
    avaliacao: aula.avaliacaoMaterial || "adequado",
    hwFeito: aula.homeworkFeito || (temHwAnterior ? "" : "sem"),
    obs: aula.observacao || aula.notaRapida || "",
    topicoId, temaId, dif: dif || "medio",
    hw: aula.homework || aula.homeworkPrevia || null,
    enviarDrive: !!(S.fb && al.docHomeworkId)
  };
  if (!P.hw) regenerar();
  desenharPos(v);
  TELA.limpar = () => { P = null; };
}

function regenerar(difHw) {
  if (P.modelo === "conversa") P.hw = gerarHomeworkConversa(S.banco, P.temaId, P.al.nivel);
  else P.hw = gerarHomework(S.banco, P.topicoId, difHw || P.dif, P.avaliacao, P.aula.textoId);
}

function desenharPos(v = document.getElementById("view")) {
  const { aula, al } = P;
  const cfg = config();
  const conv = P.modelo === "conversa";
  const extras = P.dificuldades.filter(d => !cfg.dificuldades.includes(d));
  const chips = [...cfg.dificuldades, ...extras].map(d => `<button class="chip" data-a="pos-dif" data-d="${esc(d)}" aria-pressed="${P.dificuldades.includes(d)}">${P.dificuldades.includes(d) ? "✓ " : ""}${esc(d)}</button>`).join("");
  const seg = (nome, opcoes, atual) => `<div class="seg bloco" role="group" aria-label="${esc(nome)}">${opcoes.map(([v, r]) => `<button data-a="pos-seg" data-campo="${esc(nome)}" data-v="${v}" aria-pressed="${atual === v}">${r}</button>`).join("")}</div>`;
  const hw = P.hw;
  const proxima = proximaAulaDoAluno();
  const sug = sugestaoProxima();
  const destinoHw = al.docHomeworkId && S.fb ? `Ao salvar, entra no topo do documento <b>“Homework — ${esc(al.nome)}”</b> no Drive, com a data da aula. O gabarito fica só no app, para a correção na próxima aula.`
    : al.docHomeworkUrl ? `O doc de homework deste aluno foi colado à mão, então o app não consegue escrever nele. Use “Copiar homework” e cole no documento.`
    : `Este aluno ainda não tem documento de homework. ${S.fb ? `Crie no <a href="#/aluno/${esc(al.id)}">cadastro</a> (botão “Criar no Drive”).` : `Use “Copiar homework” e cole no documento do aluno.`}`;
  const resumoHw = !hw ? `<span class="sub">Escolha ${conv ? "um tema" : "um tópico"}.</span>` : hw.tipo === "conversa"
    ? `<ol class="lista-num" style="font-size:13px;gap:8px"><li><b>Frases com ${hw.vocab.length} expressões:</b> ${esc(hw.vocab.map(x => x[0]).join(", "))}</li><li><b>Escrita:</b> ${esc(hw.escrita)}</li><li><b>Preparar:</b> ${esc(hw.preparar.join(" / "))}</li></ol>`
    : `<ol class="lista-num" style="font-size:13px;gap:8px">
        <li><b>Complete (${hw.completar.length}):</b> ${esc(hw.completar.map(c => c[0]).slice(0, 2).join(" / "))}…</li>
        <li><b>Reescreva (${hw.reescrever.length}):</b> ${esc(hw.reescrever[0] ? hw.reescrever[0][0] + " (" + hw.reescrever[0][1] + ")" : "")}…</li>
        <li><b>Traduza (${hw.traducao.length}):</b> ${esc(hw.traducao.map(c => c[0]).slice(0, 2).join(" / "))}…</li>
        <li><b>Escrita:</b> ${esc(hw.escrita)}</li>
        ${hw.texto ? `<li><b>Texto:</b> reler “${esc(hw.texto.titulo)}” e responder ${hw.texto.perguntas.length} perguntas</li>` : ""}</ol>`;
  v.innerHTML = `
    <div class="barra">
      <a class="btn" href="#/aula/${esc(aula.id)}">${ICONES.voltar} Voltar à aula</a>
      <div class="linha"><b style="font-size:18px">Pós-aula · ${esc(al.nome)}</b>${tagNivel(al.nivel)}<span class="sub">${DIAS_CURTO[diaSemana(aula.data)]} ${fmtDataLonga(aula.data)} · ${esc(aula.hora || "")} · ${MODELOS[P.modelo]}</span></div>
      <span class="flex1"></span>
      <button class="btn" data-a="pos-whats">Resumo para WhatsApp</button>
      <button class="btn" data-a="pos-salvar" id="btn-salvar-pos">${P.enviarDrive ? "Salvar e enviar homework" : "Salvar registro"}</button>
    </div>
    <div class="rolavel"><div class="grid-2">
      <div class="pilha-16">
        <section class="card"><h2 class="card-titulo">Dificuldades observadas</h2>
          <span class="mini">Toque no que apareceu hoje. Isso alimenta o “Fique de ouvido” e o tema das próximas aulas.</span>
          <div class="chips">${chips}<button class="chip" data-a="pos-outra" style="border-style:dashed">${ICONES.mais} Outra</button></div></section>
        <section class="card">
          <div class="campo"><label for="pos-assunto">${conv ? "Tema da conversa" : "Tópico trabalhado"}</label>
            ${conv ? `<select id="pos-assunto" data-i="pos-tema">${opcoesTemas(P.temaId)}</select>`
                   : `<select id="pos-assunto" data-i="pos-topico">${opcoesTopicos(P.topicoId)}</select><span class="mini">Nível usado na aula: ${DIF_LABEL[P.dif]}</span>`}</div>
          <div class="pilha"><h2 class="rotulo">O material de hoje estava…</h2>${seg("avaliacao", [["facil_demais", "Fácil demais"], ["adequado", "Adequado"], ["dificil_demais", "Difícil demais"]], P.avaliacao)}</div>
          <div class="pilha"><h2 class="rotulo">Fez o homework da aula anterior?</h2>${seg("hwFeito", [["sim", "Sim"], ["parcial", "Parcial"], ["nao", "Não"], ["sem", "Não tinha"]], P.hwFeito)}</div>
          <div class="campo"><label for="pos-obs">Observação (opcional)</label><textarea id="pos-obs" data-i="pos-obs">${esc(P.obs)}</textarea></div>
        </section>
      </div>
      <div class="pilha-16">
        <section class="card destaque">
          <div class="linha"><h2 class="card-titulo flex1">Homework gerado</h2><span class="mini">${hw ? esc(hw.topicoNome) + (hw.dif ? " · " + DIF_LABEL[hw.dif] : "") : ""}</span></div>
          ${resumoHw}
          <div class="linha"><button class="btn btn-sm" data-a="pos-hw" data-o="sortear">Sortear de novo</button>${conv ? "" : `<button class="btn btn-sm" data-a="pos-hw" data-o="facil">Mais fácil</button><button class="btn btn-sm" data-a="pos-hw" data-o="dificil">Mais difícil</button>`}<button class="btn btn-sm" data-a="pos-hw" data-o="copiar">Copiar homework</button><button class="btn btn-sm" data-a="pos-hw" data-o="ver">Ver completo</button></div>
          <div class="item" style="font-size:12px">${destinoHw}</div>
          ${S.fb && al.docHomeworkId ? `<label class="check"><input type="checkbox" data-i="pos-drive" ${P.enviarDrive ? "checked" : ""}>Enviar para o documento do aluno ao salvar</label>` : ""}
          ${aula.homeworkEnviadoEm ? `<span class="mini txt-ok">✓ Homework enviado em ${new Date(aula.homeworkEnviadoEm).toLocaleString("pt-BR")}</span>` : ""}
        </section>
        <section class="card"><h2 class="rotulo">Próxima aula${proxima ? ` · ${DIAS_CURTO[diaSemana(proxima.data)]} ${fmtData(proxima.data)}, ${esc(proxima.hora || "")}` : ""}</h2>
          <div class="pilha" style="font-size:13px">
            <div><span class="txt-muted">Modelo:</span> ${MODELOS[sug.modelo]}</div>
            <div><span class="txt-muted">Corrigir:</span> este homework</div>
            <div><span class="txt-muted">${sug.modelo === "conversa" ? "Tema" : "Tópico"} sugerido:</span> ${esc(sug.nome || "—")}</div>
            ${sug.motivo ? `<div class="mini">${esc(sug.motivo)}</div>` : ""}
          </div><span class="mini">Você pode trocar dentro da aula.</span></section>
      </div>
    </div></div>`;
}

function proximaAulaDoAluno() {
  const hoje = hojeISO();
  return aulasNoPeriodo(S.store.alunos, S.store.aulas, hoje, addDays(hoje, 21))
    .find(a => a.alunoId === P.al.id && a.status === "agendada" && a.key !== P.aula.id && !jaPassou(a)) || null;
}
function sugestaoProxima() {
  const simulada = { ...P.aula, status: "dada", modelo: P.modelo, topicoId: P.modelo === "conversa" ? P.aula.topicoId : P.topicoId, temaId: P.temaId, nivelMaterial: P.dif, avaliacaoMaterial: P.avaliacao };
  const aulas = S.store.aulas.map(a => a.id === simulada.id ? simulada : a);
  const modelo = modeloDaAula(P.al, aulas, "__nenhuma__");
  if (modelo === "conversa") {
    const id = sugerirTema(S.banco, P.al, aulas, "__nenhuma__");
    return { modelo, nome: S.banco.temasPorId[id]?.tema, motivo: "Próximo tema ainda não conversado" };
  }
  const p = sugerirPlano(S.banco, P.al, aulas, "__nenhuma__");
  const t = S.banco.topicos[p.topicoId];
  return { modelo, nome: t ? `${t.nome} · ${DIF_LABEL[p.dif]}` : "", motivo: p.motivo };
}

Object.assign(ACOES, {
  "pos-dif": el => { const d = el.dataset.d; P.dificuldades = P.dificuldades.includes(d) ? P.dificuldades.filter(x => x !== d) : [...P.dificuldades, d]; desenharPos(); },
  "pos-outra": () => { const d = (prompt("Qual dificuldade?") || "").trim(); if (d && !P.dificuldades.includes(d)) { P.dificuldades.push(d); desenharPos(); } },
  "pos-seg": el => {
    const c = el.dataset.campo, val = el.dataset.v;
    if (c === "avaliacao") { P.avaliacao = val; regenerar(); }
    if (c === "hwFeito") P.hwFeito = val;
    desenharPos();
  },
  "pos-hw": async el => {
    const o = el.dataset.o;
    const idx = DIFS.indexOf(P.hw && P.hw.dif ? P.hw.dif : P.dif);
    if (o === "sortear") regenerar(P.hw && P.hw.dif);
    if (o === "facil") regenerar(DIFS[Math.max(0, idx - 1)]);
    if (o === "dificil") regenerar(DIFS[Math.min(2, idx + 1)]);
    if (o === "copiar") return copiar(homeworkComoTexto(P.hw, P.al, P.aula.data));
    if (o === "ver") return modalMensagem(P.al, homeworkComoTexto(P.hw, P.al, P.aula.data, true), "Homework completo (com gabarito)");
    desenharPos();
  },
  "pos-whats": () => {
    const nomeAssunto = P.modelo === "conversa" ? S.banco.temasPorId[P.temaId]?.tema : S.banco.topicos[P.topicoId]?.nome;
    const nome = P.al.nome.split(" ")[0];
    const linhas = [`Oi, ${nome}! Resumo da aula de hoje:`, ``, `Tema: ${nomeAssunto || "—"}`];
    if (P.dificuldades.length) linhas.push(`Para treinar: ${P.dificuldades.join(", ").toLowerCase()}.`);
    if (P.obs.trim()) linhas.push(P.obs.trim());
    linhas.push(``, P.al.docHomeworkUrl ? `O homework já está no seu documento: ${P.al.docHomeworkUrl}` : `Vou te mandar o homework em seguida.`, ``, `Até a próxima aula!`);
    modalMensagem(P.al, linhas.join("\n"), "Resumo para o aluno");
  },
  "pos-salvar": async el => {
    const { al } = P;
    const aula = { ...S.store.aula(P.aula.id) };
    Object.assign(aula, {
      status: "dada", modelo: P.modelo, dificuldades: P.dificuldades, avaliacaoMaterial: P.avaliacao, homeworkFeito: P.hwFeito || null,
      observacao: P.obs.trim(), homework: P.hw
    });
    if (P.modelo === "conversa") aula.temaId = P.temaId; else { aula.topicoId = P.topicoId; aula.nivelMaterial = P.dif; }
    ["faltaTipo", "abonada"].forEach(k => delete aula[k]);
    el.disabled = true;
    try {
      await S.store.salvarAula(aula);
      LS.del(`ca2_timer_${aula.id}`);
      if (P.enviarDrive && S.fb && al.docHomeworkId && P.hw) {
        el.textContent = "Enviando para o Drive…";
        try {
          const token = await S.fb.tokenGoogle();
          await inserirNoTopo(token, al.docHomeworkId, homeworkComoTexto(P.hw, al, aula.data) + "\n────────────────────────\n\n");
          aula.homeworkEnviadoEm = new Date().toISOString();
          await S.store.salvarAula(aula);
          toast("Aula registrada e homework enviado para o Drive.");
        } catch (e) {
          erro(new Error("A aula foi salva, mas o envio para o Drive falhou: " + e.message + ". Use “Copiar homework”."));
          el.disabled = false; el.textContent = "Salvar e enviar homework";
          P.aula = aula; return;
        }
      } else toast("Aula registrada.");
      // Se a tela final do aluno ainda está aberta, atualiza o homework mostrado nela.
      if (Sessao.sid && Sessao.aulaId === aula.id) Sessao.encerrar(estadoFim(aula, al, P.hw)).catch(() => {});
      navegar("#/semana");
    } catch (e) { el.disabled = false; erro(e); }
  }
});

Object.assign(CAMPOS, {
  "pos-obs": el => { if (P) P.obs = el.value; },
  "pos-topico": el => { if (!P || el.value === P.topicoId) return; P.topicoId = el.value; regenerar(); desenharPos(); },
  "pos-tema": el => { if (!P || el.value === P.temaId) return; P.temaId = el.value; regenerar(); desenharPos(); },
  "pos-drive": el => { if (!P) return; P.enviarDrive = el.checked; const b = document.getElementById("btn-salvar-pos"); if (b) b.textContent = P.enviarDrive ? "Salvar e enviar homework" : "Salvar registro"; }
});
