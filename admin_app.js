// admin_app.js (ESM) – Firestore sync BEZ logowania (public write)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig, TOURNAMENT_ID } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const ref = doc(db, "tournaments", TOURNAMENT_ID);

let applyingRemote = false;

// --- zapis stanu (najbezpieczniej: bierzemy snapshot z localStorage, bo v10 trzyma "system" lokalnie)
function readSystemFromLocalStorage() {
  try {
    const raw = localStorage.getItem("tournamentSystem");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("Nie mogę odczytać tournamentSystem z localStorage:", e);
    return null;
  }
}

function readPlayoffFromLocalStorage() {
  try {
    const raw = localStorage.getItem("playoffBracket");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

async function saveState() {
  if (applyingRemote) return;

  const systemSnapshot = readSystemFromLocalStorage();
  const playoffSnapshot =
    (typeof window.currentPlayoffBracket !== "undefined" && window.currentPlayoffBracket) ||
    readPlayoffFromLocalStorage() ||
    null;

  // jeśli jeszcze nic nie ma w localStorage (np. przed pierwszym zapisem), nie wysyłaj nulli
  if (!systemSnapshot) return;

  const payload = {
    system: systemSnapshot,
    currentPlayoffBracket: playoffSnapshot,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, payload, { merge: true });
  } catch (e) {
    console.error("Błąd zapisu do Firestore:", e);
  }
}

// --- odśwież UI admina na żądanie (rozwiązuje „mecze dopiero po F5”)
function forceUiRefresh(delay = 120) {
  setTimeout(() => {
    try {
      if (typeof window.updateTournamentView === "function") window.updateTournamentView();
      if (typeof window.updateRanking === "function") window.updateRanking();
      if (typeof window.renderPlayers === "function") window.renderPlayers();
      if (typeof window.displayPlayoffBracket === "function" && window.currentPlayoffBracket) {
        window.displayPlayoffBracket(window.currentPlayoffBracket);
      }
    } catch (e) {
      console.error("forceUiRefresh error:", e);
    }
  }, delay);
}

// --- podmień localStorage save w Twoim skrypcie na Firestore save
// Uwaga: Twój script_with_tables_v10.js woła saveToLocalStorage() – przechwytujemy to tutaj.
window.saveToLocalStorage = function () {
  // najpierw pozwól Twojemu kodowi zapisać do localStorage, potem wyślij do Firestore
  // (tu tylko „dosyłamy” do Firestore)
  saveState();
};

// loadFromLocalStorage niech nic nie robi – stan przyjdzie z Firestore
window.loadFromLocalStorage = function () {};

// --- realtime: z Firestore -> localStorage -> UI
onSnapshot(ref, (snap) => {
  const data = snap.data();
  if (!data) return;

  applyingRemote = true;
  try {
    // Wstrzyknij do localStorage, bo v10 korzysta z localStorage jako źródła prawdy
    if (data.system) {
      localStorage.setItem("tournamentSystem", JSON.stringify(data.system));
    }
    if ("currentPlayoffBracket" in data) {
      if (data.currentPlayoffBracket) {
        localStorage.setItem("playoffBracket", JSON.stringify(data.currentPlayoffBracket));
        window.currentPlayoffBracket = data.currentPlayoffBracket;
      } else {
        localStorage.removeItem("playoffBracket");
        window.currentPlayoffBracket = null;
      }
    }

    // i przerysuj admina
    forceUiRefresh(50);
  } finally {
    applyingRemote = false;
  }
});

// --- auto-zapis po klikach i inputach
document.addEventListener("click", (e) => {
  const t = e.target;
  if (!t) return;
  if (t.tagName === "BUTTON" || t.closest("button")) {
    // po kliknięciach daj chwilę, żeby Twój skrypt zdążył zapisać do localStorage
    setTimeout(saveState, 120);
  }
});

document.addEventListener("input", (e) => {
  const t = e.target;
  if (!t) return;
  if (t.matches("input") || t.matches("select") || t.matches("textarea")) {
    setTimeout(saveState, 250);
  }
});

// --- kluczowe: po starcie turnieju odśwież UI od razu
document.getElementById("startTournamentBtn")?.addEventListener("click", () => forceUiRefresh(150));
document.getElementById("resetTournamentBtn")?.addEventListener("click", () => forceUiRefresh(150));
