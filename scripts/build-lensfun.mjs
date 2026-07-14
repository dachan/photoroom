// Builds a compact JSON of all Sony E-mount lens profiles (native + third-party)
// from the Lensfun database, for in-browser lens correction. Run manually to
// regenerate: `node scripts/build-lensfun.mjs`. Output: public/lensfun/sony-e.json
//
// Lensfun DB is licensed CC-BY-SA. Source: https://github.com/lensfun/lensfun
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TARGET_MOUNT = "Sony E";
const RAW_BASE = "https://raw.githubusercontent.com/lensfun/lensfun/master/data/db/";
const TREE_API = "https://api.github.com/repos/lensfun/lensfun/git/trees/master?recursive=1";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "lensfun");

function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseLens(block) {
  const mounts = [...block.matchAll(/<mount>([^<]*)<\/mount>/g)].map((m) => m[1].trim());
  if (!mounts.includes(TARGET_MOUNT)) return null;

  const maker = block.match(/<maker>([^<]*)<\/maker>/)?.[1]?.trim() ?? "";
  const model = block.match(/<model>([^<]*)<\/model>/)?.[1]?.trim() ?? "";
  if (!model) return null;
  const crop = num(block.match(/<cropfactor>([^<]*)<\/cropfactor>/)?.[1]) ?? 1;

  const distortion = [];
  for (const m of block.matchAll(/<distortion\b([^/]*)\/>/g)) {
    const a = attrs(m[1]);
    distortion.push({
      f: num(a.focal) ?? 0,
      m: a.model,
      a: num(a.a),
      b: num(a.b),
      c: num(a.c),
      k1: num(a.k1),
      k2: num(a.k2),
    });
  }

  const tca = [];
  for (const m of block.matchAll(/<tca\b([^/]*)\/>/g)) {
    const a = attrs(m[1]);
    if (a.model !== "poly3") continue;
    tca.push({
      f: num(a.focal) ?? 0,
      vr: num(a.vr) ?? 1,
      br: num(a.br) ?? 0,
      cr: num(a.cr) ?? 0,
      vb: num(a.vb) ?? 1,
      bb: num(a.bb) ?? 0,
      cb: num(a.cb) ?? 0,
    });
  }

  // Vignetting: keep only the largest focus distance per (focal, aperture).
  const vignMap = new Map();
  for (const m of block.matchAll(/<vignetting\b([^/]*)\/>/g)) {
    const a = attrs(m[1]);
    if (a.model !== "pa") continue;
    const f = num(a.focal) ?? 0;
    const av = num(a.aperture) ?? 0;
    const dist = num(a.distance) ?? 0;
    const key = `${f}|${av}`;
    const prev = vignMap.get(key);
    if (!prev || dist > prev.dist) {
      vignMap.set(key, { f, av, dist, k1: num(a.k1) ?? 0, k2: num(a.k2) ?? 0, k3: num(a.k3) ?? 0 });
    }
  }
  const vign = [...vignMap.values()].map((v) => ({
    f: v.f,
    av: v.av,
    k1: v.k1,
    k2: v.k2,
    k3: v.k3,
  }));

  if (distortion.length === 0 && vign.length === 0 && tca.length === 0) return null;
  return { maker, model, crop, distortion, tca, vign };
}

async function main() {
  console.log("Fetching Lensfun file list…");
  const tree = await (await fetch(TREE_API)).json();
  const files = tree.tree
    .map((t) => t.path)
    .filter((p) => /^data\/db\/.*\.xml$/.test(p))
    .map((p) => p.replace("data/db/", ""));

  console.log(`Scanning ${files.length} DB files for "${TARGET_MOUNT}" lenses…`);
  const lenses = [];
  for (const file of files) {
    const res = await fetch(RAW_BASE + file);
    if (!res.ok) continue;
    const xml = await res.text();
    for (const m of xml.matchAll(/<lens>([\s\S]*?)<\/lens>/g)) {
      const lens = parseLens(m[1]);
      if (lens) lenses.push(lens);
    }
  }

  lenses.sort((a, b) => `${a.maker} ${a.model}`.localeCompare(`${b.maker} ${b.model}`));
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, "sony-e.json");
  await writeFile(outPath, JSON.stringify(lenses));
  console.log(`Wrote ${lenses.length} Sony E-mount lenses to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
