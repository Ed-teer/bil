// admin_app.js – Firestore sync BEZ logowania (public write) – wersja “nie psuj v10”
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig, TOURNAMENT_ID } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const ref = doc(db, "tournaments", TOURNAMENT_ID);

let applyingRemote = false;

function readSystemFromLS() {
  try {
    const raw = localStorage.getItem("tournamentSystem");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error("LS read tournamentSystem error:", e);
    return null;
  }
}

function readPlayoffFromLS() {
  try {
    const raw = localStorage.getItem("playoffBracket");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function saveStateToFirestore() {
  if (applyingRemote) return;

  const systemSnapshot = readSystemFromLS();
  const playoffSnapshot = window.currentPlayoffBracket ?? readPlayoffFromLS() ?? null;

  // nie zapisujemy “pustego nic” jeśli v10 jeszcze nie zdążył nic utworzyć
  if (!systemSnapshot) return;

  const payload = {
    system: systemSnapshot,
    currentPlayoffBracket: playoffSnapshot ? JSON.stringify(playoffSnapshot) : null,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, payload, { merge: true });
  } catch (e) {
    console.error("Firestore save error:", e);
  }
}

// 1) Hook: po każdym zapisie v10 -> dopychamy do Firestore
function hookSaveFunction() {
  const orig = window.saveToLocalStorage;
  if (typeof orig !== "function") return false;
  if (window.__SAVE_HOOKED__) return true;
  window.__SAVE_HOOKED__ = true;

  window.saveToLocalStorage = function () {
    // najpierw niech v10 zrobi swój zapis do localStorage
    orig();
    // potem wyślij snapshot do Firestore
    saveStateToFirestore();
  };
  return true;
}

// 2) Hook: przechwyt play-off bez grzebania w v10
function hookPlayoffCapture() {
  const orig = window.displayPlayoffBracket;
  if (typeof orig !== "function") return false;
  if (window.__PLAYOFF_HOOKED__) return true;
  window.__PLAYOFF_HOOKED__ = true;

  window.displayPlayoffBracket = function (bracket) {
    try {
      window.currentPlayoffBracket = bracket ?? null;
      localStorage.setItem("playoffBracket", JSON.stringify(window.currentPlayoffBracket));
    } catch {}
    return orig.call(this, bracket);
  };
  return true;
}

// Odpal hooki, nawet jeśli v10 ładuje się chwilę
(function waitForV10() {
  let n = 0;
  const id = setInterval(() => {
    n++;
    const ok1 = hookSaveFunction();
    const ok2 = hookPlayoffCapture();
    if ((ok1 && ok2) || n > 80) clearInterval(id);
  }, 100);
})();

// 3) Firestore -> localStorage (ALE: tylko jeśli system nie jest null)
onSnapshot(ref, (snap) => {
  const data = snap.data();
  if (!data) return;

  applyingRemote = true;
  try {
    // NIE nadpisuj localStorage nullami, bo to “kasuje” UI/admina
    if (data.system) {
      localStorage.setItem("tournamentSystem", JSON.stringify(data.system));
    }

    if ("currentPlayoffBracket" in data) {
      window.currentPlayoffBracket = data.currentPlayoffBracket ?? null;
      if (data.currentPlayoffBracket) {
        localStorage.setItem("playoffBracket", JSON.stringify(data.currentPlayoffBracket));
      } else {
        localStorage.removeItem("playoffBracket");
      }
    }

    // odśwież UI przez oryginalny mechanizm v10 (loadFromLocalStorage)
    if (typeof window.loadFromLocalStorage === "function") {
      window.loadFromLocalStorage();
    }
    if (typeof window.updateTournamentView === "function") window.updateTournamentView();
    if (typeof window.updateRanking === "function") window.updateRanking();
    if (typeof window.renderPlayers === "function") window.renderPlayers();
    if (typeof window.displayPlayoffBracket === "function" && window.currentPlayoffBracket) {
      window.displayPlayoffBracket(window.currentPlayoffBracket);
    }
  } finally {
    applyingRemote = false;
  }
});

// 4) Dodatkowy “ratunek”: po klikach/inputach dopychamy zapis (gdyby v10 nie zawołał saveToLocalStorage)
// --- THROTTLED SAVE (ochrona quota Firestore) ---
let saveTimer = null;
let lastSentHash = "";

function scheduleSave(delay = 800) {
  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    const systemSnapshot = readSystemFromLS();
    if (!systemSnapshot) return;

    const currentHash = JSON.stringify(systemSnapshot);
    if (currentHash === lastSentHash) return; // brak zmian → brak zapisu
    lastSentHash = currentHash;

    await saveStateToFirestore();
  }, delay);
}

// zamiast zapisywać za każdym razem → tylko planujemy zapis
document.addEventListener("click", (e) => {
  const t = e.target;
  if (t && (t.tagName === "BUTTON" || t.closest("button"))) {
    scheduleSave(600);
  }
});

document.addEventListener("input", () => {
  scheduleSave(900);
});
