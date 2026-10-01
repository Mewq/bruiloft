// Kleurjam-oplosser: zoekt met breedte-eerst de kortste oplossing van een level.
// Gebruikt letterlijk de spelregels uit het spel zelf (het stuk tussen
// "rules engine" en "rendering" in game.html), zodat oplosser en spel nooit
// van mening kunnen verschillen.
//
//   node tools/kleurjam_solver.js MAP/game.html [levelnummer ...]
"use strict";
const fs = require("fs");

function loadEngine(gameHtml) {
  const a = gameHtml.indexOf("/* ---------- rules engine");
  const b = gameHtml.indexOf("/* ---------- rendering ----------");
  const src = gameHtml.slice(a, b);
  const factory = new Function(`
    const SIDE_DIR = {top:[-1,0], bottom:[1,0], left:[0,-1], right:[0,1]};
    const SIDE_AXIS = {top:"V", bottom:"V", left:"H", right:"H"};
    let ROWS = 0, COLS = 0, blocks = [], gates = [], wallSet = new Set();
    let iceSet = new Set(), arrowMap = new Map(), paintMap = new Map();
    let moveCount = 0, clockStarted = 0;
    ${src}
    return {
      setLevel(l){
        ROWS = l.rows; COLS = l.cols;
        wallSet = new Set(l.walls.map(w => key(w[0], w[1])));
        iceSet = new Set((l.ice || []).map(t => key(t[0], t[1])));
        arrowMap = new Map((l.arrows || []).map(t => [key(t[0], t[1]), t[2]]));
        paintMap = new Map((l.paint || []).map(t => [key(t[0], t[1]), t[2]]));
        gates = l.gates.map(g => Object.assign({}, g));
      },
      setBlocks(bs){ blocks = bs; },
      setMoves(m){ moveCount = m; },
      legalMoves, resolveMove, gatesOf, bombLeft,
    };
  `);
  return factory();
}

function loadLevels(gameHtml) {
  const a = gameHtml.indexOf("const LEVELS = [");
  const b = gameHtml.indexOf("\n  ];", a);
  return new Function("return " + gameHtml.slice(a + "const LEVELS = ".length, b + 4))();
}

// Kortste oplossing, of null. limit = maximaal aantal standen.
function solve(eng, lvl, limit) {
  limit = limit || 3000000;
  eng.setLevel(lvl);
  const start = lvl.blocks.map(b => ({
    id: b.id, color: b.color, move: b.move, colors: b.colors || null,
    bonusColor: b.bonusColor || null, bomb: b.bomb || null, frozen: b.frozen || null,
    key: !!b.key, cells: b.cells, row: b.row, col: b.col, exited: false,
  }));
  const enc = (bs) => bs.map(b => b.exited ? "x" : b.row + "," + b.col + (b.color)).join("|");
  const needed = (bs) => { eng.setBlocks(bs); return bs.every(b => !eng.gatesOf(b).length || b.exited); };
  const seen = new Map();
  seen.set(enc(start), null);
  let frontier = [start], depth = 0;
  while (frontier.length) {
    const next = [];
    for (const st of frontier) {
      eng.setBlocks(st);
      eng.setMoves(depth);
      const moves = eng.legalMoves();
      for (const m of moves) {
        eng.setBlocks(st);
        const res = eng.resolveMove(m.b, m.axis, m.offset, m.leaving, m.occ);
        const ns = st.map(b => b === m.b ? Object.assign({}, b, {
          row: res.row, col: res.col, exited: res.leaving, color: res.paint || b.color,
        }) : b);
        const k = enc(ns);
        if (seen.has(k)) continue;
        // bommen: na deze zet mag geen achtergebleven bom op nul staan
        eng.setBlocks(ns); eng.setMoves(depth + 1);
        if (ns.some(b => b.bomb && b.bomb.type === "moves" && !b.exited && eng.bombLeft(b) <= 0)) continue;
        seen.set(k, {prev: enc(st), move: m.b.id + (m.leaving ? " eruit" : " " + m.axis + m.offset)});
        if (needed(ns)) {
          const path = [];
          let cur = k;
          while (seen.get(cur)) { path.unshift(seen.get(cur).move); cur = seen.get(cur).prev; }
          return {par: depth + 1, path, states: seen.size};
        }
        if (seen.size > limit) return {par: null, states: seen.size, capped: true};
        next.push(ns);
      }
    }
    frontier = next; depth++;
  }
  return {par: null, states: seen.size};
}

module.exports = {loadEngine, loadLevels, solve};

if (require.main === module) {
  const html = fs.readFileSync(process.argv[2], "utf8");
  const eng = loadEngine(html), levels = loadLevels(html);
  const which = process.argv.slice(3).map(Number);
  (which.length ? which : levels.map((_, i) => i + 1)).forEach(n => {
    const l = levels[n - 1], t = Date.now();
    const r = solve(eng, l, 1500000);
    console.log(n, l.name, "par", l.par, "-> kortste", r.par, r.capped ? "(afgebroken)" : "", r.states, "standen", (Date.now() - t) + "ms");
  });
}
