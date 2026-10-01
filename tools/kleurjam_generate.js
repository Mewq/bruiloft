// Genereert compacte, lastige Kleurjam-levels die gegarandeerd oplosbaar zijn.
//
// Werkwijze: begin met een leeg bord en speel het spel achterstevoren. Een blok
// komt via zijn eigen poort binnen, daarna schuiven blokken willekeurig heen en
// weer. Schuiven is omkeerbaar, dus de eindstand is altijd terug op te lossen.
// Daarna rekent de oplosser (met de echte spelregels) de kortste oplossing uit:
// dat wordt par. We houden de borden waarop die oplossing het meest omweg vraagt.
//
//   node tools/kleurjam_generate.js MAP/game.html POGINGEN ZAAD > levels.json
"use strict";
const fs = require("fs");
const {loadEngine, solve} = require("./kleurjam_solver.js");

const html = fs.readFileSync(process.argv[2], "utf8");
const tries = Number(process.argv[3] || 300);
let seed = Number(process.argv[4] || 1);
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const eng = loadEngine(html);

const SHAPES = [
  [[0,0],[0,1]], [[0,0],[1,0]], [[0,0],[0,1],[0,2]], [[0,0],[1,0],[2,0]],
  [[0,0],[0,1],[1,0]], [[0,0],[0,1],[1,1]], [[0,0],[1,0],[1,1]], [[0,1],[1,0],[1,1]],
  [[0,0],[0,1],[1,0],[1,1]], [[0,0],[1,0],[2,0],[2,1]], [[0,0],[0,1],[0,2],[1,0]],
];
const COLORS = ["red","orange","yellow","green","teal","blue","purple","pink"];
const SIDES = ["left","right","top","bottom"];

function build() {
  const N = pick([6, 7, 7, 8]);
  const k = (r, c) => r + "," + c;
  const walls = [];
  const wallSet = new Set();
  for (let i = 0, n = Math.floor(rnd() * 4); i < n; i++) {
    const r = 1 + Math.floor(rnd() * (N - 2)), c = 1 + Math.floor(rnd() * (N - 2));
    if (!wallSet.has(k(r, c))) { wallSet.add(k(r, c)); walls.push([r, c]); }
  }
  const nColor = 4 + Math.floor(rnd() * 3);
  const colors = COLORS.slice().sort(() => rnd() - 0.5).slice(0, nColor);
  const lvl = {rows: N, cols: N, walls, blocks: [], gates: []};
  const usedEdge = new Set();
  const pending = [];
  colors.forEach((color, i) => {
    const cells = pick(SHAPES);
    const h = Math.max(...cells.map(x => x[0])) + 1, w = Math.max(...cells.map(x => x[1])) + 1;
    const side = pick(SIDES);
    const horiz = side === "left" || side === "right";
    const ext = horiz ? h : w;
    const span = ext + (rnd() < 0.35 ? 1 : 0);
    const index = Math.floor(rnd() * (N - span + 1));
    const edge = side + index;
    if (usedEdge.has(edge)) return;
    usedEdge.add(edge);
    const r0 = rnd();
    const move = r0 < 0.25 ? "A" : horiz ? "H" : "V";
    lvl.gates.push({color, side, index, span});
    pending.push({id: "b" + i, color, move, cells, side, index, span, h, w});
  });
  // stenen staan er vanaf het begin
  const stones = [];
  for (let i = 0, n = 1 + Math.floor(rnd() * 3); i < n; i++) {
    const cells = pick(SHAPES.slice(0, 4));
    stones.push({id: "s" + i, color: "stone", move: pick(["A", "H", "V"]), cells});
  }
  return {lvl, pending, stones, N};
}

function occOf(blocks) {
  const s = new Set();
  for (const b of blocks) for (const rc of b.cells) s.add((b.row + rc[0]) + "," + (b.col + rc[1]));
  return s;
}

function fits(lvl, blocks, cells, r, c) {
  const occ = occOf(blocks), walls = new Set(lvl.walls.map(w => w[0] + "," + w[1]));
  return cells.every(x => {
    const rr = r + x[0], cc = c + x[1];
    return rr >= 0 && cc >= 0 && rr < lvl.rows && cc < lvl.cols && !occ.has(rr + "," + cc) && !walls.has(rr + "," + cc);
  });
}

function shuffle(lvl, blocks, steps) {
  // willekeurige schuifzetten binnen het bord (geen uitgangen)
  for (let s = 0; s < steps; s++) {
    eng.setBlocks(blocks);
    const moves = eng.legalMoves().filter(m => !m.leaving);
    if (!moves.length) return;
    const m = pick(moves);
    const res = eng.resolveMove(m.b, m.axis, m.offset, false, m.occ);
    m.b.row = res.row; m.b.col = res.col;
  }
}

function makeLevel() {
  const {lvl, pending, stones, N} = build();
  if (pending.length < 4) return null;
  eng.setLevel(lvl);
  const blocks = [];
  for (const s of stones) {
    for (let t = 0; t < 40; t++) {
      const r = Math.floor(rnd() * N), c = Math.floor(rnd() * N);
      if (fits(lvl, blocks, s.cells, r, c)) { blocks.push(Object.assign({}, s, {row: r, col: c, exited: false})); break; }
    }
  }
  const order = pending.slice().sort(() => rnd() - 0.5);
  for (const p of order) {
    // binnenkomen door de eigen poort: helemaal binnen, tegen de rand, in lijn
    const horiz = p.side === "left" || p.side === "right";
    const ext = horiz ? p.h : p.w;
    const spots = [];
    for (let o = p.index; o <= p.index + p.span - ext; o++) {
      if (horiz) spots.push([o, p.side === "left" ? 0 : N - p.w]);
      else spots.push([p.side === "top" ? 0 : N - p.h, o]);
    }
    let ok = spots.filter(s => fits(lvl, blocks, p.cells, s[0], s[1]));
    for (let t = 0; !ok.length && t < 12; t++) {
      shuffle(lvl, blocks, 4);
      ok = spots.filter(s => fits(lvl, blocks, p.cells, s[0], s[1]));
    }
    if (!ok.length) return null;
    const at = pick(ok);
    blocks.push({id: p.id, color: p.color, move: p.move, cells: p.cells, row: at[0], col: at[1], exited: false});
    shuffle(lvl, blocks, 6 + Math.floor(rnd() * 10));
  }
  shuffle(lvl, blocks, 30 + Math.floor(rnd() * 40));
  lvl.blocks = blocks.map(b => ({id: b.id, color: b.color, move: b.move, row: b.row, col: b.col, cells: b.cells}));
  return lvl;
}

// Verbeterlus: schud de beginstand een paar zetten (blijft oplosbaar) en houd
// de variant waarvan de kortste oplossing de meeste omweg kost.
function climb(lvl, rounds) {
  const need = lvl.blocks.filter(b => b.color !== "stone").length;
  let best = lvl, bestR = solve(eng, lvl, 300000);
  if (!bestR.par) return null;
  for (let i = 0; i < rounds; i++) {
    const cand = JSON.parse(JSON.stringify(best));
    eng.setLevel(cand);
    const bs = cand.blocks.map(b => Object.assign({}, b, {exited: false}));
    shuffle(cand, bs, 1 + Math.floor(rnd() * 4));
    cand.blocks = bs.map(b => ({id: b.id, color: b.color, move: b.move, row: b.row, col: b.col, cells: b.cells}));
    const r = solve(eng, cand, 300000);
    if (r.par && r.par >= bestR.par) { best = cand; bestR = r; }
  }
  best.par = bestR.par; best.extra = bestR.par - need; best.path = bestR.path; best.states = bestR.states;
  return best;
}

const found = [];
for (let i = 0; i < tries; i++) {
  const lvl = makeLevel();
  if (!lvl) continue;
  const best = climb(lvl, 40);
  if (best && best.extra >= 4) {
    found.push(best);
    process.stderr.write("poging " + i + ": " + best.rows + "x" + best.cols + " par " + best.par + " (+" + best.extra + ")\n");
    fs.writeFileSync(process.argv[5] || "/dev/null", JSON.stringify(found));
  }
}
found.sort((a, b) => b.extra - a.extra);
process.stdout.write(JSON.stringify(found));
