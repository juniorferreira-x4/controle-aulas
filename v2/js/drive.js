// Google Drive / Docs: cria o documento de homework do aluno e insere o homework no topo.
// Usa só o escopo drive.file: o app enxerga apenas os arquivos que ele mesmo criou.

async function api(token, url, opts = {}) {
  const r = await fetch(url, {
    ...opts,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) }
  });
  if (!r.ok) {
    let msg = `${r.status}`;
    try { const j = await r.json(); msg = j.error?.message || msg; } catch {}
    if (r.status === 403 && /has not been used|disabled/i.test(msg)) msg = "A API do Google Drive/Docs não está ativada no projeto. Veja o guia de configuração.";
    throw new Error(msg);
  }
  return r.status === 204 ? null : r.json();
}

export async function criarDocHomework(token, aluno) {
  const arq = await api(token, "https://www.googleapis.com/drive/v3/files?fields=id,webViewLink", {
    method: "POST",
    body: JSON.stringify({ name: `Homework — ${aluno.nome}`, mimeType: "application/vnd.google-apps.document" })
  });
  await inserirNoTopo(token, arq.id,
    `Homework — ${aluno.nome}\nO homework de cada aula entra no topo deste documento. Responda logo abaixo de cada exercício.\n\n`, true);
  if (aluno.email) {
    await api(token, `https://www.googleapis.com/drive/v3/files/${arq.id}/permissions?sendNotificationEmail=true`, {
      method: "POST",
      body: JSON.stringify({ role: "writer", type: "user", emailAddress: aluno.email })
    });
  }
  return { id: arq.id, url: arq.webViewLink || `https://docs.google.com/document/d/${arq.id}/edit` };
}

export async function compartilhar(token, docId, email) {
  return api(token, `https://www.googleapis.com/drive/v3/files/${docId}/permissions?sendNotificationEmail=true`, {
    method: "POST", body: JSON.stringify({ role: "writer", type: "user", emailAddress: email })
  });
}

// Insere o texto no início do documento; a primeira linha vira título.
export async function inserirNoTopo(token, docId, texto, primeiraLinhaTitulo = true) {
  const conteudo = texto.endsWith("\n") ? texto : texto + "\n";
  const primeira = conteudo.split("\n")[0];
  const requests = [{ insertText: { location: { index: 1 }, text: conteudo } }];
  if (primeiraLinhaTitulo && primeira.length) {
    requests.push({
      updateParagraphStyle: {
        range: { startIndex: 1, endIndex: 1 + primeira.length + 1 },
        paragraphStyle: { namedStyleType: "HEADING_2" }, fields: "namedStyleType"
      }
    });
    if (conteudo.length > primeira.length + 1) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: 1 + primeira.length + 1, endIndex: 1 + conteudo.length },
          paragraphStyle: { namedStyleType: "NORMAL_TEXT" }, fields: "namedStyleType"
        }
      });
    }
  }
  return api(token, `https://docs.googleapis.com/v1/documents/${docId}:batchUpdate`, {
    method: "POST", body: JSON.stringify({ requests })
  });
}
