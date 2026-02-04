// admin_app.js (ESM)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { firebaseConfig, TOURNAMENT_ID } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// --- UI: proste logowanie admina ---
const top = document.querySelector("h1");
const authBar = document.createElement("div");
authBar.style.cssText = "display:flex; gap:10px; justify-content:center; margin:-10px 0 20px 0; flex-wrap:wrap;";
authBar.innerHTML = `
  <button id="loginBtn" type="button">🔐 Zaloguj (Google)</button>
  <button id="logoutBtn" type="button" style="display:none;">🚪 Wyloguj</button>
  <span id="authStatus" style="color:white; font-weight:700; text-shadow: 1px 1px 2px rgba(0,0,0,0.6);">Tryb podglądu (bez zapisu)</span>
`;
top.insertAdjacentElement("afterend", authBar);

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authStatus = document.getElementById("authStatus");

loginBtn.addEventListener("click", async () => {
  await signInWithPopup(auth, provider);
});
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

let canWrite = false;
onAuthStateChanged(auth, (user) => {
  if (user) {
    canWrite = true;
    loginBtn.style.display = "none";
    logoutBtn.style.display = "";
    authStatus.textContent = `Zalogowano: ${user.email} (zapis włączony)`;
  } else {
    canWrite = false;
    loginBtn.style.display = "";
    logoutBtn.style.display = "none";
    authStatus.textContent = "Tryb podglądu (bez zapisu)";
  }
});

// --- 1) załaduj istniejący skrypt aplikacji (klasyczny) ---
await new Promise((resolve, reject) => {
  const s = document.createElement("script");
  s.src = "script_with_tables_v10.js";
  s.onload = resolve;
  s.onerror = reject;
  document.body.appendChild(s);
});

// --- 2) Firebase state sync ---
const ref = doc(db, "tournaments", TOURNAMENT_ID);
let applyingRemote = false;

async function saveState() {
  if (!canWrite) return;
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

// Podmień lokalny storage na Firestore
window.saveToLocalStorage = function() { saveState(); };
window.loadFromLocalStorage = function() { /* stan przyjdzie z onSnapshot */ };

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

document.addEventListener("click", (e) => {
  const t = e.target;
  if (!t) return;
  if (t.tagName === "BUTTON" || t.closest("button")) setTimeout(saveState, 50);
});
document.addEventListener("input", (e) => {
  const t = e.target;
  if (!t) return;
  if (t.matches("input[type='number']") || t.matches("input[type='text']") || t.matches("select")) {
    setTimeout(saveState, 120);
  }
});
