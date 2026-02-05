// admin_app.js
// Firebase sync – BEZ logowania (public write)

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig, TOURNAMENT_ID } from "./firebase-config.js";

// --- Firebase init ---
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const ref = doc(db, "tournaments", TOURNAMENT_ID);

// --- poczekaj aż załaduje się główny skrypt turnieju ---
await new Promise((resolve, reject) => {
  const s = document.createElement("script");
  s.src = "script_with_tables_v10.js";
  s.onload = resolve;
  s.onerror = reject;
  document.body.appendChild(s);
});

// --- sync ---
let applyingRemote = false;

async function saveState() {
  if (applyingRemote) return;

  const payload = {
    system: window.system ?? null,
    currentPlayoffBracket:
      typeof window.currentPlayoffBracket !== "undefined"
        ? window.currentPlayoffBracket
        : null,
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(ref, payload, { merge: true });
  } catch (e) {
    console.error("Firestore save error:", e);
  }
}

// 🔁 podmień localStorage na Firestore
window.saveToLocalStorage = () => saveState();
window.loadFromLocalStorage = () => {};

// --- realtime update ---
onSnapshot(ref, (snap) => {
  const data = snap.data();
  if (!data) return;

  applyingRemote = true;
  try {
    if (data.system) window.system = data.system;
    if ("currentPlayoffBracket" in data) {
      window.currentPlayoffBracket = data.currentPlayoffBracket;
    }

    if (typeof renderPlayers === "function") renderPlayers();
    if (typeof updateTournamentView === "function") updateTournamentView();
    if (typeof updateRanking === "function") updateRanking();
    if (
      typeof displayPlayoffBracket === "function" &&
      window.currentPlayoffBracket
    ) {
      displayPlayoffBracket(window.currentPlayoffBracket);
    }
  } finally {
    applyingRemote = false;
  }
});

// --- auto zapis ---
document.addEventListener("click", (e) => {
  const t = e.target;
  if (t && (t.tagName === "BUTTON" || t.closest("button"))) {
    setTimeout(saveState, 50);
  }
});

document.addEventListener("input", (e) => {
  const t = e.target;
  if (
    t &&
    (t.matches("input") || t.matches("select"))
  ) {
    setTimeout(saveState, 120);
  }
});
