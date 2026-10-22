// Sessão da "Tela do aluno": publica o estado da aula e recebe as respostas do aluno.
// Dois caminhos ao mesmo tempo:
//  - local: janela no mesmo computador (BroadcastChannel), para compartilhar a tela;
//  - remoto: link no aparelho do aluno (Firestore: sessoes/{id}), com login anônimo do aluno.

let canal = null;
try { canal = new BroadcastChannel("ca2-tela"); } catch {}

export const Sessao = {
  fb: null, sid: null, aulaId: null, ultimo: "", timer: null, desinscrever: null,
  aoResponder: () => {}, aoPedirEstado: () => {}, alunoVistoEm: null,

  ligar(fb, { aoResponder, aoPedirEstado }) {
    this.fb = fb; this.aoResponder = aoResponder; this.aoPedirEstado = aoPedirEstado;
  },
  linkRemoto(base) { return this.sid ? `${base}aluno.html?s=${encodeURIComponent(this.sid)}` : null; },

  // Cria (ou reaproveita) a sessão remota desta aula. Expira em 4 horas.
  async iniciarRemota(aula, nomeAluno, sidExistente) {
    if (!this.fb) throw new Error("O link ao vivo precisa do Firebase configurado e de login.");
    const { doc, setDoc, getDoc, db, Timestamp, auth } = this.fb;
    let sid = sidExistente;
    if (sid) {
      try {
        const s = await getDoc(doc(db, "sessoes", sid));
        if (!s.exists() || s.data().expiraEm.toMillis() < Date.now()) sid = null;
      } catch { sid = null; }
    }
    if (!sid) {
      const bytes = new Uint8Array(18); crypto.getRandomValues(bytes);
      sid = Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("").slice(0, 28);
      await setDoc(doc(db, "sessoes", sid), {
        dono: auth.currentUser.uid, aulaId: aula.id, aluno: nomeAluno,
        criadoEm: Timestamp.now(), expiraEm: Timestamp.fromMillis(Date.now() + 4 * 3600 * 1000), estado: null
      });
    }
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
        if (ch.doc.id === "presenca") { this.alunoVistoEm = d.visto || Date.now(); this.aoResponder({ presenca: true }); return; }
        this.aoResponder({ exercicioId: ch.doc.id, itens: d.itens || [], texto: d.texto || "", enviadoEm: d.enviadoEm || null });
      });
    }, () => {});
  },
  // Publica o estado nos dois caminhos (o remoto só quando muda, com um pequeno atraso).
  publicar(estado) {
    if (!estado) return;
    if (canal) { try { canal.postMessage({ tipo: "estado", ...estado }); } catch {} }
    if (!this.sid || !this.fb || estado.aulaId !== this.aulaId) return;
    const json = JSON.stringify(estado);
    if (json === this.ultimo) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.ultimo = json;
      const { doc, updateDoc, db } = this.fb;
      // updateDoc substitui o campo "estado" inteiro (setDoc com merge manteria campos antigos).
      updateDoc(doc(db, "sessoes", this.sid), { estado: JSON.parse(json) }).catch(e => console.warn("sessão:", e.message));
    }, 250);
  },
  encerrarLocal() { if (this.desinscrever) { this.desinscrever(); this.desinscrever = null; } this.sid = null; this.aulaId = null; this.alunoVistoEm = null; }
};

if (canal) canal.onmessage = ev => {
  const d = ev.data || {};
  if (d.tipo === "pedir") Sessao.aoPedirEstado();
  if (d.tipo === "resposta") Sessao.aoResponder({ exercicioId: d.exercicioId, itens: d.itens || [], texto: d.texto || "", enviadoEm: d.enviadoEm, local: true });
};
