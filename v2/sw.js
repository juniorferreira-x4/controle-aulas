// Service worker do Controle de Aulas v2.
// Rede primeiro (para nunca ficar preso numa versão velha); cache só como reserva offline.
const CACHE = "controle-aulas-v2-7";
const ASSETS = [
  "./", "./index.html", "./style.css", "./config.js", "./manifest.json",
  "./js/app.js", "./js/aula.js", "./js/ctx.js", "./js/regras.js", "./js/banco.js", "./js/store.js", "./js/tts.js", "./js/drive.js", "./js/firebase.js", "./js/tela.js", "./aluno.html",
  "./banco/index.json", "./banco/a1-1.json", "./banco/a1-2.json", "./banco/a2-1.json", "./banco/a2-2.json",
  "./banco/b1-1.json", "./banco/b1-2.json", "./banco/b2-1.json", "./banco/b2-2.json", "./banco/textos-a.json", "./banco/textos-b.json", "./banco/conversa-1.json", "./banco/conversa-2.json",
  "./icons/icon-192.png", "./icons/icon-512.png"
];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("controle-aulas-v2") && k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copia)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: false }).then(r => r || caches.match(e.request, { ignoreSearch: true })))
  );
});
