// admin_app.js (ESM) – Firestore sync BEZ logowania (public write)
// Źródłem prawdy jest localStorage "tournamentSystem" (tak jak w Twoim v10).
// My tylko syncujemy to z Firestore i wymuszamy refresh UI po resetach/startach.

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

function writeSystemToLS(systemObj) {
  if (systemObj == null) {
    localStorage.removeItem("tournamentSystem");
    return;
  }
  localStorage.setItem("tournamentSystem", JSON.stringify(systemObj));
}

function forceUiRefresh(delay = 60) {
  setTimeout(() => {
    try {
      // Najważniejsze: w v10 logika siedzi w pamięci skryptu,
      // więc musimy przeładować stan z LS do "system" przez oryginalny loadFromLocalStorage().
      if (typeof window.__originalLoadFromLocalStorage === "function") {
        window.__originalLoadFromLocalStorage();
      } else if (typeof window.loadFromLocalStorage === "function") {
        // fallback (jeśli nie udało się podmienić)
        window.loadFromLocalStorage();
      }

      // i dopiero potem render
      if (typeof window.renderPlayers === "function") window.renderPlayers();
      if (typeof window.updateTournamentView === "function") window.updateTournamentView();
      if (typeof window.updateRanking === "function") window.updateRanking();
      if (typeof window.displayPlayoffBracket === "function" && window.currentPlayoffBracket) {
        window.displayPlayoffBracket(window.currentPlayoffBracket);
      }
    } catch (e) {
      console.error("forceUiRefresh error:", e);
    }
  }, delay);
}

async function saveStateToFirestore() {
  if (applyingRemote) return;

  const systemSnapshot = readSystemFromLS();

  // Reset ma prawo wyczyścić stan – wtedy wysyłamy null (żeby LIVE się wyczyścił)
  const payload = {
    system: systemSnapshot ?? null,
    currentPlayoffBracket: window.currentPlayoffBracket ?? null,
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(ref, payload, { merge: true });
  } catch (e) {
    console.error("Firestore save error:", e);
  }
}

/**
 * 1) Zapnij się do istniejących funkcji v10:
 * - v10 ma saveToLocalStorage() i loadFromLocalStorage()
 * My je owijamy, nie zastępujemy logiki.
 */
(function hookOriginalFunctions() {
  const origSave = window.saveToLocalStorage;
  const origLoad = window.loadFromLocalStorage;

  // zapamiętaj oryginały pod stałą nazwą (używamy w forceUiRefresh)
  if (typeof origLoad === "function") window.__originalLoadFromLocalStorage = origLoad;

  if (typeof origSave === "function") {
    window.saveToLocalStorage = function () {
      // najpierw niech v10 zapisze do localStorage
      origSave();
      // potem wypchnij snapshot do Firestore
      saveStateToFirestore();
    };
  } else {
    // fallback: jeśli z jakiegoś powodu nie ma oryginału
    window.saveToLocalStorage = function () {
      saveStateToFirestore();
    };
  }

  // NIE blokujemy loadFromLocalStorage – v10 musi móc wczytać stan z LS
  // (to właśnie usuwa potrzebę F5 po resecie)
  if (typeof origLoad === "function") {
    window.loadFromLocalStorage = function () {
      origLoad();
    };
  }
})();

/**
 * 2) Real-time: Firestore -> localStorage -> odśwież UI
 */
onSnapshot(ref, (snap) => {
  const data = snap.data();
  if (!data) return;

  applyingRemote = true;
  try {
    // kluczowe: zapis do localStorage, bo v10 czyta tylko stamtąd
    writeSystemToLS("system" in data ? data.system : null);

    if ("currentPlayoffBracket" in data) {
      window.currentPlayoffBracket = data.currentPlayoffBracket ?? null;
    }

    forceUiRefresh(30);
  } finally {
    applyingRemote = false;
  }
});

/**
 * 3) Wymuszenia po kliknięciach (start/reset) – bez F5
 */
document.getElementById("startTournamentBtn")?.addEventListener("click", () => {
  // daj v10 czas wygenerować mecze i zapisać LS
  setTimeout(() => {
    saveStateToFirestore();
    forceUiRefresh(50);
  }, 200);
});

document.getElementById("resetTournamentBtn")?.addEventListener("click", () => {
  // daj v10 czas wyczyścić LS / stan
  setTimeout(() => {
    saveStateToFirestore();  // to jest to, co „budzi” LIVE po resecie
    forceUiRefresh(50);      // i to usuwa konieczność F5 w adminie
  }, 350);
});

// Dodatkowo: po każdej interakcji próbujemy dopchnąć zapis
document.addEventListener("click", (e) => {
  const t = e.target;
  if (!t) return;
  if (t.tagName === "BUTTON" || t.closest("button")) setTimeout(saveStateToFirestore, 250);
});
document.addEventListener("input", (e) => {
  const t = e.target;
  if (!t) return;
  if (t.matches("input") || t.matches("select") || t.matches("textarea")) setTimeout(saveStateToFirestore, 350);
});
