// Login Google + Firestore + token do Google Drive (escopo drive.file).
const V = "10.12.2";
const SCOPE_DRIVE = "https://www.googleapis.com/auth/drive.file";

let token = null, tokenExpira = 0;

export async function iniciarFirebase(config) {
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const authMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.initializeApp(config);
  const auth = authMod.getAuth(app);
  let db;
  try {
    db = fsMod.initializeFirestore(app, { localCache: fsMod.persistentLocalCache({ tabManager: fsMod.persistentMultipleTabManager() }) });
  } catch {
    db = fsMod.getFirestore(app);
  }
  const provider = new authMod.GoogleAuthProvider();
  provider.addScope(SCOPE_DRIVE);
  provider.setCustomParameters({ prompt: "select_account" });

  const fb = {
    db, auth,
    collection: fsMod.collection, doc: fsMod.doc, getDocs: fsMod.getDocs, getDoc: fsMod.getDoc,
    setDoc: fsMod.setDoc, deleteDoc: fsMod.deleteDoc, writeBatch: fsMod.writeBatch,
    onSnapshot: fsMod.onSnapshot, Timestamp: fsMod.Timestamp, updateDoc: fsMod.updateDoc,
    aoMudarUsuario(cb) { return authMod.onAuthStateChanged(auth, cb); },
    async entrar() {
      const r = await authMod.signInWithPopup(auth, provider);
      guardarToken(authMod.GoogleAuthProvider.credentialFromResult(r));
      return r.user;
    },
    async sair() { token = null; await authMod.signOut(auth); },
    // Token para Drive/Docs. Se expirou (1h) ou a página recarregou, pede de novo num popup.
    async tokenGoogle() {
      if (token && Date.now() < tokenExpira) return token;
      if (!auth.currentUser) throw new Error("Faça login primeiro.");
      const r = await authMod.reauthenticateWithPopup(auth.currentUser, provider);
      guardarToken(authMod.GoogleAuthProvider.credentialFromResult(r));
      return token;
    }
  };
  return fb;
}

function guardarToken(cred) {
  if (cred && cred.accessToken) { token = cred.accessToken; tokenExpira = Date.now() + 50 * 60 * 1000; }
}

// Página do aluno: login anônimo + Firestore sem cache local.
export async function iniciarFirebaseAluno(config) {
  const appMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
  const authMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
  const fsMod = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
  const app = appMod.initializeApp(config, "aluno");
  const auth = authMod.getAuth(app);
  await authMod.signInAnonymously(auth);
  const db = fsMod.getFirestore(app);
  return { db, doc: fsMod.doc, collection: fsMod.collection, setDoc: fsMod.setDoc, onSnapshot: fsMod.onSnapshot };
}
