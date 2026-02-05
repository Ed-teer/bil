// admin_app.js (ESM) – zapis do Firestore bez logowania (public write)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig, TOURNAMENT_ID } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const ref = doc(db, "tournaments", TOURNAMENT_ID);

let applyingRemote = false;

function buildSerializableSystem(sys){
  if (!sys) return null;
  const t = sys.tournament || {};
  return {
    playerPool: Array.isArray(sys.playerPool) ? sys.playerPool : [],
    tournament: {
      ...t,
      playedPairs: Array.from(t.playedPairs || [])
    }
  };
}

async function saveState() {
  if (applyingRemote) return;

  const payload = {
    system: buildSerializableSystem(window.system),
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
    // dzięki setterowi w skrypcie v10 FIXED: window.system = ... scala w stały obiekt 'system'
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

// Auto-zapis: kliknięcia i inputy
document.addEventListener("click", (e) => {
  const t = e.target;
  if (t && (t.tagName === "BUTTON" || t.closest("button"))) setTimeout(saveState, 50);
});
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t && (t.matches("input") || t.matches("select"))) setTimeout(saveState, 120);
});
