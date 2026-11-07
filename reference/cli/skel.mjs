#!/usr/bin/env node
// skel — reference CLI for the SKEL format.
//   skel validate <file> [--lifecycle draft|production|export] [--json] [--with-sidecars] [--studio <studio.json>]
//   skel convert  <in> <out>          (.skel ⇄ .skel.json by extension)
//   skel inspect  <file>              (structure, cast, BONE coverage at a glance)
// Exit codes (LLM_INTEGRATION.md): 0 valid · 1 validation errors · 2 unreadable/unparseable input.
import { readFileSync, writeFileSync } from "node:fs";
import yaml from "js-yaml";
import { loadDocument, validateDocument, validateStudio, loadSidecarsNear, ParseError } from "./lib/validate.mjs";

const args = process.argv.slice(2);
const command = args.shift();

function flag(name) {
  const i = args.indexOf(name);
  if (i === -1) return false;
  args.splice(i, 1);
  return true;
}
function option(name) {
  const i = args.indexOf(name);
  if (i === -1) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
}

function fail2(message) {
  console.error(`skel: ${message}`);
  process.exit(2);
}

function printResult(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  for (const e of [...result.errors, ...result.warnings]) {
    console.log(`  [${e.severity}] ${e.code} ${e.path} — ${e.message}`);
  }
  console.log(`${result.valid ? "VALID" : "INVALID"} (lifecycle: ${result.lifecycle}, errors: ${result.errors.length}, warnings: ${result.warnings.length})`);
}

switch (command) {
  case "validate": {
    const asJson = flag("--json");
    const withSidecars = flag("--with-sidecars");
    const lifecycle = option("--lifecycle");
    const studioPath = option("--studio");
    const file = args[0];
    if (!file) fail2("usage: skel validate <file> [--lifecycle L] [--json] [--with-sidecars] [--studio studio.json]");
    if (lifecycle && !["draft", "production", "export"].includes(lifecycle)) fail2(`invalid --lifecycle '${lifecycle}'`);

    let doc;
    try {
      doc = loadDocument(file);
    } catch (e) {
      if (e instanceof ParseError) {
        printResult({ valid: false, lifecycle: lifecycle ?? "draft", errors: [{ code: e.code, severity: "error", path: "", message: e.message }], warnings: [] }, asJson);
        process.exit(2);
      }
      fail2(e.message);
    }

    let studio;
    if (studioPath) {
      try {
        studio = loadDocument(studioPath);
      } catch (e) {
        fail2(`cannot read studio registry: ${e.message}`);
      }
      const sres = validateStudio(studio);
      if (!sres.valid) {
        console.error(`studio registry '${studioPath}' is invalid:`);
        printResult({ ...sres, lifecycle: "registry" }, asJson);
        process.exit(1);
      }
    }

    const opts = { lifecycle, studio };
    if (withSidecars) {
      const sc = loadSidecarsNear(file);
      opts.sidecars = sc;
    }
    const result = validateDocument(doc, opts);
    printResult(result, asJson);
    process.exit(result.valid ? 0 : 1);
  }

  case "convert": {
    const [input, output] = args;
    if (!input || !output) fail2("usage: skel convert <in(.skel|.skel.json)> <out(.skel|.skel.json)>");
    let doc;
    try {
      doc = loadDocument(input);
    } catch (e) {
      fail2(e.message);
    }
    let text;
    if (output.endsWith(".json")) {
      text = JSON.stringify(doc, null, 2) + "\n";
    } else {
      // YAML profile (skel-spec §11): no refs/anchors, generous line width, keys in document order.
      text = yaml.dump(doc, { noRefs: true, lineWidth: 100, quotingType: '"' });
    }
    writeFileSync(output, text, "utf-8");
    console.log(`wrote ${output}`);
    process.exit(0);
  }

  case "inspect": {
    const file = args[0];
    if (!file) fail2("usage: skel inspect <file>");
    let doc;
    try {
      doc = loadDocument(file);
    } catch (e) {
      fail2(e.message);
    }
    const md = doc.metadata ?? {};
    const shots = doc.shots ?? [];
    const boneIds = Object.keys(doc.bone_registry ?? {});
    const withBoneText = shots.filter((s) => Object.values(s.bones ?? {}).some((b) => b && (b.text || b.action))).length;
    const statusCount = (kind) =>
      shots.reduce((acc, s) => {
        const v = s.status?.[kind] ?? "—";
        acc[v] = (acc[v] ?? 0) + 1;
        return acc;
      }, {});
    console.log(`${md.title ?? "(untitled)"}  [skel_version ${doc.skel_version ?? "?"}, lifecycle ${md.lifecycle ?? "draft"}]`);
    if (md.series?.episode_code) console.log(`series: ${md.series.series_title ?? md.series.series_id} ${md.series.episode_code}`);
    console.log(`structure: ${(doc.acts ?? []).length} act(s), ${(doc.scenes ?? []).length} scene(s), ${shots.length} shot(s)`);
    const cast = (doc.characters ?? []).map((c) => c.name ?? c.id);
    if (cast.length) console.log(`cast: ${cast.join(", ")}`);
    const props = (doc.props ?? []).map((p) => `${p.name ?? p.id}${p.significance === "plot_critical" ? "*" : ""}`);
    if (props.length) console.log(`props: ${props.join(", ")} (* = plot-critical)`);
    if (boneIds.length) console.log(`bones: ${boneIds.join(", ")} — prompt coverage ${withBoneText}/${shots.length} shots`);
    if ((doc.music_cues ?? []).length) console.log(`music cues: ${doc.music_cues.length}`);
    console.log(`status.image: ${JSON.stringify(statusCount("image"))}`);
    console.log(`status.video: ${JSON.stringify(statusCount("video"))}`);
    if (md.delivery?.frame_rate) console.log(`delivery: ${md.delivery.frame_rate} fps${md.delivery.resolution ? `, ${md.delivery.resolution.width}x${md.delivery.resolution.height}` : ""}${md.delivery.aspect ? `, ${md.delivery.aspect}` : ""}`);
    process.exit(0);
  }

  default:
    console.error("skel — reference CLI for the SKEL format");
    console.error("usage:");
    console.error("  skel validate <file> [--lifecycle draft|production|export] [--json] [--with-sidecars] [--studio studio.json]");
    console.error("  skel convert  <in> <out>");
    console.error("  skel inspect  <file>");
    process.exit(command ? 2 : 0);
}
