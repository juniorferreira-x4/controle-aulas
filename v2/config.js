// Configuração do Firebase (não é segredo: fica público no site de qualquer forma).
// Enquanto estiver null, o app funciona no "modo local" (dados só neste navegador).
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB_9OBNAG3vaGtIo7_3Ydt99a60T1J948U",
  authDomain: "controle-aulas-1e786.firebaseapp.com",
  projectId: "controle-aulas-1e786",
  storageBucket: "controle-aulas-1e786.firebasestorage.app",
  messagingSenderId: "624606064629",
  appId: "1:624606064629:web:ca2f7fd568289c80613abc"
};

// Único e-mail autorizado a entrar (as regras do Firestore também exigem isso).
export const EMAIL_AUTORIZADO = "juniorferreira.x4@gmail.com";
