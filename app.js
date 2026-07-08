// ===== Armazenamento =====
const DB = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
};
const K = { students: "gf_students", lessons: "gf_lessons", makeups: "gf_makeups", assessments: "gf_assessments" };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function students() { return DB.get(K.students); }
function lessons() { return DB.get(K.lessons); }
function makeups() { return DB.get(K.makeups); }
function assessments() { return DB.get(K.assessments); }
function saveStudents(v) { DB.set(K.students, v); }
function saveLessons(v) { DB.set(K.lessons, v); }
function saveMakeups(v) { DB.set(K.makeups, v); }
function saveAssessments(v) { DB.set(K.assessments, v); }

function studentName(id) {
  const s = students().find(s => s.id === id);
  return s ? s.nome : "(aluno removido)";
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}

function esc(str) {
  return (str || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDate(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// ===== Constantes de conteúdo =====
const SKILLS = ["Gramática", "Vocabulário", "Listening", "Speaking", "Writing", "Reading", "Pronúncia"];
const VERB_TENSES = ["Simple Present", "Simple Past", "Present Continuous", "Past Continuous", "Present Perfect", "Future", "Todos"];
const SUBTHEMES = ["Short answers", "Prepositions", "Adverbs", "If clauses", "Modal verbs", "Comparatives/Superlatives",
  "Question tags", "Phrasal verbs", "Reported speech", "Passive voice", "Countable/Uncountable", "Articles"];
const DIFFICULTY_LIST = ["Construção de frases", "Gramática", "Pronúncia", "Vocabulário",
  "Confiança/Fluência", "Listening", "Writing", "Compreensão de texto"];

// ===== Regras do contrato =====
function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function addMonths(dateStr, months) {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}
function monthKeyOf(dateStr) { return dateStr ? dateStr.slice(0, 7) : "sem-data"; }
function hojeISO() { return new Date().toISOString().slice(0, 10); }

function prazoInfo(m) {
  if (!m.dataPerdida) return { prazo: null, expirada: false, diasRestantes: null };
  const prazo = addDays(m.dataPerdida, 21);
  const expirada = m.status !== "Concluída" && hojeISO() > prazo;
  const diasRestantes = Math.ceil((new Date(prazo) - new Date(hojeISO())) / 86400000);
  return { prazo, expirada, diasRestantes };
}

function mapaCobranca() {
  const mk = makeups();
  const grupos = {};
  mk.forEach(m => {
    const chave = m.alunoId + "|" + monthKeyOf(m.dataPerdida);
    (grupos[chave] = grupos[chave] || []).push(m);
  });
  const resultado = {};
  Object.values(grupos).forEach(lista => {
    const semCota = lista.filter(e => e.motivo === "Professor faltou");
    semCota.forEach(e => {
      resultado[e.id] = { label: "Grátis", detalhe: "falta do professor — não conta na cota do aluno" };
    });
    const comCota = lista.filter(e => e.motivo !== "Professor faltou")
      .sort((a, b) => (a.dataPerdida || "").localeCompare(b.dataPerdida || ""));
    const direitoRevogado = comCota.some(e => e.motivo === "Cancelamento (<24h)");
    let usouGratis = false;
    comCota.forEach(e => {
      if (e.motivo === "Cancelamento (<24h)") {
        resultado[e.id] = { label: "R$80", detalhe: "cancelamento com menos de 24h de aviso" };
      } else if (direitoRevogado) {
        resultado[e.id] = { label: "R$80", detalhe: "direito grátis do mês perdido (houve cancelamento <24h)" };
      } else if (!usouGratis) {
        resultado[e.id] = { label: "Grátis", detalhe: "1ª remarcação do mês" };
        usouGratis = true;
      } else {
        resultado[e.id] = { label: "R$80", detalhe: "2ª+ remarcação do mês" };
      }
    });
  });
  return resultado;
}

// ===== Tema claro/escuro =====
function applyTheme(theme) {
  document.body.classList.toggle("dark-theme", theme === "dark");
  localStorage.setItem("gf_theme", theme);
}
function initTheme() { applyTheme(localStorage.getItem("gf_theme") || "light"); }
function toggleTheme() {
  applyTheme(document.body.classList.contains("dark-theme") ? "light" : "dark");
  updateThemeButton();
}
function updateThemeButton() {
  const btn = document.getElementById("btn-theme");
  if (!btn) return;
  btn.textContent = document.body.classList.contains("dark-theme") ? "☀️ Claro" : "🌙 Escuro";
}

// ===== Rascunho de formulários (persistência ao trocar de aba) =====
function captureFormDraft(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  const data = {};
  form.querySelectorAll("input, select, textarea").forEach(el => {
    if (!el.id) return;
    if (el.tagName === "SELECT" && el.multiple) {
      data[el.id] = Array.from(el.selectedOptions).map(o => o.value);
    } else if (el.type === "checkbox") {
      data[el.id] = el.checked;
    } else {
      data[el.id] = el.value;
    }
  });
  localStorage.setItem("gf_draft_" + formId, JSON.stringify(data));
}
function restoreFormDraft(formId) {
  const raw = localStorage.getItem("gf_draft_" + formId);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    const form = document.getElementById(formId);
    if (!form) return;
    Object.entries(data).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === "SELECT" && el.multiple) {
        Array.from(el.options).forEach(o => { o.selected = Array.isArray(val) && val.includes(o.value); });
      } else if (el.type === "checkbox") {
        el.checked = val;
      } else {
        el.value = val;
      }
    });
  } catch {}
}
function clearFormDraft(formId) { localStorage.removeItem("gf_draft_" + formId); }
function wireDraft(formId) {
  const form = document.getElementById(formId);
  if (!form) return;
  restoreFormDraft(formId);
  form.addEventListener("input", () => captureFormDraft(formId));
  form.addEventListener("change", () => captureFormDraft(formId));
}

// ===== Multi-select helper =====
function multiSelectHtml(id, items, selected) {
  selected = selected || [];
  const size = Math.min(items.length, 6);
  return `<select id="${id}" multiple size="${size}">${items.map(i =>
    `<option value="${esc(i)}" ${selected.includes(i) ? "selected" : ""}>${esc(i)}</option>`
  ).join("")}</select>`;
}
function readMultiSelect(id) {
  const el = document.getElementById(id);
  if (!el) return [];
  return Array.from(el.selectedOptions).map(o => o.value);
}
function setMultiSelect(id, values) {
  const el = document.getElementById(id);
  if (!el) return;
  values = values || [];
  Array.from(el.options).forEach(o => { o.selected = values.includes(o.value); });
}

// ===== Navegação por abas =====
let currentTab = "alunos";
let filtroAnteriores = { aluno: "", mes: "", ano: "" };
let aulasAnterioresBuscou = false;
let alunosBuscou = false;
let nivelStatusBuscou = false;

document.querySelectorAll("nav.tabbar button").forEach(btn => {
  btn.addEventListener("click", () => {
    currentTab = btn.dataset.tab;
    document.querySelectorAll("nav.tabbar button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    render();
  });
});

function render() {
  const main = document.getElementById("app-main");
  main.innerHTML = {
    alunos: renderAlunos,
    aulas: renderAulas,
    reposicoes: renderReposicoes,
    nivelamento: renderNivelamento,
    dashboard: renderDashboard,
    resumoia: renderResumoIA
  }[currentTab]();
  attachHandlers();
  updateThemeButton();
}

// ===== ALUNOS =====
function renderAlunoRow(s) {
  const inativo = s.status === "Inativo" || s.status === "Trancado";
  return `
    <div class="row-item">
      <div class="row-main">
        <div class="row-title ${inativo ? "aluno-inativo" : ""}">${esc(s.nome)}
          <span class="tag tag-nivel">${esc(s.nivel || "—")}</span>
          ${inativo ? `<span class="tag tag-pendente">${esc(s.status)}</span>` : ""}
        </div>
        <div class="row-sub">${esc(s.horario || "sem horário fixo")} · ${esc(s.freq || "—")}</div>
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-small" data-edit-student="${s.id}">Editar</button>
        <button class="btn btn-danger btn-small" data-del-student="${s.id}">Excluir</button>
      </div>
    </div>`;
}

function renderAlunos() {
  return `
    <div class="card" id="student-form-card">
      <h2 id="student-form-title">Novo aluno</h2>
      <form id="student-form">
        <input type="hidden" id="s-id">
        <label>Nome completo</label>
        <input type="text" id="s-nome" required>
        <div class="grid-2">
          <div><label>Nível (CEFR)</label>
            <select id="s-nivel">
              <option value="">—</option>
              <option>A1</option><option>A2</option><option>B1</option>
              <option>B2</option><option>C1</option><option>C2</option>
            </select>
          </div>
          <div><label>Status</label>
            <select id="s-status">
              <option>Ativo</option><option>Inativo</option><option>Trancado</option>
            </select>
          </div>
        </div>
        <label>Dia/horário fixo</label>
        <input type="text" id="s-horario" placeholder="Ex: Ter e Qui, 19h">
        <div class="grid-2">
          <div><label>Contato (WhatsApp)</label><input type="text" id="s-contato"></div>
          <div><label>Frequência semanal</label>
            <select id="s-freq">
              <option value="">—</option>
              <option>1x/semana</option><option>2x/semana</option><option>3x/semana</option>
            </select>
          </div>
        </div>
        <button type="submit" class="btn btn-primary">Salvar aluno</button>
      </form>
    </div>

    <div class="card">
      <h2>Buscar alunos</h2>
      <div class="grid-2">
        <div><label>Nome</label><input type="text" id="busca-aluno-nome"></div>
        <div><label>Nível</label>
          <select id="busca-aluno-nivel">
            <option value="">Todos</option><option>A1</option><option>A2</option><option>B1</option>
            <option>B2</option><option>C1</option><option>C2</option>
          </select>
        </div>
      </div>
      <label>Status</label>
      <select id="busca-aluno-status">
        <option value="">Todos</option><option>Ativo</option><option>Inativo</option><option>Trancado</option>
      </select>
      <button type="button" class="btn btn-primary btn-small" id="btn-buscar-aluno">Buscar</button>
      <div id="alunos-resultado" style="margin-top:14px">${alunosBuscou ? "" : `<div class="empty-state">Use os filtros acima e clique em Buscar para ver os alunos cadastrados.</div>`}</div>
    </div>
  `;
}

function buscarAlunos() {
  const nome = document.getElementById("busca-aluno-nome").value.trim().toLowerCase();
  const nivel = document.getElementById("busca-aluno-nivel").value;
  const status = document.getElementById("busca-aluno-status").value;
  let list = students();
  if (nome) list = list.filter(s => s.nome.toLowerCase().includes(nome));
  if (nivel) list = list.filter(s => s.nivel === nivel);
  if (status) list = list.filter(s => s.status === status);
  list.sort((a, b) => {
    const rank = s => (s.status === "Ativo" || !s.status) ? 0 : 1;
    const r = rank(a) - rank(b);
    return r !== 0 ? r : a.nome.localeCompare(b.nome);
  });
  alunosBuscou = true;
  const box = document.getElementById("alunos-resultado");
  box.innerHTML = list.length ? list.map(renderAlunoRow).join("") : `<div class="empty-state">Nenhum aluno encontrado com esse filtro.</div>`;
  wireStudentRowButtons();
}

function submitStudent(e) {
  e.preventDefault();
  const id = document.getElementById("s-id").value || uid();
  const data = {
    id,
    nome: document.getElementById("s-nome").value.trim(),
    nivel: document.getElementById("s-nivel").value,
    status: document.getElementById("s-status").value,
    horario: document.getElementById("s-horario").value.trim(),
    contato: document.getElementById("s-contato").value.trim(),
    freq: document.getElementById("s-freq").value
  };
  if (!data.nome) return;
  let list = students();
  const idx = list.findIndex(s => s.id === id);
  if (idx >= 0) list[idx] = data; else list.push(data);
  saveStudents(list);
  clearFormDraft("student-form");
  toast("Aluno salvo.");
  render();
}

// ===== AULAS =====
function renderAulas() {
  const hoje = hojeISO();
  const hojeList = lessons().filter(l => l.data === hoje).sort((a, b) => (a.data || "").localeCompare(b.data || ""));
  const opts = students().map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join("");

  const rowHtml = (l) => {
    const tagClass = l.presenca === "Falta" ? "tag-falta" : l.presenca === "Professor faltou" ? "tag-agendada" : l.presenca === "Reposição" ? "tag-reposicao" : "tag-presente";
    const habilidades = l.habilidades && l.habilidades.length ? l.habilidades : (l.habilidade ? [l.habilidade] : []);
    const temaResumo = [...(l.temposVerbais || []), ...(l.subtemas || [])].filter(Boolean);
    if (l.subtemaOutro) temaResumo.push(l.subtemaOutro);
    return `
    <div class="row-item">
      <div class="row-main">
        <div class="row-title">${esc(studentName(l.alunoId))} <span class="tag ${tagClass}">${esc(l.presenca || "—")}</span>
        ${l.presenca === "Falta" ? `<span class="tag ${l.aviso24h === "Não" ? "tag-falta" : "tag-agendada"}">${l.aviso24h === "Não" ? "sem aviso 24h" : "avisou ≥24h"}</span>` : ""}
        ${l.atraso15 ? `<span class="tag tag-reposicao">atraso &gt;15min</span>` : ""}
        </div>
        <div class="row-sub">${fmtDate(l.data)} · ${esc(habilidades.join(", ") || "—")} — ${esc(temaResumo.join(", ") || l.tema || "sem tema registrado")}</div>
        ${(l.dificuldades && l.dificuldades.length) || l.dificuldadeOutra ? `<div class="row-sub">⚠ ${esc([...(l.dificuldades || []), l.dificuldadeOutra].filter(Boolean).join("; "))}</div>` : ""}
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-small" data-edit-lesson="${l.id}">Editar</button>
        <button class="btn btn-danger btn-small" data-del-lesson="${l.id}">Excluir</button>
      </div>
    </div>`;
  };

  const rowsHoje = hojeList.length ? hojeList.map(rowHtml).join("") : `<div class="empty-state">Nenhuma aula registrada hoje ainda.</div>`;

  const anos = [...new Set(lessons().map(l => (l.data || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const meses = ["01-Jan", "02-Fev", "03-Mar", "04-Abr", "05-Mai", "06-Jun", "07-Jul", "08-Ago", "09-Set", "10-Out", "11-Nov", "12-Dez"];

  return `
    <div class="card">
      <h2>Aulas de hoje <span class="count">${hojeList.length}</span></h2>
      ${rowsHoje}
    </div>

    <div class="card">
      <h2 id="lesson-form-title">Nova aula</h2>
      <form id="lesson-form">
        <input type="hidden" id="l-id">
        <div class="grid-2">
          <div><label>Data</label><input type="date" id="l-data" value="${hoje}" required></div>
          <div><label>Aluno</label><select id="l-aluno" required><option value="">Selecione</option>${opts}</select></div>
        </div>

        <label>Habilidade(s) em foco</label>
        ${multiSelectHtml("l-habilidades", SKILLS, [])}

        <label>Tempos verbais abordados</label>
        ${multiSelectHtml("l-tempos", VERB_TENSES, [])}

        <label>Subtemas abordados</label>
        ${multiSelectHtml("l-subtemas", SUBTHEMES, [])}
        <input type="text" id="l-sub-outro" placeholder="Outro subtema não listado (opcional)">

        <label>Presença</label>
        <select id="l-presenca">
          <option>Presente</option><option>Falta</option><option>Reposição</option><option>Professor faltou</option>
        </select>

        <div id="falta-extra" class="section-hidden">
          <label>O aluno avisou com 24h ou mais de antecedência?</label>
          <select id="l-aviso24h">
            <option value="Sim">Sim, avisou com 24h+ de antecedência</option>
            <option value="Não">Não — cancelou/faltou em cima da hora (&lt;24h)</option>
          </select>
          <p style="font-size:11.5px;color:var(--text-muted);margin:6px 0 0">
            Se marcar "Não": a aula conta como dada, o aluno perde o direito à remarcação grátis do mês, e a remarcação desta aula específica será cobrada à parte (R$80).
          </p>
        </div>
        <div id="prof-faltou-aviso" class="section-hidden">
          <p style="font-size:11.5px;color:var(--text-muted);margin:6px 0 0">
            Reposição criada automaticamente como <strong>grátis</strong> e não conta na cota mensal do aluno.
          </p>
        </div>

        <label style="display:flex;align-items:center;gap:8px;text-transform:none;font-weight:400;font-size:13px;margin-top:12px">
          <input type="checkbox" id="l-atraso15" style="width:auto"> Aluno chegou com mais de 15 min de atraso (aula finalizada e contabilizada)
        </label>

        <label>Dificuldade observada</label>
        ${multiSelectHtml("l-dificuldades", DIFFICULTY_LIST, [])}
        <input type="text" id="l-dif-outra" placeholder="Outra dificuldade específica (opcional)">

        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Salvar aula</button>
          <button type="button" class="btn btn-ghost" id="btn-limpar-aula">Limpar</button>
        </div>
      </form>
    </div>

    <div class="card">
      <h2>Aulas anteriores</h2>
      <div class="grid-2">
        <div><label>Aluno</label><select id="filtro-aluno"><option value="">Todos</option>${opts}</select></div>
        <div><label>Ano</label><select id="filtro-ano"><option value="">Todos</option>${anos.map(a => `<option>${a}</option>`).join("")}</select></div>
      </div>
      <label>Mês</label>
      <select id="filtro-mes"><option value="">Todos</option>${meses.map(m => `<option value="${m.slice(0, 2)}">${m.slice(3)}</option>`).join("")}</select>
      <button type="button" class="btn btn-primary btn-small" id="btn-buscar-aulas">Buscar</button>
      <div id="aulas-anteriores-list" style="margin-top:12px">${aulasAnterioresBuscou ? renderAulasAnterioresList() : `<div class="empty-state">Use os filtros acima e clique em Buscar.</div>`}</div>
    </div>
  `;
}

function renderAulasAnterioresList() {
  const hoje = hojeISO();
  let list = lessons().filter(l => l.data !== hoje);
  if (filtroAnteriores.aluno) list = list.filter(l => l.alunoId === filtroAnteriores.aluno);
  if (filtroAnteriores.ano) list = list.filter(l => (l.data || "").slice(0, 4) === filtroAnteriores.ano);
  if (filtroAnteriores.mes) list = list.filter(l => (l.data || "").slice(5, 7) === filtroAnteriores.mes);
  list = list.sort((a, b) => (b.data || "").localeCompare(a.data || ""));

  if (!list.length) return `<div class="empty-state">Nenhuma aula encontrada com esse filtro.</div>`;

  return list.map(l => {
    const tagClass = l.presenca === "Falta" ? "tag-falta" : l.presenca === "Professor faltou" ? "tag-agendada" : l.presenca === "Reposição" ? "tag-reposicao" : "tag-presente";
    const habilidades = l.habilidades && l.habilidades.length ? l.habilidades : (l.habilidade ? [l.habilidade] : []);
    const temaResumo = [...(l.temposVerbais || []), ...(l.subtemas || [])].filter(Boolean);
    if (l.subtemaOutro) temaResumo.push(l.subtemaOutro);
    return `
    <div class="row-item">
      <div class="row-main">
        <div class="row-title">${esc(studentName(l.alunoId))} <span class="tag ${tagClass}">${esc(l.presenca || "—")}</span></div>
        <div class="row-sub">${fmtDate(l.data)} · ${esc(habilidades.join(", ") || "—")} — ${esc(temaResumo.join(", ") || l.tema || "sem tema registrado")}</div>
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-small" data-edit-lesson="${l.id}">Editar</button>
        <button class="btn btn-danger btn-small" data-del-lesson="${l.id}">Excluir</button>
      </div>
    </div>`;
  }).join("");
}

function buscarAulasAnteriores() {
  filtroAnteriores.aluno = document.getElementById("filtro-aluno").value;
  filtroAnteriores.ano = document.getElementById("filtro-ano").value;
  filtroAnteriores.mes = document.getElementById("filtro-mes").value;
  aulasAnterioresBuscou = true;
  document.getElementById("aulas-anteriores-list").innerHTML = renderAulasAnterioresList();
  wireLessonRowButtons();
}

function toggleFaltaExtra() {
  const sel = document.getElementById("l-presenca");
  const extra = document.getElementById("falta-extra");
  const profAviso = document.getElementById("prof-faltou-aviso");
  if (!sel) return;
  if (extra) extra.classList.toggle("section-hidden", sel.value !== "Falta");
  if (profAviso) profAviso.classList.toggle("section-hidden", sel.value !== "Professor faltou");
  if (sel.value === "Falta" && document.getElementById("l-aviso24h") && !document.getElementById("l-aviso24h").value) {
    document.getElementById("l-aviso24h").value = "Sim";
  }
}

function limparFormularioAula() {
  clearFormDraft("lesson-form");
  toast("Formulário limpo.");
  render();
}

function submitLesson(e) {
  e.preventDefault();
  const id = document.getElementById("l-id").value || uid();
  const presenca = document.getElementById("l-presenca").value;
  const aviso24h = presenca === "Falta" ? document.getElementById("l-aviso24h").value : "";
  const data = {
    id,
    data: document.getElementById("l-data").value,
    alunoId: document.getElementById("l-aluno").value,
    habilidades: readMultiSelect("l-habilidades"),
    temposVerbais: readMultiSelect("l-tempos"),
    subtemas: readMultiSelect("l-subtemas"),
    subtemaOutro: document.getElementById("l-sub-outro").value.trim(),
    presenca,
    aviso24h,
    atraso15: document.getElementById("l-atraso15").checked,
    dificuldades: readMultiSelect("l-dificuldades"),
    dificuldadeOutra: document.getElementById("l-dif-outra").value.trim()
  };
  if (!data.alunoId || !data.data) return;
  let list = lessons();
  const idx = list.findIndex(x => x.id === id);
  const wasSpecial = idx >= 0 && (list[idx].presenca === "Falta" || list[idx].presenca === "Professor faltou");
  if (idx >= 0) list[idx] = data; else list.push(data);
  saveLessons(list);

  if ((data.presenca === "Falta" || data.presenca === "Professor faltou") && !wasSpecial) {
    let motivo;
    if (data.presenca === "Professor faltou") motivo = "Professor faltou";
    else motivo = data.aviso24h === "Não" ? "Cancelamento (<24h)" : "Falta / cancelamento (aviso ≥24h)";
    let mk = makeups();
    mk.push({ id: uid(), alunoId: data.alunoId, dataPerdida: data.data, motivo, dataAgendada: "", horario: "", status: "Pendente", obs: "" });
    saveMakeups(mk);
    toast("Aula salva. Reposição pendente criada automaticamente.");
  } else {
    toast("Aula salva.");
  }
  clearFormDraft("lesson-form");
  render();
}

// ===== REPOSIÇÕES =====
function renderReposicoes() {
  const cobrancas = mapaCobranca();
  const list = makeups().slice().sort((a, b) => {
    if (a.status === "Pendente" && b.status !== "Pendente") return -1;
    if (b.status === "Pendente" && a.status !== "Pendente") return 1;
    return (b.dataPerdida || "").localeCompare(a.dataPerdida || "");
  });
  const opts = students().map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join("");
  const statusTag = { "Pendente": "tag-pendente", "Agendada": "tag-agendada", "Concluída": "tag-concluida", "Perdida (sem reposição)": "tag-falta" };
  const motivos = ["Falta / cancelamento (aviso ≥24h)", "Cancelamento (<24h)", "Professor faltou"];

  const rows = list.length ? list.map(m => {
    const cob = cobrancas[m.id] || { label: "—", detalhe: "" };
    const prazo = prazoInfo(m);
    return `
    <div class="row-item">
      <div class="row-main">
        <div class="row-title">${esc(studentName(m.alunoId))}
          <span class="tag ${statusTag[m.status] || ""}">${esc(m.status)}</span>
          <span class="tag ${cob.label === "Grátis" ? "tag-concluida" : "tag-falta"}">${cob.label}</span>
          ${prazo.expirada ? `<span class="tag tag-falta">expirada</span>` : ""}
        </div>
        <div class="row-sub">Aula original: ${fmtDate(m.dataPerdida)}${m.dataAgendada ? " · reposição: " + fmtDate(m.dataAgendada) : ""}</div>
        ${prazo.prazo ? `<div class="row-sub">Prazo p/ remarcar (21 dias): ${fmtDate(prazo.prazo)}${!prazo.expirada && prazo.diasRestantes !== null ? ` (${prazo.diasRestantes} dia(s) restante(s))` : ""}</div>` : ""}
        <div class="row-sub">${esc(m.motivo || "—")} · cobrança: ${cob.detalhe}</div>
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-small" data-edit-makeup="${m.id}">Editar</button>
        <button class="btn btn-danger btn-small" data-del-makeup="${m.id}">Excluir</button>
      </div>
    </div>
  `;
  }).join("") : `<div class="empty-state"><div class="big">↺</div>Nenhuma reposição registrada.</div>`;

  return `
    <div class="card">
      <h2>Reposições <span class="count">${list.length}</span></h2>
      <p style="font-size:11.5px;color:var(--text-muted);margin:0 0 12px">
        Cobrança e prazo calculados automaticamente: 1 remarcação grátis por mês, R$80 nas demais, 21 dias corridos de validade, cancelamento &lt;24h sempre cobrado e revoga o direito grátis do mês. Falta do professor nunca é cobrada nem entra na cota do aluno.
      </p>
      ${rows}
    </div>
    <div class="card">
      <h2 id="makeup-form-title">Nova reposição</h2>
      <form id="makeup-form">
        <input type="hidden" id="m-id">
        <label>Aluno</label>
        <select id="m-aluno" required><option value="">Selecione</option>${opts}</select>
        <div class="grid-2">
          <div><label>Data da aula perdida</label><input type="date" id="m-data-perdida"></div>
          <div><label>Data reposição agendada</label><input type="date" id="m-data-agendada"></div>
        </div>
        <div class="grid-2">
          <div><label>Horário</label><input type="text" id="m-horario" placeholder="Ex: 20h"></div>
          <div><label>Status</label>
            <select id="m-status">
              <option>Pendente</option><option>Agendada</option><option>Concluída</option>
              <option>Perdida (sem reposição)</option>
            </select>
          </div>
        </div>
        <label>Motivo</label>
        <select id="m-motivo">${motivos.map(mo => `<option>${mo}</option>`).join("")}</select>
        <label>Observação</label>
        <textarea id="m-obs"></textarea>
        <button type="submit" class="btn btn-primary">Salvar reposição</button>
      </form>
    </div>
  `;
}

function submitMakeup(e) {
  e.preventDefault();
  const id = document.getElementById("m-id").value || uid();
  const data = {
    id,
    alunoId: document.getElementById("m-aluno").value,
    dataPerdida: document.getElementById("m-data-perdida").value,
    dataAgendada: document.getElementById("m-data-agendada").value,
    horario: document.getElementById("m-horario").value.trim(),
    status: document.getElementById("m-status").value,
    motivo: document.getElementById("m-motivo").value,
    obs: document.getElementById("m-obs").value.trim()
  };
  if (!data.alunoId) return;
  let list = makeups();
  const idx = list.findIndex(x => x.id === id);
  if (idx >= 0) list[idx] = data; else list.push(data);
  saveMakeups(list);
  clearFormDraft("makeup-form");
  toast("Reposição salva.");
  render();
}

// ===== NIVELAMENTO =====
function mediaAssessment(a) {
  const vals = [a.listening, a.reading, a.writing, a.speaking].map(Number).filter(v => !isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}
function semestreOf(dateStr) {
  if (!dateStr) return null;
  return Number(dateStr.slice(5, 7)) <= 6 ? "1º semestre" : "2º semestre";
}
function statusNivelamentoAluno(s) {
  const mine = assessments().filter(a => a.alunoId === s.id).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  if (!mine.length) return { status: "Sem nivelamento", ultima: null };
  const vencido = hojeISO() > addMonths(mine[0].data, 6);
  return { status: vencido ? "Vencido" : "Em dia", ultima: mine[0] };
}

function renderNivelamento() {
  const opts = students().map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join("");
  const todos = assessments();
  const anos = [...new Set(todos.map(a => (a.data || "").slice(0, 4)).filter(Boolean))].sort().reverse();

  const ativos = students().filter(s => s.status === "Ativo" || !s.status);
  let emDia = 0, semNivel = 0, vencidos = 0;
  ativos.forEach(s => {
    const r = statusNivelamentoAluno(s);
    if (r.status === "Em dia") emDia++;
    else if (r.status === "Sem nivelamento") semNivel++;
    else vencidos++;
  });

  const listaHtml = todos.length ? todos.slice()
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""))
    .map(a => `
    <div class="row-item">
      <div class="row-main">
        <div class="row-title">${esc(studentName(a.alunoId))} <span class="tag tag-nivel">${semestreOf(a.data) || "—"}</span></div>
        <div class="row-sub">${fmtDate(a.data)} · Listening ${a.listening ?? "—"} · Reading ${a.reading ?? "—"} · Writing ${a.writing ?? "—"} · Speaking ${a.speaking ?? "—"} · Média ${mediaAssessment(a) !== null ? mediaAssessment(a).toFixed(1) : "—"}</div>
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-small" data-edit-assessment="${a.id}">Editar</button>
        <button class="btn btn-danger btn-small" data-del-assessment="${a.id}">Excluir</button>
      </div>
    </div>
  `).join("") : `<div class="empty-state">Nenhum nivelamento registrado com esse filtro.</div>`;

  return `
    <div class="card">
      <h2>Painel indicativo <span class="count">alunos ativos</span></h2>
      <div class="stat-grid">
        <div class="stat-box success"><div class="stat-num">${emDia}</div><div class="stat-label">Em dia</div></div>
        <div class="stat-box warn"><div class="stat-num">${semNivel}</div><div class="stat-label">Sem nivelamento</div></div>
        <div class="stat-box danger"><div class="stat-num">${vencidos}</div><div class="stat-label">Nivelamento vencido</div></div>
      </div>
    </div>

    <div class="card">
      <h2 id="assessment-form-title">Novo nivelamento</h2>
      <form id="assessment-form">
        <input type="hidden" id="a-id">
        <div class="grid-2">
          <div><label>Aluno</label><select id="a-aluno" required><option value="">Selecione</option>${opts}</select></div>
          <div><label>Data do teste</label><input type="date" id="a-data" value="${hojeISO()}" required></div>
        </div>
        <div class="grid-2">
          <div><label>Listening (0-10)</label><input type="number" id="a-listening" min="0" max="10" step="0.5"></div>
          <div><label>Reading (0-10)</label><input type="number" id="a-reading" min="0" max="10" step="0.5"></div>
        </div>
        <div class="grid-2">
          <div><label>Writing (0-10)</label><input type="number" id="a-writing" min="0" max="10" step="0.5"></div>
          <div><label>Speaking (0-10)</label><input type="number" id="a-speaking" min="0" max="10" step="0.5"></div>
        </div>
        <label>Observações</label>
        <textarea id="a-obs"></textarea>
        <button type="submit" class="btn btn-primary">Salvar nivelamento</button>
      </form>
    </div>

    <div class="card">
      <h2>Status por aluno</h2>
      <div class="grid-2">
        <div><label>Nome</label><input type="text" id="busca-nivel-nome"></div>
        <div><label>Status</label>
          <select id="busca-nivel-status">
            <option value="">Todos</option><option>Em dia</option><option>Sem nivelamento</option><option>Vencido</option>
          </select>
        </div>
      </div>
      <button type="button" class="btn btn-primary btn-small" id="btn-buscar-nivel-status">Buscar</button>
      <div id="nivel-status-resultado" style="margin-top:14px">${nivelStatusBuscou ? renderStatusPorAlunoResultado() : `<div class="empty-state">Use os filtros acima e clique em Buscar.</div>`}</div>
    </div>

    <div class="card">
      <h2>Histórico de nivelamentos</h2>
      <div class="grid-2">
        <div><label>Ano</label><select id="filtro-nivel-ano"><option value="">Todos</option>${anos.map(a => `<option>${a}</option>`).join("")}</select></div>
        <div><label>Semestre</label>
          <select id="filtro-nivel-semestre">
            <option value="">Todos</option><option value="1">1º semestre</option><option value="2">2º semestre</option>
          </select>
        </div>
      </div>
      <div id="nivel-lista" style="margin-top:12px">${listaHtml}</div>
    </div>
  `;
}

function renderStatusPorAlunoResultado() {
  const nome = (document.getElementById("busca-nivel-nome")?.value || "").trim().toLowerCase();
  const status = document.getElementById("busca-nivel-status")?.value || "";
  let list = students();
  if (nome) list = list.filter(s => s.nome.toLowerCase().includes(nome));
  const comStatus = list.map(s => ({ s, r: statusNivelamentoAluno(s) })).filter(x => !status || x.r.status === status);
  if (!comStatus.length) return `<div class="empty-state">Nenhum aluno encontrado com esse filtro.</div>`;
  const tagFor = { "Em dia": "tag-concluida", "Sem nivelamento": "tag-pendente", "Vencido": "tag-falta" };
  return comStatus.map(({ s, r }) => `
    <div class="row-item">
      <div class="row-main">
        <div class="row-title">${esc(s.nome)} <span class="tag ${tagFor[r.status]}">${r.status}</span></div>
        ${r.ultima ? `<div class="row-sub">Último: ${fmtDate(r.ultima.data)} · Média: ${mediaAssessment(r.ultima) !== null ? mediaAssessment(r.ultima).toFixed(1) : "—"}</div>` : ""}
      </div>
    </div>
  `).join("");
}

function buscarStatusPorAluno() {
  nivelStatusBuscou = true;
  document.getElementById("nivel-status-resultado").innerHTML = renderStatusPorAlunoResultado();
}

function renderNivelListaFiltrada() {
  const ano = document.getElementById("filtro-nivel-ano")?.value || "";
  const sem = document.getElementById("filtro-nivel-semestre")?.value || "";
  let list = assessments();
  if (ano) list = list.filter(a => (a.data || "").slice(0, 4) === ano);
  if (sem) list = list.filter(a => (Number((a.data || "").slice(5, 7)) <= 6 ? "1" : "2") === sem);
  list = list.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const box = document.getElementById("nivel-lista");
  if (!box) return;
  box.innerHTML = list.length ? list.map(a => `
    <div class="row-item">
      <div class="row-main">
        <div class="row-title">${esc(studentName(a.alunoId))} <span class="tag tag-nivel">${semestreOf(a.data) || "—"}</span></div>
        <div class="row-sub">${fmtDate(a.data)} · Listening ${a.listening ?? "—"} · Reading ${a.reading ?? "—"} · Writing ${a.writing ?? "—"} · Speaking ${a.speaking ?? "—"} · Média ${mediaAssessment(a) !== null ? mediaAssessment(a).toFixed(1) : "—"}</div>
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-small" data-edit-assessment="${a.id}">Editar</button>
        <button class="btn btn-danger btn-small" data-del-assessment="${a.id}">Excluir</button>
      </div>
    </div>
  `).join("") : `<div class="empty-state">Nenhum nivelamento registrado com esse filtro.</div>`;
  wireAssessmentRowButtons();
}

function submitAssessment(e) {
  e.preventDefault();
  const id = document.getElementById("a-id").value || uid();
  const data = {
    id,
    alunoId: document.getElementById("a-aluno").value,
    data: document.getElementById("a-data").value,
    listening: document.getElementById("a-listening").value,
    reading: document.getElementById("a-reading").value,
    writing: document.getElementById("a-writing").value,
    speaking: document.getElementById("a-speaking").value,
    obs: document.getElementById("a-obs").value.trim()
  };
  if (!data.alunoId || !data.data) return;
  let list = assessments();
  const idx = list.findIndex(x => x.id === id);
  if (idx >= 0) list[idx] = data; else list.push(data);
  saveAssessments(list);
  clearFormDraft("assessment-form");
  toast("Nivelamento salvo.");
  render();
}

// ===== DASHBOARD =====
function renderDashboard() {
  const stAtivos = students().filter(s => s.status === "Ativo" || !s.status);
  const ls = lessons();
  const mk = makeups();
  const totalPresente = ls.filter(l => l.presenca === "Presente").length;
  const totalFalta = ls.filter(l => l.presenca === "Falta").length;
  const pendentes = mk.filter(m => m.status === "Pendente").length;
  const nivelVencidos = stAtivos.filter(s => statusNivelamentoAluno(s).status === "Vencido").length;

  const perStudent = stAtivos.map(s => {
    const mine = ls.filter(l => l.alunoId === s.id);
    const pres = mine.filter(l => l.presenca === "Presente").length;
    const falt = mine.filter(l => l.presenca === "Falta").length;
    const total = mine.length;
    const pct = total ? Math.round((pres / total) * 100) : null;
    const pend = mk.filter(m => m.alunoId === s.id && m.status === "Pendente").length;
    return { nome: s.nome, total, falt, pct, pend };
  });

  const rowsHtml = perStudent.length ? perStudent.map(p => `
    <tr>
      <td>${esc(p.nome)}</td>
      <td>${p.total}</td>
      <td>${p.falt}</td>
      <td>
        ${p.pct === null ? "—" : p.pct + "%"}
        ${p.pct !== null ? `<div class="pct-bar-bg"><div class="pct-bar-fill" style="width:${p.pct}%"></div></div>` : ""}
      </td>
      <td>${p.pend}</td>
    </tr>
  `).join("") : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px 0">Sem alunos ativos com dados ainda.</td></tr>`;

  return `
    <div class="card">
      <h2>Visão geral</h2>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num">${totalPresente}</div><div class="stat-label">Aulas dadas</div></div>
        <div class="stat-box"><div class="stat-num">${totalFalta}</div><div class="stat-label">Faltas</div></div>
        <div class="stat-box"><div class="stat-num">${pendentes}</div><div class="stat-label">Reposições pendentes</div></div>
        <div class="stat-box"><div class="stat-num">${nivelVencidos}</div><div class="stat-label">Nivelamentos vencidos</div></div>
      </div>
    </div>
    <div class="card">
      <h2>Por aluno <span class="count">somente ativos</span></h2>
      <table class="student-table">
        <thead><tr><th>Aluno</th><th>Aulas</th><th>Faltas</th><th>% Presença</th><th>Repos. pend.</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="card">
      <h2>Feriados e pausas combinadas</h2>
      <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 8px">Anote aqui as pausas combinadas com os alunos, conforme cláusula de feriados do contrato.</p>
      <textarea id="feriados-notas" placeholder="Ex: Sem aula de 22/12 a 05/01 — recesso de fim de ano combinado com todos os alunos.">${esc(localStorage.getItem("gf_feriados") || "")}</textarea>
      <button class="btn btn-ghost btn-small" id="btn-salvar-feriados" style="margin-top:8px">Salvar nota</button>
    </div>
    <div class="card">
      <h2>Backup dos dados</h2>
      <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 10px">
        Este app guarda os dados só neste dispositivo/navegador. Para levar os dados para outro aparelho, exporte aqui e importe lá.
      </p>
      <button class="btn btn-primary btn-small" id="btn-export">Exportar backup (.json)</button>
      <button class="btn btn-ghost btn-small" id="btn-import-trigger" style="margin-left:8px">Importar backup</button>
      <input type="file" id="file-import" accept=".json" style="display:none">
    </div>
  `;
}

// ===== RESUMO IA =====
function renderResumoIA() {
  const opts = students().map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join("");
  return `
    <div class="card">
      <h2>Resumo para colar no Claude</h2>
      <label>Aluno</label>
      <select id="ia-aluno">
        <option value="">Selecione um aluno</option>
        <option value="__todos__">Todos</option>
        ${opts}
      </select>
      <button class="btn btn-primary btn-small" id="btn-gerar-ia" style="margin-top:10px">Gerar resumo</button>
      <div id="ia-result" style="margin-top:14px"></div>
    </div>
  `;
}

function construirResumoAluno(alunoId) {
  const nome = studentName(alunoId);
  const mine = lessons().filter(l => l.alunoId === alunoId);
  const temas = [...new Set(mine.flatMap(l => [...(l.temposVerbais || []), ...(l.subtemas || []), l.subtemaOutro, l.tema].filter(Boolean)))];
  const dificuldades = [...new Set(mine.flatMap(l => [...(l.dificuldades || []), l.dificuldadeOutra, l.dificuldade].filter(Boolean)))];
  const faltas = mine.filter(l => l.presenca === "Falta").length;
  const pend = makeups().filter(m => m.alunoId === alunoId && m.status === "Pendente").length;
  const nivel = students().find(s => s.id === alunoId)?.nivel || "não informado";

  const freq = {};
  dificuldades.forEach(d => { const k = d.trim().toLowerCase(); freq[k] = (freq[k] || 0) + 1; });
  mine.forEach(l => (l.dificuldades || []).forEach(d => { const k = d.trim().toLowerCase(); freq[k] = (freq[k] || 0) + 1; }));
  const recorrentes = Object.entries(freq).filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} (${c}x)`);
  const ultimas5 = mine.slice().sort((a, b) => (b.data || "").localeCompare(a.data || "")).slice(0, 5);
  const habilidadesRecentes = new Set(ultimas5.flatMap(l => l.habilidades && l.habilidades.length ? l.habilidades : (l.habilidade ? [l.habilidade] : [])));
  const habilidadesEsquecidas = SKILLS.filter(s => !habilidadesRecentes.has(s));
  const ultimaAssessment = assessments().filter(a => a.alunoId === alunoId).sort((a, b) => (b.data || "").localeCompare(a.data || ""))[0];

  const texto =
`Aluno: ${nome}
Nível: ${nivel}
Aulas registradas: ${mine.length}
Faltas: ${faltas}
Reposições pendentes: ${pend}
Temas já abordados: ${temas.length ? temas.join("; ") : "nenhum registrado"}
Dificuldades observadas: ${dificuldades.length ? dificuldades.join("; ") : "nenhuma registrada"}
Dificuldades recorrentes (repetidas): ${recorrentes.length ? recorrentes.join("; ") : "nenhuma"}
Habilidades sem prática recente: ${habilidadesEsquecidas.length ? habilidadesEsquecidas.join(", ") : "nenhuma"}
Último nivelamento: ${ultimaAssessment ? `${fmtDate(ultimaAssessment.data)}, média ${mediaAssessment(ultimaAssessment)?.toFixed(1) ?? "—"}` : "nenhum registrado"}`;

  return { nome, texto, recorrentes, habilidadesEsquecidas };
}

function gerarResumoIA() {
  const alunoId = document.getElementById("ia-aluno").value;
  const box = document.getElementById("ia-result");
  if (!alunoId) { box.innerHTML = ""; return; }

  if (alunoId === "__todos__") {
    const blocos = students().map(s => construirResumoAluno(s.id).texto);
    const textoFinal = blocos.join("\n\n=====================\n\n") || "Nenhum aluno cadastrado.";
    box.innerHTML = `
      <div class="ia-output">${esc(textoFinal)}</div>
      <button class="btn btn-ghost btn-small" id="btn-copiar-ia" style="margin-top:10px">Copiar texto</button>
    `;
    document.getElementById("btn-copiar-ia").addEventListener("click", () => {
      navigator.clipboard.writeText(textoFinal).then(() => toast("Copiado! Cole no chat com o Claude."));
    });
    return;
  }

  const { texto, recorrentes, habilidadesEsquecidas } = construirResumoAluno(alunoId);
  const sugestaoHtml = `
    <div class="card" style="margin-top:0">
      <h2>Sugestão automática <span class="count">sem IA · grátis</span></h2>
      <p style="font-size:12.5px;margin:0 0 8px"><strong>Dificuldade recorrente:</strong> ${recorrentes.length ? esc(recorrentes.slice(0, 3).join("; ")) : "nenhuma dificuldade repetida ainda registrada."}</p>
      <p style="font-size:12.5px;margin:0"><strong>Habilidades sem prática nas últimas 5 aulas:</strong> ${habilidadesEsquecidas.length ? esc(habilidadesEsquecidas.join(", ")) : "todas praticadas recentemente."}</p>
    </div>
  `;
  const textoFinal = texto + `\n\n---\nPrompt sugerido: "Com base neste histórico, monte um plano para as próximas 3 aulas, priorizando as dificuldades recorrentes e as habilidades sem prática recente, evitando repetir os temas já abordados, adequado ao nível do aluno."`;

  box.innerHTML = sugestaoHtml + `
    <div class="ia-output">${esc(textoFinal)}</div>
    <button class="btn btn-ghost btn-small" id="btn-copiar-ia" style="margin-top:10px">Copiar texto</button>
  `;
  document.getElementById("btn-copiar-ia").addEventListener("click", () => {
    navigator.clipboard.writeText(textoFinal).then(() => toast("Copiado! Cole no chat com o Claude."));
  });
}

// ===== Handlers de linha (edição/exclusão) =====
function wireStudentRowButtons() {
  document.querySelectorAll("[data-edit-student]").forEach(b => b.addEventListener("click", () => {
    const s = students().find(x => x.id === b.dataset.editStudent);
    if (!s) return;
    document.getElementById("s-id").value = s.id;
    document.getElementById("s-nome").value = s.nome;
    document.getElementById("s-nivel").value = s.nivel || "";
    document.getElementById("s-status").value = s.status || "Ativo";
    document.getElementById("s-horario").value = s.horario || "";
    document.getElementById("s-contato").value = s.contato || "";
    document.getElementById("s-freq").value = s.freq || "";
    document.getElementById("student-form-title").textContent = "Editar aluno";
    captureFormDraft("student-form");
    document.getElementById("student-form-card").scrollIntoView({ behavior: "smooth" });
  }));
  document.querySelectorAll("[data-del-student]").forEach(b => b.addEventListener("click", () => {
    if (!confirm("Excluir este aluno? O histórico de aulas dele não será apagado.")) return;
    saveStudents(students().filter(s => s.id !== b.dataset.delStudent));
    toast("Aluno excluído.");
    if (alunosBuscou) buscarAlunos(); else render();
  }));
}

function wireLessonRowButtons() {
  document.querySelectorAll("[data-edit-lesson]").forEach(b => b.addEventListener("click", () => {
    const l = lessons().find(x => x.id === b.dataset.editLesson);
    if (!l) return;
    document.getElementById("l-id").value = l.id;
    document.getElementById("l-data").value = l.data || "";
    document.getElementById("l-aluno").value = l.alunoId || "";
    document.getElementById("l-presenca").value = l.presenca || "Presente";
    document.getElementById("l-atraso15").checked = !!l.atraso15;
    toggleFaltaExtra();
    if (l.aviso24h) document.getElementById("l-aviso24h").value = l.aviso24h;
    setMultiSelect("l-habilidades", l.habilidades && l.habilidades.length ? l.habilidades : (l.habilidade ? [l.habilidade] : []));
    setMultiSelect("l-tempos", l.temposVerbais || []);
    setMultiSelect("l-subtemas", l.subtemas || []);
    document.getElementById("l-sub-outro").value = l.subtemaOutro || "";
    setMultiSelect("l-dificuldades", l.dificuldades || []);
    document.getElementById("l-dif-outra").value = l.dificuldadeOutra || l.dificuldade || "";
    document.getElementById("lesson-form-title").textContent = "Editar aula";
    captureFormDraft("lesson-form");
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }));
  document.querySelectorAll("[data-del-lesson]").forEach(b => b.addEventListener("click", () => {
    if (!confirm("Excluir este registro de aula?")) return;
    saveLessons(lessons().filter(l => l.id !== b.dataset.delLesson));
    toast("Registro excluído.");
    render();
  }));
}

function wireAssessmentRowButtons() {
  document.querySelectorAll("[data-edit-assessment]").forEach(b => b.addEventListener("click", () => {
    const a = assessments().find(x => x.id === b.dataset.editAssessment);
    if (!a) return;
    document.getElementById("a-id").value = a.id;
    document.getElementById("a-aluno").value = a.alunoId || "";
    document.getElementById("a-data").value = a.data || "";
    document.getElementById("a-listening").value = a.listening || "";
    document.getElementById("a-reading").value = a.reading || "";
    document.getElementById("a-writing").value = a.writing || "";
    document.getElementById("a-speaking").value = a.speaking || "";
    document.getElementById("a-obs").value = a.obs || "";
    document.getElementById("assessment-form-title").textContent = "Editar nivelamento";
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }));
  document.querySelectorAll("[data-del-assessment]").forEach(b => b.addEventListener("click", () => {
    if (!confirm("Excluir este nivelamento?")) return;
    saveAssessments(assessments().filter(a => a.id !== b.dataset.delAssessment));
    toast("Nivelamento excluído.");
    render();
  }));
}

// ===== Handlers gerais =====
function attachHandlers() {
  const sf = document.getElementById("student-form");
  if (sf) { sf.addEventListener("submit", submitStudent); wireDraft("student-form"); }
  const btnBuscarAluno = document.getElementById("btn-buscar-aluno");
  if (btnBuscarAluno) btnBuscarAluno.addEventListener("click", buscarAlunos);
  wireStudentRowButtons();

  const lf = document.getElementById("lesson-form");
  if (lf) { lf.addEventListener("submit", submitLesson); wireDraft("lesson-form"); }
  const btnLimparAula = document.getElementById("btn-limpar-aula");
  if (btnLimparAula) btnLimparAula.addEventListener("click", limparFormularioAula);

  const lPresenca = document.getElementById("l-presenca");
  if (lPresenca) lPresenca.addEventListener("change", toggleFaltaExtra);
  toggleFaltaExtra();

  const btnBuscarAulas = document.getElementById("btn-buscar-aulas");
  if (btnBuscarAulas) btnBuscarAulas.addEventListener("click", buscarAulasAnteriores);
  wireLessonRowButtons();

  const mf = document.getElementById("makeup-form");
  if (mf) { mf.addEventListener("submit", submitMakeup); wireDraft("makeup-form"); }
  document.querySelectorAll("[data-edit-makeup]").forEach(b => b.addEventListener("click", () => {
    const m = makeups().find(x => x.id === b.dataset.editMakeup);
    if (!m) return;
    document.getElementById("m-id").value = m.id;
    document.getElementById("m-aluno").value = m.alunoId || "";
    document.getElementById("m-data-perdida").value = m.dataPerdida || "";
    document.getElementById("m-data-agendada").value = m.dataAgendada || "";
    document.getElementById("m-horario").value = m.horario || "";
    document.getElementById("m-status").value = m.status || "Pendente";
    if (m.motivo) document.getElementById("m-motivo").value = m.motivo;
    document.getElementById("m-obs").value = m.obs || "";
    document.getElementById("makeup-form-title").textContent = "Editar reposição";
    captureFormDraft("makeup-form");
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }));
  document.querySelectorAll("[data-del-makeup]").forEach(b => b.addEventListener("click", () => {
    if (!confirm("Excluir esta reposição?")) return;
    saveMakeups(makeups().filter(m => m.id !== b.dataset.delMakeup));
    toast("Reposição excluída.");
    render();
  }));

  const af = document.getElementById("assessment-form");
  if (af) { af.addEventListener("submit", submitAssessment); wireDraft("assessment-form"); }
  const btnBuscarNivelStatus = document.getElementById("btn-buscar-nivel-status");
  if (btnBuscarNivelStatus) btnBuscarNivelStatus.addEventListener("click", buscarStatusPorAluno);
  const filtroNivelAno = document.getElementById("filtro-nivel-ano");
  const filtroNivelSem = document.getElementById("filtro-nivel-semestre");
  if (filtroNivelAno) filtroNivelAno.addEventListener("change", renderNivelListaFiltrada);
  if (filtroNivelSem) filtroNivelSem.addEventListener("change", renderNivelListaFiltrada);
  wireAssessmentRowButtons();

  const btnGerar = document.getElementById("btn-gerar-ia");
  if (btnGerar) btnGerar.addEventListener("click", gerarResumoIA);

  const btnFeriados = document.getElementById("btn-salvar-feriados");
  if (btnFeriados) btnFeriados.addEventListener("click", () => {
    localStorage.setItem("gf_feriados", document.getElementById("feriados-notas").value);
    toast("Nota salva.");
  });

  const btnTheme = document.getElementById("btn-theme");
  if (btnTheme) btnTheme.addEventListener("click", toggleTheme);

  const btnExport = document.getElementById("btn-export");
  if (btnExport) btnExport.addEventListener("click", () => {
    const backup = { students: students(), lessons: lessons(), makeups: makeups(), assessments: assessments(), exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup-controle-aulas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Backup exportado.");
  });

  const btnImportTrigger = document.getElementById("btn-import-trigger");
  const fileInput = document.getElementById("file-import");
  if (btnImportTrigger) btnImportTrigger.addEventListener("click", () => fileInput.click());
  if (fileInput) fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!confirm("Importar vai SUBSTITUIR todos os dados atuais deste dispositivo. Continuar?")) return;
        saveStudents(data.students || []);
        saveLessons(data.lessons || []);
        saveMakeups(data.makeups || []);
        saveAssessments(data.assessments || []);
        toast("Backup importado com sucesso.");
        render();
      } catch {
        alert("Arquivo inválido.");
      }
    };
    reader.readAsText(file);
  });
}

// ===== Service Worker + instalação =====
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}

let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
});

initTheme();
render();
