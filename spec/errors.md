# SKEL Normative Error Catalog

> The stable registry of validation error and warning codes. Validators claiming the **Validator** conformance class (skel-spec.md §9.1) MUST emit these codes for these conditions. Codes are stable within a spec MAJOR version: they are never renamed or repurposed, only added.

---

## 1. Error Shape and Path Convention

Every error and warning uses the `SKELError` shape (ARCHITECTURE.md, hook-payload.schema.json):

```json
{
  "code": "SCENE_SHOT_REF_MISSING",
  "severity": "error",
  "path": "/scenes/0/shot_refs/2",
  "message": "shot_refs entry 'sh_99' does not match any shot id."
}
```

- `path` is an **RFC 6901 JSON Pointer** into the parsed document (`/shots/3/bones/flux-dev`). This is the single path syntax across SKEL: validators, MUSCLE hook results, and LLM tooling all use it. Dot/bracket notation (`shots[3].bones.flux-dev`) is non-conformant.
- `path` points at the most specific offending location available; file-level failures use `""` (the whole-document pointer).
- `severity` is `error` (document is invalid / operation must not proceed in `production`/`export` lifecycles) or `warning` (document is valid; the condition deserves author attention).

## 2. Severity and Lifecycle

- In `draft` lifecycle, validators report the same codes but hosts MAY proceed on errors that are purely structural-completeness (`SCHEMA_ERROR` from lifecycle `minItems`, empty refs).
- In `production`/`export`, any `error` fails validation.
- Warnings never fail validation in any lifecycle.

## 3. Parse and Schema

| Code | Severity | Condition |
|---|---|---|
| `YAML_PARSE_ERROR` | error | The `.skel` file is not parseable YAML (or `.skel.json` is not parseable JSON). CLI exit code 2. |
| `SCHEMA_ERROR` | error | The parsed document fails `skel.schema.json` for the selected lifecycle. `message` carries the underlying schema violation; `path` the instance path. |

The reference reader additionally reports `UNSUPPORTED_VERSION` for unsupported major versions (SKEL 2.x is supported, including compatible higher minors), and `INPUT_LIMIT_EXCEEDED` when bounded parsing/traversal fails. Current limits are 10 MB, depth 64, 200,000 visited values and 10,000 YAML merge keys; cyclic aliases are rejected. These are errors, and files rejected by the parser use CLI exit code 2.

## 4. Identity and Structure

| Code | Severity | Condition |
|---|---|---|
| `DUPLICATE_ID` | error | An `id` appears more than once across acts, scenes, shots, and embedded asset collections (skel-spec §3.3). |
| `ACT_SCENE_REF_MISSING` | error | An act's `scene_refs` entry matches no scene `id`. |
| `SCENE_SHOT_REF_MISSING` | error | A scene's `shot_refs` entry matches no shot `id`. |
| `SCENE_ACT_MISSING` | error | A scene's `act_id` matches no act `id`. |
| `SHOT_SCENE_MISSING` | error | A shot's `scene_id` matches no scene `id`. |
| `MUSIC_CUE_SHOT_MISSING` | error | A music cue's `in.shot_ref` or `out.shot_ref` matches no shot `id`. |
| `ORDER_MISMATCH` | warning | `order` fields disagree with the canonical refs-array order (skel-spec §3.6). |

## 5. Asset References

Dual-severity rule (skel-spec §3.4): when the corresponding embedded collection is **present** in the document, an unresolved reference is an **error**; when the collection is **absent**, the same code is a **warning** ("resolvable only against an external studio registry") — unless a registry was supplied to the validator and resolves it, in which case nothing is reported.

| Code | Condition |
|---|---|
| `CHARACTER_REF_MISSING` | A `character_refs` entry, `dialogue.character_ref`, `carried_by`, `relationships[].character_ref`, or series `cast_refs` entry resolves to no character. |
| `ENVIRONMENT_REF_MISSING` | A scene's `environment_ref` resolves to no environment. |
| `LOCATION_REF_MISSING` | A scene's or environment's `location_ref` resolves to no location. |
| `PROP_REF_MISSING` | A `prop_refs` entry, `props_carried` entry, or `props_present` entry resolves to no prop. |
| `AUDIO_REF_MISSING` | A `sound_effects[].audio_ref`, `music_cues[].audio_ref`, or `soundscape_refs` entry resolves to no audio asset. |
| `ASSET_SCENE_REF_MISSING` | warning always: an asset's scene pointer (`wardrobe_variants[].scene_refs`, `state_overrides[].scene_ref`) matches no scene. |
| `ASSET_SHOT_REF_MISSING` | warning always: an asset's shot pointer (`first_appearance`) matches no shot. |

## 6. BONE Resolution

| Code | Severity | Condition |
|---|---|---|
| `BONE_REGISTRY_MISSING` | error | An entity carries `bones` but the document has no `bone_registry` (skel-spec §2.9). |
| `BONE_UNRESOLVED` | error | An entity `bones` key has no matching `bone_registry` entry. |
| `BONE_REQUIRED_FIELD_MISSING` | error | After inheritance resolution (BONE Spec §5), a field marked `required: true` is absent. |
| `BONE_ATTACHMENT_INVALID` | warning | BONE data sits on an entity type not listed in the definition's `attaches_to` (BONE Spec §7.3). |

## 7. Tokens

| Code | Severity | Condition |
|---|---|---|
| `CUSTOM_TOKEN_UNDECLARED` | warning | An `x-` token appears in a token field but is not declared in the active key file's `custom` section. |
| `CUSTOM_TOKEN_CATEGORY_MISMATCH` | error | A declared custom token is used in a token field that does not match its declared `category` (skel-spec §4.3). |
| `TOD_CONT_FIRST_SCENE` | warning | The first scene of the document uses `tod: CONT` (skel-spec §2.4.1). |

## 8. Consistency

| Code | Severity | Condition |
|---|---|---|
| `HEADER_LOC_MISMATCH` | warning | A scene's `header` string disagrees with its canonical `loc` object (type, name, or tod). |
| `DURATION_CONFLICT` | warning | Both `target_duration_seconds` and `target_duration_minutes` are present and disagree by more than one second. |
| `DIALOGUE_AMBIGUOUS_SPEAKER` | warning | A shot lists more than one `character_refs` entry and a dialogue line has no `character_ref`. |
| `PROP_CONTINUITY` | warning | A prop with `significance: plot_critical` appears in exactly one shot's `prop_refs` across the document. |

## 9. Sidecars

Reported only when sidecar validation is requested (`--with-sidecars` / `include_sidecars`).

| Code | Severity | Condition |
|---|---|---|
| `SIDECAR_SHOT_MISSING` | error | A shot-ID key in `video-map.json` / `audio-map.json` / `canvas/layout.json` matches no shot in the document. (Canvas keys MAY also be scene/act IDs; only keys matching no entity at all are errors — stale canvas nodes are tolerated by hosts per canvas-layout.schema.json.) |
| `SIDECAR_SCHEMA_ERROR` | error | A sidecar file fails its schema (`video-map.schema.json`, `audio-map.schema.json`, `canvas-layout.schema.json`). |
| `SIDECAR_PARSE_ERROR` | error | A sidecar file is not parseable JSON. |
| `SIDECAR_DUPLICATE_ID` | error | A video take or audio track `id` appears more than once for the same shot. IDs are stable within a shot's take or track collection. |
| `VIDEO_MULTIPLE_ACTIVE_TAKES` | error | More than one video take for a shot has `isActive: true`. Empty and all-inactive take lists remain valid. |
| `MEDIA_FADE_DURATION_CONFLICT` | error | An audio track's `fadeInSeconds + fadeOutSeconds` exceeds its declared `durationSeconds`. |
| `MEDIA_PROVENANCE_MISMATCH` | error | Compatibility fields (`boneId`, `model`, or `prompt`) disagree with the corresponding canonical `provenance` value on the same take or track. |

## 10. MUSCLE-Contributed Codes

MUSCLE `veto` hooks merge their errors into the same result stream. Their codes are namespaced by manifest id — `<muscle_id>.<code>` (e.g. `studio-style-guard.tone`) — and MUST NOT collide with the unprefixed first-party registry above. First-party codes never contain a dot.

## 11. Registry Policy

- New codes are **additive** and arrive with a MINOR spec release plus a conformance fixture.
- A code's severity class (§5's dual-severity rule aside) never changes within a MAJOR version.
- Tools MUST treat unknown codes as forward-compatible: report them verbatim, do not fail on them.

The machine-readable registry consumed by the conformance runner is `tests/conformance/manifest.json`.
