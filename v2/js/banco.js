// Carrega o banco de exercícios estático (pasta banco/).
export async function carregarBanco(base = "banco/") {
  const idx = await (await fetch(base + "index.json", { cache: "no-cache" })).json();
  const arquivos = await Promise.all(idx.arquivos.map(f => fetch(base + f, { cache: "no-cache" }).then(r => r.json())));
  const textosArq = await Promise.all(idx.textos.map(f => fetch(base + f, { cache: "no-cache" }).then(r => r.json())));
  const dicas = idx.dicas ? await fetch(base + idx.dicas, { cache: "no-cache" }).then(r => r.json()) : { aquecimento: {}, estruturas: {}, frases: {} };
  const conversaArq = await Promise.all((idx.conversa || []).map(f => fetch(base + f, { cache: "no-cache" }).then(r => r.json())));
  const banco = { topicos: {}, porNivel: {}, aquecimento: {}, textos: [], textosPorId: {}, ordem: [], temas: [], temasPorId: {}, dicas };
  arquivos.forEach(arq => {
    const n = arq.nivel;
    banco.porNivel[n] = banco.porNivel[n] || [];
    if (arq.aquecimento) banco.aquecimento[n] = arq.aquecimento;
    arq.topicos.forEach(t => {
      const topico = { ...t, nivel: n };
      banco.topicos[t.id] = topico;
      banco.porNivel[n].push(topico);
      banco.ordem.push(t.id);
    });
  });
  textosArq.forEach(arq => arq.textos.forEach(t => { banco.textos.push(t); banco.textosPorId[t.id] = t; }));
  conversaArq.forEach(arq => arq.temas.forEach(t => { banco.temas.push(t); banco.temasPorId[t.id] = t; }));
  banco.totalItens = Object.values(banco.topicos).reduce((s, t) =>
    s + ["facil", "medio", "dificil"].reduce((x, d) => x + t[d].p.length + t[d].t.length + t[d].c.length + t[d].r.length, 0) + t.fala.length + t.escrita.length, 0);
  return banco;
}
