// Actualiza el README de perfil de la org Zetalabs:
//  - Barra de stack real (bytes de código, ponderado por recencia)
//  - Fila de métricas agregadas (SIN exponer nombres de repos)
// Solo emite datos agregados; nunca lista repos privados.
import { readFileSync, writeFileSync } from "node:fs";

const ORG = "ZetalabsCL";
const README = "profile/README.md";
const MONTHS = 18;

const token = process.env.GITHUB_TOKEN;
const headers = {
  Accept: "application/vnd.github+json",
  "User-Agent": ORG,
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};

async function fetchAll(url) {
  const r = await fetch(url, { headers });
  return r.ok ? await r.json() : [];
}

const cutoff = Date.now() - MONTHS * 30 * 24 * 3600 * 1000;
const all = await fetchAll(
  `https://api.github.com/orgs/${ORG}/repos?per_page=100&type=all&sort=pushed`
);

let scan = all.filter(
  (r) => r && !r.fork && !r.archived && new Date(r.pushed_at).getTime() >= cutoff
);
if (scan.length < 4) scan = all.filter((r) => r && !r.fork && !r.archived);

// Lenguajes: normalizado por repo + media vida de 12 meses.
const totals = {};
for (const r of scan) {
  const lr = await fetch(r.languages_url, { headers });
  if (!lr.ok) continue;
  const langs = await lr.json();
  const repoBytes = Object.values(langs).reduce((a, b) => a + b, 0);
  if (!repoBytes) continue;
  const monthsAgo =
    (Date.now() - new Date(r.pushed_at).getTime()) / (30 * 24 * 3600 * 1000);
  const weight = Math.pow(0.5, monthsAgo / 12);
  for (const [name, bytes] of Object.entries(langs)) {
    totals[name] = (totals[name] || 0) + (bytes / repoBytes) * weight;
  }
}

const grand = Object.values(totals).reduce((a, b) => a + b, 0) || 1;
const top = Object.entries(totals)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8);

const BARW = 22;
const pad = Math.max(...top.map(([n]) => n.length), 1);
const langBlock = top
  .map(([name, v]) => {
    const pct = (v / grand) * 100;
    const filled = Math.round((pct / 100) * BARW);
    const bar = "█".repeat(filled) + "░".repeat(BARW - filled);
    return `${name.padEnd(pad)}  ${bar}  ${pct.toFixed(1).padStart(5)}%`;
  })
  .join("\n");

// Métricas AGREGADAS (sin nombres): #tecnologías, stack líder, año base.
const techCount = Object.keys(totals).length;
const lead = top[0]?.[0] ?? "—";
const founded = Math.min(
  ...all.map((r) => new Date(r.created_at).getFullYear()).filter(Boolean),
  new Date().getFullYear()
);
const badge = (label, value, color) =>
  `![${label}](https://img.shields.io/badge/${encodeURIComponent(
    label
  )}-${encodeURIComponent(String(value))}-${color}?style=for-the-badge)`;
const metrics = [
  badge("Tecnologías en producción", `${techCount}+`, "B42116"),
  badge("Stack líder", lead, "16a34a"),
  badge("Construyendo desde", founded, "111111"),
].join("\n&nbsp;\n");

const fill = (text, start, end, body) =>
  text.replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n${body}\n${end}`);

let readme = readFileSync(README, "utf8");
readme = fill(
  readme,
  "<!--START_SECTION:langs-->",
  "<!--END_SECTION:langs-->",
  "```text\n" + langBlock + "\n```"
);
readme = fill(
  readme,
  "<!--START_SECTION:metrics-->",
  "<!--END_SECTION:metrics-->",
  metrics
);
writeFileSync(README, readme);
console.log(
  `Org README actualizado: ${scan.length} repos, ${techCount} tecnologías, líder ${lead}.`
);
