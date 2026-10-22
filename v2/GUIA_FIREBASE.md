# Guia: Firebase e Google Drive (Controle de Aulas v2)

O app funciona em três modos:

| Modo | Onde ficam os dados | Quando usar |
|---|---|---|
| **Demonstração** (`?demo=1` no endereço) | Só neste navegador, com dados de exemplo | Para conhecer o app |
| **Local** (sem Firebase configurado) | Só neste navegador | Enquanto o Firebase não está pronto |
| **Nuvem** (Firebase configurado) | Firestore, na sua conta Google | Uso real, em qualquer aparelho |

O plano gratuito (Spark) do Firebase é mais que suficiente para um professor: 1 GB de dados e 50 mil leituras por dia.

## 1. Criar o projeto (uma vez só)

1. Acesse **console.firebase.google.com** → **Criar projeto** → nome `controle-aulas`. O Analytics pode ficar desativado.
2. **Authentication** → Começar → **Google** → ativar → salvar.
3. Em **Authentication → Configurações → Domínios autorizados**, adicione `juniorferreira-x4.github.io`.
4. **Firestore Database** → Criar banco → local **southamerica-east1** → **modo de produção**.
5. **Firestore → aba Regras**: substitua todo o texto pelo bloco abaixo e clique em **Publicar**.

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null
        && request.auth.uid == uid
        && request.auth.token.email == 'juniorferreira.x4@gmail.com'
        && request.auth.token.email_verified == true;
    }
  }
}
```

6. Abra **Configurações (engrenagem) → Geral → Seus apps** e clique em **`</>`** (Web). Registre com o apelido `web`, sem Hosting, e copie o bloco `firebaseConfig`.
7. Cole o bloco em `v2/config.js`, no lugar de `null`:

```js
export const FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "....firebaseapp.com",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

O `firebaseConfig` não é segredo: ele fica público no site de qualquer forma. Quem protege os dados são as **regras** do passo 5, que só deixam o seu e-mail ler e gravar.

## 2. Ativar o Google Drive e o Google Docs (para o homework automático)

O login do app já pede a permissão `drive.file`. Com ela, o app enxerga **apenas os documentos que ele mesmo criou**, nunca o resto do seu Drive. Falta ligar as duas APIs no projeto:

1. Abra `https://console.cloud.google.com/apis/library/drive.googleapis.com` com o projeto `controle-aulas` selecionado no topo e clique em **Ativar**.
2. Faça o mesmo em `https://console.cloud.google.com/apis/library/docs.googleapis.com`.

Se, no primeiro login, o Google mostrar o aviso “o Google não verificou este app”, clique em **Avançado → Acessar controle-aulas**. O app é seu, e o aviso aparece porque ele não passou pela revisão pública do Google, que não é necessária para uso pessoal.

## 3. Primeiro uso

1. Abra `https://juniorferreira-x4.github.io/controle-aulas/v2/` e entre com a sua conta Google.
2. No app antigo (`/controle-aulas/`), vá em **Painel → Exportar backup (.json)**.
3. No app novo, vá em **Ajustes → Importar backup do app antigo** e escolha o arquivo.
4. Em cada aluno: confira o nível, o e-mail e os horários, e cole o link do documento compartilhado. Depois clique em **Criar no Drive** para criar o documento de homework.

## Como o homework chega ao aluno

- No pós-aula, o app gera o homework a partir do tópico e da dificuldade da aula.
- Se o aluno tem um documento de homework criado pelo app, ao clicar em **Salvar e enviar homework** o homework entra **no topo** desse documento, com a data da aula.
- O gabarito **não** vai para o documento. Ele fica no app e aparece na etapa “Homework” da aula seguinte.
- Documentos colados à mão (links de documentos que já existiam) não podem ser escritos pelo app, por causa da permissão `drive.file`. Para esses, use **Copiar homework**.
