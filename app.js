// ===== Armazenamento =====
const DB = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; } },
  set(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
};
const K = { students: "gf_students", lessons: "gf_lessons", makeups: "gf_makeups" };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function students() { return DB.get(K.students); }
function lessons() { return DB.get(K.lessons); }
function makeups() { return DB.get(K.makeups); }
function saveStudents(v) { DB.set(K.students, v); }
function saveLessons(v) { DB.set(K.lessons, v); }
function saveMakeups(v) { DB.set(K.makeups, v); }

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

// ===== Regras do contrato =====
const SKILLS = ["Gramática", "Vocabulário", "Listening", "Speaking", "Writing", "Reading", "Pronúncia"];

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function monthKeyOf(dateStr) { return dateStr ? dateStr.slice(0, 7) : "sem-data"; }
function hojeISO() { return new Date().toISOString().slice(0, 10); }

// Prazo de 21 dias corridos e status de expiração
function prazoInfo(m) {
  if (!m.dataPerdida) return { prazo: null, expirada: false, diasRestantes: null };
  const prazo = addDays(m.dataPerdida, 21);
  const expirada = m.status !== "Concluída" && hojeISO() > prazo;
  const diasRestantes = Math.ceil((new Date(prazo) - new Date(hojeISO())) / 86400000);
  return { prazo, expirada, diasRestantes };
}

// 1 remarcação grátis por mês por aluno; cancelamento <24h é sempre cobrado E revoga
// o direito grátis daquele mês para o aluno (mesmo que outras remarcações do mês já existissem antes).
function mapaCobranca() {
  const mk = makeups();
  const grupos = {};
  mk.forEach(m => {
    const chave = m.alunoId + "|" + monthKeyOf(m.dataPerdida);
    (grupos[chave] = grupos[chave] || []).push(m);
  });
  const resultado = {};
  Object.values(grupos).forEach(lista => {
    lista.sort((a, b) => (a.dataPerdida || "").localeCompare(b.dataPerdida || ""));
    const direitoRevogado = lista.some(e => e.motivo === "Cancelamento (<24h)");
    let usouGratis = false;
    lista.forEach(e => {
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

// ===== Navegação por abas =====
const TABS = ["alunos", "aulas", "reposicoes", "dashboard", "resumoia"];
let currentTab = "alunos";

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
    dashboard: renderDashboard,
    resumoia: renderResumoIA
  }[currentTab]();
  attachHandlers();
}

// ===== ALUNOS =====
function renderAlunos() {
  const list = students();
  const rows = list.length ? list.map(s => `
    <div class="row-item">
      <div class="row-main">
        <div class="row-title">${esc(s.nome)} <span class="tag" style="background:#EEF2F6;color:#16324F">${esc(s.nivel || "—")}</span></div>
        <div class="row-sub">${esc(s.horario || "sem horário fixo")} · ${esc(s.freq || "—")} · ${esc(s.status || "Ativo")}</div>
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-small" data-edit-student="${s.id}">Editar</button>
        <button class="btn btn-danger btn-small" data-del-student="${s.id}">Excluir</button>
      </div>
    </div>
  `).join("") : `<div class="empty-state"><div class="big">👤</div>Nenhum aluno cadastrado ainda.<br>Adicione o primeiro abaixo.</div>`;

  return `
    <div class="card">
      <h2>Alunos cadastrados <span class="count">${list.length}</span></h2>
      ${rows}
    </div>
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
  `;
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
  toast("Aluno salvo.");
  render();
}

// ===== AULAS =====
function renderAulas() {
  const list = lessons().slice().sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const opts = students().map(s => `<option value="${s.id}">${esc(s.nome)}</option>`).join("");
  const rows = list.length ? list.map(l => {
    const tagClass = l.presenca === "Falta" ? "tag-falta" : l.presenca === "Reposição" ? "tag-reposicao" : "tag-presente";
    return `
    <div class="row-item">
      <div class="row-main">
        <div class="row-title">${esc(studentName(l.alunoId))} <span class="tag ${tagClass}">${esc(l.presenca || "—")}</span>
        ${l.presenca === "Falta" ? `<span class="tag ${l.aviso24h === "Não" ? "tag-falta" : "tag-agendada"}">${l.aviso24h === "Não" ? "sem aviso 24h" : "avisou ≥24h"}</span>` : ""}
        ${l.atraso15 ? `<span class="tag tag-reposicao">atraso >15min</span>` : ""}
        </div>
        <div class="row-sub">${fmtDate(l.data)} · ${esc(l.habilidade || "—")} — ${esc(l.tema || "sem tema registrado")}</div>
        ${l.dificuldade ? `<div class="row-sub">⚠ ${esc(l.dificuldade)}</div>` : ""}
      </div>
      <div class="row-actions">
        <button class="btn btn-ghost btn-small" data-edit-lesson="${l.id}">Editar</button>
        <button class="btn btn-danger btn-small" data-del-lesson="${l.id}">Excluir</button>
      </div>
    </div>`;
  }).join("") : `<div class="empty-state"><div class="big">📖</div>Nenhuma aula registrada ainda.</div>`;

  return `
    <div class="card">
      <h2>Registro de aulas <span class="count">${list.length}</span></h2>
      ${rows}
    </div>
    <div class="card">
      <h2 id="lesson-form-title">Nova aula</h2>
      <form id="lesson-form">
        <input type="hidden" id="l-id">
        <div class="grid-2">
          <div><label>Data</label><input type="date" id="l-data" required></div>
          <div><label>Aluno</label><select id="l-aluno" required><option value="">Selecione</option>${opts}</select></div>
        </div>
        <label>Tema / assunto abordado</label>
        <input type="text" id="l-tema" placeholder="Ex: Past simple x Present perfect">
        <div class="grid-2">
          <div><label>Habilidade foco</label>
            <select id="l-habilidade">
              <option value="">—</option>
              ${SKILLS.map(s => `<option>${s}</option>`).join("")}
            </select>
          </div>
          <div><label>Presença</label>
            <select id="l-presenca">
              <option>Presente</option><option>Falta</option><option>Reposição</option>
            </select>
          </div>
        </div>
        <div id="falta-extra" class="section-hidden">
          <label>O aluno avisou com 24h ou mais de antecedência?</label>
          <select id="l-aviso24h">
            <option value="Sim">Sim, avisou com 24h+ de antecedência</option>
            <option value="Não">Não — cancelou/faltou em cima da hora (&lt;24h)</option>
          </select>
          <p style="font-size:11.5px;color:var(--text-muted);margin:6px 0 0">
            Se marcar "Não", pelo contrato: a aula conta como dada, o aluno perde o direito à remarcação grátis do mês, e qualquer remarcação desta aula será cobrada à parte (R$80).
          </p>
        </div>
        <label style="display:flex;align-items:center;gap:8px;text-transform:none;font-weight:400;font-size:13px;margin-top:12px">
          <input type="checkbox" id="l-atraso15" style="width:auto"> Aluno chegou com mais de 15 min de atraso (aula finalizada e contabilizada, conforme tolerância do contrato)
        </label>
        <label>Dificuldade observada (específica, não genérica)</label>
        <textarea id="l-dificuldade" placeholder="Ex: confunde 'much' e 'many' com substantivos incontáveis"></textarea>
        <label>Nota da aula</label>
        <textarea id="l-nota" placeholder="Observações livres sobre a aula"></textarea>
        <button type="submit" class="btn btn-primary">Salvar aula</button>
      </form>
    </div>
  `;
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
    tema: document.getElementById("l-tema").value.trim(),
    habilidade: document.getElementById("l-habilidade").value,
    presenca,
    aviso24h,
    atraso15: document.getElementById("l-atraso15").checked,
    dificuldade: document.getElementById("l-dificuldade").value.trim(),
    nota: document.getElementById("l-nota").value.trim()
  };
  if (!data.alunoId || !data.data) return;
  let list = lessons();
  const idx = list.findIndex(x => x.id === id);
  const wasFalta = idx >= 0 && list[idx].presenca === "Falta";
  if (idx >= 0) list[idx] = data; else list.push(data);
  saveLessons(list);

  if (data.presenca === "Falta" && !wasFalta) {
    const motivo = data.aviso24h === "Não" ? "Cancelamento (<24h)" : "Falta / cancelamento (aviso ≥24h)";
    let mk = makeups();
    mk.push({ id: uid(), alunoId: data.alunoId, dataPerdida: data.data, motivo, dataAgendada: "", horario: "", status: "Pendente", obs: "" });
    saveMakeups(mk);
    toast("Aula salva. Reposição pendente criada automaticamente.");
  } else {
    toast("Aula salva.");
  }
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
  const motivos = ["Falta / cancelamento (aviso ≥24h)", "Cancelamento (<24h)"];

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
        Cobrança e prazo calculados automaticamente pelas regras do contrato: 1 remarcação grátis por mês, R$80 nas demais, 21 dias corridos de validade, cancelamento &lt;24h sempre cobrado e revoga o direito grátis do mês.
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
  toast("Reposição salva.");
  render();
}

// ===== DASHBOARD =====
function renderDashboard() {
  const st = students();
  const ls = lessons();
  const mk = makeups();
  const totalPresente = ls.filter(l => l.presenca === "Presente").length;
  const totalFalta = ls.filter(l => l.presenca === "Falta").length;
  const pendentes = mk.filter(m => m.status === "Pendente").length;

  const perStudent = st.map(s => {
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
  `).join("") : `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:16px 0">Sem dados ainda.</td></tr>`;

  return `
    <div class="card">
      <h2>Visão geral</h2>
      <div class="stat-grid">
        <div class="stat-box"><div class="stat-num">${totalPresente}</div><div class="stat-label">Aulas dadas</div></div>
        <div class="stat-box"><div class="stat-num">${totalFalta}</div><div class="stat-label">Faltas</div></div>
        <div class="stat-box"><div class="stat-num">${pendentes}</div><div class="stat-label">Reposições pendentes</div></div>
        <div class="stat-box"><div class="stat-num">${st.length}</div><div class="stat-label">Alunos ativos</div></div>
      </div>
    </div>
    <div class="card">
      <h2>Por aluno</h2>
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
      <select id="ia-aluno"><option value="">Selecione um aluno</option>${opts}</select>
      <button class="btn btn-primary btn-small" id="btn-gerar-ia" style="margin-top:10px">Gerar resumo</button>
      <div id="ia-result" style="margin-top:14px"></div>
    </div>
  `;
}

function gerarResumoIA() {
  const alunoId = document.getElementById("ia-aluno").value;
  const box = document.getElementById("ia-result");
  if (!alunoId) { box.innerHTML = ""; return; }
  const nome = studentName(alunoId);
  const mine = lessons().filter(l => l.alunoId === alunoId);
  const temas = [...new Set(mine.map(l => l.tema).filter(Boolean))];
  const dificuldades = [...new Set(mine.map(l => l.dificuldade).filter(Boolean))];
  const faltas = mine.filter(l => l.presenca === "Falta").length;
  const pend = makeups().filter(m => m.alunoId === alunoId && m.status === "Pendente").length;
  const nivel = students().find(s => s.id === alunoId)?.nivel || "não informado";

  // Sugestão automática por regras (sem IA)
  const freq = {};
  mine.forEach(l => { if (l.dificuldade) { const k = l.dificuldade.trim().toLowerCase(); freq[k] = (freq[k] || 0) + 1; } });
  const recorrentes = Object.entries(freq).filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} (apareceu ${c}x)`);
  const ultimas5 = mine.slice().sort((a, b) => (b.data || "").localeCompare(a.data || "")).slice(0, 5);
  const habilidadesRecentes = new Set(ultimas5.map(l => l.habilidade).filter(Boolean));
  const habilidadesEsquecidas = SKILLS.filter(s => !habilidadesRecentes.has(s));

  const sugestaoHtml = `
    <div class="card" style="margin-top:0">
      <h2>Sugestão automática <span class="count">sem IA · grátis</span></h2>
      <p style="font-size:12.5px;margin:0 0 8px"><strong>Dificuldade recorrente:</strong> ${recorrentes.length ? esc(recorrentes.slice(0, 3).join("; ")) : "nenhuma dificuldade repetida ainda registrada."}</p>
      <p style="font-size:12.5px;margin:0"><strong>Habilidades sem prática nas últimas 5 aulas:</strong> ${habilidadesEsquecidas.length ? esc(habilidadesEsquecidas.join(", ")) : "todas praticadas recentemente."}</p>
    </div>
  `;

  const texto =
`Aluno: ${nome}
Nível: ${nivel}
Aulas registradas: ${mine.length}
Faltas: ${faltas}
Reposições pendentes: ${pend}
Temas já abordados: ${temas.length ? temas.join("; ") : "nenhum registrado"}
Dificuldades observadas: ${dificuldades.length ? dificuldades.join("; ") : "nenhuma registrada"}
Dificuldades recorrentes (repetidas em mais de 1 aula): ${recorrentes.length ? recorrentes.join("; ") : "nenhuma"}
Habilidades sem prática recente: ${habilidadesEsquecidas.length ? habilidadesEsquecidas.join(", ") : "nenhuma"}

---
Prompt sugerido: "Com base neste histórico, monte um plano para as próximas 3 aulas, priorizando as dificuldades recorrentes e as habilidades sem prática recente, evitando repetir os temas já abordados, adequado ao nível do aluno."`;

  box.innerHTML = sugestaoHtml + `
    <div class="ia-output" id="ia-text">${esc(texto)}</div>
    <button class="btn btn-ghost btn-small" id="btn-copiar-ia" style="margin-top:10px">Copiar texto</button>
  `;
  document.getElementById("btn-copiar-ia").addEventListener("click", () => {
    navigator.clipboard.writeText(texto).then(() => toast("Copiado! Cole no chat com o Claude."));
  });
}

function toggleFaltaExtra() {
  const sel = document.getElementById("l-presenca");
  const extra = document.getElementById("falta-extra");
  if (!sel || !extra) return;
  extra.classList.toggle("section-hidden", sel.value !== "Falta");
  if (sel.value === "Falta" && !document.getElementById("l-aviso24h").value) {
    document.getElementById("l-aviso24h").value = "Sim";
  }
}

// ===== Handlers gerais (delegação após render) =====
function attachHandlers() {
  const sf = document.getElementById("student-form");
  if (sf) sf.addEventListener("submit", submitStudent);
  const lf = document.getElementById("lesson-form");
  if (lf) lf.addEventListener("submit", submitLesson);
  const mf = document.getElementById("makeup-form");
  if (mf) mf.addEventListener("submit", submitMakeup);

  const lPresenca = document.getElementById("l-presenca");
  if (lPresenca) lPresenca.addEventListener("change", toggleFaltaExtra);
  toggleFaltaExtra();

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
    document.getElementById("student-form-card").scrollIntoView({ behavior: "smooth" });
  }));
  document.querySelectorAll("[data-del-student]").forEach(b => b.addEventListener("click", () => {
    if (!confirm("Excluir este aluno? O histórico de aulas dele não será apagado.")) return;
    saveStudents(students().filter(s => s.id !== b.dataset.delStudent));
    toast("Aluno excluído.");
    render();
  }));

  document.querySelectorAll("[data-edit-lesson]").forEach(b => b.addEventListener("click", () => {
    const l = lessons().find(x => x.id === b.dataset.editLesson);
    if (!l) return;
    document.getElementById("l-id").value = l.id;
    document.getElementById("l-data").value = l.data || "";
    document.getElementById("l-aluno").value = l.alunoId || "";
    document.getElementById("l-tema").value = l.tema || "";
    document.getElementById("l-habilidade").value = l.habilidade || "";
    document.getElementById("l-presenca").value = l.presenca || "Presente";
    document.getElementById("l-atraso15").checked = !!l.atraso15;
    toggleFaltaExtra();
    if (l.aviso24h) document.getElementById("l-aviso24h").value = l.aviso24h;
    document.getElementById("l-dificuldade").value = l.dificuldade || "";
    document.getElementById("l-nota").value = l.nota || "";
    document.getElementById("lesson-form-title").textContent = "Editar aula";
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }));
  document.querySelectorAll("[data-del-lesson]").forEach(b => b.addEventListener("click", () => {
    if (!confirm("Excluir este registro de aula?")) return;
    saveLessons(lessons().filter(l => l.id !== b.dataset.delLesson));
    toast("Registro excluído.");
    render();
  }));

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
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }));
  document.querySelectorAll("[data-del-makeup]").forEach(b => b.addEventListener("click", () => {
    if (!confirm("Excluir esta reposição?")) return;
    saveMakeups(makeups().filter(m => m.id !== b.dataset.delMakeup));
    toast("Reposição excluída.");
    render();
  }));

  const btnGerar = document.getElementById("btn-gerar-ia");
  if (btnGerar) btnGerar.addEventListener("click", gerarResumoIA);

  const btnFeriados = document.getElementById("btn-salvar-feriados");
  if (btnFeriados) btnFeriados.addEventListener("click", () => {
    localStorage.setItem("gf_feriados", document.getElementById("feriados-notas").value);
    toast("Nota salva.");
  });

  const btnExport = document.getElementById("btn-export");
  if (btnExport) btnExport.addEventListener("click", () => {
    const backup = { students: students(), lessons: lessons(), makeups: makeups(), exportedAt: new Date().toISOString() };
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

render();
