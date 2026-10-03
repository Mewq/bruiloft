// Zoekt écht moeilijke Kleurjam-levels in de stijl van Rush Hour.
//
// Een vol bord met 'auto's' die maar één kant op schuiven (stenen en gekleurde
// blokken). We rekenen achterstevoren vanaf alle opgeloste standen (alle
// gekleurde blokken buiten) en vinden zo voor élke stand de kortste afstand tot
// de oplossing. De beginstand die het verst weg ligt, wordt het level. Daarna
// controleert de echte oplosser uit het spel de par.
//
//   node tools/kleurjam_hard.js MAP/game.html POGINGEN ZAAD UIT.json
"use strict";
const fs = require("fs");
const {loadEngine, solve} = require("./kleurjam_solver.js");
const html = fs.readFileSync(process.argv[2], "utf8");
const tries = Number(process.argv[3] || 100);
let seed = Number(process.argv[4] || 1);
const outFile = process.argv[5];
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const eng = loadEngine(html);
const COLORS = ["red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"];

// Stuk: horizontaal (H) of verticaal (V), lengte len; positie (r,c) = linksboven.
function cellsOf(p) { const a = []; for (let i = 0; i < p.len; i++) a.push(p.dir === "H" ? [0, i] : [i, 0]); return a; }

function makeBoard() {
  const N = pick((process.env.KJ_SIZES || "6,6,6,7").split(",").map(Number));
  const grid = Array.from({length: N}, () => Array(N).fill(-1));
  const pieces = [];
  const free = (r, c, dir, len) => {
    for (let i = 0; i < len; i++) {
      const rr = dir === "H" ? r : r + i, cc = dir === "H" ? c + i : c;
      if (rr >= N || cc >= N || grid[rr][cc] !== -1) return false;
    }
    return true;
  };
  const put = (p) => { for (let i = 0; i < p.len; i++) grid[p.dir === "H" ? p.r : p.r + i][p.dir === "H" ? p.c + i : p.c] = pieces.length; pieces.push(p); };
  // walls: vaste muurtjes die nooit bewegen
  const walls = [];
  const nWall = Math.floor(rnd() * (Number(process.env.KJ_WALLS || 3) + 1));
  for (let t = 0; walls.length < nWall && t < 100; t++) {
    const r = Math.floor(rnd() * N), c = Math.floor(rnd() * N);
    if (grid[r][c] === -1) { grid[r][c] = -2; walls.push([r, c]); }
  }
  const cMin = Number(process.env.KJ_CMIN || 2), cMax = Number(process.env.KJ_CMAX || 4);
  const nColor = cMin + Math.floor(rnd() * (cMax - cMin + 1));   // zoveel blokken moeten eruit
  const colors = COLORS.slice().sort(() => rnd() - 0.5).slice(0, nColor);
  for (const color of colors) {
    for (let t = 0; t < 50; t++) {
      const dir = pick(["H", "V"]), len = pick([2, 2, 3]);
      const r = Math.floor(rnd() * N), c = Math.floor(rnd() * N);
      if (free(r, c, dir, len)) {
        const side = dir === "H" ? pick(["left", "right"]) : pick(["top", "bottom"]);
        put({color, dir, len, r, c, side});
        break;
      }
    }
  }
  if (pieces.length < nColor) return null;
  const nStone = Math.min(Number(process.env.KJ_SMAX || 99), Math.floor(N * N * (0.40 + rnd() * 0.14) / 2.3));
  for (let s = 0, t = 0; s < nStone && t < 400; t++) {
    const dir = pick(["H", "V"]), len = rnd() < 0.7 ? 2 : 3;
    const r = Math.floor(rnd() * N), c = Math.floor(rnd() * N);
    if (free(r, c, dir, len)) { put({color: "stone", dir, len, r, c}); s++; }
  }
  return {N, pieces, walls};
}

// --- snelle regels voor dit soort borden (alleen schuiven en eruit) ---
function analyse(board) {
  const {N, pieces} = board;
  const wallCells = (board.walls || []).map(w => w[0] * N + w[1]);
  const P = pieces.length;
  const colored = pieces.map((p, i) => p.color !== "stone" ? i : -1).filter(i => i >= 0);
  // positie = index langs de schuifas; de andere coördinaat ligt vast
  const fixed = pieces.map(p => p.dir === "H" ? p.r : p.c);
  const maxPos = pieces.map(p => N - p.len);
  const occ = (state) => {
    const g = new Int8Array(N * N).fill(-1);
    for (const w of wallCells) g[w] = -2;
    for (let i = 0; i < P; i++) {
      const s = state[i]; if (s < 0) continue;
      const p = pieces[i];
      for (let k = 0; k < p.len; k++) {
        const r = p.dir === "H" ? fixed[i] : s + k, c = p.dir === "H" ? s + k : fixed[i];
        g[r * N + c] = i;
      }
    }
    return g;
  };
  const cellFree = (g, i, pos) => {        // past stuk i op pos (los van zichzelf)?
    const p = pieces[i];
    for (let k = 0; k < p.len; k++) {
      const r = p.dir === "H" ? fixed[i] : pos + k, c = p.dir === "H" ? pos + k : fixed[i];
      const v = g[r * N + c]; if (v !== -1 && v !== i) return false;
    }
    return true;
  };
  // kan stuk i vanaf pos door zijn poort naar buiten (alles ertussen vrij)?
  const canExit = (g, i, pos) => {
    const p = pieces[i];
    if (p.side === "left" || p.side === "top") { for (let x = 0; x < pos; x++) if (!cellFree(g, i, x)) return false; return true; }
    for (let x = pos + 1; x <= maxPos[i]; x++) if (!cellFree(g, i, x)) return false; return true;
  };
  // stand als één getal (8 waarden per stuk, -1 = buiten): veel sneller dan tekst
  const key = P <= 17 ? (st) => { let k = 0; for (let i = P - 1; i >= 0; i--) k = k * 8 + st[i] + 1; return k; }
                      : (st) => st.join(",");
  // 1. alle doelstanden: gekleurd eruit, stenen overal waar ze kunnen komen
  const start = pieces.map((p, i) => p.color === "stone" ? (p.dir === "H" ? p.c : p.r) : -1);
  const dist = new Map();
  let frontier = [];
  {
    const q = [start]; dist.set(key(start), 0);
    while (q.length) {
      const st = q.pop(); frontier.push(st);
      const g = occ(st);
      for (let i = 0; i < P; i++) {
        if (st[i] < 0) continue;
        for (const d of [-1, 1]) for (let x = st[i] + d; x >= 0 && x <= maxPos[i] && cellFree(g, i, x); x += d) {
          const ns = st.slice(); ns[i] = x; const k = key(ns);
          if (!dist.has(k)) { dist.set(k, 0); q.push(ns); }
        }
      }
      if (dist.size > 200000) return null;
    }
  }
  // 2. achteruit zoeken: elke stap terug is één zet vooruit
  let depth = 0, best = null, bestD = -1;
  while (frontier.length) {
    const next = [];
    for (const st of frontier) {
      const g = occ(st);
      const allIn = colored.every(i => st[i] >= 0);
      if (allIn && depth > bestD) { bestD = depth; best = st; }
      for (let i = 0; i < P; i++) {
        if (st[i] >= 0) {
          for (const d of [-1, 1]) for (let x = st[i] + d; x >= 0 && x <= maxPos[i] && cellFree(g, i, x); x += d) {
            const ns = st.slice(); ns[i] = x; const k = key(ns);
            if (!dist.has(k)) { dist.set(k, depth + 1); next.push(ns); }
          }
        } else if (pieces[i].color !== "stone") {
          // terug naar binnen: elke plek vanwaar hij in één zet eruit kan
          for (let x = 0; x <= maxPos[i]; x++) {
            if (!cellFree(g, i, x) || !canExit(g, i, x)) continue;
            const ns = st.slice(); ns[i] = x; const k = key(ns);
            if (!dist.has(k)) { dist.set(k, depth + 1); next.push(ns); }
          }
        }
      }
    }
    if (dist.size > Number(process.env.KJ_CAP || 900000)) return null;
    frontier = next; depth++;
  }
  return {dist: bestD, state: best, states: dist.size};
}

function toLevel(board, state) {
  const {N, pieces} = board;
  const blocks = [], gates = [];
  pieces.forEach((p, i) => {
    const r = p.dir === "H" ? p.r : state[i], c = p.dir === "H" ? state[i] : p.c;
    blocks.push({id: "b" + i, color: p.color, move: p.dir, row: r, col: c, cells: cellsOf(p)});
    if (p.color !== "stone") gates.push({color: p.color, side: p.side, index: p.dir === "H" ? p.r : p.c, span: 1});
  });
  return {rows: N, cols: N, walls: (board.walls || []).map(w => [w[0], w[1]]), blocks, gates};
}

// Bord aanpassen: een steen verplaatsen, toevoegen of weghalen, of een
// gekleurd blok verleggen. Alleen houden als de puzzel er dieper van wordt.
function mutate(board) {
  const b = {N: board.N, pieces: board.pieces.map(p => Object.assign({}, p)), walls: (board.walls || []).map(w => w.slice())};
  const N = b.N;
  const occupied = (skip) => {
    const g = new Set(b.walls.map(w => w[0] + "," + w[1]));
    b.pieces.forEach((p, i) => { if (i === skip) return; for (let k = 0; k < p.len; k++) g.add((p.dir === "H" ? p.r : p.r + k) + "," + (p.dir === "H" ? p.c + k : p.c)); });
    return g;
  };
  const fitsAt = (p, g) => { for (let k = 0; k < p.len; k++) { const r = p.dir === "H" ? p.r : p.r + k, c = p.dir === "H" ? p.c + k : p.c; if (r >= N || c >= N || g.has(r + "," + c)) return false; } return true; };
  const stonesNow = b.pieces.filter(p => p.color === "stone");
  if (process.env.KJ_CONVERT && stonesNow.length && rnd() < 0.35) {
    // ombouwen: een steen wordt een gekleurd blok met eigen poort, of vaste muur
    const si = b.pieces.indexOf(pick(stonesNow)), s = b.pieces[si];
    const used = new Set(b.pieces.map(p => p.color));
    const free = COLORS.filter(c => !used.has(c));
    if (free.length && rnd() < 0.6) {
      b.pieces[si] = Object.assign({}, s, {color: pick(free), side: s.dir === "H" ? pick(["left", "right"]) : pick(["top", "bottom"])});
    } else {
      b.pieces.splice(si, 1);
      for (let k = 0; k < s.len; k++) b.walls.push([s.dir === "H" ? s.r : s.r + k, s.dir === "H" ? s.c + k : s.c]);
    }
    return b;
  }
  const roll = rnd();
  const stones = b.pieces.map((p, i) => p.color === "stone" ? i : -1).filter(i => i >= 0);
  const sMax = Number(process.env.KJ_SMAX || 99), wMax = Number(process.env.KJ_WALLS || 3);
  if (roll < 0.15) {                         // muurtje verplaatsen, toevoegen of weghalen
    const g = occupied(-1);
    if (b.walls.length && rnd() < 0.5) b.walls.splice(Math.floor(rnd() * b.walls.length), 1);
    if (b.walls.length < wMax) {
      const r = Math.floor(rnd() * N), c = Math.floor(rnd() * N);
      if (!g.has(r + "," + c)) b.walls.push([r, c]);
    }
    return b;
  }
  if (roll < 0.3 && stones.length > 0) { b.pieces.splice(pick(stones), 1); return b; }
  if (roll < 0.3 && stones.length > sMax) { b.pieces.splice(pick(stones), 1); return b; }
  if (roll < 0.5 && stones.length < sMax) {
    const p = {color: "stone", dir: pick(["H", "V"]), len: rnd() < 0.7 ? 2 : 3, r: Math.floor(rnd() * N), c: Math.floor(rnd() * N)};
    if (fitsAt(p, occupied(-1))) { b.pieces.push(p); return b; }
    return null;
  }
  const i = Math.floor(rnd() * b.pieces.length), p = b.pieces[i];
  const q = Object.assign({}, p, {r: Math.floor(rnd() * N), c: Math.floor(rnd() * N)});
  if (rnd() < 0.3) q.dir = q.dir === "H" ? "V" : "H";
  if (q.color !== "stone") q.side = q.dir === "H" ? pick(["left", "right"]) : pick(["top", "bottom"]);
  if (!fitsAt(q, occupied(i))) return null;
  b.pieces[i] = q;
  return b;
}

// Kandidaten (diepte >= 22) worden direct bewaard, zonder dure controle; die
// gebeurt bij het kiezen. Nieuwe zoektochten beginnen vaak bij een goed bord.
let found = [];
try { found = JSON.parse(fs.readFileSync(outFile, "utf8")); } catch (e) {}
const seenStates = new Set(found.map(f => JSON.stringify(f.blocks)));
const boards = found.map(f => f.board).filter(Boolean);
function keep(board, a) {
  if (a.dist < Number(process.env.KJ_MIN || 22)) return;
  const nCol = board.pieces.filter(p => p.color !== "stone").length, nSt = board.pieces.length - nCol;
  if (nCol < Number(process.env.KJ_CMIN || 0) || nSt > Number(process.env.KJ_SMAX || 99)) return;
  const lvl = toLevel(board, a.state);
  const k = JSON.stringify(lvl.blocks);
  if (seenStates.has(k)) return;
  seenStates.add(k);
  lvl.par = a.dist; lvl.board = board;
  found.push(lvl); boards.push(board);
  found.sort((x, y) => y.par - x.par);
  fs.writeFileSync(outFile, JSON.stringify(found));
  process.stderr.write(board.N + "x" + board.N + " par " + a.dist + " (" + a.states + " standen)\n");
}
for (let t = 0; t < tries; t++) {
  let board = boards.length && rnd() < 0.6 ? JSON.parse(JSON.stringify(pick(boards))) : makeBoard();
  if (!board) continue;
  let a = analyse(board);
  if (!a) continue;
  let stale = 0;
  while (stale < Number(process.env.KJ_STALE || 90)) {
    const nb = mutate(board);
    if (!nb) { stale++; continue; }
    const na = analyse(nb);
    // score: diepte, met straf zolang er te weinig kleuren of te veel stenen zijn
    const score = (bd, an) => {
      const nCol = bd.pieces.filter(p => p.color !== "stone").length, nSt = bd.pieces.length - nCol;
      return an.dist - 4 * Math.max(0, Number(process.env.KJ_CMIN || 0) - nCol) - 3 * Math.max(0, nSt - Number(process.env.KJ_SMAX || 99));
    };
    if (na && na.state && score(nb, na) >= score(board, a) - (rnd() < 0.1 ? 1 : 0)) {
      if (score(nb, na) > score(board, a)) stale = 0; else stale++;
      board = nb; a = na;
      keep(board, a);
    } else stale++;
  }
}
