import { assertDataLimits } from './parse.mjs';

// One semantic validator; adapters supply the same release schemas without owning rules.
export function createValidator(checks, DEFAULT_KEYFILE) {
const TOKEN_CATEGORIES = ['size','angle','lens','move','light','tod','dof','aspect','color','mood','weather','texture','transition'];
function validators() {
  return checks;
}
// ── Helpers ────────────────────────────────────────────────────────────────────
const err = (code, path, message) => ({ code, severity: "error", path, message });
const warn = (code, path, message) => ({ code, severity: "warning", path, message });

function dialogueLines(dialogue) {
  if (dialogue == null) return [];
  if (typeof dialogue === "string") return [{ text: dialogue }];
  if (Array.isArray(dialogue)) return dialogue;
  return [dialogue];
}

function idSet(arr) {
  return new Set((arr ?? []).map((e) => e?.id).filter(Boolean));
}

// ── Main entry ─────────────────────────────────────────────────────────────────
/**
 * @param {object} doc parsed SKEL document
 * @param {object} [opts]
 * @param {"draft"|"production"|"export"} [opts.lifecycle] override metadata.lifecycle
 * @param {object} [opts.studio] parsed studio.json registry for asset resolution
 * @param {object} [opts.sidecars] { videoMap, audioMap, canvas } parsed sidecar objects
 * @returns {{valid: boolean, lifecycle: string, errors: object[], warnings: object[]}}
 */
function validateDocument(doc, opts = {}) {
  const errors = [];
  const warnings = [];
  const report = (e) => (e.severity === "error" ? errors : warnings).push(e);

  try { assertDataLimits(doc); } catch (e) {
    return { valid: false, lifecycle: 'draft', errors: [err(e.code, '', e.message)], warnings };
  }
  const lifecycle = opts.lifecycle ?? doc?.metadata?.lifecycle ?? "draft";
  const target = opts.lifecycle && doc?.metadata
    ? { ...doc, metadata: { ...doc.metadata, lifecycle: opts.lifecycle } }
    : doc;

  // 1. Schema
  const { skel } = validators();
  let invalidTypes = false;
  if (!skel(target)) {
    invalidTypes = (skel.errors ?? []).some(e => e.keyword === 'type');
    for (const e of skel.errors ?? []) {
      report(err("SCHEMA_ERROR", e.instancePath || "", `${e.message}${e.params ? " " + JSON.stringify(e.params) : ""}`));
    }
  }
  if (typeof doc !== "object" || doc === null || invalidTypes) {
    return { valid: false, lifecycle, errors, warnings };
  }

  if (typeof doc.skel_version === 'string' && !/^2\./.test(doc.skel_version)) {
    report(err('UNSUPPORTED_VERSION', '/skel_version', 'This reader supports SKEL major version 2.'));
    return { valid: false, lifecycle, errors, warnings };
  }
  if (opts.studio !== undefined) {
    const registryResult = validateStudio(opts.studio);
    if (!registryResult.valid) return { valid: false, lifecycle, errors: [...errors, ...registryResult.errors.map(e => ({...e, path: 'studio.json#' + e.path}))], warnings };
  }
  const acts = doc.acts ?? [];
  const scenes = doc.scenes ?? [];
  const shots = doc.shots ?? [];

  // 2. Duplicate IDs across all ID-bearing collections
  const seen = new Map();
  const collections = [
    ["/acts", acts], ["/scenes", scenes], ["/shots", shots],
    ["/characters", doc.characters], ["/environments", doc.environments],
    ["/locations", doc.locations], ["/props", doc.props],
    ["/audio_assets", doc.audio_assets], ["/music_cues", doc.music_cues],
  ];
  for (const [base, arr] of collections) {
    (arr ?? []).forEach((e, i) => {
      if (!e?.id) return;
      if (seen.has(e.id)) report(err("DUPLICATE_ID", `${base}/${i}/id`, `Duplicate id '${e.id}' (also at ${seen.get(e.id)}).`));
      else seen.set(e.id, `${base}/${i}/id`);
    });
  }

  // 3. Structural references
  const sceneIds = idSet(scenes);
  const shotIds = idSet(shots);
  const actIds = idSet(acts);
  acts.forEach((a, i) => (a?.scene_refs ?? []).forEach((r, j) => {
    if (!sceneIds.has(r)) report(err("ACT_SCENE_REF_MISSING", `/acts/${i}/scene_refs/${j}`, `scene_refs entry '${r}' does not match any scene id.`));
  }));
  scenes.forEach((s, i) => {
    (s?.shot_refs ?? []).forEach((r, j) => {
      if (!shotIds.has(r)) report(err("SCENE_SHOT_REF_MISSING", `/scenes/${i}/shot_refs/${j}`, `shot_refs entry '${r}' does not match any shot id.`));
    });
    if (s?.act_id && !actIds.has(s.act_id)) report(err("SCENE_ACT_MISSING", `/scenes/${i}/act_id`, `act_id '${s.act_id}' does not match any act id.`));
  });
  shots.forEach((s, i) => {
    if (s?.scene_id && !sceneIds.has(s.scene_id)) report(err("SHOT_SCENE_MISSING", `/shots/${i}/scene_id`, `scene_id '${s.scene_id}' does not match any scene id.`));
  });
  (doc.music_cues ?? []).forEach((c, i) => {
    for (const end of ["in", "out"]) {
      const ref = c?.[end]?.shot_ref;
      if (ref && !shotIds.has(ref)) report(err("MUSIC_CUE_SHOT_MISSING", `/music_cues/${i}/${end}/shot_ref`, `${end}.shot_ref '${ref}' does not match any shot id.`));
    }
  });

  // 4. Ordering precedence (refs arrays canonical)
  acts.forEach((a, i) => {
    if (typeof a?.order === "number" && a.order !== i) {
      report(warn("ORDER_MISMATCH", `/acts/${i}/order`, `Act order ${a.order} disagrees with array position ${i}.`));
    }
  });
  const scenePos = new Map();
  let sceneCursor = 0;
  for (const a of acts) for (const r of a?.scene_refs ?? []) scenePos.set(r, sceneCursor++);
  scenes.forEach((s, i) => {
    const posInAct = (acts.find((a) => a?.id === s?.act_id)?.scene_refs ?? []).indexOf(s?.id);
    if (typeof s?.order === "number" && posInAct >= 0 && s.order !== posInAct) {
      report(warn("ORDER_MISMATCH", `/scenes/${i}/order`, `Scene order ${s.order} disagrees with its position ${posInAct} in the act's scene_refs.`));
    }
  });
  shots.forEach((sh, i) => {
    const posInScene = (scenes.find((sc) => sc?.id === sh?.scene_id)?.shot_refs ?? []).indexOf(sh?.id);
    if (typeof sh?.order === "number" && posInScene >= 0 && sh.order !== posInScene) {
      report(warn("ORDER_MISMATCH", `/shots/${i}/order`, `Shot order ${sh.order} disagrees with its position ${posInScene} in the scene's shot_refs.`));
    }
  });

  // 5. Asset references — dual severity (skel-spec §3.4)
  const studio = opts.studio;
  const registryIds = {
    characters: idSet(studio?.characters),
    environments: idSet(studio?.environments),
    locations: idSet(studio?.locations),
    props: idSet(studio?.props),
    audio: idSet(studio?.audio_assets),
  };
  const embedded = {
    characters: Array.isArray(doc.characters) ? idSet(doc.characters) : null,
    environments: Array.isArray(doc.environments) ? idSet(doc.environments) : null,
    locations: Array.isArray(doc.locations) ? idSet(doc.locations) : null,
    props: Array.isArray(doc.props) ? idSet(doc.props) : null,
    audio: Array.isArray(doc.audio_assets) ? idSet(doc.audio_assets) : null,
  };
  const checkAsset = (kind, code, ref, path, label) => {
    if (!ref) return;
    const local = embedded[kind];
    if (local?.has(ref) || registryIds[kind].has(ref)) return;
    if (local !== null) report(err(code, path, `${label} '${ref}' does not resolve to the embedded ${kind} collection${studio ? " or the studio registry" : ""}.`));
    else report(warn(code, path, `${label} '${ref}' is resolvable only against an external studio registry.`));
  };

  shots.forEach((sh, i) => {
    (sh?.character_refs ?? []).forEach((r, j) => checkAsset("characters", "CHARACTER_REF_MISSING", r, `/shots/${i}/character_refs/${j}`, "character_refs entry"));
    dialogueLines(sh?.dialogue).forEach((d, j) => {
      if (d?.character_ref) checkAsset("characters", "CHARACTER_REF_MISSING", d.character_ref, `/shots/${i}/dialogue/${j}/character_ref`, "dialogue.character_ref");
    });
    (sh?.prop_refs ?? []).forEach((r, j) => checkAsset("props", "PROP_REF_MISSING", r, `/shots/${i}/prop_refs/${j}`, "prop_refs entry"));
    (sh?.sound_effects ?? []).forEach((c, j) => checkAsset("audio", "AUDIO_REF_MISSING", c?.audio_ref, `/shots/${i}/sound_effects/${j}/audio_ref`, "sound_effects audio_ref"));
  });
  scenes.forEach((sc, i) => {
    checkAsset("environments", "ENVIRONMENT_REF_MISSING", sc?.environment_ref, `/scenes/${i}/environment_ref`, "environment_ref");
    checkAsset("locations", "LOCATION_REF_MISSING", sc?.location_ref, `/scenes/${i}/location_ref`, "location_ref");
  });
  (doc.environments ?? []).forEach((env, i) => {
    checkAsset("locations", "LOCATION_REF_MISSING", env?.location_ref, `/environments/${i}/location_ref`, "environment location_ref");
    (env?.props_present ?? []).forEach((r, j) => checkAsset("props", "PROP_REF_MISSING", r, `/environments/${i}/props_present/${j}`, "props_present entry"));
    (env?.soundscape_refs ?? []).forEach((r, j) => checkAsset("audio", "AUDIO_REF_MISSING", r, `/environments/${i}/soundscape_refs/${j}`, "soundscape_refs entry"));
  });
  (doc.characters ?? []).forEach((ch, i) => {
    (ch?.relationships ?? []).forEach((rel, j) => checkAsset("characters", "CHARACTER_REF_MISSING", rel?.character_ref, `/characters/${i}/relationships/${j}/character_ref`, "relationship character_ref"));
    (ch?.props_carried ?? []).forEach((r, j) => checkAsset("props", "PROP_REF_MISSING", r, `/characters/${i}/props_carried/${j}`, "props_carried entry"));
    if (ch?.first_appearance && !shotIds.has(ch.first_appearance)) {
      report(warn("ASSET_SHOT_REF_MISSING", `/characters/${i}/first_appearance`, `first_appearance '${ch.first_appearance}' matches no shot.`));
    }
    (ch?.wardrobe_variants ?? []).forEach((w, j) => (w?.scene_refs ?? []).forEach((r, k) => {
      if (!sceneIds.has(r)) report(warn("ASSET_SCENE_REF_MISSING", `/characters/${i}/wardrobe_variants/${j}/scene_refs/${k}`, `wardrobe scene_ref '${r}' matches no scene.`));
    }));
    (ch?.state_overrides ?? []).forEach((so, j) => {
      if (so?.scene_ref && !sceneIds.has(so.scene_ref)) report(warn("ASSET_SCENE_REF_MISSING", `/characters/${i}/state_overrides/${j}/scene_ref`, `state_override scene_ref '${so.scene_ref}' matches no scene.`));
    });
  });
  (doc.props ?? []).forEach((p, i) => {
    checkAsset("characters", "CHARACTER_REF_MISSING", p?.carried_by, `/props/${i}/carried_by`, "carried_by");
    if (p?.first_appearance && !shotIds.has(p.first_appearance)) {
      report(warn("ASSET_SHOT_REF_MISSING", `/props/${i}/first_appearance`, `first_appearance '${p.first_appearance}' matches no shot.`));
    }
  });
  (doc.music_cues ?? []).forEach((c, i) => checkAsset("audio", "AUDIO_REF_MISSING", c?.audio_ref, `/music_cues/${i}/audio_ref`, "music cue audio_ref"));

  // 6. BONE resolution
  const registry = doc.bone_registry ?? null;
  const boneCarriers = [
    ["metadata", doc.metadata, "/metadata"],
    ...acts.map((a, i) => ["act", a, `/acts/${i}`]),
    ...scenes.map((s, i) => ["scene", s, `/scenes/${i}`]),
    ...shots.map((s, i) => ["shot", s, `/shots/${i}`]),
    ...(doc.characters ?? []).map((c, i) => ["character", c, `/characters/${i}`]),
    ...(doc.environments ?? []).map((e, i) => ["environment", e, `/environments/${i}`]),
  ];
  let anyBones = false;
  for (const [entityType, entity, base] of boneCarriers) {
    const bones = entity?.bones;
    if (!bones || typeof bones !== "object") continue;
    anyBones = true;
    for (const boneId of Object.keys(bones)) {
      const def = registry?.[boneId];
      if (!def) {
        if (registry) report(err("BONE_UNRESOLVED", `${base}/bones/${boneId}`, `Referenced BONE key '${boneId}' does not exist in bone_registry.`));
        continue;
      }
      if (Array.isArray(def.attaches_to) && !def.attaches_to.includes(entityType)) {
        report(warn("BONE_ATTACHMENT_INVALID", `${base}/bones/${boneId}`, `BONE '${boneId}' attaches_to [${def.attaches_to.join(", ")}], not '${entityType}'.`));
      }
    }
  }
  if (anyBones && !registry) {
    report(err("BONE_REGISTRY_MISSING", "/bone_registry", "Entities carry bones data but the document has no bone_registry."));
  }

  // Required fields: chain-resolve for shots; self + defaults for characters/environments.
  const actById = new Map(acts.map((a) => [a?.id, a]));
  const sceneById = new Map(scenes.map((s) => [s?.id, s]));
  const resolveChainForShot = (shot, boneId) => {
    const def = registry?.[boneId] ?? {};
    const scene = sceneById.get(shot?.scene_id);
    const act = scene ? actById.get(scene.act_id) : undefined;
    return {
      ...(def.defaults ?? {}),
      ...(doc.metadata?.bones?.[boneId] ?? {}),
      ...(act?.bones?.[boneId] ?? {}),
      ...(scene?.bones?.[boneId] ?? {}),
      ...(shot?.bones?.[boneId] ?? {}),
    };
  };
  const checkRequired = (resolved, def, base, boneId) => {
    for (const [field, fdef] of Object.entries(def?.fields ?? {})) {
      if (fdef?.required === true && resolved[field] === undefined) {
        report(err("BONE_REQUIRED_FIELD_MISSING", `${base}/bones/${boneId}/${field}`, `Required BONE field '${field}' of '${boneId}' is missing after inheritance resolution.`));
      }
    }
  };
  if (registry) {
    shots.forEach((sh, i) => {
      for (const boneId of Object.keys(sh?.bones ?? {})) {
        if (!registry[boneId]) continue;
        checkRequired(resolveChainForShot(sh, boneId), registry[boneId], `/shots/${i}`, boneId);
      }
    });
    [["characters", doc.characters], ["environments", doc.environments]].forEach(([key, arr]) => {
      (arr ?? []).forEach((entity, i) => {
        for (const boneId of Object.keys(entity?.bones ?? {})) {
          const def = registry[boneId];
          if (!def) continue;
          checkRequired({ ...(def.defaults ?? {}), ...(entity.bones[boneId] ?? {}) }, def, `/${key}/${i}`, boneId);
        }
      });
    });
  }

  // 7. Tokens: custom declarations + CONT placement
  const keyfile = typeof doc.key_file === "object" && doc.key_file !== null ? doc.key_file : DEFAULT_KEYFILE;
  const keyfileIsUri = typeof doc.key_file === "string";
  const customByToken = new Map(((keyfile.custom ?? []).filter((c) => c?.token)).map((c) => [c.token, c]));
  const checkToken = (value, category, path) => {
    if (typeof value !== "string" || !value.startsWith("x-")) return;
    if (keyfileIsUri) return; // cannot resolve external key files offline
    const decl = customByToken.get(value);
    if (!decl) report(warn("CUSTOM_TOKEN_UNDECLARED", path, `Custom token '${value}' is not declared in the key file's custom section.`));
    else if (decl.category !== category) report(err("CUSTOM_TOKEN_CATEGORY_MISMATCH", path, `Custom token '${value}' is declared as category '${decl.category}' but used as '${category}'.`));
  };
  shots.forEach((sh, i) => {
    for (const cat of TOKEN_CATEGORIES) {
      if (cat === "tod" || cat === "transition") continue;
      checkToken(sh?.v_setup?.[cat], cat, `/shots/${i}/v_setup/${cat}`);
    }
    checkToken(sh?.transition_out, "transition", `/shots/${i}/transition_out`);
  });
  scenes.forEach((sc, i) => {
    checkToken(sc?.loc?.tod, "tod", `/scenes/${i}/loc/tod`);
    checkToken(sc?.transition_out, "transition", `/scenes/${i}/transition_out`);
  });
  const firstSceneId = acts[0]?.scene_refs?.[0];
  const firstScene = sceneById.get(firstSceneId);
  if (firstScene?.loc?.tod === "CONT") {
    report(warn("TOD_CONT_FIRST_SCENE", `/scenes/${scenes.indexOf(firstScene)}/loc/tod`, "The first scene uses tod: CONT — there is no previous scene to be continuous with."));
  }

  // 8. Consistency lints
  const norm = (s) => String(s ?? "").toUpperCase().replace(/[.\s]/g, "");
  scenes.forEach((sc, i) => {
    if (!sc?.header || !sc?.loc) return;
    const h = norm(sc.header);
    const ok = h.startsWith(norm(sc.loc.type)) && h.includes(norm(sc.loc.name)) && (!sc.loc.tod || h.includes(norm(sc.loc.tod)));
    if (!ok) report(warn("HEADER_LOC_MISMATCH", `/scenes/${i}/header`, `header '${sc.header}' disagrees with canonical loc (${sc.loc.type}. ${sc.loc.name} - ${sc.loc.tod}).`));
  });
  const md = doc.metadata ?? {};
  if (typeof md.target_duration_seconds === "number" && typeof md.target_duration_minutes === "number") {
    if (Math.abs(md.target_duration_seconds - md.target_duration_minutes * 60) > 1) {
      report(warn("DURATION_CONFLICT", "/metadata/target_duration_minutes", `target_duration_minutes (${md.target_duration_minutes}) disagrees with canonical target_duration_seconds (${md.target_duration_seconds}).`));
    }
  }
  shots.forEach((sh, i) => {
    if ((sh?.character_refs ?? []).length > 1) {
      dialogueLines(sh?.dialogue).forEach((d, j) => {
        if (!d?.character_ref) report(warn("DIALOGUE_AMBIGUOUS_SPEAKER", `/shots/${i}/dialogue${Array.isArray(sh.dialogue) ? "/" + j : ""}`, "Shot lists multiple characters but this dialogue line names no character_ref."));
      });
    }
  });
  (doc.props ?? []).forEach((p, i) => {
    if (p?.significance !== "plot_critical") return;
    const appearances = shots.filter((sh) => (sh?.prop_refs ?? []).includes(p.id)).length;
    if (appearances === 1) {
      report(warn("PROP_CONTINUITY", `/props/${i}`, `Plot-critical prop '${p.id}' appears in exactly one shot — set up without payoff (or vice versa).`));
    }
  });

  // 9. Sidecars (optional)
  const sc = { ...opts.sidecars };
  const v = validators();
  for (const [key, filename, check] of [['videoMap','video-map.json',v.videoMap],['audioMap','audio-map.json',v.audioMap],['canvas','canvas/layout.json',v.canvas]]) {
    if (sc[key] !== undefined && !check(sc[key])) {
      for (const e of check.errors ?? []) report(err('SIDECAR_SCHEMA_ERROR', filename + '#' + e.instancePath, e.message ?? 'schema violation'));
      delete sc[key];
    }
  }
  const allEntityIds = new Set([...actIds, ...sceneIds, ...shotIds]);
  for (const key of ["videoMapParseError", "audioMapParseError", "canvasParseError"]) {
    if (sc[key]) report(sc[key]);
  }
  if (sc.videoMap) {
    if (!v.videoMap(sc.videoMap)) for (const e of v.videoMap.errors ?? []) report(err("SIDECAR_SCHEMA_ERROR", `video-map.json#${e.instancePath}`, e.message ?? "schema violation"));
    for (const [key, takes] of Object.entries(sc.videoMap.takes ?? {})) {
      if (!shotIds.has(key)) report(err("SIDECAR_SHOT_MISSING", `video-map.json#/takes/${key}`, `video-map key '${key}' matches no shot.`));
      if (!Array.isArray(takes)) continue;
      if (takes.filter((take) => take?.isActive === true).length > 1) {
        report(err("VIDEO_MULTIPLE_ACTIVE_TAKES", `video-map.json#/takes/${key}`, `Shot '${key}' has more than one active video take.`));
      }
      const takeIds = new Set();
      takes.forEach((take, index) => {
        if (take?.id) {
          if (takeIds.has(take.id)) report(err("SIDECAR_DUPLICATE_ID", `video-map.json#/takes/${key}/${index}/id`, `Video take id '${take.id}' is duplicated.`));
          takeIds.add(take.id);
        }
        for (const [compat, canonical] of [["boneId", "bone_id"], ["model", "model"], ["prompt", "prompt"]]) {
          if (take?.[compat] != null && take?.provenance?.[canonical] != null && take[compat] !== take.provenance[canonical]) {
            report(err("MEDIA_PROVENANCE_MISMATCH", `video-map.json#/takes/${key}/${index}/${compat}`, `${compat} disagrees with provenance.${canonical}.`));
          }
        }
      });
    }
  }
  if (sc.audioMap) {
    if (!v.audioMap(sc.audioMap)) for (const e of v.audioMap.errors ?? []) report(err("SIDECAR_SCHEMA_ERROR", `audio-map.json#${e.instancePath}`, e.message ?? "schema violation"));
    for (const [key, tracks] of Object.entries(sc.audioMap.tracks ?? {})) {
      if (!shotIds.has(key)) report(err("SIDECAR_SHOT_MISSING", `audio-map.json#/tracks/${key}`, `audio-map key '${key}' matches no shot.`));
      if (!Array.isArray(tracks)) continue;
      const trackIds = new Set();
      tracks.forEach((track, index) => {
        if (track?.id) {
          if (trackIds.has(track.id)) report(err("SIDECAR_DUPLICATE_ID", `audio-map.json#/tracks/${key}/${index}/id`, `Audio track id '${track.id}' is duplicated.`));
          trackIds.add(track.id);
        }
        if (typeof track?.durationSeconds === "number" && (track.fadeInSeconds ?? 0) + (track.fadeOutSeconds ?? 0) > track.durationSeconds) {
          report(err("MEDIA_FADE_DURATION_CONFLICT", `audio-map.json#/tracks/${key}/${index}`, "Audio fades exceed the declared track duration."));
        }
        for (const field of ["model", "prompt"]) {
          if (track?.[field] != null && track?.provenance?.[field] != null && track[field] !== track.provenance[field]) {
            report(err("MEDIA_PROVENANCE_MISMATCH", `audio-map.json#/tracks/${key}/${index}/${field}`, `${field} disagrees with provenance.${field}.`));
          }
        }
      });
    }
  }
  if (sc.canvas) {
    if (!v.canvas(sc.canvas)) for (const e of v.canvas.errors ?? []) report(err("SIDECAR_SCHEMA_ERROR", `canvas/layout.json#${e.instancePath}`, e.message ?? "schema violation"));
    for (const key of Object.keys(sc.canvas.nodes ?? {})) if (!allEntityIds.has(key)) report(err("SIDECAR_SHOT_MISSING", `canvas/layout.json#/nodes/${key}`, `canvas node key '${key}' matches no act, scene, or shot.`));
  }

  return { valid: errors.length === 0, lifecycle, errors, warnings };
}

// ── Studio registry validation ─────────────────────────────────────────────────
function validateStudio(studio) {
  const errors = [];
  try { assertDataLimits(studio); } catch (e) { return { valid: false, errors: [err(e.code, '', e.message)], warnings: [] }; }
  const { studio: sv } = validators();
  if (!sv(studio)) {
    for (const e of sv.errors ?? []) errors.push(err("SCHEMA_ERROR", e.instancePath || "", `${e.message}${e.params ? " " + JSON.stringify(e.params) : ""}`));
  }
  if (errors.length) return { valid: false, errors, warnings: [] };
  const seen = new Map();
  for (const key of ["characters", "environments", "locations", "props", "audio_assets", "voices", "skins", "palettes"]) {
    (studio?.[key] ?? []).forEach((entity, i) => {
      if (!entity?.id) return;
      if (seen.has(entity.id)) errors.push(err("DUPLICATE_ID", `/${key}/${i}/id`, `Duplicate id '${entity.id}' (also at ${seen.get(entity.id)}).`));
      else seen.set(entity.id, `/${key}/${i}/id`);
    });
  }
  return { valid: errors.length === 0, errors, warnings: [] };
}


function validateDocumentShape(doc) {
  try { assertDataLimits(doc); } catch (e) { return [err(e.code, '', e.message)]; }
  const check = validators().skel;
  const issues = check(doc) ? [] : check.errors.map(e => err('SCHEMA_ERROR', e.instancePath || '', e.message + ' ' + JSON.stringify(e.params)));
  if (typeof doc?.skel_version === 'string' && !/^2\./.test(doc.skel_version)) issues.push(err('UNSUPPORTED_VERSION','/skel_version','This reader supports SKEL major version 2.'));
  return issues;
}
return { validateDocument, validateStudio, validateDocumentShape };
}
