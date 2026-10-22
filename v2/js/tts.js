// Leitura em voz alta com a voz do navegador (grátis, sem servidor).
// O texto é lido frase a frase: evita o corte de falas longas do Chrome e permite pausar/retomar com segurança.

const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
let frases = [], idx = 0, tocando = false, rate = 1, vozNome = null, ouvinte = () => {};

export function suportado() { return !!synth && typeof SpeechSynthesisUtterance !== "undefined"; }

export function vozesIngles() {
  if (!suportado()) return [];
  return synth.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang))
    .sort((a, b) => pontuar(b) - pontuar(a));
}
function pontuar(v) {
  let p = 0;
  if (/en-US/i.test(v.lang)) p += 3;
  if (/en-GB/i.test(v.lang)) p += 2;
  if (/Google|Natural|Neural|Samantha|Daniel|Aria|Jenny|Guy/i.test(v.name)) p += 4;
  if (v.localService) p += 1;
  return p;
}
export function aoCarregarVozes(cb) {
  if (!suportado()) return;
  if (synth.getVoices().length) cb();
  synth.addEventListener?.("voiceschanged", cb);
}

export function carregar(texto, onEstado) {
  parar();
  frases = (texto.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [texto]).map(s => s.trim()).filter(Boolean);
  idx = 0;
  ouvinte = onEstado || (() => {});
  emitir();
}
export function definirVelocidade(r) { rate = r; if (tocando) { const i = idx; synth.cancel(); idx = i; falarAtual(); } }
export function definirVoz(nome) { vozNome = nome; if (tocando) { const i = idx; synth.cancel(); idx = i; falarAtual(); } }
export function tocar() {
  if (!suportado() || !frases.length) return;
  if (idx >= frases.length) idx = 0;
  tocando = true; emitir(); falarAtual();
}
export function pausar() { tocando = false; if (suportado()) synth.cancel(); emitir(); }
export function parar() { tocando = false; idx = 0; if (suportado()) synth.cancel(); emitir(); }
export function voltarFrase() { const t = tocando; if (suportado()) synth.cancel(); idx = Math.max(0, idx - 1); if (t) { tocando = true; falarAtual(); } emitir(); }
export function estado() { return { tocando, idx, total: frases.length, progresso: frases.length ? idx / frases.length : 0, rate }; }

function falarAtual() {
  if (!tocando || idx >= frases.length) { tocando = false; emitir(); return; }
  const u = new SpeechSynthesisUtterance(frases[idx]);
  u.lang = "en-US"; u.rate = rate;
  const v = vozesIngles().find(x => x.name === vozNome) || vozesIngles()[0];
  if (v) { u.voice = v; u.lang = v.lang; }
  const meu = idx;
  u.onend = () => { if (!tocando || meu !== idx) return; idx++; emitir(); falarAtual(); };
  u.onerror = (e) => { if (e.error === "interrupted" || e.error === "canceled") return; tocando = false; emitir(); };
  synth.speak(u);
}
function emitir() { try { ouvinte(estado()); } catch {} }

export function falarUma(texto, r = 1) {
  if (!suportado()) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  const v = vozesIngles()[0]; if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-US";
  u.rate = r; synth.speak(u);
}
