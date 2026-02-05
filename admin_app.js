// admin_app.js (ESM) – Firebase sync BEZ logowania (public write)
// Uwaga: ten tryb jest niezabezpieczony (każdy znający link może pisać do bazy, jeśli rules na to pozwalają)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig, TOURNAMENT_ID } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const ref = doc(db, "tournaments", TOURNAMENT_ID);

let applyingRemote = false;

// zapisuj to samo, co idzie do localStorage (to jest jedyny pewny snapshot stanu)
async function saveStateFromLocalStorage() {
  if (applyingRemote) return;

  const raw = localStorage.getItem("tournamentSystem");
  if (!raw) return;

  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { return; }

  try {
    await setDoc(ref, { system: parsed, updatedAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    console.error("Firestore save error:", e);
  }
}

// Podmień saveToLocalStorage tak, żeby dalej działał lokalny zapis + dopiero potem Firestore
const originalSave = window.saveToLocalStorage;
window.saveToLocalStorage = function () {
  try { if (typeof originalSave === "function") originalSave(); } finally {
    saveStateFromLocalStorage();
  }
};

// Remote -> local: wstrzyknij do localStorage i odpal oryginalny loader (on zaktualizuje UI)
const originalLoad = window.loadFromLocalStorage;
onSnapshot(ref, (snap) => {
  const data = snap.data();
  if (!data || !data.system) return;

  applyingRemote = true;
  try {
    localStorage.setItem("tournamentSystem", JSON.stringify(data.system));
    if (typeof originalLoad === "function") originalLoad();
  } finally {
    applyingRemote = false;
  }
});

// dodatkowo: po pierwszym wejściu, jeśli mamy już lokalny stan, wyślij go do Firestore
setTimeout(() => {
  // nie nadpisuj zdalnego, jeśli już istnieje (snapshot przyjdzie i tak)
  saveStateFromLocalStorage();
}, 500);
