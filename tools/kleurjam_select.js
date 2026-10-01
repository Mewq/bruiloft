// Kiest uit gegenereerde levels een oplopende reeks, voegt hier en daar een
// extra mechaniek toe (verf, gesloten poort, bevroren blok) als de oplosser
// bevestigt dat het oplosbaar blijft en meer omweg kost, en schrijft de
// levels als JavaScript weg.
//   node tools/kleurjam_select.js MAP/game.html AANTAL uit1.json uit2.json ... > nieuw.js
"use strict";
const fs = require("fs");
const {loadEngine, solve} = require("./kleurjam_solver.js");
const html = fs.readFileSync(process.argv[2], "utf8");
const want = Number(process.argv[3]);
const eng = loadEngine(html);
let seed = 4242;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

let all = [];
for (const f of process.argv.slice(4)) { try { all = all.concat(JSON.parse(fs.readFileSync(f, "utf8"))); } catch (e) {} }
const seen = new Set();
all = all.filter(l => { const k = JSON.stringify([l.walls, l.blocks, l.gates]); if (seen.has(k)) return false; seen.add(k); return true; });
all.sort((a, b) => a.extra - b.extra || a.par - b.par);

const need = (l) => l.blocks.filter(b => b.color !== "stone").length;
function twist(l, kind) {
  const c = JSON.parse(JSON.stringify(l));
  const colored = c.blocks.filter(b => b.color !== "stone");
  if (kind === "verf") {
    const occ = new Set();
    c.blocks.forEach(b => b.cells.forEach(x => occ.add((b.row + x[0]) + "," + (b.col + x[1]))));
    c.walls.forEach(w => occ.add(w[0] + "," + w[1]));
    const free = [];
    for (let r = 0; r < c.rows; r++) for (let q = 0; q < c.cols; q++) if (!occ.has(r + "," + q)) free.push([r, q]);
    if (!free.length) return null;
    const b = pick(colored), other = pick(colored.filter(x => x !== b));
    if (!other) return null;
    const f = pick(free);
    c.paint = [[f[0], f[1], b.color]];
    b.color = other.color;                 // begint in de verkeerde kleur
  } else if (kind === "slot") {
    pick(c.gates).locked = {openAfter: 1 + Math.floor(rnd() * 2)};
  } else if (kind === "vorst") {
    pick(colored).frozen = {thawAfter: 1 + Math.floor(rnd() * 2)};
  }
  return c;
}

// Spreid de keuze over de hele moeilijkheidsreeks.
const chosen = [];
for (let i = 0; i < want && all.length; i++) {
  const idx = Math.min(all.length - 1, Math.round(i * (all.length - 1) / Math.max(1, want - 1)));
  chosen.push(all[idx]);
}
const kinds = ["verf", "slot", "vorst"];
const out = chosen.map((l, i) => {
  let best = l;
  if (i % 2 === 1) {
    for (let t = 0; t < 9; t++) {
      const c = twist(best, kinds[(i + t) % 3]);
      if (!c) continue;
      const r = solve(eng, c, 150000);
      if (r.par && r.par > best.par) { c.par = r.par; c.extra = r.par - need(c); c.path = r.path; best = c; break; }
    }
  }
  const r = solve(eng, best, 400000);   // eindcontrole met ruime grens
  if (!r.par) throw new Error("onoplosbaar na controle");
  best.par = r.par;
  return best;
});
out.sort((a, b) => a.par - b.par);
process.stdout.write(JSON.stringify(out.map(l => ({
  rows: l.rows, cols: l.cols, par: l.par, walls: l.walls, blocks: l.blocks, gates: l.gates,
  paint: l.paint, extra: l.extra,
}))));
process.stderr.write(out.map(l => l.rows + "x" + l.cols + " par " + l.par + (l.paint ? " verf" : "") +
  (l.gates.some(g => g.locked) ? " slot" : "") + (l.blocks.some(b => b.frozen) ? " vorst" : "")).join("\n") + "\n");
