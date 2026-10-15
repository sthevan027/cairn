// Uso: bun run tools/make-latest-json.ts <versão> "<notas da versão>"
// Lê o .sig do instalador já assinado e grava o latest.json ao lado dele.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildLatestJson, releaseTag } from "./latestJson";

const [version, notes = ""] = process.argv.slice(2);
if (!version) {
  console.error('uso: bun run tools/make-latest-json.ts <versão> "<notas>"');
  process.exit(1);
}

const clean = version.replace(/^v/, "");
const dir = join("src-tauri", "target", "release", "bundle", "nsis");
const signature = readFileSync(join(dir, `Cairn_${clean}_x64-setup.exe.sig`), "utf8");
const json = buildLatestJson({ version, notes, pubDate: new Date(), signature, repo: "sthevan027/cairn" });
const out = join(dir, "latest.json");
writeFileSync(out, JSON.stringify(json, null, 2) + "\n");
console.log(`escrito ${out}`);
console.log(`publique a release com a tag ${releaseTag(clean)} (o instalador é baixado de /releases/download/${releaseTag(clean)}/)`);
