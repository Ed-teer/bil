// live.js (ESM)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig, TOURNAMENT_ID } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const ref = doc(db, "tournaments", TOURNAMENT_ID);

const elTables = document.getElementById("tables");
const elQueue = document.getElementById("queue");
const elRanking = document.getElementById("ranking");
const elPlayoff = document.getElementById("playoff");
const elLast = document.getElementById("lastUpdate");

function fmtDate(d){
  try { return new Intl.DateTimeFormat("pl-PL", { dateStyle:"medium", timeStyle:"short"}).format(d); }
  catch { return ""; }
}
function safePct(x){
  if (!Number.isFinite(x)) return "0.0";
  return (Math.round(x * 1000) / 10).toFixed(1);
}

function renderTables(system, playoff){
  const tables = (system?.tournament?.tables || []).map(n => parseInt(n)).filter(n => n>=1 && n<=9).sort((a,b)=>a-b);
  const map = new Map();

  const all = system?.tournament?.allMatches || [];
  all.forEach(m => {
    if (!m || m.table == null || m.completed || m.isBye) return;
    map.set(m.table, {
      badge: "Liga",
      names: `${m.player1} vs ${m.player2}`,
      score: (m.score1 != null || m.score2 != null) ? `${m.score1 ?? 0} : ${m.score2 ?? 0}` : ""
    });
  });

  if (playoff?._meta?.matches) {
    for (const [key, meta] of Object.entries(playoff._meta.matches)) {
      if (!meta || meta.table == null || meta.completed) continue;
      const [roundKey, idxStr] = key.split("_");
      const idx = parseInt(idxStr || "0");
      let match = null;
      if (roundKey === "roundOf12") match = playoff.roundOf12?.[idx];
      if (roundKey === "quarterfinals") match = playoff.quarterfinals?.[idx];
      if (roundKey === "semifinals") match = playoff.semifinals?.[idx];
      if (roundKey === "final") match = playoff.final;
      if (roundKey === "thirdPlace") match = playoff.thirdPlace;
      if (!match) continue;
      const [p1, p2] = match;
      if (!p1 || !p2 || p1 === "bye" || p2 === "bye") continue;
      if (!map.has(meta.table)) map.set(meta.table, { badge:"Play-off", names:`${p1} vs ${p2}`, score:"" });
    }
  }

  elTables.innerHTML = "";
  if (tables.length === 0) { elTables.innerHTML = "<div>Brak wybranych stołów.</div>"; return; }

  tables.forEach(t => {
    const data = map.get(t);
    const div = document.createElement("div");
    div.className = "tableTile";
    div.innerHTML = `
      <div class="top"><span>Stół ${t}</span><span class="badge">${data ? data.badge : "Wolny"}</span></div>
      <div class="match">${data ? data.names : "—"}</div>
      <div class="score">${data?.score ? `Wynik: ${data.score}` : ""}</div>
    `;
    elTables.appendChild(div);
  });
}

function renderQueue(system){
  const all = system?.tournament?.allMatches || [];
  const waiting = all
    .filter(m => m && !m.completed && !m.isBye && m.table == null)
    .sort((a,b) => (a.globalIndex ?? 0) - (b.globalIndex ?? 0))
    .slice(0, 10);

  elQueue.innerHTML = "";
  if (waiting.length === 0) { elQueue.innerHTML = "<div>Brak oczekujących meczów.</div>"; return; }

  waiting.forEach(m => {
    const div = document.createElement("div");
    div.className = "queueItem";
    div.innerHTML = `<div class="left">${m.player1} vs ${m.player2}</div><div class="right">Runda ${m.round ?? "?"}</div>`;
    elQueue.appendChild(div);
  });
}

function renderRanking(system){
  const players = system?.tournament?.players || [];
  const statsMap = system?.tournament?.playerStats || {};
  const manualOrder = system?.tournament?.manualOrder || {};

  const ranked = players
    .map(name => {
      const s = statsMap[name] || { matches:0, wonGames:0, totalGames:0, byes:0 };
      const ratio = s.totalGames > 0 ? (s.wonGames / s.totalGames) : 0;
      return { name, s, ratio };
    })
    .sort((a,b) => {
      if (b.ratio !== a.ratio) return b.ratio - a.ratio;
      if ((b.s.wonGames ?? 0) !== (a.s.wonGames ?? 0)) return (b.s.wonGames ?? 0) - (a.s.wonGames ?? 0);

      const ma = manualOrder[a.name];
      const mb = manualOrder[b.name];
      if (ma != null && mb == null) return -1;
      if (ma == null && mb != null) return 1;
      if (ma != null && mb != null && ma !== mb) return ma - mb;

      return a.name.localeCompare(b.name, "pl");
    });

  elRanking.innerHTML = "";
  ranked.forEach((r, i) => {
    const tr = document.createElement("tr");
    const pct = r.s.totalGames > 0 ? ((r.s.wonGames / r.s.totalGames) * 100) : 0;

    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${r.name}</td>
      <td>${r.s.matches ?? 0}</td>
      <td>${r.s.wonGames ?? 0}</td>
      <td>${(r.s.wonGames ?? 0)} / ${(r.s.totalGames ?? 0)}</td>
      <td>${pct.toFixed(1)}%</td>
    `;
    elRanking.appendChild(tr);
  });
}


function playoffMetaBadge(playoff, key){
  const meta = playoff?._meta?.matches?.[key];
  if (!meta) return "—";
  if (meta.completed) return "Zakończony";
  if (meta.table != null) return `Stół ${meta.table}`;
  return "—";
}

function renderPlayoff(playoff){
  elPlayoff.innerHTML = "";
  if (!playoff) { elPlayoff.innerHTML = "<div>Brak play-off.</div>"; return; }

  const add = (title, names, badge) => {
    const div = document.createElement("div");
    div.className = "pmatch";
    div.innerHTML = `<div class="hdr"><span>${title}</span><span class="badge">${badge}</span></div><div class="names">${names}</div>`;
    elPlayoff.appendChild(div);
  };

  (playoff.roundOf12 || []).forEach((m, i) => add("Baraże", `${m?.[0] ?? "???"} vs ${m?.[1] ?? "???"}`, playoffMetaBadge(playoff, `roundOf12_${i}`)));
  (playoff.quarterfinals || []).forEach((m, i) => add("Ćwierćfinały", `${m?.[0] ?? "???"} vs ${m?.[1] ?? "???"}`, playoffMetaBadge(playoff, `quarterfinals_${i}`)));
  (playoff.semifinals || []).forEach((m, i) => add("Półfinały", `${m?.[0] ?? "???"} vs ${m?.[1] ?? "???"}`, playoffMetaBadge(playoff, `semifinals_${i}`)));

  const fm = playoff.final || ["???","???"];
  const tm = playoff.thirdPlace || ["???","???"];
  add("Finał", `${fm[0] ?? "???"} vs ${fm[1] ?? "???"}`, playoffMetaBadge(playoff, "final_0"));
  add("3. miejsce", `${tm[0] ?? "???"} vs ${tm[1] ?? "???"}`, playoffMetaBadge(playoff, "thirdPlace_0"));
}

onSnapshot(ref, (snap) => {
const data = snap.data();
if (!data) return;

// --- SYSTEM: obsłuż oba formaty (system / systemJson) ---
let system = null;
try {
  if (data.systemJson) system = JSON.parse(data.systemJson);
  else system = data.system ?? null;
} catch (e) {
  system = data.system ?? null;
}

// --- PLAYOFF: obsłuż oba formaty (playoffJson / currentPlayoffBracket) ---
let playoff = null;
try {
  if (data.playoffJson) playoff = JSON.parse(data.playoffJson);
  else if (typeof data.currentPlayoffBracket === "string") playoff = JSON.parse(data.currentPlayoffBracket);
  else playoff = data.currentPlayoffBracket ?? null;
} catch (e) {
  playoff = data.currentPlayoffBracket ?? null;
}



  const ts = data.updatedAt?.toDate ? data.updatedAt.toDate() : null;
  elLast.textContent = ts ? `Ostatnia aktualizacja: ${fmtDate(ts)}` : "Połączono";

  renderTables(system, playoff);
  renderQueue(system);
  renderRanking(system);
  renderPlayoff(playoff);
});
