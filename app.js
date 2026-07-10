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
  return (str || "").toString().replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function slug(s) {
  return (s || "").toString().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
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
const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex"];
const WEEKDAY_LABELS = { Seg: "Segunda", Ter: "Terça", Qua: "Quarta", Qui: "Quinta", Sex: "Sexta" };

function generateTimeSlots(startHour, endHour, stepMin) {
  const slots = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += stepMin) {
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}
const TIME_SLOTS = generateTimeSlots(7, 22, 15);

// ===== Regras do contrato =====
function toLocalISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toLocalISO(d);
}
function addMonths(dateStr, months) {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return toLocalISO(d);
}
function monthKeyOf(dateStr) { return dateStr ? dateStr.slice(0, 7) : "sem-data"; }
function hojeISO() { return toLocalISO(new Date()); }

function prazoInfo(m) {
  if (!m.dataPerdida) return { prazo: null, expirada: false, diasRestantes: null };
  const prazo = addDays(m.dataPerdida, 21);
  const expirada = !m.dataAgendada && hojeISO() > prazo;
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
    semCota.forEach(e => { resultado[e.id] = { label: "Grátis", detalhe: "falta do professor — não conta na cota do aluno" }; });
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
function captureFormDraft(formId, storageKey) {
  storageKey = storageKey || formId;
  const form = document.getElementById(formId);
  if (!form) return;
  const data = {};
  form.querySelectorAll("input, select, textarea").forEach(el => {
    if (!el.id) return;
    if (el.tagName === "SELECT" && el.multiple) data[el.id] = Array.from(el.selectedOptions).map(o => o.value);
    else if (el.type === "checkbox") data[el.id] = el.checked;
    else data[el.id] = el.value;
  });
  localStorage.setItem("gf_draft_" + storageKey, JSON.stringify(data));
}
function restoreFormDraft(formId, storageKey) {
  storageKey = storageKey || formId;
  const raw = localStorage.getItem("gf_draft_" + storageKey);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    const form = document.getElementById(formId);
    if (!form) return;
    Object.entries(data).forEach(([id, val]) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === "SELECT" && el.multiple) Array.from(el.options).forEach(o => { o.selected = Array.isArray(val) && val.includes(o.value); });
      else if (el.type === "checkbox") el.checked = val;
      else el.value = val;
    });
  } catch {}
}
function clearFormDraft(storageKey) { localStorage.removeItem("gf_draft_" + storageKey); }
function wireDraft(formId, storageKey) {
  const form = document.getElementById(formId);
  if (!form) return;
  restoreFormDraft(formId, storageKey);
  form.addEventListener("input", () => captureFormDraft(formId, storageKey));
  form.addEventListener("change", () => captureFormDraft(formId, storageKey));
}
function lessonDraftKey() {
  return aulaSelecionada ? `lesson-form::${aulaSelecionada.alunoId}::${aulaSelecionada.data}` : "lesson-form::none";
}

// ===== Dropdown de múltipla seleção =====
function multiDropdownHtml(name, items, selected) {
  selected = selected || [];
  const optionsHtml = items.map(item => {
    const id = `${name}-${slug(item)}`;
    return `<label class="dd-option"><input type="checkbox" id="${id}" class="${name}-opt" data-value="${esc(item)}" ${selected.includes(item) ? "checked" : ""}><span>${esc(item)}</span></label>`;
  }).join("");
  return `
    <div class="multi-dropdown" data-name="${name}">
      <button type="button" class="multi-dropdown-toggle" data-name="${name}">
        <span id="${name}-label">Selecionar...</span><span class="chevron">▾</span>
      </button>
      <div class="multi-dropdown-panel section-hidden" id="${name}-panel">${optionsHtml}</div>
    </div>`;
}
function readMultiDropdown(name) {
  return Array.from(document.querySelectorAll(`.${name}-opt:checked`)).map(el => el.dataset.value);
}
function updateDropdownLabel(name) {
  const vals = readMultiDropdown(name);
  const label = document.getElementById(`${name}-label`);
  if (!label) return;
  label.textContent = vals.length === 0 ? "Selecionar..." : vals.length <= 2 ? vals.join(", ") : `${vals.length} selecionadas`;
}
function wireMultiDropdown(name) {
  const toggle = document.querySelector(`.multi-dropdown-toggle[data-name="${name}"]`);
  const panel = document.getElementById(`${name}-panel`);
  if (!toggle || !panel) return;
  updateDropdownLabel(name);
  toggle.addEventListener("click", (ev) => {
    ev.stopPropagation();
    const isHidden = panel.classList.contains("section-hidden");
    document.querySelectorAll(".multi-dropdown-panel").forEach(p => p.classList.add("section-hidden"));
    if (isHidden) panel.classList.remove("section-hidden");
  });
  panel.addEventListener("click", ev => ev.stopPropagation());
  panel.querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.addEventListener("change", () => updateDropdownLabel(name));
  });
}

// ===== Navegação por abas e estado =====
let currentTab = "alunos";
let filtroAnteriores = { aluno: "", mes: "", ano: "" };
let aulasAnterioresBuscou = false;
let alunosBuscou = false;
let nivelStatusBuscou = false;
let semanaOffset = 0;
let aulaSelecionada = null; // { alunoId, data, horario, lessonId }
let dashboardFiltro = { ano: "", semestre: "", mes: "" };
let dashboardStatusFiltro = "Ativo";

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
  const classeNome = s.status === "Inativo" ? "aluno-inativo" : s.status === "Trancado" ? "aluno-trancado" : "";
  const tagClasse = s.status === "Inativo" ? "tag-pendente" : s.status === "Trancado" ? "tag-trancado" : "";
  return `
    <div class="row-item">
      <div class="row-main">
        <div class="row-title ${classeNome}">${esc(s.nome)}
          <span class="tag tag-nivel">${esc(s.nivel || "—")}</span>
          ${s.status && s.status !== "Ativo" ? `<span class="tag ${tagClasse}">${esc(s.status)}</span>` : ""}
        </div>
        <div class="row-sub">${(s.diasSemana || []).join(", ") || "sem dia fixo"}${s.horarioSlot ? " · " + esc(s.horarioSlot) : ""}${s.aniversario ? " · 🎂 " + esc(s.aniversario) : ""}</div>
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-small" data-edit-student="${s.id}">Editar</button>
        <button class="btn btn-danger btn-small" data-del-student="${s.id}">Excluir</button>
      </div>
    </div>`;
}

function renderAlunos() {
  const dias31 = Array.from({ length: 31 }, (_, i) => i + 1);
  const meses = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `
    <div class="split-2col">
      <div class="card panel-fixed" id="student-form-card">
        <h2 id="student-form-title">Novo aluno</h2>
        <form id="student-form">
          <input type="hidden" id="s-id">
          <input type="hidden" id="s-dias-semana" value="">
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
          <label>Dias da semana</label>
          <div class="weekday-picker">
            ${WEEKDAYS.map(dia => `<div class="weekday-option" data-value="${dia}">${dia}</div>`).join("")}
          </div>
          <label>Horário</label>
          <select id="s-horario">
            <option value="">—</option>
            ${TIME_SLOTS.map(t => `<option>${t}</option>`).join("")}
          </select>
          <div class="grid-2">
            <div><label>Aniversário — dia</label>
              <select id="s-aniv-dia"><option value="">—</option>${dias31.map(d => `<option>${d}</option>`).join("")}</select>
            </div>
            <div><label>Aniversário — mês</label>
              <select id="s-aniv-mes"><option value="">—</option>${meses.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("")}</select>
            </div>
          </div>
          <label>Contato (WhatsApp)</label>
          <input type="text" id="s-contato">
          <div class="btn-row">
            <button type="submit" class="btn btn-primary">Salvar aluno</button>
            <button type="button" class="btn btn-primary" id="btn-limpar-novo-aluno">Limpar</button>
          </div>
        </form>
      </div>

      <div class="card panel-grow">
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
        <div class="btn-row">
          <button type="button" class="btn btn-primary btn-small" id="btn-buscar-aluno">Buscar</button>
          <button type="button" class="btn btn-primary btn-small" id="btn-limpar-aluno">Limpar</button>
        </div>
        <div id="alunos-resultado" class="panel-scroll" style="margin-top:16px">${alunosBuscou ? renderAlunosResultadoAtual() : `<div class="empty-state">Use os filtros acima e clique em Buscar para ver os alunos cadastrados.</div>`}</div>
      </div>
    </div>
  `;
}

function renderAlunosResultadoAtual() {
  const nome = (document.getElementById("busca-aluno-nome")?.value || "").trim().toLowerCase();
  const nivel = document.getElementById("busca-aluno-nivel")?.value || "";
  const status = document.getElementById("busca-aluno-status")?.value || "";
  let list = students();
  if (nome) list = list.filter(s => s.nome.toLowerCase().includes(nome));
  if (nivel) list = list.filter(s => s.nivel === nivel);
  if (status) list = list.filter(s => s.status === status);
  list.sort((a, b) => {
    const rank = s => (s.status === "Ativo" || !s.status) ? 0 : 1;
    const r = rank(a) - rank(b);
    return r !== 0 ? r : a.nome.localeCompare(b.nome);
  });
  return list.length ? list.map(renderAlunoRow).join("") : `<div class="empty-state">Nenhum aluno encontrado com esse filtro.</div>`;
}

function buscarAlunos() {
  alunosBuscou = true;
  const box = document.getElementById("alunos-resultado");
  box.innerHTML = renderAlunosResultadoAtual();
  wireStudentRowButtons();
}
function limparBuscaAlunos() {
  document.getElementById("busca-aluno-nome").value = "";
  document.getElementById("busca-aluno-nivel").value = "";
  document.getElementById("busca-aluno-status").value = "";
  alunosBuscou = false;
  document.getElementById("alunos-resultado").innerHTML = `<div class="empty-state">Use os filtros acima e clique em Buscar para ver os alunos cadastrados.</div>`;
}
function limparNovoAluno() {
  clearFormDraft("student-form");
  toast("Formulário limpo.");
  render();
}

function wireWeekdayPicker() {
  const hidden = document.getElementById("s-dias-semana");
  const selecionadosAtuais = hidden ? (hidden.value || "").split(",").filter(Boolean) : [];
  document.querySelectorAll(".weekday-option").forEach(el => {
    el.classList.toggle("selected", selecionadosAtuais.includes(el.dataset.value));
    el.addEventListener("click", () => {
      el.classList.toggle("selected");
      const selecionados = Array.from(document.querySelectorAll(".weekday-option.selected")).map(o => o.dataset.value);
      if (hidden) hidden.value = selecionados.join(",");
      captureFormDraft("student-form");
    });
  });
}

function submitStudent(e) {
  e.preventDefault();
  const id = document.getElementById("s-id").value || uid();
  const diasSemana = (document.getElementById("s-dias-semana").value || "").split(",").filter(Boolean);
  const anivDia = document.getElementById("s-aniv-dia").value;
  const anivMes = document.getElementById("s-aniv-mes").value;
  const data = {
    id,
    nome: document.getElementById("s-nome").value.trim(),
    nivel: document.getElementById("s-nivel").value,
    status: document.getElementById("s-status").value,
    diasSemana,
    horarioSlot: document.getElementById("s-horario").value,
    aniversario: (anivDia && anivMes) ? `${String(anivDia).padStart(2, "0")}/${String(anivMes).padStart(2, "0")}` : "",
    contato: document.getElementById("s-contato").value.trim()
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
function getMondayISO(offsetWeeks) {
  const d = new Date();
  const day = d.getDay();
  const diffToMonday = (day === 0 ? -6 : 1 - day);
  d.setDate(d.getDate() + diffToMonday + offsetWeeks * 7);
  return toLocalISO(d);
}
function weekDates(offsetWeeks) {
  const monday = new Date(getMondayISO(offsetWeeks) + "T00:00:00");
  const dates = [];
  for (let i = 0; i < 5; i++) { const d = new Date(monday); d.setDate(monday.getDate() + i); dates.push(toLocalISO(d)); }
  return dates;
}
function blocosDaSemana(offsetWeeks) {
  const dates = weekDates(offsetWeeks);
  const ativos = students().filter(s => s.status === "Ativo" || !s.status);
  const todasLessons = lessons();
  const porDia = {};
  dates.forEach((data, i) => {
    const diaCodigo = WEEKDAYS[i];
    let blocos = [];
    ativos.forEach(s => {
      if ((s.diasSemana || []).includes(diaCodigo) && s.horarioSlot) {
        const jaExiste = todasLessons.some(l => l.alunoId === s.id && l.data === data);
        if (!jaExiste) blocos.push({ alunoId: s.id, data, horario: s.horarioSlot, lessonId: null, status: null });
      }
    });
    todasLessons.filter(l => l.data === data).forEach(l => {
      blocos.push({ alunoId: l.alunoId, data, horario: l.horario || "—", lessonId: l.id, status: l.presenca });
    });
    blocos.sort((a, b) => (a.horario || "").localeCompare(b.horario || ""));
    porDia[diaCodigo] = { data, blocos };
  });
  return porDia;
}

function renderCalendarioSemanal() {
  const porDia = blocosDaSemana(semanaOffset);
  const statusClass = { "Presente": "slot-presente", "Falta": "slot-falta", "Reposição": "slot-reposicao", "Professor faltou": "slot-professor", "Feriado": "slot-feriado" };
  const dates = weekDates(semanaOffset);
  const label = `${fmtDate(dates[0])} – ${fmtDate(dates[4])}`;

  const cols = WEEKDAYS.map(dia => {
    const { data, blocos } = porDia[dia];
    const blocosHtml = blocos.length ? blocos.map(b => `
      <div class="week-slot ${b.status ? (statusClass[b.status] || "") : "slot-vazio"}"
           data-slot-aluno="${b.alunoId}" data-slot-data="${b.data}" data-slot-horario="${esc(b.horario)}" data-slot-lesson="${b.lessonId || ""}">
        <strong>${esc(b.horario)}</strong><br>${esc(studentName(b.alunoId))}${b.status ? ` · ${esc(b.status)}` : ""}
      </div>
    `).join("") : `<div class="week-empty-note">sem aulas</div>`;
    return `
      <div class="week-day-col">
        <div class="week-day-header">${WEEKDAY_LABELS[dia]}<br>${fmtDate(data)}</div>
        ${blocosHtml}
      </div>`;
  }).join("");

  return `
    <div class="card panel-grow">
      <h2>Calendário semanal <span class="count">${label}</span></h2>
      <div class="week-nav">
        <button type="button" class="btn btn-ghost btn-small" id="btn-semana-anterior">‹ Semana anterior</button>
        <button type="button" class="btn btn-ghost btn-small" id="btn-semana-hoje">Hoje</button>
        <button type="button" class="btn btn-ghost btn-small" id="btn-semana-proxima">Próxima semana ›</button>
      </div>
      <div class="week-grid panel-scroll">${cols}</div>
    </div>
  `;
}

function renderAulaSelecionada() {
  if (!aulaSelecionada) return `<div class="aula-selecionada-overlay"></div>`;
  const { alunoId, data, horario, lessonId } = aulaSelecionada;
  const lesson = lessonId ? lessons().find(l => l.id === lessonId) : null;
  const presencaAtual = lesson ? lesson.presenca : "Presente";

  return `
    <div class="aula-selecionada-overlay active">
    <div class="card" id="aula-selecionada-card">
      <h2>Aula selecionada
        <button type="button" class="btn btn-ghost btn-small" id="btn-fechar-aula-selecionada" style="margin-left:auto">Fechar</button>
      </h2>
      <p style="font-size:13px;margin:0 0 14px;color:var(--text-muted)">
        <strong style="color:var(--heading)">${esc(studentName(alunoId))}</strong> · ${fmtDate(data)} · ${esc(horario)}
      </p>
      <form id="lesson-form">
        <input type="hidden" id="l-id" value="${lesson ? lesson.id : ""}">
        <input type="hidden" id="l-aluno" value="${alunoId}">
        <input type="hidden" id="l-data" value="${data}">
        <input type="hidden" id="l-horario" value="${esc(horario)}">

        <label>Presença</label>
        <select id="l-presenca">
          ${["Presente", "Falta", "Reposição", "Professor faltou", "Feriado"].map(op => `<option ${presencaAtual === op ? "selected" : ""}>${op}</option>`).join("")}
        </select>

        <div id="falta-extra" class="section-hidden">
          <label>O aluno avisou com 24h ou mais de antecedência?</label>
          <select id="l-aviso24h">
            <option value="Sim" ${lesson?.aviso24h !== "Não" ? "selected" : ""}>Sim, avisou com 24h+ de antecedência</option>
            <option value="Não" ${lesson?.aviso24h === "Não" ? "selected" : ""}>Não — cancelou/faltou em cima da hora (&lt;24h)</option>
          </select>
          <p style="font-size:11.5px;color:var(--text-muted);margin:6px 0 0">
            Se marcar "Não": a aula conta como dada, o aluno perde o direito à remarcação grátis do mês, e a remarcação desta aula será cobrada à parte (R$80).
          </p>
        </div>
        <div id="prof-faltou-aviso" class="section-hidden">
          <p style="font-size:11.5px;color:var(--text-muted);margin:6px 0 0">Reposição criada automaticamente como <strong>grátis</strong> e não conta na cota mensal do aluno.</p>
        </div>
        <div id="feriado-aviso" class="section-hidden">
          <p style="font-size:11.5px;color:var(--text-muted);margin:6px 0 0">Feriado combinado: nenhuma reposição é gerada.</p>
        </div>

        <label>Habilidade(s) em foco</label>
        ${multiDropdownHtml("l-habilidades", SKILLS, lesson?.habilidades || [])}

        <label>Tempos verbais abordados</label>
        ${multiDropdownHtml("l-tempos", VERB_TENSES, lesson?.temposVerbais || [])}

        <label>Subtemas abordados</label>
        ${multiDropdownHtml("l-subtemas", SUBTHEMES, lesson?.subtemas || [])}
        <label class="field-followup">Outro subtema (opcional)</label>
        <input type="text" id="l-sub-outro" value="${esc(lesson?.subtemaOutro || "")}">

        <label>Dificuldade observada</label>
        ${multiDropdownHtml("l-dificuldades", DIFFICULTY_LIST, lesson?.dificuldades || [])}
        <label class="field-followup">Outra dificuldade (opcional)</label>
        <input type="text" id="l-dif-outra" value="${esc(lesson?.dificuldadeOutra || lesson?.dificuldade || "")}">

        <div class="btn-row">
          <button type="submit" class="btn btn-primary">Salvar aula</button>
          <button type="button" class="btn btn-primary" id="btn-limpar-aula">Limpar</button>
        </div>
      </form>
    </div>
    </div>
  `;
}

function renderHistoricoAulasCard() {
  const opts = students().map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join("");
  const anos = [...new Set(lessons().map(l => (l.data || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const meses = ["01-Jan", "02-Fev", "03-Mar", "04-Abr", "05-Mai", "06-Jun", "07-Jul", "08-Ago", "09-Set", "10-Out", "11-Nov", "12-Dez"];
  return `
    <div class="card panel-grow">
      <h2>Histórico de aulas</h2>
      <div class="grid-2">
        <div><label>Aluno</label><select id="filtro-aluno"><option value="">Todos</option>${opts}</select></div>
        <div><label>Ano</label><select id="filtro-ano"><option value="">Todos</option>${anos.map(a => `<option>${a}</option>`).join("")}</select></div>
      </div>
      <label>Mês</label>
      <select id="filtro-mes"><option value="">Todos</option>${meses.map(m => `<option value="${m.slice(0, 2)}">${m.slice(3)}</option>`).join("")}</select>
      <div class="btn-row">
        <button type="button" class="btn btn-primary btn-small" id="btn-buscar-aulas">Buscar</button>
        <button type="button" class="btn btn-primary btn-small" id="btn-limpar-aulas">Limpar</button>
      </div>
      <div id="aulas-anteriores-list" class="panel-scroll" style="margin-top:16px">${aulasAnterioresBuscou ? renderHistoricoAulasList() : `<div class="empty-state">Use os filtros acima e clique em Buscar.</div>`}</div>
    </div>
  `;
}

function renderHistoricoAulasList() {
  let list = lessons().slice();
  if (filtroAnteriores.aluno) list = list.filter(l => l.alunoId === filtroAnteriores.aluno);
  if (filtroAnteriores.ano) list = list.filter(l => (l.data || "").slice(0, 4) === filtroAnteriores.ano);
  if (filtroAnteriores.mes) list = list.filter(l => (l.data || "").slice(5, 7) === filtroAnteriores.mes);
  list = list.sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  if (!list.length) return `<div class="empty-state">Nenhuma aula encontrada com esse filtro.</div>`;

  const tagClassFor = { "Falta": "tag-falta", "Professor faltou": "tag-agendada", "Reposição": "tag-reposicao", "Feriado": "tag-nivel" };
  return list.map(l => {
    const tagClass = tagClassFor[l.presenca] || "tag-presente";
    const habilidades = l.habilidades && l.habilidades.length ? l.habilidades : (l.habilidade ? [l.habilidade] : []);
    const temaResumo = [...(l.temposVerbais || []), ...(l.subtemas || [])].filter(Boolean);
    if (l.subtemaOutro) temaResumo.push(l.subtemaOutro);
    return `
    <div class="row-item">
      <div class="row-main">
        <div class="row-title">${esc(studentName(l.alunoId))} <span class="tag ${tagClass}">${esc(l.presenca || "—")}</span></div>
        <div class="row-sub">${fmtDate(l.data)} ${l.horario ? "· " + esc(l.horario) : ""} · ${esc(habilidades.join(", ") || "—")} — ${esc(temaResumo.join(", ") || l.tema || "sem tema registrado")}</div>
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-small" data-edit-lesson="${l.id}">Editar</button>
        <button class="btn btn-danger btn-small" data-del-lesson="${l.id}">Excluir</button>
      </div>
    </div>`;
  }).join("");
}

function buscarHistoricoAulas() {
  filtroAnteriores.aluno = document.getElementById("filtro-aluno").value;
  filtroAnteriores.ano = document.getElementById("filtro-ano").value;
  filtroAnteriores.mes = document.getElementById("filtro-mes").value;
  aulasAnterioresBuscou = true;
  document.getElementById("aulas-anteriores-list").innerHTML = renderHistoricoAulasList();
  wireHistoricoRowButtons();
}
function limparHistoricoAulas() {
  filtroAnteriores = { aluno: "", mes: "", ano: "" };
  aulasAnterioresBuscou = false;
  document.getElementById("filtro-aluno").value = "";
  document.getElementById("filtro-ano").value = "";
  document.getElementById("filtro-mes").value = "";
  document.getElementById("aulas-anteriores-list").innerHTML = `<div class="empty-state">Use os filtros acima e clique em Buscar.</div>`;
}

function renderAulas() {
  return `<div class="split-2col split-aulas">${renderCalendarioSemanal()}${renderHistoricoAulasCard()}</div>${renderAulaSelecionada()}`;
}

function toggleFaltaExtra() {
  const sel = document.getElementById("l-presenca");
  if (!sel) return;
  const extra = document.getElementById("falta-extra");
  const profAviso = document.getElementById("prof-faltou-aviso");
  const feriadoAviso = document.getElementById("feriado-aviso");
  if (extra) extra.classList.toggle("section-hidden", sel.value !== "Falta");
  if (profAviso) profAviso.classList.toggle("section-hidden", sel.value !== "Professor faltou");
  if (feriadoAviso) feriadoAviso.classList.toggle("section-hidden", sel.value !== "Feriado");
  if (sel.value === "Falta" && document.getElementById("l-aviso24h") && !document.getElementById("l-aviso24h").value) {
    document.getElementById("l-aviso24h").value = "Sim";
  }
}

function limparFormularioAula() {
  clearFormDraft(lessonDraftKey());
  toast("Formulário limpo.");
  render();
  setTimeout(() => document.getElementById("aula-selecionada-card")?.scrollIntoView({ behavior: "smooth" }), 0);
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
    horario: document.getElementById("l-horario").value,
    habilidades: readMultiDropdown("l-habilidades"),
    temposVerbais: readMultiDropdown("l-tempos"),
    subtemas: readMultiDropdown("l-subtemas"),
    subtemaOutro: document.getElementById("l-sub-outro").value.trim(),
    presenca,
    aviso24h,
    dificuldades: readMultiDropdown("l-dificuldades"),
    dificuldadeOutra: document.getElementById("l-dif-outra").value.trim()
  };
  if (!data.alunoId || !data.data) return;
  let list = lessons();
  const idx = list.findIndex(x => x.id === id);
  const wasSpecial = idx >= 0 && (list[idx].presenca === "Falta" || list[idx].presenca === "Professor faltou");
  if (idx >= 0) list[idx] = data; else list.push(data);
  saveLessons(list);

  if ((data.presenca === "Falta" || data.presenca === "Professor faltou") && !wasSpecial) {
    const motivo = data.presenca === "Professor faltou" ? "Professor faltou" : (data.aviso24h === "Não" ? "Cancelamento (<24h)" : "Falta / cancelamento (aviso ≥24h)");
    let mk = makeups();
    mk.push({ id: uid(), alunoId: data.alunoId, dataPerdida: data.data, motivo, dataAgendada: "", horario: "", obs: "" });
    saveMakeups(mk);
    toast("Aula salva. Reposição pendente criada automaticamente.");
  } else {
    toast("Aula salva.");
  }
  clearFormDraft(lessonDraftKey());
  aulaSelecionada = null;
  render();
}

// ===== REPOSIÇÕES =====
function estadoReposicao(m) { return m.dataAgendada ? "Agendada" : "Pendente"; }

function renderReposicoes() {
  const cobrancas = mapaCobranca();
  const list = makeups().slice().sort((a, b) => {
    const ea = estadoReposicao(a), eb = estadoReposicao(b);
    if (ea === "Pendente" && eb !== "Pendente") return -1;
    if (eb === "Pendente" && ea !== "Pendente") return 1;
    return (b.dataPerdida || "").localeCompare(a.dataPerdida || "");
  });
  const opts = students().map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join("");
  const motivos = ["Falta / cancelamento (aviso ≥24h)", "Cancelamento (<24h)", "Professor faltou"];

  const rows = list.length ? list.map(m => {
    const cob = cobrancas[m.id] || { label: "—", detalhe: "" };
    const prazo = prazoInfo(m);
    const estado = estadoReposicao(m);
    return `
    <div class="row-item">
      <div class="row-main">
        <div class="row-title">${esc(studentName(m.alunoId))}
          <span class="tag ${estado === "Agendada" ? "tag-agendada" : "tag-pendente"}">${estado}</span>
          <span class="tag ${cob.label === "Grátis" ? "tag-concluida" : "tag-falta"}">${cob.label}</span>
          ${prazo.expirada ? `<span class="tag tag-falta">expirada</span>` : ""}
        </div>
        <div class="row-sub">Aula original: ${fmtDate(m.dataPerdida)}${m.dataAgendada ? " · reposição: " + fmtDate(m.dataAgendada) + (m.horario ? " às " + esc(m.horario) : "") : ""}</div>
        ${prazo.prazo ? `<div class="row-sub">Prazo p/ remarcar (21 dias): ${fmtDate(prazo.prazo)}${!prazo.expirada && prazo.diasRestantes !== null ? ` (${prazo.diasRestantes} dia(s) restante(s))` : ""}</div>` : ""}
        <div class="row-sub">${esc(m.motivo || "—")} · cobrança: ${cob.detalhe}</div>
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-small" data-marcar-makeup="${m.id}">Marcar reposição</button>
        <button class="btn btn-ghost btn-small" data-edit-makeup="${m.id}">Editar</button>
        <button class="btn btn-danger btn-small" data-del-makeup="${m.id}">Excluir</button>
      </div>
    </div>
  `;
  }).join("") : `<div class="empty-state"><div class="big">↺</div>Nenhuma reposição registrada.</div>`;

  return `
    <div class="split-2col">
      <div class="card panel-grow">
        <h2 id="makeup-form-title">Nova reposição</h2>
        <form id="makeup-form" class="panel-scroll">
          <input type="hidden" id="m-id">
          <label>Aluno</label>
          <select id="m-aluno" required><option value="">Selecione</option>${opts}</select>
          <div class="grid-2">
            <div><label>Data da aula perdida</label><input type="date" id="m-data-perdida"></div>
            <div><label>Motivo</label><select id="m-motivo">${motivos.map(mo => `<option>${mo}</option>`).join("")}</select></div>
          </div>
          <div class="grid-2">
            <div><label>Data reposição agendada</label><input type="date" id="m-data-agendada"></div>
            <div><label>Horário</label>
              <select id="m-horario"><option value="">—</option>${TIME_SLOTS.map(t => `<option>${t}</option>`).join("")}</select>
            </div>
          </div>
          <label>Observação</label>
          <textarea id="m-obs"></textarea>
          <div class="btn-row">
            <button type="submit" class="btn btn-primary">Salvar reposição</button>
            <button type="button" class="btn btn-primary" id="btn-limpar-reposicao">Limpar</button>
          </div>
        </form>
      </div>
      <div class="card panel-grow">
        <h2>Reposições <span class="count">${list.length}</span></h2>
        <p style="font-size:11.5px;color:var(--text-muted);margin:0 0 12px">
          Cobrança e prazo calculados automaticamente. Falta do professor nunca é cobrada nem entra na cota do aluno. Ao salvar com data e horário de reposição preenchidos, a aula entra automaticamente no calendário da aba Aulas.
        </p>
        <div class="panel-scroll">${rows}</div>
      </div>
    </div>
  `;
}

function preencherFormularioReposicao(m, travarCampos) {
  document.getElementById("m-id").value = m.id;
  document.getElementById("m-aluno").value = m.alunoId || "";
  document.getElementById("m-data-perdida").value = m.dataPerdida || "";
  document.getElementById("m-motivo").value = m.motivo || "";
  document.getElementById("m-data-agendada").value = m.dataAgendada || "";
  document.getElementById("m-horario").value = m.horario || "";
  document.getElementById("m-obs").value = m.obs || "";
  ["m-aluno", "m-data-perdida", "m-motivo"].forEach(id => { document.getElementById(id).disabled = !!travarCampos; });
  captureFormDraft("makeup-form");
}

function limparReposicao() {
  clearFormDraft("makeup-form");
  toast("Formulário limpo.");
  render();
}

function submitMakeup(e) {
  e.preventDefault();
  const id = document.getElementById("m-id").value || uid();
  const data = {
    id,
    alunoId: document.getElementById("m-aluno").value,
    dataPerdida: document.getElementById("m-data-perdida").value,
    dataAgendada: document.getElementById("m-data-agendada").value,
    horario: document.getElementById("m-horario").value,
    motivo: document.getElementById("m-motivo").value,
    obs: document.getElementById("m-obs").value.trim()
  };
  if (!data.alunoId) return;
  let list = makeups();
  const idx = list.findIndex(x => x.id === id);
  const existing = idx >= 0 ? list[idx] : null;
  let lessonId = existing?.lessonId || null;

  if (data.dataAgendada && data.horario) {
    let ls = lessons();
    const baseLesson = { alunoId: data.alunoId, data: data.dataAgendada, horario: data.horario, presenca: "Reposição", habilidades: [], temposVerbais: [], subtemas: [], subtemaOutro: "", dificuldades: [], dificuldadeOutra: "" };
    if (lessonId) {
      const lidx = ls.findIndex(l => l.id === lessonId);
      if (lidx >= 0) { ls[lidx] = { ...ls[lidx], ...baseLesson, id: lessonId }; }
      else { ls.push({ ...baseLesson, id: lessonId }); }
    } else {
      lessonId = uid();
      ls.push({ ...baseLesson, id: lessonId });
    }
    saveLessons(ls);
  }
  data.lessonId = lessonId;

  if (idx >= 0) list[idx] = data; else list.push(data);
  saveMakeups(list);
  clearFormDraft("makeup-form");
  toast(data.dataAgendada && data.horario ? "Reposição salva e incluída no calendário de Aulas." : "Reposição salva.");
  render();
}

// ===== NIVELAMENTO =====
function mediaAssessment(a) {
  const vals = [a.listening, a.reading, a.writing, a.speaking].map(Number).filter(v => !isNaN(v));
  if (!vals.length) return null;
  return vals.reduce((s, v) => s + v, 0) / vals.length;
}
function semestreOf(dateStr) { if (!dateStr) return null; return Number(dateStr.slice(5, 7)) <= 6 ? "1º semestre" : "2º semestre"; }
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
    if (r.status === "Em dia") emDia++; else if (r.status === "Sem nivelamento") semNivel++; else vencidos++;
  });

  const listaHtml = todos.length ? todos.slice().sort((a, b) => (b.data || "").localeCompare(a.data || "")).map(a => `
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
    <div class="split-2col">
      <div class="split-col">
        <div class="card panel-fixed">
          <h2>Painel indicativo <span class="count">alunos ativos</span></h2>
          <div class="stat-grid">
            <div class="stat-box success"><div class="stat-num">${emDia}</div><div class="stat-label">Em dia</div></div>
            <div class="stat-box warn"><div class="stat-num">${semNivel}</div><div class="stat-label">Sem nivelamento</div></div>
            <div class="stat-box danger" style="grid-column:1/-1"><div class="stat-num">${vencidos}</div><div class="stat-label">Nivelamento vencido</div></div>
          </div>
        </div>

        <div class="card panel-grow">
          <h2 id="assessment-form-title">Novo nivelamento</h2>
          <form id="assessment-form" class="panel-scroll">
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
            <div class="btn-row">
              <button type="submit" class="btn btn-primary">Salvar nivelamento</button>
              <button type="button" class="btn btn-primary" id="btn-limpar-nivelamento">Limpar</button>
            </div>
          </form>
        </div>
      </div>

      <div class="split-col">
        <div class="card panel-grow">
          <h2>Status por aluno</h2>
          <div class="grid-2">
            <div><label>Nome</label><input type="text" id="busca-nivel-nome"></div>
            <div><label>Status</label>
              <select id="busca-nivel-status"><option value="">Todos</option><option>Em dia</option><option>Sem nivelamento</option><option>Vencido</option></select>
            </div>
          </div>
          <div class="btn-row">
            <button type="button" class="btn btn-primary btn-small" id="btn-buscar-nivel-status">Buscar</button>
            <button type="button" class="btn btn-primary btn-small" id="btn-limpar-nivel-status">Limpar</button>
          </div>
          <div id="nivel-status-resultado" class="panel-scroll" style="margin-top:16px">${nivelStatusBuscou ? renderStatusPorAlunoResultado() : `<div class="empty-state">Use os filtros acima e clique em Buscar.</div>`}</div>
        </div>

        <div class="card panel-grow">
          <h2>Histórico de nivelamentos</h2>
          <div class="grid-2">
            <div><label>Ano</label><select id="filtro-nivel-ano"><option value="">Todos</option>${anos.map(a => `<option>${a}</option>`).join("")}</select></div>
            <div><label>Semestre</label>
              <select id="filtro-nivel-semestre"><option value="">Todos</option><option value="1">1º semestre</option><option value="2">2º semestre</option></select>
            </div>
          </div>
          <div id="nivel-lista" class="panel-scroll" style="margin-top:16px">${listaHtml}</div>
        </div>
      </div>
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
function limparStatusPorAluno() {
  document.getElementById("busca-nivel-nome").value = "";
  document.getElementById("busca-nivel-status").value = "";
  nivelStatusBuscou = false;
  document.getElementById("nivel-status-resultado").innerHTML = `<div class="empty-state">Use os filtros acima e clique em Buscar.</div>`;
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

function limparNivelamento() {
  clearFormDraft("assessment-form");
  toast("Formulário limpo.");
  render();
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
  const ls = lessons();
  const mk = makeups();
  let lsFiltrado = ls.slice();
  if (dashboardFiltro.ano) lsFiltrado = lsFiltrado.filter(l => (l.data || "").slice(0, 4) === dashboardFiltro.ano);
  if (dashboardFiltro.mes) lsFiltrado = lsFiltrado.filter(l => (l.data || "").slice(5, 7) === dashboardFiltro.mes);
  if (dashboardFiltro.semestre) lsFiltrado = lsFiltrado.filter(l => (Number((l.data || "").slice(5, 7)) <= 6 ? "1" : "2") === dashboardFiltro.semestre);

  const totalPresente = lsFiltrado.filter(l => l.presenca === "Presente").length;
  const totalFalta = lsFiltrado.filter(l => l.presenca === "Falta").length;
  const pendentes = mk.filter(m => estadoReposicao(m) === "Pendente").length;
  const nivelVencidos = students().filter(s => (s.status === "Ativo" || !s.status) && statusNivelamentoAluno(s).status === "Vencido").length;

  const anos = [...new Set(ls.map(l => (l.data || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const meses = ["01-Jan", "02-Fev", "03-Mar", "04-Abr", "05-Mai", "06-Jun", "07-Jul", "08-Ago", "09-Set", "10-Out", "11-Nov", "12-Dez"];

  const statusFiltro = dashboardStatusFiltro;
  let stFiltrados = students();
  if (statusFiltro !== "Todos") stFiltrados = stFiltrados.filter(s => (s.status || "Ativo") === statusFiltro);

  const perStudent = stFiltrados.map(s => {
    const mine = ls.filter(l => l.alunoId === s.id);
    const pres = mine.filter(l => l.presenca === "Presente").length;
    const falt = mine.filter(l => l.presenca === "Falta").length;
    const total = mine.length;
    const pct = total ? Math.round((pres / total) * 100) : null;
    const pend = mk.filter(m => m.alunoId === s.id && estadoReposicao(m) === "Pendente").length;
    return { nome: s.nome, total, falt, pct, pend };
  });

  const rowsHtml = perStudent.length ? perStudent.map(p => `
    <tr>
      <td>${esc(p.nome)}</td><td>${p.total}</td><td>${p.falt}</td>
      <td>${p.pct === null ? "—" : p.pct + "%"} ${p.pct !== null ? `<div class="pct-bar-bg"><div class="pct-bar-fill" style="width:${p.pct}%"></div></div>` : ""}</td>
      <td>${p.pend}</td>
    </tr>
  `).join("") : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px 0">Sem alunos com esse filtro.</td></tr>`;

  return `
    <div class="split-2col">
      <div class="card panel-grow">
        <h2>Por aluno</h2>
        <label>Status</label>
        <select id="dash-status-aluno" style="max-width:220px">
          ${["Ativo", "Inativo", "Trancado", "Todos"].map(s => `<option ${dashboardStatusFiltro === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
        <div class="panel-scroll" style="margin-top:16px">
          <table class="student-table">
            <thead><tr><th>Aluno</th><th>Aulas</th><th>Faltas</th><th>% Presença</th><th>Repos. pend.</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>

      <div class="split-col">
        <div class="card panel-grow">
          <h2>Visão geral</h2>
          <div class="grid-2">
            <div><label>Ano</label><select id="dash-filtro-ano"><option value="">Todos</option>${anos.map(a => `<option ${dashboardFiltro.ano === a ? "selected" : ""}>${a}</option>`).join("")}</select></div>
            <div><label>Semestre</label><select id="dash-filtro-semestre"><option value="">Todos</option><option value="1" ${dashboardFiltro.semestre === "1" ? "selected" : ""}>1º semestre</option><option value="2" ${dashboardFiltro.semestre === "2" ? "selected" : ""}>2º semestre</option></select></div>
          </div>
          <label>Mês</label>
          <select id="dash-filtro-mes"><option value="">Todos</option>${meses.map(m => `<option value="${m.slice(0, 2)}" ${dashboardFiltro.mes === m.slice(0, 2) ? "selected" : ""}>${m.slice(3)}</option>`).join("")}</select>
          <div class="btn-row">
            <button type="button" class="btn btn-primary btn-small" id="btn-buscar-dashboard">Buscar</button>
            <button type="button" class="btn btn-primary btn-small" id="btn-limpar-dashboard">Limpar</button>
          </div>
          <div class="stat-grid" style="margin-top:16px">
            <div class="stat-box"><div class="stat-num">${totalPresente}</div><div class="stat-label">Aulas dadas (período)</div></div>
            <div class="stat-box"><div class="stat-num">${totalFalta}</div><div class="stat-label">Faltas (período)</div></div>
            <div class="stat-box"><div class="stat-num">${pendentes}</div><div class="stat-label">Reposições pendentes</div></div>
            <div class="stat-box"><div class="stat-num">${nivelVencidos}</div><div class="stat-label">Nivelamentos vencidos</div></div>
          </div>
        </div>
        <div class="card panel-fixed">
          <h2>Backup dos dados</h2>
          <p style="font-size:12.5px;color:var(--text-muted);margin:0 0 10px">Este app guarda os dados só neste dispositivo/navegador. Para levar os dados para outro aparelho, exporte aqui e importe lá.</p>
          <div class="btn-row" style="margin-top:0">
            <button class="btn btn-primary btn-small" id="btn-export">Exportar backup (.json)</button>
            <button class="btn btn-primary btn-small" id="btn-import-trigger">Importar backup</button>
          </div>
          <input type="file" id="file-import" accept=".json" style="display:none">
        </div>
      </div>
    </div>
  `;
}

// ===== RESUMO IA =====
function renderResumoIA() {
  const opts = students().map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join("");
  const anos = [...new Set(makeups().map(m => (m.dataPerdida || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const meses = ["01-Jan", "02-Fev", "03-Mar", "04-Abr", "05-Mai", "06-Jun", "07-Jul", "08-Ago", "09-Set", "10-Out", "11-Nov", "12-Dez"];
  return `
    <div class="split-2col">
      <div class="card panel-grow">
        <h2>Resumo para colar no Claude</h2>
        <label>Aluno</label>
        <select id="ia-aluno"><option value="">Selecione um aluno</option><option value="__todos__">Todos</option>${opts}</select>
        <button class="btn btn-primary btn-small" id="btn-gerar-ia" style="margin-top:16px">Gerar resumo</button>
        <div id="ia-result" class="panel-scroll" style="margin-top:16px"></div>
      </div>
      <div class="card panel-grow">
        <h2>Relatório de reposições em aberto</h2>
        <div class="grid-2">
          <div><label>Aluno</label><select id="ia-rep-aluno"><option value="">Todos</option>${opts}</select></div>
          <div><label>Ano</label><select id="ia-rep-ano"><option value="">Todos</option>${anos.map(a => `<option>${a}</option>`).join("")}</select></div>
        </div>
        <label>Mês</label>
        <select id="ia-rep-mes"><option value="">Todos</option>${meses.map(m => `<option value="${m.slice(0, 2)}">${m.slice(3)}</option>`).join("")}</select>
        <button class="btn btn-primary btn-small" id="btn-gerar-ia-rep" style="margin-top:16px">Gerar relatório</button>
        <div id="ia-rep-result" class="panel-scroll" style="margin-top:16px"></div>
      </div>
    </div>
  `;
}

function gerarRelatorioReposicoesIA() {
  const alunoId = document.getElementById("ia-rep-aluno").value;
  const ano = document.getElementById("ia-rep-ano").value;
  const mes = document.getElementById("ia-rep-mes").value;
  const box = document.getElementById("ia-rep-result");
  const cobrancas = mapaCobranca();

  let list = makeups().filter(m => estadoReposicao(m) === "Pendente");
  if (alunoId) list = list.filter(m => m.alunoId === alunoId);
  if (ano) list = list.filter(m => (m.dataPerdida || "").slice(0, 4) === ano);
  if (mes) list = list.filter(m => (m.dataPerdida || "").slice(5, 7) === mes);
  list = list.sort((a, b) => (a.dataPerdida || "").localeCompare(b.dataPerdida || ""));

  if (!list.length) {
    box.innerHTML = `<div class="empty-state">Nenhuma reposição em aberto com esse filtro.</div>`;
    return;
  }

  const linhas = list.map(m => {
    const cob = cobrancas[m.id] || { label: "—", detalhe: "" };
    const prazo = prazoInfo(m);
    return `- ${studentName(m.alunoId)} | aula perdida em ${fmtDate(m.dataPerdida)} | motivo: ${m.motivo} | cobrança: ${cob.label} (${cob.detalhe}) | prazo p/ remarcar: ${prazo.prazo ? fmtDate(prazo.prazo) : "—"}${prazo.expirada ? " (EXPIRADA)" : prazo.diasRestantes !== null ? ` (${prazo.diasRestantes} dia(s) restante(s))` : ""}${m.obs ? " | obs: " + m.obs : ""}`;
  });

  const texto = `Relatório de reposições em aberto (${list.length})\n\n${linhas.join("\n")}`;

  box.innerHTML = `
    <div class="ia-output">${esc(texto)}</div>
    <button class="btn btn-ghost btn-small" id="btn-copiar-ia-rep" style="margin-top:16px">Copiar texto</button>
  `;
  document.getElementById("btn-copiar-ia-rep").addEventListener("click", () => {
    navigator.clipboard.writeText(texto).then(() => toast("Copiado! Cole no chat com o Claude."));
  });
}

function construirResumoAluno(alunoId) {
  const nome = studentName(alunoId);
  const mine = lessons().filter(l => l.alunoId === alunoId);
  const temas = [...new Set(mine.flatMap(l => [...(l.temposVerbais || []), ...(l.subtemas || []), l.subtemaOutro, l.tema].filter(Boolean)))];
  const dificuldades = [...new Set(mine.flatMap(l => [...(l.dificuldades || []), l.dificuldadeOutra, l.dificuldade].filter(Boolean)))];
  const faltas = mine.filter(l => l.presenca === "Falta").length;
  const pend = makeups().filter(m => m.alunoId === alunoId && estadoReposicao(m) === "Pendente").length;
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
    box.innerHTML = `<div class="ia-output">${esc(textoFinal)}</div><button class="btn btn-ghost btn-small" id="btn-copiar-ia" style="margin-top:16px">Copiar texto</button>`;
    document.getElementById("btn-copiar-ia").addEventListener("click", () => navigator.clipboard.writeText(textoFinal).then(() => toast("Copiado! Cole no chat com o Claude.")));
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

  box.innerHTML = sugestaoHtml + `<div class="ia-output">${esc(textoFinal)}</div><button class="btn btn-ghost btn-small" id="btn-copiar-ia" style="margin-top:16px">Copiar texto</button>`;
  document.getElementById("btn-copiar-ia").addEventListener("click", () => navigator.clipboard.writeText(textoFinal).then(() => toast("Copiado! Cole no chat com o Claude.")));
}

// ===== Handlers de linha =====
function wireStudentRowButtons() {
  document.querySelectorAll("[data-edit-student]").forEach(b => b.addEventListener("click", () => {
    const s = students().find(x => x.id === b.dataset.editStudent);
    if (!s) return;
    document.getElementById("s-id").value = s.id;
    document.getElementById("s-nome").value = s.nome;
    document.getElementById("s-nivel").value = s.nivel || "";
    document.getElementById("s-status").value = s.status || "Ativo";
    document.querySelectorAll(".weekday-option").forEach(el => { el.classList.toggle("selected", (s.diasSemana || []).includes(el.dataset.value)); });
    document.getElementById("s-dias-semana").value = (s.diasSemana || []).join(",");
    document.getElementById("s-horario").value = s.horarioSlot || "";
    const [ad, am] = (s.aniversario || "").split("/");
    document.getElementById("s-aniv-dia").value = ad ? String(Number(ad)) : "";
    document.getElementById("s-aniv-mes").value = am ? String(Number(am)) : "";
    document.getElementById("s-contato").value = s.contato || "";
    document.getElementById("student-form-title").textContent = "Editar aluno";
    captureFormDraft("student-form");
    document.getElementById("student-form-card").scrollIntoView({ behavior: "smooth" });
  }));
  document.querySelectorAll("[data-del-student]").forEach(b => b.addEventListener("click", () => {
    if (!confirm("Excluir este aluno? O histórico de aulas dele não será apagado.")) return;
    saveStudents(students().filter(s => s.id !== b.dataset.delStudent));
    toast("Aluno excluído.");
    if (alunosBuscou) { document.getElementById("alunos-resultado").innerHTML = renderAlunosResultadoAtual(); wireStudentRowButtons(); } else render();
  }));
}

function wireHistoricoRowButtons() {
  document.querySelectorAll("[data-edit-lesson]").forEach(b => b.addEventListener("click", () => {
    const l = lessons().find(x => x.id === b.dataset.editLesson);
    if (!l) return;
    aulaSelecionada = { alunoId: l.alunoId, data: l.data, horario: l.horario || "—", lessonId: l.id };
    render();
    setTimeout(() => document.getElementById("aula-selecionada-card")?.scrollIntoView({ behavior: "smooth" }), 0);
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
  // Alunos
  const sf = document.getElementById("student-form");
  if (sf) { sf.addEventListener("submit", submitStudent); wireDraft("student-form"); wireWeekdayPicker(); }
  const btnLimparNovoAluno = document.getElementById("btn-limpar-novo-aluno");
  if (btnLimparNovoAluno) btnLimparNovoAluno.addEventListener("click", limparNovoAluno);
  const btnBuscarAluno = document.getElementById("btn-buscar-aluno");
  if (btnBuscarAluno) btnBuscarAluno.addEventListener("click", buscarAlunos);
  const btnLimparAluno = document.getElementById("btn-limpar-aluno");
  if (btnLimparAluno) btnLimparAluno.addEventListener("click", limparBuscaAlunos);
  wireStudentRowButtons();

  // Aulas — calendário
  const prevBtn = document.getElementById("btn-semana-anterior");
  const nextBtn = document.getElementById("btn-semana-proxima");
  const todayBtn = document.getElementById("btn-semana-hoje");
  if (prevBtn) prevBtn.addEventListener("click", () => { semanaOffset--; render(); });
  if (nextBtn) nextBtn.addEventListener("click", () => { semanaOffset++; render(); });
  if (todayBtn) todayBtn.addEventListener("click", () => { semanaOffset = 0; render(); });
  document.querySelectorAll(".week-slot").forEach(el => el.addEventListener("click", () => {
    aulaSelecionada = { alunoId: el.dataset.slotAluno, data: el.dataset.slotData, horario: el.dataset.slotHorario, lessonId: el.dataset.slotLesson || null };
    render();
    setTimeout(() => document.getElementById("aula-selecionada-card")?.scrollIntoView({ behavior: "smooth" }), 0);
  }));

  // Aulas — formulário da aula selecionada
  const lf = document.getElementById("lesson-form");
  if (lf) {
    lf.addEventListener("submit", submitLesson);
    wireDraft("lesson-form", lessonDraftKey());
    ["l-habilidades", "l-tempos", "l-subtemas", "l-dificuldades"].forEach(wireMultiDropdown);
  }
  const btnFecharAula = document.getElementById("btn-fechar-aula-selecionada");
  if (btnFecharAula) btnFecharAula.addEventListener("click", () => { aulaSelecionada = null; render(); });
  const overlay = document.querySelector(".aula-selecionada-overlay.active");
  if (overlay) overlay.addEventListener("click", (ev) => { if (ev.target === overlay) { aulaSelecionada = null; render(); } });
  const btnLimparAula = document.getElementById("btn-limpar-aula");
  if (btnLimparAula) btnLimparAula.addEventListener("click", limparFormularioAula);
  const lPresenca = document.getElementById("l-presenca");
  if (lPresenca) lPresenca.addEventListener("change", toggleFaltaExtra);
  toggleFaltaExtra();

  // Aulas — histórico
  const btnBuscarAulas = document.getElementById("btn-buscar-aulas");
  if (btnBuscarAulas) btnBuscarAulas.addEventListener("click", buscarHistoricoAulas);
  const btnLimparAulas = document.getElementById("btn-limpar-aulas");
  if (btnLimparAulas) btnLimparAulas.addEventListener("click", limparHistoricoAulas);
  wireHistoricoRowButtons();

  // Reposições
  const mf = document.getElementById("makeup-form");
  if (mf) { mf.addEventListener("submit", submitMakeup); wireDraft("makeup-form"); }
  const btnLimparRep = document.getElementById("btn-limpar-reposicao");
  if (btnLimparRep) btnLimparRep.addEventListener("click", limparReposicao);
  document.querySelectorAll("[data-marcar-makeup]").forEach(b => b.addEventListener("click", () => {
    const m = makeups().find(x => x.id === b.dataset.marcarMakeup);
    if (!m) return;
    preencherFormularioReposicao(m, true);
    document.getElementById("makeup-form-title").textContent = "Marcar reposição";
    document.getElementById("m-data-agendada").focus();
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }));
  document.querySelectorAll("[data-edit-makeup]").forEach(b => b.addEventListener("click", () => {
    const m = makeups().find(x => x.id === b.dataset.editMakeup);
    if (!m) return;
    preencherFormularioReposicao(m, false);
    document.getElementById("makeup-form-title").textContent = "Editar reposição";
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }));
  document.querySelectorAll("[data-del-makeup]").forEach(b => b.addEventListener("click", () => {
    if (!confirm("Excluir esta reposição?")) return;
    saveMakeups(makeups().filter(m => m.id !== b.dataset.delMakeup));
    toast("Reposição excluída.");
    render();
  }));

  // Nivelamento
  const af = document.getElementById("assessment-form");
  if (af) { af.addEventListener("submit", submitAssessment); wireDraft("assessment-form"); }
  const btnLimparNivelamento = document.getElementById("btn-limpar-nivelamento");
  if (btnLimparNivelamento) btnLimparNivelamento.addEventListener("click", limparNivelamento);
  const btnBuscarNivelStatus = document.getElementById("btn-buscar-nivel-status");
  if (btnBuscarNivelStatus) btnBuscarNivelStatus.addEventListener("click", buscarStatusPorAluno);
  const btnLimparNivelStatus = document.getElementById("btn-limpar-nivel-status");
  if (btnLimparNivelStatus) btnLimparNivelStatus.addEventListener("click", limparStatusPorAluno);
  const filtroNivelAno = document.getElementById("filtro-nivel-ano");
  const filtroNivelSem = document.getElementById("filtro-nivel-semestre");
  if (filtroNivelAno) filtroNivelAno.addEventListener("change", renderNivelListaFiltrada);
  if (filtroNivelSem) filtroNivelSem.addEventListener("change", renderNivelListaFiltrada);
  wireAssessmentRowButtons();

  // Dashboard
  const btnBuscarDash = document.getElementById("btn-buscar-dashboard");
  if (btnBuscarDash) btnBuscarDash.addEventListener("click", () => {
    dashboardFiltro.ano = document.getElementById("dash-filtro-ano").value;
    dashboardFiltro.semestre = document.getElementById("dash-filtro-semestre").value;
    dashboardFiltro.mes = document.getElementById("dash-filtro-mes").value;
    render();
  });
  const btnLimparDash = document.getElementById("btn-limpar-dashboard");
  if (btnLimparDash) btnLimparDash.addEventListener("click", () => { dashboardFiltro = { ano: "", semestre: "", mes: "" }; render(); });
  const dashStatusSel = document.getElementById("dash-status-aluno");
  if (dashStatusSel) dashStatusSel.addEventListener("change", () => { dashboardStatusFiltro = dashStatusSel.value; render(); });

  // Resumo IA
  const btnGerar = document.getElementById("btn-gerar-ia");
  if (btnGerar) btnGerar.addEventListener("click", gerarResumoIA);
  const btnGerarRep = document.getElementById("btn-gerar-ia-rep");
  if (btnGerarRep) btnGerarRep.addEventListener("click", gerarRelatorioReposicoesIA);

  // Tema
  const btnTheme = document.getElementById("btn-theme");
  if (btnTheme) btnTheme.addEventListener("click", toggleTheme);

  // Backup
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
      } catch { alert("Arquivo inválido."); }
    };
    reader.readAsText(file);
  });
}

// Fecha qualquer dropdown de múltipla seleção ao clicar fora
document.addEventListener("click", (ev) => {
  document.querySelectorAll(".multi-dropdown").forEach(dd => {
    if (!dd.contains(ev.target)) {
      const panel = dd.querySelector(".multi-dropdown-panel");
      if (panel) panel.classList.add("section-hidden");
    }
  });
});

// ===== Service Worker + instalação =====
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
}
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; });

initTheme();
render();
