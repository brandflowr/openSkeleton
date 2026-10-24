# SKEL — Story Keyframe Extensible Layout

**v2.10** | An open storyboard data format

> A flat, relational YAML format for encoding visual narratives into machine-readable, validatable story data.

[**OpenSKELETON — Official Format Site**](https://openskeleton.dev/) · [**Genlock Studio — Create with SKEL**](https://genlockstudio.com/) · [**SKEL X-Ray — Free Format Viewer**](https://xray.openskeleton.dev/)

---

## SKEL Ecosystem

| | Product | Purpose |
|---|---|---|
| **Write** | [**Skeleton Writer**](https://github.com/brandflowr/Skeleton-Writer) | A desktop writing app for prose, screenplays, and structured stories, designed for SKEL as its native project format. Free Windows preview downloads and documentation. |
| **Create** | [**Genlock Studio**](https://genlockstudio.com/) | A first-class desktop studio for authoring storyboards and visual narratives with SKEL as its native story format. |
| **View** | [**SKEL X-Ray**](https://xray.openskeleton.dev/) | A free web viewer for opening and inspecting SKEL format files. |
| **Learn** | [**OpenSKELETON**](https://openskeleton.dev/) | The official home of the SKEL format, documentation, ecosystem, and releases. |

---

## What Is SKEL?

SKEL (Story Keyframe Extensible Layout) is an open format that represents screenplays, storyboards, and visual narratives as flat, relational data. The native authoring format is YAML (`.skel`); `.skel.json` is the JSON export/interchange form of the same data model. Instead of deeply nested trees, SKEL stores acts, scenes, and shots as top-level arrays linked by ID references — like a relational database for stories.

SKEL is the native story format of [**Genlock Studio**](https://genlockstudio.com/), the desktop storyboard studio, and is designed to be read and written by any tool. You can inspect SKEL files without installing a desktop application using the free [**SKEL X-Ray viewer**](https://xray.openskeleton.dev/).

Designed for:
- AI-driven image/video generation pipelines (Flux, Kling, Runway, WAN, etc.)
- Storyboard authoring tools
- Cross-tool interchange between screenplay editors and production software

---

## Spec

| File | Contents |
|---|---|
| [`spec/skel-spec.md`](./spec/skel-spec.md) | Formal specification |
| [`spec/bone-spec.md`](./spec/bone-spec.md) | BONE data plugin system specification |
| [`spec/muscle-spec.md`](./spec/muscle-spec.md) | MUSCLE behavior plugin system specification |
| [`spec/studio-spec.md`](./spec/studio-spec.md) | Studio registry (`studio.json`) — the story bible: characters, environments, props, voices, skins, series |
| [`spec/skel.schema.json`](./spec/skel.schema.json) | JSON Schema (Draft 7) for validating `.skel.json` files |
| [`spec/bone.schema.json`](./spec/bone.schema.json) | JSON Schema for validating `.bone.json` files |
| [`spec/muscle.schema.json`](./spec/muscle.schema.json) | JSON Schema for validating `.muscle.json` manifests |
| [`spec/studio.schema.json`](./spec/studio.schema.json) | JSON Schema for validating `studio.json` registries |
| [`spec/genlock-studio.schema.json`](./spec/genlock-studio.schema.json) | Genlock 1.0 runtime registry at `.genlock/studio.json` (distinct from portable `studio.json`) |
| [`spec/host-profile.schema.json`](./spec/host-profile.schema.json) | Machine-readable host storage, version, schema, and conformance declaration |
| [`spec/hook-payload.schema.json`](./spec/hook-payload.schema.json) | Hook invocation contract (envelope/result shapes for MUSCLE hooks) |
| [`spec/errors.md`](./spec/errors.md) | Normative validation error catalog (stable codes, severities, RFC 6901 paths) |
| [`spec/MUSCLE_AUTHORING.md`](./spec/MUSCLE_AUTHORING.md) | How to write a MUSCLE plugin, step by step |
| [`spec/muscles/`](./spec/muscles/) | Example MUSCLE manifests: studio-style-guard, fountain-adapter, continuity-guard |
| [`reference/muscle-host/`](./reference/muscle-host/) | Runnable reference host — discovery, hook invocation, capability-checked patch application |
| [`reference/cli/`](./reference/cli/) | Reference `skel` CLI — validate / convert / inspect (`npx @openskeleton/cli validate story.skel`) |
| [`reference/fountain-adapter/`](./reference/fountain-adapter/) | Working Fountain round-trip adapter (ADR-016 proof) with byte-identical round-trip test |
| [`spec/skel-keyfile.json`](./spec/skel-keyfile.json) | Default token dictionary (13 categories, 131 tokens) |
| [`spec/example.skel.json`](./spec/example.skel.json) | Complete working example (JSON export form) — "The Last Signal" |
| [`spec/example.skel`](./spec/example.skel) | The same example in native YAML, annotated — start here to *read* SKEL |
| [`spec/examples/`](./spec/examples/) | Kitchen-sink example (full asset layer) + episodic pair sharing one `studio.json` |
| [`spec/bones/`](./spec/bones/) | Starter BONE definitions: flux-dev, runway-gen3, kling-v1, seedance-2, character-reference-sheet, storyboard-grid-9 |
| [`spec/x-genlock.schema.json`](./spec/x-genlock.schema.json) | Schema for Genlock-owned `x-genlock` extension data (proposals, frame images) |
| [`spec/GENLOCK_HOST_PROFILE.md`](./spec/GENLOCK_HOST_PROFILE.md) | How Genlock Studio maps the neutral spec onto its storage (the model for writing your own host profile) |
| [`profiles/genlock/profile.json`](./profiles/genlock/profile.json) | Current machine-readable Genlock implementation profile and conformance status |
| [`spec/MIGRATIONS.md`](./spec/MIGRATIONS.md) | Every rename and structural change, with migration paths and sunsets |
| [`spec/PACKAGING.md`](./spec/PACKAGING.md) | npm package contents, host integration, vendored-sync transition, and release verification |
| [`spec/audio-map.schema.json`](./spec/audio-map.schema.json) | Schema for the `audio-map.json` sidecar (shot → audio track assignments) |
| [`spec/video-map.schema.json`](./spec/video-map.schema.json) | Schema for the `video-map.json` sidecar (shot → video takes) |
| [`spec/canvas-layout.schema.json`](./spec/canvas-layout.schema.json) | Schema for the `canvas-layout.json` sidecar (canvas node positions) |
| [`spec/TOKEN_REFERENCE.md`](./spec/TOKEN_REFERENCE.md) | All valid tokens, defaults, and constraints at a glance |
| [`spec/LLM_INTEGRATION.md`](./spec/LLM_INTEGRATION.md) | How LLM agents read, edit, and validate SKEL projects |
| [`docs/NEXT-GENERATION-PRODUCTION-ROADMAP.md`](./docs/NEXT-GENERATION-PRODUCTION-ROADMAP.md) | Proposed sequence contracts, typed references, take lineage, OTIO, production packages, and the SKEL/BONE/MUSCLE ownership boundary |
| [`spec/ARCHITECTURE.md`](./spec/ARCHITECTURE.md) | System architecture and data flows |
| [`spec/DECISIONS.md`](./spec/DECISIONS.md) | Architecture Decision Records |
| [`spec/CHANGELOG.md`](./spec/CHANGELOG.md) | Version history |
| [`spec/OVERVIEW.md`](./spec/OVERVIEW.md) | Quick orientation |
| [`tests/conformance/`](./tests/conformance/) | Conformance corpus: valid/invalid fixtures with expected error codes |
| [`registry/`](./registry/) | Community registry of public BONE/MUSCLE ids |

---

## Quick Start

Validate a document with the reference CLI:

```bash
npx @openskeleton/cli validate story.skel        # or: node reference/cli/skel.mjs validate story.skel
skel validate story.skel --lifecycle export --json --with-sidecars
skel convert story.skel story.skel.json          # YAML ⇄ JSON
skel inspect story.skel                          # structure, cast, coverage at a glance
```

Get live validation + token autocomplete in VS Code by starting your `.skel` file with the modeline:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/brandflowr/SKELETON-Brandflowr/v2.10.0/spec/skel.schema.json
skel_version: "2.0"
```

Repo health: `npm install && npm run check` validates every shipped artifact, runs the conformance corpus, the MUSCLE host demo, and the Fountain round-trip — the same suite as CI.

---

## Conformance

Implementations claim classes — **Reader**, **Writer**, **Validator**, **Full Host** — defined in [`spec/skel-spec.md`](./spec/skel-spec.md) §9, and self-certify against [`tests/conformance/`](./tests/conformance/). Use of the SKEL/BONE/MUSCLE marks is conditioned on conformance ([TRADEMARKS.md](./TRADEMARKS.md)). Spec changes follow [GOVERNANCE.md](./GOVERNANCE.md); security reports follow [SECURITY.md](./SECURITY.md).

---

## Plugin System

SKEL has a two-layer plugin system, following the skeleton metaphor:

- **BONE** (Base Object Narrative Export) — *data* plugins. A `.bone.json` file attaches AI generation config, prompt contracts, and pipeline data to SKEL entities. See [`spec/bone-spec.md`](./spec/bone-spec.md) and the starter definitions in [`spec/bones/`](./spec/bones/).
- **MUSCLE** (Modular User-Scripted Companion Logic Extension) — *behavior* plugins. A `.muscle.json` manifest subscribes to named lifecycle hooks (import, validation, prompt assembly, generation, render write-back, export) and returns JSON patches that the host validates and applies atomically. MUSCLEs never touch documents directly. See [`spec/muscle-spec.md`](./spec/muscle-spec.md).

`.skel` is the body layout, `.bone` files are what attaches to it, `.muscle` files are what makes it move.

Want to build a plugin? Start with [`spec/MUSCLE_AUTHORING.md`](./spec/MUSCLE_AUTHORING.md), copy an example from [`spec/muscles/`](./spec/muscles/), and test against the [reference host](./reference/muscle-host/):

```bash
cd reference/muscle-host/demo && node run-demo.mjs
```

---

## License

MIT — see [LICENSE](./LICENSE).

Copyright © 2025–2026 Brandflowr AI LLC.

SKEL™, BONE™, MUSCLE™, and SPORE™ are trademarks of Brandflowr AI LLC — see [TRADEMARKS.md](./TRADEMARKS.md).
