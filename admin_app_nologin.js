// admin_app_nologin.js (ESM) – zapis do Firestore bez logowania (public write)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig, TOURNAMENT_ID } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const ref = doc(db, "tournaments", TOURNAMENT_ID);

// --- 1) załaduj istniejący skrypt aplikacji (klasyczny) ---
await new Promise((resolve, reject) => {
  const s = document.createElement("script");
  s.src = "script_with_tables_v10.js";
  s.onload = resolve;
  s.onerror = reject;
  document.body.appendChild(s);
});

// --- 2) Firestore sync ---
let applyingRemote = false;

async function saveState() {
  if (applyingRemote) return;

  const payload = {
    system: window.system ?? null,
    currentPlayoffBracket: (typeof window.currentPlayoffBracket !== "undefined" ? window.currentPlayoffBracket : null),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(ref, payload, { merge: true });
  } catch (e) {
    console.error("Błąd zapisu do Firestore:", e);
  }
}

// Podmień localStorage na Firestore
window.saveToLocalStorage = function () { saveState(); };
window.loadFromLocalStorage = function () { /* stan przyjdzie z onSnapshot */ };

onSnapshot(ref, (snap) => {
  const data = snap.data();
  if (!data) return;

  applyingRemote = true;
  try {
    if (data.system) window.system = data.system;
    if ("currentPlayoffBracket" in data) window.currentPlayoffBracket = data.currentPlayoffBracket;

    if (typeof window.renderPlayers === "function") window.renderPlayers();
    if (typeof window.updateTournamentView === "function") window.updateTournamentView();
    if (typeof window.updateRanking === "function") window.updateRanking();
    if (typeof window.displayPlayoffBracket === "function" && window.currentPlayoffBracket) {
      window.displayPlayoffBracket(window.currentPlayoffBracket);
    }
  } finally {
    applyingRemote = false;
  }
});

// Auto-zapis: przyciski
document.addEventListener("click", (e) => {
  const t = e.target;
  if (!t) return;
  if (t.tagName === "BUTTON" || t.closest("button")) setTimeout(saveState, 50);
});

// Auto-zapis: inputy (wyniki / selecty)
document.addEventListener("input", (e) => {
  const t = e.target;
  if (!t) return;
  if (t.matches("input[type='number']") || t.matches("input[type='text']") || t.matches("select")) {
    setTimeout(saveState, 120);
  }
});
