# skel — Reference CLI

The reference implementation of the [external validator contract](../../spec/ARCHITECTURE.md) (Validator conformance class, skel-spec §9.1), plus YAML⇄JSON conversion and a quick project inspector.

```bash
# from the repo
node reference/cli/skel.mjs validate spec/example.skel

# as a package
npx @openskeleton/cli validate story.skel
```

Requires Node ≥22.12. In a source checkout run `npm ci` at the repository root. The release CLI depends on the matching spec version; `npm run test:package` tests both local tarballs together.

## Commands

### `skel validate <file>`

Validates a `.skel` (YAML) or `.skel.json` document: JSON Schema for the selected lifecycle, referential integrity, asset-reference resolution, BONE inheritance (`defaults → metadata → act → scene → shot`), token declarations, and the consistency lints — with the normative codes from [`spec/errors.md`](../../spec/errors.md) and RFC 6901 paths.

| Flag | Effect |
|---|---|
| `--lifecycle draft\|production\|export` | Override `metadata.lifecycle` for this run |
| `--json` | Machine-readable `SKELValidationResult` output |
| `--with-sidecars` | Also validate `video-map.json` / `audio-map.json` / `canvas/layout.json` found next to the document |
| `--studio <studio.json>` | Resolve asset references against a studio registry (validated first) |

Exit codes: `0` valid · `1` validation errors · `2` file unreadable or unparseable.

**Required-field semantics:** `metadata`/`act`/`scene` BONE entries are default providers. `required: true` fields are enforced where data is consumed — on shots (chain-resolved) and on characters/environments (self + definition defaults).

### `skel convert <in> <out>`

Converts between native YAML and the JSON export form, by output extension. YAML output follows the authoring profile (skel-spec §11): no anchors/aliases, stable key order as parsed.

### `skel inspect <file>`

One screen of truth: title, version, lifecycle, series code, structure counts, cast, plot-critical props, BONE prompt coverage, status rollups, delivery facts.

## As a library

```js
import { loadDocument, validateDocument } from "@openskeleton/spec/validator";
const result = validateDocument(loadDocument("story.skel"), { lifecycle: "production" });
```

The conformance runner (`scripts/run-conformance.mjs`) drives this same library across `tests/conformance/` — if your own validator matches the corpus, it matches this one.
