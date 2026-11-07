# Reference MUSCLE Host

A Node.js (≥22.12, with the repository’s npm dependencies installed) reference implementation of the **host side** of the [MUSCLE spec](../../spec/muscle-spec.md). It exists so plugin authors and host implementers have running code that demonstrates the contract — it is a conformance/teaching artifact, not a product.

## What it implements

- **Discovery** (§6.1): scans directories for `*.muscle.json`, validates manifests, later scopes override earlier ones by `muscle_id`.
- **Invocation** (§4): builds the hook envelope, executes the `cli` route (JSON on stdin → JSON on stdout), honors `timeout_ms`. Other route types report as unavailable.
- **Mode enforcement** (§3.3): results that exceed the declared mode (`observe`/`transform`/`veto`) are rejected as failures.
- **Patch application** (§4.3): capability check per path, `creative_status: locked` protection, atomic apply with rollback, complete post-apply schema and semantic validation, `metadata.plugins` recording (§6.3).
- **`subject_replacement`** (§4.2): derived values only; on `generate.route`, the replacement must be one of the candidate routes.
- **Deterministic ordering** (§3.1): priority, then registration order.

Manifests, envelopes and results are schema-validated. The host emits payload 1.1 and accepts compatible 1.x results. CLI commands execute from the manifest directory; quoted arguments are parsed into argv without a shell. The host checks patch destinations, move sources and all resulting changes, including ancestors and array shifts. Document and subject changes are staged together and committed only after validation.

Not implemented: MCP/API/skill routes, sidecar capabilities, or OS process isolation. Run only trusted CLI plugins: executables inherit the user's filesystem and network permissions. Returned-patch enforcement protects the in-memory document transaction, not the operating system from arbitrary plugin code.

Run `npm ci` at the repository root before the demo. `npm run test:regressions` exercises transaction failures, subject chaining and both shipped CLI plugins through this host. `npm run test:package` also invokes the installed continuity manifest.

## Run the demo

```bash
cd demo
node run-demo.mjs
```

The demo runs the spec's `example.skel.json` through two hooks with three plugins:

| MUSCLE | Mode | Demonstrates |
|---|---|---|
| `shot-lint` | `veto` on `document.validate` | Custom lint rules merging into validation results |
| `note-stamper` | `transform` on `entity.changed` | A capability-scoped patch set applying cleanly |
| `rogue-writer` | `transform` on `entity.changed` | An undeclared write → entire patch set rejected, pipeline continues |

Expected output: lint warnings from shot-lint, one applied patch set from note-stamper, a rejection notice for rogue-writer, and a final document state showing `metadata.title` untouched.

## Use it as a library

```js
import { discoverMuscles, runHook } from "./muscle-host.mjs";

const muscles = discoverMuscles(["./muscles"]);
const report = runHook("document.validate", { muscles, document, lifecycle: "production" });
```

## Writing your own MUSCLE

See [`spec/MUSCLE_AUTHORING.md`](../../spec/MUSCLE_AUTHORING.md).
