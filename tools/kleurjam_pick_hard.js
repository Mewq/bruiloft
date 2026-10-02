// Kiest uit de kandidaten van kleurjam_hard.js een reeks die duidelijk van
// elkaar verschilt (minstens 4 stukken anders), van zwaar naar zwaarst.
//   node tools/kleurjam_pick_hard.js AANTAL kandidaten1.json ... > gekozen.json
"use strict";
const fs = require("fs");
const want = Number(process.argv[2]);
let all = [];
for (const f of process.argv.slice(3)) { try { all = all.concat(JSON.parse(fs.readFileSync(f, "utf8"))); } catch (e) {} }
const sig = (l) => l.blocks.map(b => b.color[0] + b.move + b.cells.length + ":" + (b.move === "H" ? "r" + b.row : "c" + b.col));
const differs = (a, b) => { const sb = new Set(sig(b)); return sig(a).filter(x => !sb.has(x)).length; };
all.sort((a, b) => b.par - a.par);
const chosen = [];
for (const l of all) {
  if (chosen.length >= want) break;
  if (chosen.every(c => differs(l, c) >= Number(process.env.KJ_DIFF || 4))) chosen.push(l);
}
chosen.sort((a, b) => a.par - b.par);
process.stderr.write(chosen.map(l => l.rows + "x" + l.cols + " par " + l.par).join("\n") + "\n");
process.stdout.write(JSON.stringify(chosen.map(l => { const c = Object.assign({}, l); delete c.board; return c; })));
