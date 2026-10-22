// Regras de agenda, contrato e sugestões automáticas. Sem dependência de UI.

// ===== Datas (sempre componentes locais — nunca toISOString) =====
export function toLocalISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function parseISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
export function hojeISO() { return toLocalISO(new Date()); }
export function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return toLocalISO(d); }
export function diffDias(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
export function fmtData(iso) { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}`; }
export function fmtDataLonga(iso) { if (!iso) return "—"; const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; }
export const DIAS_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export const DIAS_LONGO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
export function diaSemana(iso) { return parseISO(iso).getDay(); }
export function segundaDaSemana(offset = 0) {
  const d = new Date(); const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow) + offset * 7);
  return toLocalISO(d);
}
export function mesDe(iso) { return iso ? iso.slice(0, 7) : ""; }
export function agoraHHMM() { const d = new Date(); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }

// ===== Constantes =====
export const NIVEIS = ["A1", "A2", "B1", "B2", "C1", "C2"];
export const DIFS = ["facil", "medio", "dificil"];
export const DIF_LABEL = { facil: "Fácil", medio: "Médio", dificil: "Difícil" };
export const SITUACOES = { ativo: "Ativo", trancado: "Trancado", inativo: "Inativo", experimental: "Aula experimental" };
export const STATUS_LABEL = {
  agendada: "agendada", dada: "dada", falta: "falta", remarcada: "remarcada",
  prof_faltou: "professor faltou", feriado: "feriado"
};
export const DIFICULDADES_PADRAO = [
  "Construção de frases", "Gramática", "Tempos verbais", "Pronúncia", "Vocabulário", "Fluência",
  "Listening", "Preposições", "Ordem das palavras", "Insegurança para falar", "Writing", "Compreensão de texto"
];
export const ETAPAS_PADRAO = [
  { id: "aquecimento", nome: "Aquecimento", min: 3 },
  { id: "homework", nome: "Homework", min: 7 },
  { id: "pratica", nome: "Prática", min: 20 },
  { id: "listening", nome: "Listening", min: 15 },
  { id: "fala", nome: "Fala", min: 12 },
  { id: "fechamento", nome: "Fechamento", min: 3 }
];
export const VALOR_REMARCACAO = 80;
export const PRAZO_REPOSICAO_DIAS = 21;

// ===== Agenda =====
// Uma "aula" pode existir no banco (tem id) ou ser virtual (vem do horário fixo do aluno).
export function chaveVirtual(alunoId, data) { return `v_${alunoId}_${data}`; }
export function ehVirtual(key) { return typeof key === "string" && key.startsWith("v_"); }
export function parseVirtual(key) { const p = key.split("_"); return { alunoId: p.slice(1, -1).join("_"), data: p[p.length - 1] }; }

export function horaDoAluno(aluno, iso) {
  const dow = diaSemana(iso);
  const h = (aluno.horarios || []).find(x => Number(x.dia) === dow);
  return h ? h.hora : null;
}

// Aulas de um intervalo [ini, fim]: reais + virtuais dos horários fixos.
export function aulasNoPeriodo(alunos, aulas, ini, fim) {
  const lista = [];
  const reais = aulas.filter(a => a.data >= ini && a.data <= fim);
  reais.forEach(a => lista.push({ ...a, key: a.id }));
  const ativos = alunos.filter(a => a.situacao === "ativo" || a.situacao === "experimental");
  for (let d = ini; d <= fim; d = addDays(d, 1)) {
    ativos.forEach(al => {
      const hora = horaDoAluno(al, d);
      if (!hora) return;
      if (al.inicioAgenda && d < al.inicioAgenda) return;
      const existe = aulas.some(a => a.alunoId === al.id && a.data === d && a.tipo !== "reposicao");
      if (!existe) lista.push({ key: chaveVirtual(al.id, d), alunoId: al.id, data: d, hora, tipo: "regular", status: "agendada", virtual: true });
    });
  }
  lista.sort((a, b) => (a.data + (a.hora || "")).localeCompare(b.data + (b.hora || "")));
  return lista;
}

export function jaPassou(aula) {
  const hoje = hojeISO();
  if (aula.data < hoje) return true;
  if (aula.data > hoje) return false;
  if (!aula.hora) return false;
  const [h, m] = aula.hora.split(":").map(Number);
  const agora = new Date();
  return agora.getHours() * 60 + agora.getMinutes() > h * 60 + m + 60;
}

export function semRegistro(aula) {
  return (aula.status === "agendada") && jaPassou(aula);
}

// ===== Contrato: cobrança das reposições =====
// Por aluno e mês da aula ORIGINAL:
//  - Professor faltou / falta abonada: reposição grátis, não conta na cota.
//  - Remarcação com aviso >= 24h: a 1ª do mês é grátis, desde que ainda não tenha havido
//    falta/cancelamento < 24h naquele mês; as demais custam R$ 80.
//  - Falta sem aviso ou aviso < 24h (não abonada): aula conta como dada, o aluno perde a
//    remarcação grátis do mês dali em diante, e repor essa aula custa R$ 80.
export function eventosDoMes(aulas, alunoId, mes) {
  return aulas.filter(a => a.alunoId === alunoId && mesDe(a.data) === mes &&
    (a.status === "remarcada" || a.status === "falta" || a.status === "prof_faltou"))
    .sort((a, b) => (a.data + (a.hora || "")).localeCompare(b.data + (b.hora || "")));
}

export function mapaCobranca(aulas) {
  const res = {};
  const grupos = {};
  aulas.forEach(a => {
    if (!(a.status === "remarcada" || a.status === "falta" || a.status === "prof_faltou")) return;
    const k = a.alunoId + "|" + mesDe(a.data);
    (grupos[k] = grupos[k] || []).push(a);
  });
  Object.values(grupos).forEach(lista => {
    lista.sort((a, b) => (a.data + (a.hora || "")).localeCompare(b.data + (b.hora || "")));
    let gratisUsada = false, perdeuDireito = false;
    lista.forEach(a => {
      if (a.status === "prof_faltou") { res[a.id] = { valor: 0, motivo: "Professor faltou — não conta na cota" }; return; }
      if (a.status === "falta" && a.abonada) { res[a.id] = { valor: 0, motivo: "Falta abonada — não conta na cota" }; return; }
      if (a.status === "falta") { perdeuDireito = true; res[a.id] = { valor: VALOR_REMARCACAO, motivo: "Falta ou aviso < 24h: aula conta como dada; repor custa R$ 80" }; return; }
      // remarcada com aviso >= 24h
      if (!gratisUsada && !perdeuDireito) { gratisUsada = true; res[a.id] = { valor: 0, motivo: "1ª remarcação do mês" }; }
      else if (perdeuDireito) res[a.id] = { valor: VALOR_REMARCACAO, motivo: "Remarcação grátis do mês perdida (houve falta/aviso < 24h)" };
      else res[a.id] = { valor: VALOR_REMARCACAO, motivo: "2ª remarcação do mês ou mais" };
    });
  });
  return res;
}

// Simula o custo de uma nova remarcação/falta antes de confirmar.
export function simularCusto(aulas, aula, novoStatus, abonada = false) {
  const outras = aulas.filter(a => a.id !== aula.id);
  const fake = { ...aula, id: "__sim__", status: novoStatus, abonada };
  return mapaCobranca([...outras, fake])["__sim__"];
}

export function situacaoGratisDoMes(aulas, alunoId, mes) {
  const ev = eventosDoMes(aulas, alunoId, mes);
  const mapa = mapaCobranca(aulas);
  const usada = ev.some(a => a.status === "remarcada" && mapa[a.id] && mapa[a.id].valor === 0);
  const perdida = ev.some(a => a.status === "falta" && !a.abonada);
  return { usada, perdida, disponivel: !usada && !perdida };
}

export function prazoReposicao(aula) { return addDays(aula.data, PRAZO_REPOSICAO_DIAS); }

// Aulas que dão direito a reposição e ainda não têm reposição marcada.
export function reposicoesPendentes(aulas) {
  const filhos = new Set(aulas.filter(a => a.reposicaoDe).map(a => a.reposicaoDe));
  const hoje = hojeISO();
  return aulas.filter(a => (a.status === "remarcada" || a.status === "prof_faltou" || (a.status === "falta" && a.abonada)) && !filhos.has(a.id))
    .map(a => ({ aula: a, prazo: prazoReposicao(a), expirada: hoje > prazoReposicao(a) }));
}

export function faltasNoPeriodo(aulas, alunoId, desdeISO) {
  return aulas.filter(a => a.alunoId === alunoId && a.status === "falta" && a.data >= desdeISO);
}

// ===== Sugestão de tópico e dificuldade =====
function subirDif(d) { return d === "facil" ? "medio" : "dificil"; }
function descerDif(d) { return d === "dificil" ? "medio" : "facil"; }

export function aulasDadasDoAluno(aulas, alunoId) {
  return aulas.filter(a => a.alunoId === alunoId && a.status === "dada")
    .sort((a, b) => (b.data + (b.hora || "")).localeCompare(a.data + (a.hora || "")));
}

export function sugerirPlano(banco, aluno, aulas, aulaAtualId) {
  const nivel = aluno.nivel && banco.porNivel[aluno.nivel] ? aluno.nivel : (aluno.nivel === "C1" || aluno.nivel === "C2" ? "B2" : "A2");
  const topicos = banco.porNivel[nivel] || [];
  const dadas = aulasDadasDoAluno(aulas, aluno.id).filter(a => a.id !== aulaAtualId);
  const ultima = dadas.find(a => a.topicoId);
  const difPadrao = nivel === "A1" ? "facil" : "medio";
  if (!topicos.length) return { nivel, topicoId: null, dif: difPadrao, motivo: "" };
  if (ultima && ultima.avaliacaoMaterial === "dificil_demais" && banco.topicos[ultima.topicoId]) {
    return { nivel, topicoId: ultima.topicoId, dif: descerDif(ultima.nivelMaterial || difPadrao), motivo: "Reforço: o material da última aula foi difícil demais" };
  }
  const recentes = new Set(dadas.slice(0, 12).map(a => a.topicoId).filter(Boolean));
  let idx = ultima ? topicos.findIndex(t => t.id === ultima.topicoId) : -1;
  let escolhido = null;
  for (let i = 1; i <= topicos.length; i++) {
    const t = topicos[(idx + i + topicos.length) % topicos.length];
    if (!recentes.has(t.id)) { escolhido = t; break; }
  }
  if (!escolhido) escolhido = topicos[(idx + 1 + topicos.length) % topicos.length];
  let dif = ultima ? (ultima.nivelMaterial || difPadrao) : difPadrao;
  if (ultima && ultima.avaliacaoMaterial === "facil_demais") dif = subirDif(dif);
  const motivo = ultima ? (ultima.avaliacaoMaterial === "facil_demais" ? "Última aula foi fácil demais: subiu a dificuldade" : "Próximo tópico ainda não trabalhado") : "Primeiro tópico do nível";
  return { nivel, topicoId: escolhido.id, dif, motivo };
}

export function sugerirTexto(banco, nivel, topicoId, dif, usados) {
  const doNivel = banco.textos.filter(t => t.nivel === nivel);
  const naoUsados = doNivel.filter(t => !usados.has(t.id));
  const base = naoUsados.length ? naoUsados : doNivel;
  const pont = t => (t.topicos.includes(topicoId) ? 2 : 0) + (t.dif === dif ? 1 : 0);
  return base.slice().sort((a, b) => pont(b) - pont(a))[0] || null;
}

// ===== Homework automático =====
function embaralhar(arr, seed) {
  const a = arr.slice(); let s = seed || Math.floor(Math.random() * 1e9);
  for (let i = a.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor((s / 233280) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function gerarHomework(banco, topicoId, dif, avaliacao, textoId, seed) {
  const t = banco.topicos[topicoId];
  if (!t) return null;
  // Na aula usamos perguntas + tradução oral do nível escolhido.
  // O homework usa completar + reescrever do mesmo nível e tradução escrita de um nível vizinho.
  let difTrad = dif === "dificil" ? "medio" : (avaliacao === "dificil_demais" ? descerDif(dif) : subirDif(dif));
  if (difTrad === dif) difTrad = dif === "facil" ? "medio" : "facil";
  const s = seed || Math.floor(Math.random() * 1e9);
  const completar = embaralhar(t[dif].c, s).slice(0, 5);
  const reescrever = embaralhar(t[dif].r, s + 1).slice(0, 3);
  const traducao = embaralhar(t[difTrad].t, s + 2).slice(0, 3);
  const escrita = embaralhar(t.escrita, s + 3)[0];
  const texto = textoId ? banco.textosPorId[textoId] : null;
  return {
    topicoId, topicoNome: t.nome, nivel: t.nivel, dif, seed: s,
    completar, reescrever, traducao, escrita,
    texto: texto ? { id: texto.id, titulo: texto.titulo, corpo: texto.texto, perguntas: texto.pessoais } : null,
    geradoEm: new Date().toISOString()
  };
}

export function homeworkComoTexto(hw, aluno, dataAula, comRespostas = false) {
  if (!hw) return "";
  const L = [];
  L.push(`HOMEWORK — ${fmtDataLonga(dataAula)} — ${hw.topicoNome}`);
  L.push("");
  L.push("1) Complete the sentences:");
  hw.completar.forEach((c, i) => L.push(`   ${String.fromCharCode(97 + i)}) ${c[0]}${comRespostas ? `   → ${c[1]}` : ""}`));
  L.push("");
  L.push("2) Rewrite the sentences:");
  hw.reescrever.forEach((r, i) => L.push(`   ${String.fromCharCode(97 + i)}) ${r[0]}  (${r[1]})${comRespostas ? `   → ${r[2]}` : ""}`));
  L.push("");
  L.push("3) Translate into English:");
  hw.traducao.forEach((t, i) => L.push(`   ${String.fromCharCode(97 + i)}) ${t[0]}${comRespostas ? `   → ${t[1]}` : ""}`));
  L.push("");
  L.push(`4) Writing: ${hw.escrita}`);
  if (hw.texto) {
    L.push("");
    L.push(`5) Read the text again — "${hw.texto.titulo}" — and answer in full sentences:`);
    L.push("");
    L.push(hw.texto.corpo);
    L.push("");
    hw.texto.perguntas.forEach((p, i) => L.push(`   ${String.fromCharCode(97 + i)}) ${p}`));
  }
  L.push("");
  return L.join("\n");
}
