// Camada de dados: mesma interface para o modo local (navegador) e o Firebase (nuvem).
export function novoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
};
function limpo(obj) { return JSON.parse(JSON.stringify(obj)); }
function upsert(lista, item) {
  const i = lista.findIndex(x => x.id === item.id);
  if (i >= 0) lista[i] = item; else lista.push(item);
}

class BaseStore {
  constructor() { this.alunos = []; this.aulas = []; this.config = {}; this.ouvintes = new Set(); }
  aluno(id) { return this.alunos.find(a => a.id === id); }
  aula(id) { return this.aulas.find(a => a.id === id); }
  carimbar(obj) {
    const agora = new Date().toISOString();
    if (!obj.id) obj.id = novoId();
    if (!obj.criadoEm) obj.criadoEm = agora;
    obj.atualizadoEm = agora;
    return obj;
  }
}

export class LocalStore extends BaseStore {
  constructor(prefixo = "ca2_") { super(); this.p = prefixo; this.modo = "local"; }
  async init() {
    this.alunos = LS.get(this.p + "alunos", []);
    this.aulas = LS.get(this.p + "aulas", []);
    this.config = LS.get(this.p + "config", {});
  }
  _salvar(tipo) {
    if (!LS.set(this.p + tipo, this[tipo])) throw new Error("Não foi possível salvar neste navegador (armazenamento cheio ou bloqueado).");
  }
  async salvarAluno(a) { upsert(this.alunos, limpo(this.carimbar(a))); this._salvar("alunos"); return a; }
  async salvarAula(a) { upsert(this.aulas, limpo(this.carimbar(a))); this._salvar("aulas"); return a; }
  async apagarAula(id) { this.aulas = this.aulas.filter(a => a.id !== id); this._salvar("aulas"); }
  async apagarAluno(id) {
    this.alunos = this.alunos.filter(a => a.id !== id);
    this.aulas = this.aulas.filter(a => a.alunoId !== id);
    this._salvar("alunos"); this._salvar("aulas");
  }
  async salvarConfig(c) { this.config = limpo(c); this._salvar("config"); }
  async importarTudo({ alunos, aulas }) {
    alunos.forEach(a => upsert(this.alunos, limpo(this.carimbar(a))));
    aulas.forEach(a => upsert(this.aulas, limpo(this.carimbar(a))));
    this._salvar("alunos"); this._salvar("aulas");
  }
}

// O Firestore não aceita lista dentro de lista (ex.: homework.completar = [[frase, resposta], …]).
// Ao gravar, cada lista interna vira { __a: [...] }; ao ler, volta a ser lista.
export function paraFs(v, dentroDeLista = false) {
  if (Array.isArray(v)) { const arr = v.map(x => paraFs(x, true)); return dentroDeLista ? { __a: arr } : arr; }
  if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = paraFs(v[k], false); return o; }
  return v;
}
export function deFs(v) {
  if (Array.isArray(v)) return v.map(deFs);
  if (v && typeof v === "object") {
    if (Array.isArray(v.__a) && Object.keys(v).length === 1) return v.__a.map(deFs);
    const o = {}; for (const k in v) o[k] = deFs(v[k]); return o;
  }
  return v;
}

export class FirebaseStore extends BaseStore {
  constructor(fb, uid) { super(); this.fb = fb; this.uid = uid; this.modo = "nuvem"; }
  _col(nome) { const { collection, db } = this.fb; return collection(db, "users", this.uid, nome); }
  _doc(nome, id) { const { doc, db } = this.fb; return doc(db, "users", this.uid, nome, id); }
  async init() {
    const { getDocs, getDoc } = this.fb;
    const [al, au, cf] = await Promise.all([
      getDocs(this._col("alunos")), getDocs(this._col("aulas")), getDoc(this._doc("config", "main"))
    ]);
    this.alunos = al.docs.map(d => deFs(d.data()));
    this.aulas = au.docs.map(d => deFs(d.data()));
    this.config = cf.exists() ? deFs(cf.data()) : {};
  }
  async salvarAluno(a) { const x = limpo(this.carimbar(a)); upsert(this.alunos, x); await this.fb.setDoc(this._doc("alunos", x.id), paraFs(x)); return x; }
  async salvarAula(a) { const x = limpo(this.carimbar(a)); upsert(this.aulas, x); await this.fb.setDoc(this._doc("aulas", x.id), paraFs(x)); return x; }
  async apagarAula(id) { this.aulas = this.aulas.filter(a => a.id !== id); await this.fb.deleteDoc(this._doc("aulas", id)); }
  async apagarAluno(id) {
    const das = this.aulas.filter(a => a.alunoId === id).map(a => a.id);
    this.alunos = this.alunos.filter(a => a.id !== id);
    this.aulas = this.aulas.filter(a => a.alunoId !== id);
    await this._lote([...das.map(x => ["del", "aulas", x]), ["del", "alunos", id]]);
  }
  async salvarConfig(c) { this.config = limpo(c); await this.fb.setDoc(this._doc("config", "main"), paraFs(this.config)); }
  async importarTudo({ alunos, aulas }) {
    const ops = [];
    alunos.forEach(a => { const x = limpo(this.carimbar(a)); upsert(this.alunos, x); ops.push(["set", "alunos", x.id, x]); });
    aulas.forEach(a => { const x = limpo(this.carimbar(a)); upsert(this.aulas, x); ops.push(["set", "aulas", x.id, x]); });
    await this._lote(ops);
  }
  async _lote(ops) {
    const { writeBatch, db } = this.fb;
    for (let i = 0; i < ops.length; i += 400) {
      const b = writeBatch(db);
      ops.slice(i, i + 400).forEach(([tipo, col, id, dados]) => {
        if (tipo === "del") b.delete(this._doc(col, id)); else b.set(this._doc(col, id), paraFs(dados));
      });
      await b.commit();
    }
  }
}
