# Writing a MUSCLE

How to build a behavior plugin for SKEL. Normative details live in [muscle-spec.md](./muscle-spec.md); this is the practical path.

A MUSCLE is two things:

1. **A manifest** (`your-plugin.muscle.json`) — declares what hooks you listen to, what you're allowed to touch, and how a host runs you.
2. **A tool** (any language) — receives a JSON envelope, returns a JSON result. That's the whole integration surface.

---

## 1. Pick your hook and mode

| You want to... | Hook | Mode |
|---|---|---|
| Add custom validation / lint rules | `document.validate` | `veto` |
| Rewrite or style-enforce assembled prompts | `prompt.assemble.after` | `transform` |
| Adjust BONE data before prompt assembly | `prompt.assemble.before` | `transform` |
| Import/export another format losslessly | `import.after` / `export.before` | `transform` |
| Post-process finished renders | `render.complete` | `transform` |
| Sync edits to an external system | `entity.changed` | `observe` |
| Route generation (queueing, cost gating) | `generate.route` | `transform` |

Modes: `observe` = read-only, `transform` = may return patches or a `subject_replacement`, `veto` = may return validation errors. The host rejects anything beyond your declared mode.

## 2. Write the manifest

```json
{
  "$schema": "https://raw.githubusercontent.com/brandflowr/SKELETON-Brandflowr/v2.10.0/spec/muscle.schema.json",
  "muscle_id": "my-shot-lint",
  "muscle_version": "1.0.0",
  "label": "My Shot Lint",
  "description": "Warns when shots break my studio's rules.",
  "hooks": [
    { "on": "document.validate", "mode": "veto", "priority": 100, "timeout_ms": 10000 }
  ],
  "capabilities": ["read:document"],
  "execution_routes": [
    { "type": "cli", "label": "My Shot Lint", "command": "node my-shot-lint.mjs" }
  ]
}
```

Rules of thumb:

- Prefix `muscle_id` with your studio/handle to avoid collisions (`acme-shot-lint`).
- Declare the **minimum** capabilities you need — hosts show them to users as a consent screen, and every patch outside them rejects your whole patch set.
- If you write vendor data, use your own extension namespace: `patch:extensions.x-acme` lets you write `extensions.x-acme` on any entity and nothing else. The host creates the `extensions` container for you if it's missing.
- Validate your manifest against [`muscle.schema.json`](./muscle.schema.json) before shipping.

## 3. Write the tool

For the `cli` route: read the envelope from stdin, write the result to stdout, exit 0. Complete working example (Node, but any language works):

```js
const envelope = JSON.parse(await new Response(process.stdin).text());
const doc = envelope.document ?? {};

const errors = [];
for (const [i, shot] of (doc.shots ?? []).entries()) {
  if (!shot.action?.trim()) {
    errors.push({
      code: "my-shot-lint.empty-action",   // always prefix codes with your muscle_id
      severity: "error",
      path: `/shots/${i}/action`,
      message: `Shot ${shot.id} has no action text.`,
    });
  }
}

process.stdout.write(JSON.stringify({ payload_version: "1.0", ok: true, errors }));
```

The envelope and result shapes are formally defined in [`hook-payload.schema.json`](./hook-payload.schema.json). Key envelope fields: `hook`, `lifecycle` (`draft`/`production`/`export`), `context.config` (your per-project settings), `document` (only if you hold `read:document`), and a hook-specific `subject`.

## 4. Mutating the document: patches

Transform MUSCLEs never return a modified document — they return [RFC 6902 JSON Patch](https://datatracker.ietf.org/doc/html/rfc6902) operations:

```json
{
  "payload_version": "1.0",
  "ok": true,
  "patches": [
    { "op": "add", "path": "/shots/0/extensions/x-acme", "value": { "reviewed": true } }
  ]
}
```

The host checks every path against your capabilities, refuses writes to `creative_status: locked` entities and to `metadata.plugins`, applies your set atomically, re-validates the document, and rolls back if anything breaks. Move sources, ancestor replacements and array shifts are checked as well as destinations. These guarantees cover returned patches. CLI plugins execute with the host user’s operating-system permissions and must be trusted unless the embedding application supplies process isolation.

For derived-value hooks, return `subject_replacement` instead — e.g. the rewritten prompt string on `prompt.assemble.after`. It affects only the in-flight value, never the saved document.

## 5. Test against the reference host

```bash
cd reference/muscle-host/demo
node run-demo.mjs
```

Drop your manifest in a `muscles/` folder, point `discoverMuscles()` at it, and invoke your hook with a real document (the spec ships [`example.skel.json`](./example.skel.json)). The reference host enforces the same rules Genlock does — if your plugin behaves there, it's conformant. See [reference/muscle-host/](../reference/muscle-host/) for three worked examples (a linter, a patcher, and a deliberately misbehaving plugin).

## 6. Ship it

- Distribute the manifest + your tool however you like; users drop the manifest into `{workspace}/muscles/` or `{project}/muscles/`.
- Version with semver. Breaking manifest changes bump MAJOR.
- Remember discovery ≠ enabled: users opt in per project, and hosts surface your declared capabilities when they do.
