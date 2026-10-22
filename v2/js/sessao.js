// Sessão da "Tela do aluno": publica o estado da aula e recebe o que o aluno escreve.
// Dois caminhos ao mesmo tempo:
//  - local: janela no mesmo computador (BroadcastChannel), para compartilhar a tela;
//  - remoto: link fixo do aluno (Firestore: sessoes/{id}). O aluno não precisa de conta.

let canal = null;
try { canal = new BroadcastChannel("ca2-tela"); } catch {}

const HORAS_SESSAO = 4;

export function novoSid() {
  const bytes = new Uint8Array(18); crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("").slice(0, 28);
}
export function baseApp() { return location.href.split("#")[0].split("?")[0].replace(/index\.html$/, ""); }
export function linkDoAluno(sid) { return sid ? `${baseApp()}aluno.html?s=${encodeURIComponent(sid)}` : null; }

export const Sessao = {
  fb: null, sid: null, aulaId: null, ultimo: "", timer: null, desinscrever: null,
  aoResponder: () => {}, aoPedirEstado: () => {},
  alunoVistoEm: null, listening: null, janelaVistaEm: null,

  ligar(fb, { aoResponder, aoPedirEstado }) {
    this.fb = fb; this.aoResponder = aoResponder; this.aoPedirEstado = aoPedirEstado;
  },
  ativa(aulaId) { return !!this.sid && this.aulaId === aulaId; },

  // Ativa o link fixo do aluno para esta aula por 4 horas.
  // Se o link estava com outra aula, apaga as respostas antigas e recomeça.
  async ativar(aula, nomeAluno, sid) {
    if (!this.fb) throw new Error("O link ao vivo precisa do login com o Google.");
    const { doc, setDoc, getDoc, getDocs, deleteDoc, updateDoc, collection, db, Timestamp, auth } = this.fb;
    const ref = doc(db, "sessoes", sid);
    const expira = Timestamp.fromMillis(Date.now() + HORAS_SESSAO * 3600 * 1000);
    let mesma = false;
    try { const s = await getDoc(ref); mesma = s.exists() && s.data().aulaId === aula.id; } catch {}
    if (mesma) {
      await updateDoc(ref, { expiraEm: expira });
    } else {
      try { const r = await getDocs(collection(db, "sessoes", sid, "respostas")); await Promise.all(r.docs.map(d => deleteDoc(d.ref))); } catch {}
      await setDoc(ref, { dono: auth.currentUser.uid, aulaId: aula.id, aluno: nomeAluno, criadoEm: Timestamp.now(), expiraEm: expira, estado: null });
    }
    if (this.sid !== sid || this.aulaId !== aula.id) { this.alunoVistoEm = null; this.listening = null; }
    this.sid = sid; this.aulaId = aula.id; this.ultimo = "";
    this._ouvirRemoto();
    return sid;
  },
  _ouvirRemoto() {
    if (this.desinscrever) this.desinscrever();
    const { collection, onSnapshot, db } = this.fb;
    this.desinscrever = onSnapshot(collection(db, "sessoes", this.sid, "respostas"), snap => {
      snap.docChanges().forEach(ch => {
        if (ch.type === "removed") return;
        const d = ch.doc.data();
        if (ch.doc.id === "presenca") {
          // Usa o relógio deste computador (o do aluno pode estar adiantado ou atrasado).
          this.alunoVistoEm = Date.now(); this.listening = d.listening || null;
          this.aoResponder({ presenca: true }); return;
        }
        this.aoResponder({ exercicioId: ch.doc.id, itens: d.itens || [], texto: d.texto || "", enviadoEm: d.enviadoEm || null, rascunho: !!d.rascunho });
      });
    }, () => {});
  },
  // Publica o estado nos dois caminhos (o remoto só quando muda, com um pequeno atraso).
  publicar(estado, imediato = false) {
    if (!estado) return;
    if (canal) { try { canal.postMessage({ tipo: "estado", ...estado }); } catch {} }
    if (!this.sid || !this.fb || estado.aulaId !== this.aulaId) return;
    const json = JSON.stringify(estado);
    if (json === this.ultimo) return;
    clearTimeout(this.timer);
    const enviar = () => {
      this.ultimo = json;
      const { doc, updateDoc, db } = this.fb;
      // updateDoc substitui o campo "estado" inteiro (setDoc com merge manteria campos antigos).
      return updateDoc(doc(db, "sessoes", this.sid), { estado: JSON.parse(json) }).catch(e => console.warn("sessão:", e.message));
    };
    if (imediato) return enviar();
    this.timer = setTimeout(enviar, 250);
  },
  // Fim da aula: mostra a tela final ao aluno por mais 30 minutos e para de ouvir as respostas.
  async encerrar(estadoFinal) {
    if (canal) { try { canal.postMessage({ tipo: "estado", ...estadoFinal }); } catch {} }
    if (!this.sid || !this.fb || estadoFinal.aulaId !== this.aulaId) return;
    const { doc, updateDoc, db, Timestamp } = this.fb;
    clearTimeout(this.timer);
    this.ultimo = JSON.stringify(estadoFinal);
    await updateDoc(doc(db, "sessoes", this.sid), { estado: estadoFinal, expiraEm: Timestamp.fromMillis(Date.now() + 30 * 60 * 1000) }).catch(e => console.warn("sessão:", e.message));
    if (this.desinscrever) { this.desinscrever(); this.desinscrever = null; }
  },
  encerrarLocal() { if (this.desinscrever) { this.desinscrever(); this.desinscrever = null; } this.sid = null; this.aulaId = null; this.alunoVistoEm = null; this.listening = null; }
};

if (canal) canal.onmessage = ev => {
  const d = ev.data || {};
  if (d.tipo === "pedir") Sessao.aoPedirEstado();
  if (d.tipo === "presenca") { Sessao.janelaVistaEm = Date.now(); if (!Sessao.sid) Sessao.listening = d.listening || null; Sessao.aoResponder({ presenca: true }); }
  if (d.tipo === "resposta") Sessao.aoResponder({ exercicioId: d.exercicioId, itens: d.itens || [], texto: d.texto || "", enviadoEm: d.enviadoEm, rascunho: !!d.rascunho, local: true });
};
