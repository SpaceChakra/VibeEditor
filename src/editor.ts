// =============================================================================
// VibeEditor — procedural character and level editor
// Served at /editor.html by Vite. Imports the active CharacterBuilder so what you
// edit is the actual procedural model geometry, materials, outlines, and hierarchy.
//
// Per body part you can adjust position (x/y/z), rotation (x/y/z) and scale, with:
//   • "Move hierarchy"   — transforms the rig group node (children follow).
//   • (unchecked)        — transforms only that part's own meshes, leaving any
//                          child joints where they are (the builder's traverse idiom).
//   • "Mirror"           — applies the mirrored transform to the opposite-side part.
// "Generate code" emits paste-ready lines for every part you've touched.
// If the "Auto-apply to source" checkbox is checked, Generate will also POST the
// snippet to the Vite dev server (/__editor-apply) which inserts a marked block
// into the corresponding src/warriors/builders/*Builder.ts (or sidecar for levels/anim).
// Restart `npm run dev` after changing vite.config.ts so the endpoint is active.
//
// Animation poses: "Load → Sliders" + tweak, then "Apply to this pose" (or Copy/Paste to others)
// updates the ANIM_POSES entry in *this* editor.ts (marked auto block in the fn body).
// Respects the Auto-apply checkbox (if off, dumps snippet for manual paste).
// Undo pose apply is supported via server (restores from timestamped backup of prior entry).
// Note: runtime animations live in runtime source; editor poses are for preview/export only.
//
// Cross-check on launch / pose select: the "Check runtime" button (or equiv) fetches live
// excerpts from runtime source (via /__editor-snippet?kind=player-pose) and builder sources.
// This lets you *see* the authoritative runtime numbers/logic right in the editor and
// optionally "Import numbers → sliders" to pull a recent runtime tweak back into your
// ANIM_POSES preview (then re-Apply if you want to persist the sync in editor).
// Models: editor always builds from the live *Builder.ts on character load (after reload
// to pick up disk edits); "Check builder overrides" shows the current auto-applied block.
// =============================================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// @ts-ignore
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';
import { CharacterBuilder } from './CharacterBuilder';
import { WarriorType } from './warriors/types';
import type { CharacterRig } from './warriors/types';
import { EnvironmentManager, LEVELS } from './EnvironmentManager';

const AXES = ['x', 'y', 'z'] as const;
type Axis = typeof AXES[number];

// Rig keys that are transformable Object3D nodes, in a sensible editing order.
const PART_KEYS: (keyof CharacterRig)[] = [
  'torso', 'pelvis', 'neck', 'head',
  'lShoulder', 'lUpperArm', 'lForearm', 'lHand',
  'rShoulder', 'rUpperArm', 'rForearm', 'rHand',
  'lThigh', 'lCalf', 'lFoot',
  // NOTE: lShin/rShin are intentionally omitted (they are child visuals under lCalf/rCalf in the rig).
  // Exposing them caused raycast selection on the lower-leg geometry to pick lShin (instead of lCalf),
  // so moving "the lower leg at the knee" would not carry the attached lFoot (see nodeKeyFromObject + builder parentage).
  // Bare shin adjustment is still possible via part-mode offsets on lCalf (now included in its baseMeshes).
  'rThigh', 'rCalf', 'rFoot',
  'lShinArmor', 'rShinArmor', 'lFootArmor', 'rFootArmor', 'lClaw', 'rClaw',
  'hair', 'bagpipes', 'belt', 'jacketHem',
  'weaponGroup', 'lWing', 'rWing', 'lEye', 'rEye', 'lEyeball', 'rEyeball',
];

// Left/right mirror pairs (by rig key).
const MIRROR_PAIR: Record<string, string> = {
  lShoulder: 'rShoulder', rShoulder: 'lShoulder',
  lUpperArm: 'rUpperArm', rUpperArm: 'lUpperArm',
  lForearm: 'rForearm', rForearm: 'lForearm',
  lHand: 'rHand', rHand: 'lHand',
  lThigh: 'rThigh', rThigh: 'lThigh',
  lCalf: 'rCalf', rCalf: 'lCalf',
  lFoot: 'rFoot', rFoot: 'lFoot',
  lWing: 'rWing', rWing: 'lWing',
  lEye: 'rEye', rEye: 'lEye',
  lPatella: 'rPatella', rPatella: 'lPatella',
  lShinArmor: 'rShinArmor', rShinArmor: 'lShinArmor',
  lFootArmor: 'rFootArmor', rFootArmor: 'lFootArmor',
  lClaw: 'rClaw', rClaw: 'lClaw',
  lEyeball: 'rEyeball', rEyeball: 'lEyeball',
};

type Vec = { x: number; y: number; z: number };
type Mode = 'hierarchy' | 'part';
interface PartState {
  hierarchy: { pos: Vec; rot: Vec; scl: Vec };
  part: { pos: Vec; rot: Vec; scl: Vec }; // pos/rot are OFFSETS, scl is a MULTIPLIER
  taper: { top: number; bottom: number }; // XZ scale factor at each end: 1.0 = no change
}

const vec = (x = 0, y = 0, z = 0): Vec => ({ x, y, z });
const one = (): Vec => vec(1, 1, 1);

// -----------------------------------------------------------------------------
// Three.js scene
// -----------------------------------------------------------------------------
const viewEl = document.getElementById('view') as HTMLDivElement;
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
viewEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20242c);

// Match game's PBR environment so metal/gold materials look the same here as runtime.
const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
scene.environmentIntensity = 0;
scene.environment = null;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 2.4, 6);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.6, 0);
controls.enablePan = true;
(window as any).scene = scene;
(window as any).camera = camera;
(window as any).controls = controls;
(window as any).selectLvlMesh = lvlSelectMesh;

// Lighting matches character select screen exactly — no ambient, no IBL.
const ambient = new THREE.AmbientLight(0xffffff, 0.2);
ambient.visible = false;
scene.add(ambient);
const key = new THREE.DirectionalLight(0xfff5e0, 2.4);
key.position.set(3, 8, 6);
key.castShadow = true;
scene.add(key);
const fill = new THREE.DirectionalLight(0x2244aa, 0.4);
fill.position.set(-5, 2, 4);
scene.add(fill);

// Ground grid for reference.
const grid = new THREE.GridHelper(10, 20, 0x44505f, 0x2a313c);
scene.add(grid);

// Selection highlight.
const boxHelper = new THREE.BoxHelper(new THREE.Object3D(), 0xf0c987);
(boxHelper.material as THREE.LineBasicMaterial).depthTest = false;
boxHelper.visible = false;
scene.add(boxHelper);

function resize() {
  const w = viewEl.clientWidth, h = viewEl.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// -----------------------------------------------------------------------------
// Kill the browser's autofill / "previous entries" dropdown on text inputs —
// it gets in the way of editing numeric values. Applies to current and any
// dynamically-created inputs.
// -----------------------------------------------------------------------------
function killAutofill(el: HTMLInputElement) {
  if (el.type === 'text' || el.type === 'number' || el.inputMode === 'decimal') {
    el.autocomplete = 'off';
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('autocorrect', 'off');
    el.setAttribute('spellcheck', 'false');
    // Browsers ignore autocomplete="off" unless the field looks "un-named".
    if (!el.name) el.name = 'no-autofill-' + Math.random().toString(36).slice(2);
  }
}
document.querySelectorAll('input').forEach(el => killAutofill(el as HTMLInputElement));
new MutationObserver(muts => {
  for (const m of muts) {
    for (const node of m.addedNodes) {
      if (node instanceof HTMLInputElement) killAutofill(node);
      else if (node instanceof HTMLElement) node.querySelectorAll('input').forEach(el => killAutofill(el as HTMLInputElement));
    }
  }
}).observe(document.body, { childList: true, subtree: true });

// -----------------------------------------------------------------------------
// Gamepad: FPS-style free-fly camera (no orbital focus).
//   Left stick  -> move on the horizontal plane (forward/back + strafe)
//   Triggers    -> vertical motion (RT up, LT down)
//   Right stick -> look (yaw/pitch)
// -----------------------------------------------------------------------------
let fpsYaw = 0, fpsPitch = 0, fpsWasActive = false;
const _fpsQuat = new THREE.Quaternion();
const _fpsEuler = new THREE.Euler(0, 0, 0, 'YXZ');
const _fpsForward = new THREE.Vector3();
const _fpsRight = new THREE.Vector3();
function updateGamepadCamera(dt: number): boolean {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let pad: Gamepad | null = null;
  for (const p of pads) { if (p) { pad = p; break; } }
  if (!pad) { fpsWasActive = false; return false; }

  const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
  const lx = dz(pad.axes[0] || 0), ly = dz(pad.axes[1] || 0);
  const rx = dz(pad.axes[2] || 0), ry = dz(pad.axes[3] || 0);
  const lt = pad.buttons[6]?.value || 0;   // left trigger
  const rt = pad.buttons[7]?.value || 0;   // right trigger
  const anyInput = lx || ly || rx || ry || lt > 0.05 || rt > 0.05;
  if (!anyInput) { return fpsWasActive; }

  if (!fpsWasActive) {
    // Take over from OrbitControls: seed yaw/pitch from current orientation.
    _fpsEuler.setFromQuaternion(camera.quaternion);
    fpsYaw = _fpsEuler.y; fpsPitch = _fpsEuler.x;
    fpsWasActive = true;
  }

  const lookSpeed = 2.2;
  fpsYaw -= rx * lookSpeed * dt;
  fpsPitch -= ry * lookSpeed * dt;
  fpsPitch = Math.max(-1.5, Math.min(1.5, fpsPitch));
  _fpsEuler.set(fpsPitch, fpsYaw, 0);
  _fpsQuat.setFromEuler(_fpsEuler);
  camera.quaternion.copy(_fpsQuat);

  const moveSpeed = 6;
  _fpsForward.set(0, 0, -1).applyQuaternion(_fpsQuat); _fpsForward.y = 0; _fpsForward.normalize();
  _fpsRight.set(1, 0, 0).applyQuaternion(_fpsQuat); _fpsRight.y = 0; _fpsRight.normalize();
  camera.position.addScaledVector(_fpsForward, -ly * moveSpeed * dt);
  camera.position.addScaledVector(_fpsRight, lx * moveSpeed * dt);
  camera.position.y += (rt - lt) * moveSpeed * dt;

  // Keep the orbit target a few units ahead so mouse control stays sane afterward.
  _fpsForward.set(0, 0, -1).applyQuaternion(_fpsQuat);
  controls.target.copy(camera.position).addScaledVector(_fpsForward, 3);
  return true;
}

// -----------------------------------------------------------------------------
// Model state
// -----------------------------------------------------------------------------
let rig: CharacterRig;
let currentType: WarriorType = WarriorType.RUSTY; // for pose-specific sample weapon handling
let currentColorVariant = 0;
let scale = 1;                                  // profile.scale (the `s` in the source)
let nodes: Record<string, THREE.Object3D> = {}; // rig key -> node (only existing ones)
let baseGroup: Record<string, { pos: Vec; rot: Vec; scl: Vec; taperTop: number; taperBot: number }> = {}; // group baselines
// For part-only mode: baseline transforms of each part's own (non-joint) meshes.
let baseMeshes: Record<string, { obj: THREE.Object3D; pos: Vec; rot: Vec; scl: Vec }[]> = {};
// Baseline vertex positions for geometry taper (all Mesh descendants, skipping sub-joints).
let baseTaperVerts: Record<string, { mesh: THREE.Mesh; origPositions: Float32Array }[]> = {};
let state: Record<string, PartState> = {};
let extraKeys = new Set<string>(); // node keys that live under rig.extras (not typed rig fields)

// Multi-select (Ctrl+click)
const selectedKeys = new Set<string>();
const secondaryBoxHelpers: THREE.BoxHelper[] = [];

// How a part is referenced in exported builder code.
function refPath(key: string): string { return extraKeys.has(key) ? `extras!.${key}` : key; }

function cloneV(v: { x: number; y: number; z: number }): Vec { return { x: v.x, y: v.y, z: v.z }; }

function loadCharacter(type: WarriorType) {
  // Tear down previous model.
  if (rig?.mesh) { scene.remove(rig.mesh); rig.mesh.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
  }); }

  rig = CharacterBuilder.build(type, scene, currentColorVariant);
  if (currentColorVariant === 2) {
    rig.mesh.traverse(obj => {
      if (obj instanceof THREE.Mesh && obj.material) {
        const mat = obj.material as THREE.MeshStandardMaterial;
        if (mat.color) {
          const hsl = { h: 0, s: 0, l: 0 };
          mat.color.getHSL(hsl);
          mat.color.setHSL((hsl.h + 0.5) % 1, Math.max(0, hsl.s * 1.0), Math.max(0, hsl.l * 1.0));
          mat.needsUpdate = true;
        }
      }
    });
  }
  currentType = type;
  scale = rig.profile.scale || 1;
  rig.mesh.position.set(0, 0, 0);
  if (gameLightOn) {
    const start = LEVEL_START_POS[gameLightLevel] ?? DEFAULT_START_POS;
    rig.mesh.position.set(-start.x, 0, start.z);
    rig.mesh.rotation.y = Math.PI / 2;
    if (gameLightOpponent) { disposeRig(gameLightOpponent); gameLightOpponent = null; }
    gameLightOpponent = CharacterBuilder.build(type, scene, currentColorVariant === 2 ? 0 : 2);
    gameLightOpponent.mesh.position.set(start.x, 0, start.z);
    gameLightOpponent.mesh.rotation.y = -Math.PI / 2;
  }

  // Collect existing transformable nodes.
  nodes = {};
  for (const key of PART_KEYS) {
    const n = (rig as any)[key] as THREE.Object3D | undefined;
    if (n && n.isObject3D) nodes[key as string] = n;
  }
  // Plus any builder-registered extra parts.
  extraKeys = new Set();
  AUTO_HIERARCHY.clear();
  if (rig.extras) {
    for (const [key, n] of Object.entries(rig.extras)) {
      if (n && (n as THREE.Object3D).isObject3D) {
        nodes[key] = n as THREE.Object3D; extraKeys.add(key);
        // Non-Group extras are leaf meshes: part-only mode would only touch their
        // outline child, so auto-select hierarchy mode for these.
        if (!(n instanceof THREE.Group)) AUTO_HIERARCHY.add(key);
      }
    }
  }

  // Capture baselines.
  baseGroup = {};
  baseMeshes = {};
  baseTaperVerts = {};
  state = {};
  const jointSet = new Set(Object.values(nodes));
  const seenGeoUUIDs = new Set<string>();
  for (const key of Object.keys(nodes)) {
    const n = nodes[key];
    const _bTaperTop = (n.userData as any)?.editorTaperTop as number | undefined;
    const _bTaperBot = (n.userData as any)?.editorTaperBot as number | undefined;
    baseGroup[key] = { pos: cloneV(n.position), rot: cloneV(n.rotation), scl: cloneV(n.scale),
      taperTop: _bTaperTop ?? 1, taperBot: _bTaperBot ?? 1 };
    // Part-only targets: every direct child that is NOT a child rig-joint.
    const meshes: { obj: THREE.Object3D; pos: Vec; rot: Vec; scl: Vec }[] = [];
    for (const child of n.children) {
      if (jointSet.has(child)) continue; // skip sub-joints (they're edited on their own)
      meshes.push({ obj: child, pos: cloneV(child.position), rot: cloneV(child.rotation), scl: cloneV(child.scale) });
    }
    baseMeshes[key] = meshes;
    // Taper targets: all Mesh descendants, excluding sub-joint branches.
    const skipBranches = new Set<THREE.Object3D>();
    for (const c of n.children) { if (jointSet.has(c)) c.traverse(o => skipBranches.add(o)); }
    const taperEntries: { mesh: THREE.Mesh; origPositions: Float32Array }[] = [];
    n.traverse(child => {
      if (child === n || skipBranches.has(child)) return;
      if (!(child instanceof THREE.Mesh) || !child.geometry?.attributes?.position) return;
      if (seenGeoUUIDs.has(child.geometry.uuid)) return;
      seenGeoUUIDs.add(child.geometry.uuid);
      taperEntries.push({ mesh: child, origPositions: new Float32Array(child.geometry.attributes.position.array) });
    });
    baseTaperVerts[key] = taperEntries;
    // If the builder baked a taper into this part's geometry, read it back and
    // reverse-apply it so origPositions become the pre-taper vertex positions.
    // This makes the taper sliders show the builder's value on load, and lets
    // further adjustments be cleanly exported without compounding.
    const _preTop = (n.userData as any)?.editorTaperTop as number | undefined;
    const _preBot = (n.userData as any)?.editorTaperBot as number | undefined;
    const _preTaper = (_preTop !== undefined && _preBot !== undefined) ? { top: _preTop, bottom: _preBot } : null;
    if (_preTaper) {
      for (const { origPositions } of taperEntries) {
        let _yMin = Infinity, _yMax = -Infinity;
        for (let i = 1; i < origPositions.length; i += 3) {
          if (origPositions[i] < _yMin) _yMin = origPositions[i];
          if (origPositions[i] > _yMax) _yMax = origPositions[i];
        }
        const _h = _yMax - _yMin;
        for (let i = 0; i < origPositions.length; i += 3) {
          const _t = _h > 1e-6 ? (origPositions[i + 1] - _yMin) / _h : 0.5;
          const _sc = _preTaper.bottom + _t * (_preTaper.top - _preTaper.bottom);
          if (Math.abs(_sc) > 1e-6) { origPositions[i] /= _sc; origPositions[i + 2] /= _sc; }
        }
      }
    }
    state[key] = {
      hierarchy: { pos: cloneV(n.position), rot: cloneV(n.rotation), scl: cloneV(n.scale) },
      part: { pos: vec(), rot: vec(), scl: one() },
      taper: _preTaper ? { top: _preTaper.top, bottom: _preTaper.bottom } : { top: 1, bottom: 1 },
    };
  }

  undoStack.length = 0;
  pendingSnapshot = null;
  charTexMap.clear();
  charTexUndoStack.length = 0;
  charTexRedoStack.length = 0;
  charTexBaseline.clear();
  charMatBaseline.clear();
  charTexScopeAll = (currentColorVariant === 0);
  charUpdateScopeUI();
  // Capture baseline after one frame so all materials are fully initialized.
  requestAnimationFrame(() => charTexCaptureBaseline());

  // Pose clipboard (copy/paste for ANIM_POSES entries + "Apply to this pose") is intentionally per-model.
  // Different warriors have different scales (profile.scale), arm/neck Y offsets, hand grips (Sample claws use ~\pm PI vs sword \pm PI/2),
  // weaponGroup locking/offsets (Sample locked + dual claws; Sample axe base rot/pos; sample shield spear+shield+armor children),
  // plus heavy builder post-adjusts (adjustPartMeshes, direct sets, clears on WG/head, scale overrides, foot repos etc.).
  // Absolute copied {pos,rot} from one rig's state do not produce correct results on another. We clear here (like undo/charTex stacks)
  // to avoid silent bad pastes or source applies. User simply re-copies (or re-loads a native pose) after switching.
  if (copiedPoseData) {
    copiedPoseData = null;
    copiedPoseFromId = null;
    updatePoseCopyPasteUI();
    showToast('Pose clipboard cleared on model switch (poses are tuned to specific warrior scale, arm/neck offsets, hand grips, weaponGroup locking, armor attachments, and builder baselines). Re-copy a pose while on this model for accurate results.');
  }

  buildPartDropdown();
  selectPart(partSel.value || Object.keys(nodes)[0]);
}

// -----------------------------------------------------------------------------
// Applying transforms
// -----------------------------------------------------------------------------
function applyTaper(key: string) {
  const t = state[key]?.taper;
  const entries = baseTaperVerts[key];
  if (!t || !entries?.length) return;
  const { top, bottom } = t;
  for (const { mesh, origPositions } of entries) {
    const posAttr = mesh.geometry.attributes.position;
    const arr = posAttr.array as Float32Array;
    let yMin = Infinity, yMax = -Infinity;
    for (let i = 1; i < origPositions.length; i += 3) {
      if (origPositions[i] < yMin) yMin = origPositions[i];
      if (origPositions[i] > yMax) yMax = origPositions[i];
    }
    const height = yMax - yMin;
    for (let i = 0; i < origPositions.length; i += 3) {
      const t01 = height > 1e-6 ? (origPositions[i + 1] - yMin) / height : 0.5;
      const xzScale = bottom + t01 * (top - bottom);
      arr[i]     = origPositions[i]     * xzScale;
      arr[i + 1] = origPositions[i + 1];
      arr[i + 2] = origPositions[i + 2] * xzScale;
    }
    posAttr.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
  }
}

function applyPart(key: string) {
  const n = nodes[key];
  if (!n) return;
  const st = state[key];
  // Hierarchy transform on the group node.
  n.position.set(st.hierarchy.pos.x, st.hierarchy.pos.y, st.hierarchy.pos.z);
  n.rotation.set(st.hierarchy.rot.x, st.hierarchy.rot.y, st.hierarchy.rot.z);
  n.scale.set(st.hierarchy.scl.x, st.hierarchy.scl.y, st.hierarchy.scl.z);
  // Part-only: offset/scale each own-mesh relative to its baseline.
  for (const m of baseMeshes[key]) {
    m.obj.position.set(m.pos.x + st.part.pos.x, m.pos.y + st.part.pos.y, m.pos.z + st.part.pos.z);
    m.obj.rotation.set(m.rot.x + st.part.rot.x, m.rot.y + st.part.rot.y, m.rot.z + st.part.rot.z);
    m.obj.scale.set(m.scl.x * st.part.scl.x, m.scl.y * st.part.scl.y, m.scl.z * st.part.scl.z);
  }
  applyTaper(key);
  propagateFootCompensation(key);
}

// When calf, thigh, or pelvis rotation changes, keep the foot flat by
// replicating the same compensation the game runtime uses:
//   foot.rot.x = -(thigh.rot.x + calf.rot.x + pelvis.rot.x)
const FOOT_DRIVERS = new Set(['lCalf', 'rCalf', 'lThigh', 'rThigh', 'pelvis']);
function propagateFootCompensation(drivenKey: string) {
  if (!FOOT_DRIVERS.has(drivenKey)) return;
  for (const side of ['l', 'r'] as const) {
    const footKey = `${side}Foot`;
    if (!state[footKey] || !state[`${side}Thigh`] || !state[`${side}Calf`] || !state['pelvis']) continue;
    const comp = -(
      state[`${side}Thigh`].hierarchy.rot.x +
      state[`${side}Calf`].hierarchy.rot.x +
      state['pelvis'].hierarchy.rot.x
    );
    state[footKey].hierarchy.rot.x = comp;
    applyPart(footKey);
    if (partSel.value === footKey) refreshRows();
  }
}

// Resolve a part's mirror partner: explicit table first, else the l*/r* naming
// convention (lHorn <-> rHorn, lMaskEye <-> rMaskEye, etc.).
function mirrorPartner(key: string): string | null {
  if (MIRROR_PAIR[key]) return MIRROR_PAIR[key];
  let m = key.match(/^l([A-Z].*)$/); if (m && nodes['r' + m[1]]) return 'r' + m[1];
  m = key.match(/^r([A-Z].*)$/); if (m && nodes['l' + m[1]]) return 'l' + m[1];
  return null;
}

// Mirror an edit made on `key` onto its opposite-side partner.
function applyMirror(key: string, mode: Mode) {
  const pairKey = mirrorPartner(key);
  if (!pairKey || !nodes[pairKey]) return;
  const src = state[key][mode];
  const dst = state[pairKey][mode];
  if (mode === 'hierarchy') {
    const base = baseGroup[pairKey];
    // Mirror across the X plane: x -> -x (about the partner's own baseline x),
    // and the X-position is the mirror of the source's X position.
    dst.pos.x = -src.pos.x;
    dst.pos.y = src.pos.y;
    dst.pos.z = src.pos.z;
    dst.rot.x = src.rot.x;
    dst.rot.y = -src.rot.y;
    dst.rot.z = -src.rot.z;
    dst.scl.x = src.scl.x; dst.scl.y = src.scl.y; dst.scl.z = src.scl.z;
    void base;
  } else {
    // Part-only: pos/rot are offsets, scl is a multiplier.
    dst.pos.x = -src.pos.x; dst.pos.y = src.pos.y; dst.pos.z = src.pos.z;
    dst.rot.x = src.rot.x; dst.rot.y = -src.rot.y; dst.rot.z = -src.rot.z;
    dst.scl.x = src.scl.x; dst.scl.y = src.scl.y; dst.scl.z = src.scl.z;
  }
  applyPart(pairKey);
}

// -----------------------------------------------------------------------------
// Undo (per edit step, not per slider tick)
// -----------------------------------------------------------------------------
// A "step" = one interaction: a slider drag, a number entry, or a reset. We
// snapshot the full state when an interaction begins and push it when it
// commits, so each Ctrl+Z reverts one logical edit.
const undoStack: Record<string, PartState>[] = [];
const redoStack: Record<string, PartState>[] = [];
let pendingSnapshot: Record<string, PartState> | null = null;
const MAX_UNDO = 100;

function snapshotState(): Record<string, PartState> {
  return JSON.parse(JSON.stringify(state));
}
// Call at the start of an interaction. No-op if a step is already in progress.
// Clears redo history so a new edit invalidates any forward steps.
function beginStep() {
  if (!pendingSnapshot) {
    pendingSnapshot = snapshotState();
    redoStack.length = 0;
  }
}
// Call when the interaction commits (e.g. slider released, number changed).
function commitStep() {
  if (!pendingSnapshot) return;
  undoStack.push(pendingSnapshot);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  pendingSnapshot = null;
}
// One-shot step for instantaneous actions (Reset part / Reset all).
function recordStep(fn: () => void) {
  const before = snapshotState();
  fn();
  undoStack.push(before);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}
function undo() {
  const prev = undoStack.pop();
  if (!prev) return;
  redoStack.push(snapshotState());
  state = prev;
  for (const key of Object.keys(nodes)) applyPart(key);
  refreshRows();
  if (nodes[partSel.value]) boxHelper.setFromObject(nodes[partSel.value]);
}
function redo() {
  const next = redoStack.pop();
  if (!next) return;
  undoStack.push(snapshotState());
  state = next;
  for (const key of Object.keys(nodes)) applyPart(key);
  refreshRows();
  if (nodes[partSel.value]) boxHelper.setFromObject(nodes[partSel.value]);
}

// Known PBR texture sets available for swapping onto any material.
interface TexSet {
  label: string;
  loaderMethod: string;   // EnvironmentManager helper name, for export code
  c?: string; n?: string; r?: string; ao?: string; metal?: string;
}
const LVL_TEX_SETS: TexSet[] = [
  { label: '— keep current —', loaderMethod: '' },
  { label: 'Rock', loaderMethod: 'loadRock', c: '/textures/rock_color.webp', n: '/textures/rock_normal.webp', r: '/textures/rock_roughness.webp' },
  { label: 'Castle Wall', loaderMethod: 'loadCastleWall', c: '/textures/castle_wall_color.webp', n: '/textures/castle_wall_normal.webp', r: '/textures/castle_wall_roughness.webp', ao: '/textures/castle_wall_ao.webp' },
  { label: 'Wood', loaderMethod: 'loadWood', c: '/textures/wood_color.webp', n: '/textures/wood_normal.webp', r: '/textures/wood_roughness.webp', ao: '/textures/wood_ao.webp' },
  { label: 'Gravel', loaderMethod: 'loadGravel', c: '/textures/gravel_color.webp', n: '/textures/gravel_normal.webp', r: '/textures/gravel_roughness.webp', ao: '/textures/gravel_ao.webp' },
  { label: 'Marble', loaderMethod: 'loadMarble', c: '/textures/marble_color.jpg', n: '/textures/marble_normal.png', r: '/textures/marble_roughness.jpg', ao: '/textures/marble_ao.jpg' },
  { label: 'Cracked Ground', loaderMethod: 'loadCrackedGround', c: '/textures/cracked_ground_color.jpg', n: '/textures/cracked_ground_normal.png', r: '/textures/cracked_ground_roughness.jpg', ao: '/textures/cracked_ground_ao.jpg' },
  { label: 'Concrete', loaderMethod: 'loadConcrete', c: '/textures/concrete_color.webp', n: '/textures/concrete_normal.webp', r: '/textures/concrete_roughness.webp' },
  { label: 'Shingle', loaderMethod: 'loadShingle', n: '/textures/shingle_normal.webp', r: '/textures/shingle_roughness.webp', ao: '/textures/shingle_ao.webp' },
  { label: 'Metal', loaderMethod: 'loadMetal', c: '/textures/metal_color.webp', n: '/textures/metal_normal.webp', r: '/textures/metal_roughness.webp', metal: '/textures/metal_metalness.webp' },
  { label: 'Silver Metal', loaderMethod: 'loadSilverMetal', c: '/textures/silver_metal_color.webp', n: '/textures/silver_metal_normal.webp', r: '/textures/silver_metal_roughness.webp', ao: '/textures/silver_metal_ao.webp', metal: '/textures/silver_metal_metalness.webp' },
  { label: 'Fabric', loaderMethod: 'loadFabric', c: '/textures/fabric_color.webp', n: '/textures/fabric_normal.webp', r: '/textures/fabric_roughness.webp' },
  { label: 'Skin', loaderMethod: 'loadSkin', c: '/textures/skin_color.webp', n: '/textures/skin_normal.webp', r: '/textures/skin_roughness.webp' },
  { label: 'Chainmail', loaderMethod: 'loadChainmail', c: '/textures/chainmail_color.webp', n: '/textures/chainmail_normal.webp', r: '/textures/chainmail_roughness.webp', ao: '/textures/chainmail_ao.webp', metal: '/textures/chainmail_metalness.webp' },
  { label: 'Planks', loaderMethod: 'loadPlanks', c: '/textures/planks_color.jpg', n: '/textures/planks_normal.png', ao: '/textures/planks_ao.jpg', metal: '/textures/planks_metalness.jpg' },
  { label: 'Planks Nails', loaderMethod: 'loadPlanksNails', c: '/textures/planks_nails_color.jpg', n: '/textures/planks_nails_normal.png', r: '/textures/planks_nails_roughness.jpg', ao: '/textures/planks_nails_ao.jpg', metal: '/textures/planks_nails_metalness.jpg' },
  { label: 'Beard', loaderMethod: 'loadBeard', c: '/textures/beard_color.jpg', n: '/textures/beard_normal.png', r: '/textures/beard_roughness.jpg', ao: '/textures/beard_ao.jpg' },
  { label: 'Fur', loaderMethod: 'loadFur', c: '/textures/fur_color.jpg', n: '/textures/fur_normal.png', r: '/textures/fur_roughness.jpg', ao: '/textures/fur_ao.jpg' },
  { label: 'Aluminum', loaderMethod: 'loadAluminum', n: '/textures/aluminum_normal.png', r: '/textures/aluminum_roughness.jpg', ao: '/textures/aluminum_ao.jpg', metal: '/textures/aluminum_metalness.jpg' },
  { label: 'Lava', loaderMethod: 'loadLava', c: '/textures/lava_color.jpg', n: '/textures/lava_normal.webp', r: '/textures/lava_roughness.jpg', ao: '/textures/lava_ao.jpg' },
];

// =============================================================================
// CHARACTER TEXTURE EDITOR
// =============================================================================

interface CharTexEntry {
  texSetLabel: string;
  uvRepeatU: number;
  uvRepeatV: number;
  uvRotation: number;
  normalScale: number;
  aoIntensity: number;
  colorHex: number;
  roughness: number;
  metalness: number;
  emissiveHex: number;
  emissiveIntensity: number;
  variantScope: 'all' | 'variant';
}

const charTexMap = new Map<string, CharTexEntry>(); // key: `${partKey}:${meshIdx}`
// Snapshot of material state at character load — used by Revert all.
const charTexBaseline = new Map<string, CharTexEntry>();
// Original material instances + map references — restored on revert to fix grouping and preserve builder-applied textures.
interface CharMatSnapshot { mat: THREE.MeshStandardMaterial; map: THREE.Texture | null; normalMap: THREE.Texture | null; roughnessMap: THREE.Texture | null; aoMap: THREE.Texture | null; metalnessMap: THREE.Texture | null; emissiveMap: THREE.Texture | null; }
const charMatBaseline = new Map<string, CharMatSnapshot>();
let charActiveSubTab: 'model' | 'texture' = 'model';
let charTexMeshIdx = 0;
let charGroupMode = true;
let charTexScopeAll = true; // true = changes apply to all variants; false = this variant only

let copiedTextureSettings: {
  texSetLabel: string;
  uvRepeatU: number;
  uvRepeatV: number;
  uvRotation: number;
  normalScale?: number;
  aoIntensity?: number;
  colorHex: number;
  roughness: number;
  metalness: number;
  emissiveHex: number;
  emissiveIntensity: number;
} | null = null;

function updateCopyPasteUI() {
  const hasSettings = copiedTextureSettings !== null;
  const charPaste = document.getElementById('charTexPaste') as HTMLButtonElement | null;
  if (charPaste) charPaste.disabled = !hasSettings;
  const lvlPaste = document.getElementById('lvlTexPaste') as HTMLButtonElement | null;
  if (lvlPaste) lvlPaste.disabled = !hasSettings;
}

function charUpdateScopeUI() {
  document.getElementById('charScopeAll')?.classList.toggle('active', charTexScopeAll);
  document.getElementById('charScopeVariant')?.classList.toggle('active', !charTexScopeAll);
}

const charTexUndoStack: Array<Map<string, CharTexEntry>> = [];
const charTexRedoStack: Array<Map<string, CharTexEntry>> = [];
let charTexPendingSnapshot: Map<string, CharTexEntry> | null = null;

function charTexSnapshot(): Map<string, CharTexEntry> {
  return new Map(Array.from(charTexMap.entries()).map(([k, v]) => [k, { ...v }]));
}
function charTexBeginStep() {
  if (!charTexPendingSnapshot) charTexPendingSnapshot = charTexSnapshot();
}
function charTexCommitStep() {
  if (!charTexPendingSnapshot) return;
  charTexUndoStack.push(charTexPendingSnapshot);
  if (charTexUndoStack.length > MAX_UNDO) charTexUndoStack.shift();
  charTexRedoStack.length = 0;
  charTexPendingSnapshot = null;
}
function charTexUndo() {
  const prev = charTexUndoStack.pop();
  if (!prev) return;
  charTexRedoStack.push(charTexSnapshot());
  charTexMap.clear();
  for (const [k, v] of prev) charTexMap.set(k, v);
  charTexResetToBaseline();
  charTexReapplyAll();
  charTexPopulateUI(charTexCurrentPartKey(), charTexMeshIdx);
}
function charTexRedo() {
  const next = charTexRedoStack.pop();
  if (!next) return;
  charTexUndoStack.push(charTexSnapshot());
  charTexMap.clear();
  for (const [k, v] of next) charTexMap.set(k, v);
  charTexResetToBaseline();
  charTexReapplyAll();
  charTexPopulateUI(charTexCurrentPartKey(), charTexMeshIdx);
}

function charTexCurrentPartKey(): string {
  return (document.getElementById('part') as HTMLSelectElement).value;
}

function charTexForEachSelected(mutate: (entry: CharTexEntry) => void, reloadMaps = false) {
  const scope: 'all' | 'variant' = charTexScopeAll ? 'all' : 'variant';
  const primaryKey = charTexCurrentPartKey();
  const primaryEntry = charEnsureEntry(primaryKey, charTexMeshIdx);
  mutate(primaryEntry);
  primaryEntry.variantScope = scope;
  charApplyEntry(primaryKey, charTexMeshIdx, reloadMaps);
  for (const k of selectedKeys) {
    if (k === primaryKey) continue;
    const secEntry = charEnsureEntry(k, 0);
    mutate(secEntry);
    secEntry.variantScope = scope;
    charApplyEntry(k, 0, reloadMaps);
  }
}

function charGetMeshList(partKey: string): THREE.Mesh[] {
  const node = nodes[partKey];
  if (!node) return [];
  const out: THREE.Mesh[] = [];
  node.traverse(o => { if (o instanceof THREE.Mesh) out.push(o as THREE.Mesh); });
  return out;
}

function charTexKey(partKey: string, idx: number): string { return `${partKey}:${idx}`; }

function charGetMat(mesh: THREE.Mesh): THREE.MeshStandardMaterial | null {
  const m = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return (m instanceof THREE.MeshStandardMaterial) ? m : null;
}

function charEnsureEntry(partKey: string, idx: number): CharTexEntry {
  const k = charTexKey(partKey, idx);
  if (!charTexMap.has(k)) {
    const mesh = charGetMeshList(partKey)[idx];
    const mat = mesh ? charGetMat(mesh) : null;
    const srcTex = mat ? (mat.map ?? mat.normalMap ?? mat.roughnessMap) as THREE.Texture | null : null;
    charTexMap.set(k, {
      texSetLabel: mat ? charDetectTexSet(mat) : '',
      uvRepeatU: srcTex?.repeat?.x ?? 1,
      uvRepeatV: srcTex?.repeat?.y ?? 1,
      uvRotation: srcTex?.rotation ?? 0,
      normalScale: mat?.normalScale?.x ?? 1,
      aoIntensity: mat?.aoMapIntensity ?? 1,
      colorHex: mat?.color?.getHex() ?? 0xffffff,
      roughness: mat?.roughness ?? 0.8,
      metalness: mat?.metalness ?? 0,
      emissiveHex: mat?.emissive?.getHex() ?? 0x000000,
      emissiveIntensity: mat?.emissiveIntensity ?? 0,
      variantScope: charTexScopeAll ? 'all' : 'variant',
    });
  }
  return charTexMap.get(k)!;
}

// Returns a grouping key for a material: parts share a group only when they match
// on BOTH colour and texture ("related by color, then texture").
//
// Grouping purely by texture image was too coarse: gold (makeGold) and steel
// (makeSilverArmor) both pull from the same silver_metal_* image files, so a
// brass helm cross and the steel helmet collapsed into one group and edits to
// one bled into the other. Folding the colour tint into the key keeps same-
// texture/same-colour parts together (e.g. both bars of the cross, which share
// one brass material) while separating same-texture/different-colour parts.
function charMatGroupKey(mat: THREE.MeshStandardMaterial): string {
  // Texture identity: image src of the first available map, else the material
  // uuid (untextured materials only group with their own exact instance).
  const tex = mat.map ?? mat.normalMap ?? mat.roughnessMap ?? mat.aoMap;
  const texId = (tex?.image as HTMLImageElement | undefined)?.src ?? mat.uuid;
  // Colour identity: hex tint, so gold vs. steel on the same maps stay separate.
  const colorId = mat.color.getHex().toString(16).padStart(6, '0');
  return `${colorId}|${texId}`;
}

function charGetGroupMembers(partKey: string, meshIdx: number): Array<{ partKey: string; idx: number }> {
  const targetMesh = charGetMeshList(partKey)[meshIdx];
  if (!targetMesh) return [];
  const targetMat = charGetMat(targetMesh);
  if (!targetMat) return [{ partKey, idx: meshIdx }];
  const key = charMatGroupKey(targetMat);
  const result: Array<{ partKey: string; idx: number }> = [];
  for (const pk of Object.keys(nodes)) {
    charGetMeshList(pk).forEach((m, i) => {
      const mat = charGetMat(m);
      if (mat && charMatGroupKey(mat) === key) result.push({ partKey: pk, idx: i });
    });
  }
  return result;
}

function charApplyMatProps(mat: THREE.MeshStandardMaterial, entry: CharTexEntry, reloadMaps = false) {
  const ts = LVL_TEX_SETS.find(s => s.label === entry.texSetLabel);
  if (reloadMaps && ts?.loaderMethod) {
    const loadMap = (path?: string, srgb = false): THREE.Texture | null => {
      if (!path) return null;
      const t = lvlLoadTex(path).clone();
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(entry.uvRepeatU, entry.uvRepeatV);
      t.center.set(0.5, 0.5);
      t.rotation = entry.uvRotation;
      t.needsUpdate = true;
      return t;
    };
    mat.map          = loadMap(ts.c, true);
    mat.normalMap    = loadMap(ts.n);
    mat.roughnessMap = loadMap(ts.r);
    mat.aoMap        = loadMap(ts.ao);
    mat.metalnessMap = loadMap(ts.metal);
    mat.emissiveMap  = null;
  } else {
    lvlSetRepeatOnMat(mat, entry.uvRepeatU, entry.uvRepeatV, entry.uvRotation);
  }
  mat.normalScale.set(entry.normalScale, entry.normalScale);
  mat.aoMapIntensity = entry.aoIntensity;
  mat.color.setHex(entry.colorHex);
  mat.roughness = entry.roughness;
  mat.metalness = entry.metalness;
  mat.emissive.setHex(entry.emissiveHex);
  mat.emissiveIntensity = entry.emissiveIntensity;
  mat.needsUpdate = true;
}

function charApplyEntry(partKey: string, idx: number, reloadMaps = false) {
  const entry = charEnsureEntry(partKey, idx);

  if (charGroupMode) {
    // Apply to all meshes sharing the same material, and sync their entries.
    const members = charGetGroupMembers(partKey, idx);
    for (const { partKey: pk, idx: i } of members) {
      const mesh = charGetMeshList(pk)[i];
      const mat = mesh ? charGetMat(mesh) : null;
      if (mat) charApplyMatProps(mat, entry, reloadMaps);
      if (pk !== partKey || i !== idx) charTexMap.set(charTexKey(pk, i), { ...entry });
    }
  } else {
    // Individual mode: clone material to detach from group if still shared.
    const mesh = charGetMeshList(partKey)[idx];
    if (!mesh) return;
    let mat = charGetMat(mesh);
    if (!mat) return;
    if (charGetGroupMembers(partKey, idx).length > 1) {
      const cloned = mat.clone();
      if (Array.isArray(mesh.material)) mesh.material[0] = cloned;
      else mesh.material = cloned;
      mat = cloned;
    }
    charApplyMatProps(mat, entry, reloadMaps);
  }
}

function charTexReapplyAll() {
  for (const k of charTexMap.keys()) {
    const [partKey, idxStr] = k.split(':');
    const base = charTexBaseline.get(k);
    const entry = charTexMap.get(k)!;
    const reloadMaps = entry.texSetLabel !== (base?.texSetLabel ?? '');
    charApplyEntry(partKey, parseInt(idxStr), reloadMaps);
  }
}

function charTexResetToBaseline() {
  for (const [k, base] of charTexBaseline) {
    const [partKey, idxStr] = k.split(':');
    const idx = parseInt(idxStr);
    const mesh = charGetMeshList(partKey)[idx];
    if (!mesh) continue;
    // Restore original material instance so shared-material grouping is intact.
    const snap = charMatBaseline.get(k);
    if (snap) {
      if (Array.isArray(mesh.material)) mesh.material[0] = snap.mat;
      else mesh.material = snap.mat;
    }
    const mat = snap?.mat ?? charGetMat(mesh);
    if (!mat) continue;
    mat.map = snap?.map ?? null;
    mat.normalMap = snap?.normalMap ?? null;
    mat.roughnessMap = snap?.roughnessMap ?? null;
    mat.aoMap = snap?.aoMap ?? null;
    mat.metalnessMap = snap?.metalnessMap ?? null;
    mat.emissiveMap = snap?.emissiveMap ?? null;
    mat.normalScale.set(base.normalScale, base.normalScale);
    mat.aoMapIntensity = base.aoIntensity;
    mat.color.setHex(base.colorHex);
    mat.roughness = base.roughness;
    mat.metalness = base.metalness;
    mat.emissive.setHex(base.emissiveHex);
    mat.emissiveIntensity = base.emissiveIntensity;
    mat.needsUpdate = true;
  }
}

function charUpdateGroupInfo(partKey: string, idx: number) {
  const info = document.getElementById('charGroupInfo')!;
  if (!charGroupMode) { info.textContent = ''; return; }
  const count = charGetGroupMembers(partKey, idx).length;
  info.textContent = count > 1 ? `${count} meshes share this material` : '';
}

function charPopulateMeshSel(partKey: string) {
  const sel = document.getElementById('charMeshSel') as HTMLSelectElement;
  const grp = document.getElementById('charTexGrp')!;
  sel.innerHTML = '';
  const meshes = charGetMeshList(partKey);
  if (meshes.length === 0) {
    grp.classList.add('grp-disabled');
    const opt = document.createElement('option');
    opt.textContent = '— no meshes —';
    sel.append(opt);
    document.getElementById('charGroupInfo')!.textContent = '';
    return;
  }
  grp.classList.remove('grp-disabled');
  meshes.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    const geoType = m.geometry?.type ?? 'Mesh';
    const groupSize = charGetGroupMembers(partKey, i).length;
    opt.textContent = groupSize > 1 ? `[${i}] ${geoType}  ·  group: ${groupSize}` : `[${i}] ${geoType}`;
    sel.append(opt);
  });
  charTexMeshIdx = 0;
  sel.value = '0';
  charUpdateGroupInfo(partKey, 0);
  charTexPopulateUI(partKey, 0);
}

function charTexPopulateUI(partKey: string, idx: number) {
  const entry = charEnsureEntry(partKey, idx);

  // Texture set dropdown — reset to "keep current" if no set applied
  const texSelEl = document.getElementById('charTexSel') as HTMLSelectElement;
  texSelEl.value = entry.texSetLabel
    ? String(LVL_TEX_SETS.findIndex(s => s.label === entry.texSetLabel))
    : '0';

  const setNum = (sliderId: string, numId: string, v: number, decimals = 2) => {
    (document.getElementById(sliderId) as HTMLInputElement).value = String(v);
    (document.getElementById(numId) as HTMLInputElement).value = String(Math.round(v * Math.pow(10, decimals)) / Math.pow(10, decimals));
  };
  setNum('charUVUSlider', 'charUVUNum', entry.uvRepeatU);
  setNum('charUVVSlider', 'charUVVNum', entry.uvRepeatV);
  setNum('charNormSlider', 'charNormNum', entry.normalScale);
  setNum('charAOSlider', 'charAONum', entry.aoIntensity);
  setNum('charRoughSlider', 'charRoughNum', entry.roughness, 3);
  setNum('charMetalSlider', 'charMetalNum', entry.metalness, 3);
  setNum('charEmissiveSlider', 'charEmissiveNum', entry.emissiveIntensity, 2);

  const snapRot = Math.round(entry.uvRotation / (Math.PI / 2)) * (Math.PI / 2);
  document.querySelectorAll<HTMLButtonElement>('#charUVRotGrp .uv-rot-btn').forEach(btn => {
    btn.classList.toggle('active', Math.abs(parseFloat(btn.dataset.rot ?? '0') - snapRot) < 0.01);
  });

  (document.getElementById('charColorPick') as HTMLInputElement).value =
    '#' + entry.colorHex.toString(16).padStart(6, '0');
  (document.getElementById('charEmissivePick') as HTMLInputElement).value =
    '#' + entry.emissiveHex.toString(16).padStart(6, '0');
}

function charTexWireArrows(numId: string, sliderId: string, min: number, max: number, step: number, onSet: (v: number) => void) {
  const num = document.getElementById(numId) as HTMLInputElement;
  num.addEventListener('focus', charTexBeginStep);
  num.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const cur = parseFloat(num.value); if (isNaN(cur)) return;
    charTexBeginStep();
    const delta = e.shiftKey ? step * 10 : step;
    onSet(Math.min(max, Math.max(min, Math.round((cur + (e.key === 'ArrowUp' ? delta : -delta)) * 1e5) / 1e5)));
  });
  num.addEventListener('keyup', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') charTexCommitStep(); });
  num.addEventListener('change', charTexCommitStep);
  const slider = document.getElementById(sliderId) as HTMLInputElement;
  slider.addEventListener('pointerdown', charTexBeginStep);
  slider.addEventListener('input', () => onSet(parseFloat(slider.value)));
  slider.addEventListener('change', charTexCommitStep);
}

// ── wiring ────────────────────────────────────────────────────────────────────

// Sub-tab switching
document.getElementById('charTabModel')!.addEventListener('click', () => {
  charActiveSubTab = 'model';
  document.getElementById('charModelSubPanel')!.style.display = '';
  document.getElementById('charTexSubPanel')!.style.display = 'none';
  document.getElementById('charTabModel')!.classList.add('active');
  document.getElementById('charTabTexture')!.classList.remove('active');
});
document.getElementById('charTabTexture')!.addEventListener('click', () => {
  charActiveSubTab = 'texture';
  document.getElementById('charModelSubPanel')!.style.display = 'none';
  document.getElementById('charTexSubPanel')!.style.display = '';
  document.getElementById('charTabModel')!.classList.remove('active');
  document.getElementById('charTabTexture')!.classList.add('active');
  charPopulateMeshSel((document.getElementById('part') as HTMLSelectElement).value);
});

// Mesh selector
document.getElementById('charMeshSel')!.addEventListener('change', () => {
  const idx = parseInt((document.getElementById('charMeshSel') as HTMLSelectElement).value);
  charTexMeshIdx = isNaN(idx) ? 0 : idx;
  const partKey = charTexCurrentPartKey();
  charUpdateGroupInfo(partKey, charTexMeshIdx);
  charTexPopulateUI(partKey, charTexMeshIdx);
});

// Group mode toggle
document.getElementById('charGroupMode')!.addEventListener('change', (e) => {
  charGroupMode = (e.target as HTMLInputElement).checked;
  charUpdateGroupInfo(charTexCurrentPartKey(), charTexMeshIdx);
});

// Texture set
const charTexSelEl = document.getElementById('charTexSel') as HTMLSelectElement;
LVL_TEX_SETS.forEach((ts, i) => {
  const opt = document.createElement('option'); opt.value = String(i); opt.textContent = ts.label;
  charTexSelEl.append(opt);
});
charTexSelEl.addEventListener('change', () => {
  charTexUndoStack.push(charTexSnapshot()); charTexRedoStack.length = 0;
  const ts = LVL_TEX_SETS[parseInt(charTexSelEl.value)];
  charTexForEachSelected(entry => { entry.texSetLabel = ts?.loaderMethod ? ts.label : ''; }, true);
});

// UV U
const charUVUSet = (u: number) => {
  (document.getElementById('charUVUSlider') as HTMLInputElement).value = String(u);
  (document.getElementById('charUVUNum') as HTMLInputElement).value = String(Math.round(u * 100) / 100);
  charTexForEachSelected(entry => { entry.uvRepeatU = u; });
};
charTexWireArrows('charUVUNum', 'charUVUSlider', 0.1, 20, 0.5, charUVUSet);
(document.getElementById('charUVUNum') as HTMLInputElement).addEventListener('change', () => {
  const v = parseFloat((document.getElementById('charUVUNum') as HTMLInputElement).value);
  if (!isNaN(v)) charUVUSet(Math.min(20, Math.max(0.1, v)));
});

// UV V
const charUVVSet = (v: number) => {
  (document.getElementById('charUVVSlider') as HTMLInputElement).value = String(v);
  (document.getElementById('charUVVNum') as HTMLInputElement).value = String(Math.round(v * 100) / 100);
  charTexForEachSelected(entry => { entry.uvRepeatV = v; });
};
charTexWireArrows('charUVVNum', 'charUVVSlider', 0.1, 20, 0.5, charUVVSet);
(document.getElementById('charUVVNum') as HTMLInputElement).addEventListener('change', () => {
  const v = parseFloat((document.getElementById('charUVVNum') as HTMLInputElement).value);
  if (!isNaN(v)) charUVVSet(Math.min(20, Math.max(0.1, v)));
});

// UV rotation
document.querySelectorAll<HTMLButtonElement>('#charUVRotGrp .uv-rot-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#charUVRotGrp .uv-rot-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const rot = parseFloat(btn.dataset.rot ?? '0');
    charTexUndoStack.push(charTexSnapshot()); charTexRedoStack.length = 0;
    charTexForEachSelected(entry => { entry.uvRotation = rot; });
  });
});

// Normal scale
const charNormSet = (v: number) => {
  (document.getElementById('charNormSlider') as HTMLInputElement).value = String(v);
  (document.getElementById('charNormNum') as HTMLInputElement).value = String(Math.round(v * 100) / 100);
  charTexForEachSelected(entry => { entry.normalScale = v; });
};
charTexWireArrows('charNormNum', 'charNormSlider', 0, 3, 0.05, charNormSet);
(document.getElementById('charNormNum') as HTMLInputElement).addEventListener('change', () => {
  const v = parseFloat((document.getElementById('charNormNum') as HTMLInputElement).value);
  if (!isNaN(v)) charNormSet(Math.min(3, Math.max(0, v)));
});

// AO intensity
const charAOSet = (v: number) => {
  (document.getElementById('charAOSlider') as HTMLInputElement).value = String(v);
  (document.getElementById('charAONum') as HTMLInputElement).value = String(Math.round(v * 100) / 100);
  charTexForEachSelected(entry => { entry.aoIntensity = v; });
};
charTexWireArrows('charAONum', 'charAOSlider', 0, 2, 0.05, charAOSet);
(document.getElementById('charAONum') as HTMLInputElement).addEventListener('change', () => {
  const v = parseFloat((document.getElementById('charAONum') as HTMLInputElement).value);
  if (!isNaN(v)) charAOSet(Math.min(2, Math.max(0, v)));
});

// Color tint
document.getElementById('charColorPick')!.addEventListener('focus', charTexBeginStep);
document.getElementById('charColorPick')!.addEventListener('input', (e) => {
  charTexBeginStep();
  const hex = parseInt((e.target as HTMLInputElement).value.slice(1), 16);
  charTexForEachSelected(entry => { entry.colorHex = hex; });
});
document.getElementById('charColorPick')!.addEventListener('change', charTexCommitStep);

// Roughness
const charRoughSet = (v: number) => {
  (document.getElementById('charRoughSlider') as HTMLInputElement).value = String(v);
  (document.getElementById('charRoughNum') as HTMLInputElement).value = String(Math.round(v * 1000) / 1000);
  charTexForEachSelected(entry => { entry.roughness = v; });
};
charTexWireArrows('charRoughNum', 'charRoughSlider', 0, 1, 0.05, charRoughSet);
(document.getElementById('charRoughNum') as HTMLInputElement).addEventListener('change', () => {
  const v = parseFloat((document.getElementById('charRoughNum') as HTMLInputElement).value);
  if (!isNaN(v)) charRoughSet(Math.min(1, Math.max(0, v)));
});

// Metalness
const charMetalSet = (v: number) => {
  (document.getElementById('charMetalSlider') as HTMLInputElement).value = String(v);
  (document.getElementById('charMetalNum') as HTMLInputElement).value = String(Math.round(v * 1000) / 1000);
  charTexForEachSelected(entry => { entry.metalness = v; });
};
charTexWireArrows('charMetalNum', 'charMetalSlider', 0, 1, 0.05, charMetalSet);
(document.getElementById('charMetalNum') as HTMLInputElement).addEventListener('change', () => {
  const v = parseFloat((document.getElementById('charMetalNum') as HTMLInputElement).value);
  if (!isNaN(v)) charMetalSet(Math.min(1, Math.max(0, v)));
});

// Emissive color
document.getElementById('charEmissivePick')!.addEventListener('focus', charTexBeginStep);
document.getElementById('charEmissivePick')!.addEventListener('input', (e) => {
  charTexBeginStep();
  const hex = parseInt((e.target as HTMLInputElement).value.slice(1), 16);
  charTexForEachSelected(entry => { entry.emissiveHex = hex; });
});
document.getElementById('charEmissivePick')!.addEventListener('change', charTexCommitStep);

// Emissive intensity
const charEmissiveSet = (v: number) => {
  (document.getElementById('charEmissiveSlider') as HTMLInputElement).value = String(v);
  (document.getElementById('charEmissiveNum') as HTMLInputElement).value = String(Math.round(v * 100) / 100);
  charTexForEachSelected(entry => { entry.emissiveIntensity = v; });
};
charTexWireArrows('charEmissiveNum', 'charEmissiveSlider', 0, 5, 0.1, charEmissiveSet);
(document.getElementById('charEmissiveNum') as HTMLInputElement).addEventListener('change', () => {
  const v = parseFloat((document.getElementById('charEmissiveNum') as HTMLInputElement).value);
  if (!isNaN(v)) charEmissiveSet(Math.min(5, Math.max(0, v)));
});

// Export
function generateCharTexExport(): string {
  const variantLabel = currentColorVariant === 1 ? 'Alt 1' : currentColorVariant === 2 ? 'Alt 2' : 'Original';
  const charName = WarriorType[currentType] ?? String(currentType);
  const f = (v: number) => String(Math.round(v * 10000) / 10000);
  const eps = 0.0001;
  const allBlocks: string[] = [];
  const variantBlocks: string[] = [];
  const emittedGroupKeys = new Set<string>();

  for (const [k, entry] of charTexMap) {
    const [partKey, idxStr] = k.split(':');
    const idx = parseInt(idxStr);
    const meshes = charGetMeshList(partKey);
    const mesh = meshes[idx];
    const mat = mesh ? charGetMat(mesh) : null;

    // Skip if this material group was already exported
    const groupKey = mat ? charMatGroupKey(mat) : k;
    if (emittedGroupKeys.has(groupKey)) continue;

    const base = charTexBaseline.get(k);
    const texSetChanged = entry.texSetLabel !== (base?.texSetLabel ?? '');
    const uvChanged = Math.abs(entry.uvRepeatU - (base?.uvRepeatU ?? 1)) > eps
                   || Math.abs(entry.uvRepeatV - (base?.uvRepeatV ?? 1)) > eps;
    const uvRotChanged = Math.abs(entry.uvRotation - (base?.uvRotation ?? 0)) > eps;
    const normChanged  = Math.abs(entry.normalScale  - (base?.normalScale  ?? 1))    > eps;
    const aoChanged    = Math.abs(entry.aoIntensity  - (base?.aoIntensity  ?? 1))    > eps;
    const colorChanged = entry.colorHex !== (base?.colorHex ?? 0xffffff);
    const roughChanged = Math.abs(entry.roughness - (base?.roughness ?? 0.8)) > eps;
    const metalChanged = Math.abs(entry.metalness - (base?.metalness ?? 0))   > eps;
    const emissiveHexChanged = entry.emissiveHex !== (base?.emissiveHex ?? 0x000000);
    const emissiveIntChanged = Math.abs(entry.emissiveIntensity - (base?.emissiveIntensity ?? 0)) > eps;

    const ts = LVL_TEX_SETS.find(s => s.label === entry.texSetLabel);

    // Build property lines first — only emit the block if something actually changed
    const propLines: string[] = [];
    if (ts?.loaderMethod && (texSetChanged || uvChanged)) {
      const u = f(entry.uvRepeatU), v = f(entry.uvRepeatV);
      if (ts.c)     propLines.push(`  mat.map          = this.cloneTex(this.${ts.loaderMethod}().c, ${u}, ${v});`);
      if (ts.n)     propLines.push(`  mat.normalMap    = this.cloneTex(this.${ts.loaderMethod}().n, ${u}, ${v});`);
      if (ts.r)     propLines.push(`  mat.roughnessMap = this.cloneTex(this.${ts.loaderMethod}().r, ${u}, ${v});`);
      if (ts.ao)    propLines.push(`  mat.aoMap        = this.cloneTex(this.${ts.loaderMethod}().ao, ${u}, ${v});`);
      if (ts.metal) propLines.push(`  mat.metalnessMap = this.cloneTex(this.${ts.loaderMethod}().metal, ${u}, ${v});`);
      propLines.push(`  mat.emissiveMap  = null;`);
    }
    if (uvRotChanged)     propLines.push(`  // Apply UV rotation to all maps: t.center.set(0.5,0.5); t.rotation = ${f(entry.uvRotation)};`);
    if (normChanged)      propLines.push(`  mat.normalScale.set(${f(entry.normalScale)}, ${f(entry.normalScale)});`);
    if (aoChanged)        propLines.push(`  mat.aoMapIntensity = ${f(entry.aoIntensity)};`);
    if (colorChanged)     propLines.push(`  mat.color.setHex(0x${entry.colorHex.toString(16).padStart(6, '0')});`);
    if (roughChanged)     propLines.push(`  mat.roughness = ${f(entry.roughness)};`);
    if (metalChanged)     propLines.push(`  mat.metalness = ${f(entry.metalness)};`);
    if (emissiveHexChanged) propLines.push(`  mat.emissive.setHex(0x${entry.emissiveHex.toString(16).padStart(6, '0')});`);
    if (emissiveIntChanged) propLines.push(`  mat.emissiveIntensity = ${f(entry.emissiveIntensity)};`);

    if (propLines.length === 0) continue;

    emittedGroupKeys.add(groupKey);

    const geoType = mesh?.geometry?.type ?? 'Mesh';
    const ref = refPath(partKey);
    const groupMembers = charGetGroupMembers(partKey, idx);
    const uniqueParts = [...new Set(groupMembers.map(m => m.partKey))];
    const groupNote = uniqueParts.length > 1 ? `  [group: ${uniqueParts.join(', ')}]` : '';

    const block: string[] = [];
    block.push(`// Part: ${partKey}  mesh[${idx}] ${geoType}${groupNote}`);
    block.push(`{`);
    block.push(`  const mat = nthMesh(rig.${ref}, ${idx}).material as THREE.MeshStandardMaterial;`);
    block.push(...propLines);
    block.push(`  mat.needsUpdate = true;`);
    block.push(`}`);
    const scope = entry.variantScope ?? (currentColorVariant === 0 ? 'all' : 'variant');
    if (scope === 'all') allBlocks.push(block.join('\n'));
    else variantBlocks.push(block.join('\n'));
  }

  if (allBlocks.length === 0 && variantBlocks.length === 0) return '// No changes from baseline.';

  const header = [
    `// === CHARACTER TEXTURE EXPORT — ${charName}  |  ${variantLabel} ===`,
    '// Add this helper once to the builder file (or a shared util):',
    '// function nthMesh(node: THREE.Object3D, n: number): THREE.Mesh {',
    '//   let i = 0; let found: THREE.Mesh | undefined;',
    '//   node.traverse(o => { if (o instanceof THREE.Mesh && i++ === n) found = o as THREE.Mesh; });',
    '//   return found!;',
    '// }',
    '',
  ].join('\n');

  const parts: string[] = [];
  if (allBlocks.length > 0) parts.push(allBlocks.join('\n\n'));
  if (variantBlocks.length > 0) {
    const indented = variantBlocks.map(b => b.split('\n').map(l => '  ' + l).join('\n')).join('\n\n');
    parts.push(`if (profile.colorVariant === ${currentColorVariant}) {\n${indented}\n}`);
  }

  return header + parts.join('\n\n') + '\n';
}

function charDetectTexSet(mat: THREE.MeshStandardMaterial): string {
  const filename = (t: THREE.Texture | null | undefined) =>
    ((t?.image as HTMLImageElement | undefined)?.src ?? '').split('/').pop() ?? '';
  const matFiles = [mat.map, mat.normalMap, mat.roughnessMap, mat.aoMap, mat.metalnessMap].map(filename);
  for (const ts of LVL_TEX_SETS) {
    if (!ts.loaderMethod) continue;
    const tsFiles = [ts.c, ts.n, ts.r, ts.ao, ts.metal].filter(Boolean).map(p => p!.split('/').pop()!);
    if (tsFiles.some(f => matFiles.some(mf => mf && mf === f))) return ts.label;
  }
  return '';
}

function charTexCaptureBaseline() {
  charTexBaseline.clear();
  charMatBaseline.clear();
  for (const partKey of Object.keys(nodes)) {
    charGetMeshList(partKey).forEach((mesh, idx) => {
      const mat = charGetMat(mesh);
      if (!mat) return;
      charMatBaseline.set(charTexKey(partKey, idx), { mat, map: mat.map, normalMap: mat.normalMap, roughnessMap: mat.roughnessMap, aoMap: mat.aoMap, metalnessMap: mat.metalnessMap, emissiveMap: mat.emissiveMap });
      const srcTex = (mat.map ?? mat.normalMap ?? mat.roughnessMap) as THREE.Texture | null;
      charTexBaseline.set(charTexKey(partKey, idx), {
        texSetLabel: charDetectTexSet(mat),
        uvRepeatU: srcTex?.repeat?.x ?? 1,
        uvRepeatV: srcTex?.repeat?.y ?? 1,
        uvRotation: srcTex?.rotation ?? 0,
        normalScale: mat.normalScale?.x ?? 1,
        aoIntensity: mat.aoMapIntensity ?? 1,
        colorHex: mat.color.getHex(),
        roughness: mat.roughness,
        metalness: mat.metalness,
        emissiveHex: mat.emissive.getHex(),
        emissiveIntensity: mat.emissiveIntensity ?? 0,
        variantScope: charTexScopeAll ? 'all' : 'variant',
      });
    });
  }
}

function charTexRevertAll() {
  if (charTexBaseline.size === 0) return;
  charTexUndoStack.push(charTexSnapshot());
  charTexRedoStack.length = 0;
  charTexMap.clear();
  charTexResetToBaseline();
  charTexPopulateUI(charTexCurrentPartKey(), charTexMeshIdx);
}

function charCopyTexture() {
  const partKey = charTexCurrentPartKey();
  const entry = charEnsureEntry(partKey, charTexMeshIdx);
  copiedTextureSettings = {
    texSetLabel: entry.texSetLabel,
    uvRepeatU: entry.uvRepeatU,
    uvRepeatV: entry.uvRepeatV,
    uvRotation: entry.uvRotation,
    normalScale: entry.normalScale,
    aoIntensity: entry.aoIntensity,
    colorHex: entry.colorHex,
    roughness: entry.roughness,
    metalness: entry.metalness,
    emissiveHex: entry.emissiveHex,
    emissiveIntensity: entry.emissiveIntensity,
  };
  updateCopyPasteUI();
  showToast('Copied texture settings');
}

function charPasteTexture() {
  if (!copiedTextureSettings) return;
  charTexBeginStep();
  charTexForEachSelected(entry => {
    entry.texSetLabel = copiedTextureSettings!.texSetLabel;
    entry.uvRepeatU = copiedTextureSettings!.uvRepeatU;
    entry.uvRepeatV = copiedTextureSettings!.uvRepeatV;
    entry.uvRotation = copiedTextureSettings!.uvRotation;
    if (copiedTextureSettings!.normalScale !== undefined) {
      entry.normalScale = copiedTextureSettings!.normalScale;
    }
    if (copiedTextureSettings!.aoIntensity !== undefined) {
      entry.aoIntensity = copiedTextureSettings!.aoIntensity;
    }
    entry.colorHex = copiedTextureSettings!.colorHex;
    entry.roughness = copiedTextureSettings!.roughness;
    entry.metalness = copiedTextureSettings!.metalness;
    entry.emissiveHex = copiedTextureSettings!.emissiveHex;
    entry.emissiveIntensity = copiedTextureSettings!.emissiveIntensity;
  }, true);
  charTexCommitStep();
  charTexPopulateUI(charTexCurrentPartKey(), charTexMeshIdx);
  showToast('Applied texture settings');
}

document.getElementById('charTexUndo')!.addEventListener('click', () => charTexUndo());
document.getElementById('charTexRedo')!.addEventListener('click', () => charTexRedo());
document.getElementById('charTexRevert')!.addEventListener('click', () => charTexRevertAll());
document.getElementById('charTexCopy')!.addEventListener('click', () => charCopyTexture());
document.getElementById('charTexPaste')!.addEventListener('click', () => charPasteTexture());
document.getElementById('charScopeAll')!.addEventListener('click', () => { charTexScopeAll = true; charUpdateScopeUI(); });
document.getElementById('charScopeVariant')!.addEventListener('click', () => { charTexScopeAll = false; charUpdateScopeUI(); });

document.getElementById('charGenTexExport')!.addEventListener('click', async () => {
  const code = generateCharTexExport();
  (document.getElementById('charTexExport') as HTMLTextAreaElement).value = code;
  await tryAutoApply('character-tex', code);
});
document.getElementById('charCopyTexExport')!.addEventListener('click', () => {
  const el = document.getElementById('charTexExport') as HTMLTextAreaElement;
  if (!el.value) el.value = generateCharTexExport();
  navigator.clipboard.writeText(el.value);
});

// -----------------------------------------------------------------------------
// UI
// -----------------------------------------------------------------------------
const charSel = document.getElementById('character') as HTMLSelectElement;
const partSel = document.getElementById('part') as HTMLSelectElement;
const hierChk = document.getElementById('moveHierarchy') as HTMLInputElement;
const mirrorChk = document.getElementById('mirror') as HTMLInputElement;
const exportEl = document.getElementById('export') as HTMLTextAreaElement;

// Slider ranges per channel.
const RANGES = {
  pos: { min: -3, max: 3, step: 0.01 },
  rot: { min: -Math.PI, max: Math.PI, step: 0.01 },
  scl: { min: 0.1, max: 3, step: 0.01 },
};

interface RowRefs { range: HTMLInputElement; num: HTMLInputElement; }
const rows: Record<'pos' | 'rot' | 'scl', Record<Axis, RowRefs>> = {
  pos: {} as any, rot: {} as any, scl: {} as any,
};
const axisLocked: Record<'pos' | 'rot' | 'scl', boolean> = { pos: false, rot: false, scl: false };
interface TaperRowRefs { range: HTMLInputElement; num: HTMLInputElement; }
const taperRows: Record<'top' | 'bottom', TaperRowRefs> = {} as any;
const TAPER_RANGE = { min: 0, max: 2, step: 0.01 };

function buildRows(containerId: string, channel: 'pos' | 'rot' | 'scl') {
  const container = document.getElementById(containerId)!;
  container.innerHTML = '';
  const r = RANGES[channel];
  for (const axis of AXES) {
    const row = document.createElement('div');
    row.className = 'row';
    const lbl = document.createElement('span');
    lbl.className = 'axis'; lbl.textContent = axis.toUpperCase();
    const range = document.createElement('input');
    range.type = 'range'; range.min = String(r.min); range.max = String(r.max); range.step = String(r.step);
    const num = document.createElement('input');
    num.type = 'text'; num.inputMode = 'decimal'; num.className = 'num';
    row.append(lbl, range, num);
    container.append(row);
    rows[channel][axis] = { range, num };

    const onInput = (val: number) => {
      if (!pendingSnapshot) beginStep();
      const mode: Mode = hierChk.checked ? 'hierarchy' : 'part';
      const key = partSel.value;
      // Delta from snapshot start so secondary parts move relative to their own baselines.
      const startPrimary = (pendingSnapshot?.[key]?.[mode] as any)?.[channel]?.[axis] ?? val;
      const delta = val - startPrimary;
      const axesToSet: Axis[] = axisLocked[channel] ? [...AXES] : [axis];
      for (const ax of axesToSet) {
        (state[key][mode] as any)[channel][ax] = val;
        rows[channel][ax].range.value = String(val);
        if (document.activeElement !== rows[channel][ax].num) rows[channel][ax].num.value = String(round(val));
      }
      applyPart(key);
      if (mirrorChk.checked) applyMirror(key, mode);
      // Propagate same delta to all other selected parts.
      for (const k of selectedKeys) {
        if (k === key || !state[k]) continue;
        for (const ax of axesToSet) {
          const startK = (pendingSnapshot?.[k]?.[mode] as any)?.[channel]?.[ax] ?? (state[k][mode] as any)[channel][ax];
          (state[k][mode] as any)[channel][ax] = startK + delta;
        }
        applyPart(k);
        if (mirrorChk.checked && !selectedKeys.has(mirrorPartner(k) ?? '')) applyMirror(k, mode);
      }
    };
    range.addEventListener('input', () => onInput(parseFloat(range.value)));
    num.addEventListener('input', () => { const raw = num.value; if (raw === '' || raw === '-' || raw.endsWith('.')) return; const v = parseFloat(raw); if (!isNaN(v)) onInput(v); });
    // Normalize display (e.g. "1." → "1") when leaving the field.
    num.addEventListener('blur', () => { const v = parseFloat(num.value); if (!isNaN(v)) num.value = String(round(v)); });
    // Undo-step bookkeeping: snapshot at the start of an interaction, commit at the end.
    range.addEventListener('focus', beginStep);
    range.addEventListener('pointerdown', beginStep);
    range.addEventListener('change', commitStep);
    num.addEventListener('focus', beginStep);
    num.addEventListener('change', commitStep);
    num.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const cur = parseFloat(num.value);
      if (isNaN(cur)) return;
      beginStep(); // snapshot once at start of hold; no-op on key-repeat
      const delta = e.shiftKey ? r.step * 10 : r.step;
      const next = Math.round((cur + (e.key === 'ArrowUp' ? delta : -delta)) * 100000) / 100000;
      onInput(Math.max(r.min, Math.min(r.max, next)));
      num.value = String(round(next));
    });
    num.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') commitStep();
    });
  }
}

function buildTaperRows() {
  const container = document.getElementById('taperRows')!;
  container.innerHTML = '';
  for (const [which, label] of [['top', 'T'], ['bottom', 'B']] as const) {
    const row = document.createElement('div');
    row.className = 'row';
    const lbl = document.createElement('span');
    lbl.className = 'axis'; lbl.textContent = label;
    const range = document.createElement('input');
    range.type = 'range'; range.min = String(TAPER_RANGE.min); range.max = String(TAPER_RANGE.max); range.step = String(TAPER_RANGE.step);
    const num = document.createElement('input');
    num.type = 'text'; num.inputMode = 'decimal'; num.className = 'num';
    row.append(lbl, range, num);
    container.append(row);
    taperRows[which] = { range, num };

    const onInput = (val: number) => {
      const key = partSel.value;
      if (!state[key]) return;
      state[key].taper[which] = val;
      range.value = String(val);
      if (document.activeElement !== num) num.value = String(round(val));
      applyPart(key);
      if (mirrorChk.checked) {
        const pk = mirrorPartner(key);
        if (pk && state[pk]) { state[pk].taper[which] = val; applyPart(pk); }
      }
      for (const k of selectedKeys) {
        if (k === key || !state[k]) continue;
        state[k].taper[which] = val; applyPart(k);
        if (mirrorChk.checked && !selectedKeys.has(mirrorPartner(k) ?? '')) {
          const pk = mirrorPartner(k);
          if (pk && state[pk]) { state[pk].taper[which] = val; applyPart(pk); }
        }
      }
    };
    range.addEventListener('input', () => onInput(parseFloat(range.value)));
    num.addEventListener('input', () => { const raw = num.value; if (raw === '' || raw === '-' || raw.endsWith('.')) return; const v = parseFloat(raw); if (!isNaN(v)) onInput(v); });
    num.addEventListener('blur', () => { const v = parseFloat(num.value); if (!isNaN(v)) num.value = String(round(v)); });
    range.addEventListener('focus', beginStep); range.addEventListener('pointerdown', beginStep); range.addEventListener('change', commitStep);
    num.addEventListener('focus', beginStep); num.addEventListener('change', commitStep);
    num.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const cur = parseFloat(num.value); if (isNaN(cur)) return;
      beginStep();
      const delta = e.shiftKey ? TAPER_RANGE.step * 10 : TAPER_RANGE.step;
      const next = Math.round((cur + (e.key === 'ArrowUp' ? delta : -delta)) * 100000) / 100000;
      onInput(Math.max(TAPER_RANGE.min, Math.min(TAPER_RANGE.max, next)));
      num.value = String(round(next));
    });
    num.addEventListener('keyup', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') commitStep(); });
  }
}

function round(v: number) { return Math.round(v * 1000) / 1000; }

function refreshRows() {
  const mode: Mode = hierChk.checked ? 'hierarchy' : 'part';
  const key = partSel.value;
  if (!state[key]) return;
  const st = state[key][mode];
  const map = { pos: st.pos, rot: st.rot, scl: st.scl } as const;
  (['pos', 'rot', 'scl'] as const).forEach(ch => {
    for (const axis of AXES) {
      const v = (map[ch] as any)[axis];
      rows[ch][axis].range.value = String(v);
      rows[ch][axis].num.value = String(round(v));
    }
  });
  (['top', 'bottom'] as const).forEach(which => {
    const v = state[key].taper[which];
    taperRows[which].range.value = String(v);
    taperRows[which].num.value = String(round(v));
  });
}

function buildPartDropdown() {
  partSel.innerHTML = '';
  for (const key of Object.keys(nodes)) {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = key;
    partSel.append(opt);
  }
}

// Parts where hierarchy mode is wrong by default:
// - Non-Group extras (Mesh nodes like bracers): part-only would only affect the
//   outline child, making sliders feel broken. Auto-switch to hierarchy.
// - Forearm/upper-arm joints: hierarchy mode scales children including weapon.
//   Auto-switch to part-only so only the skin mesh changes.
const AUTO_HIERARCHY = new Set<string>(); // populated at load time (non-Group extras)
const AUTO_PART_ONLY = new Set(['lForearm', 'rForearm', 'lUpperArm', 'rUpperArm']);

function selectPart(key: string) {
  selectedKeys.clear();
  selectedKeys.add(key);
  rebuildSecondaryBoxHelpers();
  partSel.value = key;
  const n = nodes[key];
  if (AUTO_HIERARCHY.has(key)) hierChk.checked = true;
  else if (AUTO_PART_ONLY.has(key)) hierChk.checked = false;
  if (n) { boxHelper.setFromObject(n); boxHelper.visible = true; }
  refreshRows();
  if (charActiveSubTab === 'texture') charPopulateMeshSel(key);
}

function rebuildSecondaryBoxHelpers() {
  for (const bh of secondaryBoxHelpers) { bh.visible = false; scene.remove(bh); }
  secondaryBoxHelpers.length = 0;
  for (const k of selectedKeys) {
    if (k === partSel.value || !nodes[k]) continue;
    const bh = new THREE.BoxHelper(nodes[k], 0x44aaff);
    (bh.material as THREE.LineBasicMaterial).depthTest = false;
    scene.add(bh);
    secondaryBoxHelpers.push(bh);
  }
}

function toggleCtrlSelect(key: string) {
  if (!nodes[key]) return;
  if (selectedKeys.has(key)) {
    // Deselect this key
    selectedKeys.delete(key);
    if (partSel.value === key) {
      const remaining = [...selectedKeys];
      if (remaining.length > 0) {
        const next = remaining[remaining.length - 1];
        partSel.value = next;
        if (AUTO_HIERARCHY.has(next)) hierChk.checked = true;
        else if (AUTO_PART_ONLY.has(next)) hierChk.checked = false;
        boxHelper.setFromObject(nodes[next]); boxHelper.visible = true;
        refreshRows();
      } else {
        boxHelper.visible = false;
      }
    }
  } else {
    // Add this key; make it primary
    selectedKeys.add(key);
    partSel.value = key;
    if (AUTO_HIERARCHY.has(key)) hierChk.checked = true;
    else if (AUTO_PART_ONLY.has(key)) hierChk.checked = false;
    boxHelper.setFromObject(nodes[key]); boxHelper.visible = true;
    refreshRows();
  }
  rebuildSecondaryBoxHelpers();
}

function resetPart(key: string) {
  const b = baseGroup[key];
  state[key] = {
    hierarchy: { pos: cloneV(b.pos), rot: cloneV(b.rot), scl: cloneV(b.scl) },
    part: { pos: vec(), rot: vec(), scl: one() },
    taper: { top: 1, bottom: 1 },
  };
  applyPart(key);
  if (key === partSel.value) refreshRows();
}

// -----------------------------------------------------------------------------
// Export
// -----------------------------------------------------------------------------
function fmt(n: number) {
  const r = Math.round(n * 10000) / 10000;
  return Number.isInteger(r) ? String(r) : String(r);
}
// Express a world value in terms of `s` (e.g. -0.56 with s=1.4 -> "-0.4 * s").
function sExpr(n: number) {
  if (n === 0) return '0';
  const v = n / scale;
  const r = Math.round(v * 10000) / 10000;
  return `${fmt(r)} * s`;
}

function approxEqual(a: number, b: number, eps = 1e-4) { return Math.abs(a - b) < eps; }

function generateExport(): string {
  const out: string[] = [];
  const variantLabel = currentColorVariant === 1 ? ' — ALT 1 (mid attack)' : currentColorVariant === 2 ? ' — ALT 2 (high attack)' : '';
  out.push(`// === Character editor output — paste into the builder (s = profile.scale = ${scale})${variantLabel} ===`);
  const headerLineCount = out.length;
  if (currentColorVariant > 0) out.push(`// Wrap these changes in: if (profile.colorVariant === ${currentColorVariant}) { ... }`);
  let any = false;
  // parts.ts helpers referenced by the emitted code; surfaced as an import hint.
  const helpersUsed = new Set<string>();

  // Trailing `, [rig.a, rig.b]` joint-list arg for the part-only/taper helpers
  // (the sub-joints to leave untouched). Empty when the part has no sub-joints,
  // so the helper's default parameter applies.
  const jointsExpr = (key: string): string => {
    const joints = nodes[key].children.filter(c => Object.values(nodes).includes(c));
    if (!joints.length) return '';
    const refs = joints.map(j => {
      const jk = Object.keys(nodes).find(k => nodes[k] === j)!;
      return `rig.${refPath(jk)}`;
    });
    return `, [${refs.join(', ')}]`;
  };

  for (const key of Object.keys(nodes)) {
    const st = state[key];
    const b = baseGroup[key];
    const lines: string[] = [];
    const ref = refPath(key); // `extras!.foo` for registry parts, else the plain key

    // --- Hierarchy (group node) changes ---
    const h = st.hierarchy;
    if (!approxEqual(h.pos.x, b.pos.x) || !approxEqual(h.pos.y, b.pos.y) || !approxEqual(h.pos.z, b.pos.z))
      lines.push(`rig.${ref}.position.set(${sExpr(h.pos.x)}, ${sExpr(h.pos.y)}, ${sExpr(h.pos.z)});`);
    if (!approxEqual(h.rot.x, b.rot.x) || !approxEqual(h.rot.y, b.rot.y) || !approxEqual(h.rot.z, b.rot.z))
      lines.push(`rig.${ref}.rotation.set(${fmt(h.rot.x)}, ${fmt(h.rot.y)}, ${fmt(h.rot.z)});`);
    if (!approxEqual(h.scl.x, b.scl.x) || !approxEqual(h.scl.y, b.scl.y) || !approxEqual(h.scl.z, b.scl.z))
      lines.push(`rig.${ref}.scale.set(${fmt(h.scl.x)}, ${fmt(h.scl.y)}, ${fmt(h.scl.z)});`);

    // --- Part-only (own meshes, joints kept in place) changes ---
    const p = st.part;
    const posChanged = !approxEqual(p.pos.x, 0) || !approxEqual(p.pos.y, 0) || !approxEqual(p.pos.z, 0);
    const rotChanged = !approxEqual(p.rot.x, 0) || !approxEqual(p.rot.y, 0) || !approxEqual(p.rot.z, 0);
    const sclChanged = !approxEqual(p.scl.x, 1) || !approxEqual(p.scl.y, 1) || !approxEqual(p.scl.z, 1);
    if (posChanged || rotChanged || sclChanged) {
      // Part-only: shift/scale own meshes only, skipping child joints — this
      // matches the editor's live preview (which only touches direct own meshes,
      // NOT every descendant the way a traverse would). Emitted as a call to the
      // shared adjustPartMeshes() helper in parts.ts.
      const opts: string[] = [];
      if (posChanged) opts.push(`pos: [${sExpr(p.pos.x)}, ${sExpr(p.pos.y)}, ${sExpr(p.pos.z)}]`);
      if (rotChanged) opts.push(`rot: [${fmt(p.rot.x)}, ${fmt(p.rot.y)}, ${fmt(p.rot.z)}]`);
      if (sclChanged) opts.push(`scl: [${fmt(p.scl.x)}, ${fmt(p.scl.y)}, ${fmt(p.scl.z)}]`);
      lines.push(`// part-only adjust for ${key} (own meshes; child joints unaffected)`);
      lines.push(`adjustPartMeshes(rig.${ref}, { ${opts.join(', ')} }${jointsExpr(key)});`);
      helpersUsed.add('adjustPartMeshes');
    }

    const taper = st.taper;
    if (!approxEqual(taper.top, b.taperTop, 1e-3) || !approxEqual(taper.bottom, b.taperBot, 1e-3)) {
      // Vertex-level taper that mirrors applyTaper() in the editor, emitted as a
      // call to the shared taperMeshesY() helper in parts.ts. Works on any
      // geometry shape (not just CylinderGeometry); the helper also records the
      // editorTaper{Top,Bot} userData markers the editor reads back on load.
      lines.push(`// taper: top XZ ×${fmt(taper.top)}, bottom XZ ×${fmt(taper.bottom)}`);
      lines.push(`taperMeshesY(rig.${ref}, ${fmt(taper.top)}, ${fmt(taper.bottom)}${jointsExpr(key)});`);
      helpersUsed.add('taperMeshesY');
    }

    if (lines.length) {
      any = true;
      out.push('', `// ${key}`);
      out.push(...lines);
    }
  }

  if (!any) out.push('', '// (no changes yet — adjust a part)');
  if (helpersUsed.size) {
    out.splice(headerLineCount, 0,
      `// Import from ../parts: ${[...helpersUsed].sort().join(', ')}`);
  }
  return out.join('\n');
}

// -----------------------------------------------------------------------------
// Keyframe / Pose Preview
// -----------------------------------------------------------------------------
// Apply runtime source global defaults to the live rig (no snapshot/restore).
// Mirrors the "GLOBAL DEFAULTS — Reset every frame" block in runtime source animate().
function setIdleDefaults(s: number, usesLockedWeapon: boolean, usesSideWeapon: boolean) {
  if (rig.mesh) {
    rig.mesh.rotation.set(0, 0, 0);
  }
  const armY = (rig.profile as any).armYOffset ?? 0.04;
  const neckY = (rig.profile as any).neckYOffset ?? (baseGroup['neck'] ? baseGroup['neck'].pos.y / s - 0.20 : 0.28);
  const tb = baseGroup['torso'];
  if (rig.torso) {
    rig.torso.position.set(tb?.pos.x ?? 0, 1.85 * s, tb?.pos.z ?? 0);
    rig.torso.rotation.set(0.1, 0.1, 0);
    rig.torso.scale.set(tb?.scl.x ?? 1, tb?.scl.y ?? 1, tb?.scl.z ?? 1);
  }
  if (rig.pelvis) { rig.pelvis.position.set(0, 1.35 * s, 0); rig.pelvis.rotation.set(0, 0, 0); }
  if (rig.lUpperArm) { rig.lUpperArm.position.y = (baseGroup['lUpperArm']?.pos.y ?? 0) + armY * s; rig.lUpperArm.rotation.set(0.2, 0, -0.3); }
  if (rig.rUpperArm) { rig.rUpperArm.position.y = (baseGroup['rUpperArm']?.pos.y ?? 0) + armY * s; rig.rUpperArm.rotation.set(0.3, 0, 0.2); }
  if (rig.neck) rig.neck.position.y = neckY * s;
  if (rig.head) rig.head.rotation.set(0, 0, 0);
  if (rig.lForearm) rig.lForearm.rotation.set(-0.4, 0, 0);
  if (rig.rForearm) rig.rForearm.rotation.set(-0.5, 0, 0);
  // Sample: claws use ±π (forward-pointing grip), not ±π/2 (sword grip).
  if (rig.lHand) rig.lHand.rotation.set(0, usesLockedWeapon ? (baseGroup['lHand']?.rot.y ?? Math.PI) : Math.PI / 2, 0);
  if (rig.rHand) rig.rHand.rotation.set(0, usesLockedWeapon ? (baseGroup['rHand']?.rot.y ?? -Math.PI) : -Math.PI / 2, 0);
  if (rig.lThigh) rig.lThigh.rotation.set(-0.1, 0, -0.1);
  if (rig.lCalf) rig.lCalf.rotation.set(0.1, 0, 0);
  if (rig.lFoot) rig.lFoot.rotation.set(0, -0.4, 0);
  if (rig.rThigh) rig.rThigh.rotation.set(-0.1, 0, 0.1);
  if (rig.rCalf) rig.rCalf.rotation.set(0.1, 0, 0);
  if (rig.rFoot) rig.rFoot.rotation.set(0, 0.4, 0);
  // Sample's weaponGroup is locked to his hands (weaponGroupLocked=true). Don't override it.
  if (rig.weaponGroup && !usesLockedWeapon) {
    rig.weaponGroup.rotation.set(usesSideWeapon ? Math.PI / 2 : Math.PI, 0, -Math.PI / 2);
  }
}

interface AnimPose { label: string; fn: (s: number, usesLockedWeapon: boolean, usesSideWeapon: boolean) => void; }

// Each entry applies the global defaults first, then its state-specific overrides.
// Values match runtime source at the specified phase progress (p=1.0 = fully in that phase).
// Shake, impactRecoil, idleSway, and breathing are zeroed for clean static snapshots.
const ANIM_POSES: Record<string, AnimPose> = {
  idle: {
    label: 'Idle (standing)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
    },
  },
  // Intro flourish phases mirror runtime source INTRO (coil → hoist → settle).
  intro_setup: {
    label: 'Intro – Setup coil (anticipation)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
  setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
  // --- auto-applied pose overrides from /editor.html at 2026-07-01T20:44:20.217Z ---
  if (rig.torso) { rig.torso.rotation.set(0.05, -0.35, 0); rig.torso.position.set(0, 1.67 * s, 0); }
  if (rig.pelvis) rig.pelvis.position.set(0, 1.21 * s, 0);
  if (rig.head) rig.head.rotation.set(0.12, -0.22, 0);
  if (rig.lUpperArm) rig.lUpperArm.rotation.set(0.05, 0, -0.45);
  if (rig.rUpperArm) rig.rUpperArm.rotation.set(0.0384, 0.1584, 0.3184);
  if (rig.lForearm) rig.lForearm.rotation.set(-0.7, -3.1416, 0);
  if (rig.rForearm) rig.rForearm.rotation.set(-1.0116, 2.8584, 0.2384);
  if (rig.lThigh) rig.lThigh.rotation.set(-0.4, 0, -0.1);
  if (rig.rThigh) rig.rThigh.rotation.set(-0.4, 0, 0.1);
  if (rig.lCalf) rig.lCalf.rotation.set(0.5, 0, 0);
  if (rig.rCalf) rig.rCalf.rotation.set(0.5, 0, 0);
  if (rig.lFoot) rig.lFoot.rotation.set(-0.1, -0.4, 0);
  if (rig.rFoot) rig.rFoot.rotation.set(-0.1, 0.4, 0);
  // --- end auto-applied pose ---
},
  },
  intro_execution: {
    label: 'Intro – Execution hoist (peak)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const wgBaseX = usesSideWeapon ? Math.PI / 2 : Math.PI;
      if (rig.torso) rig.torso.rotation.set(0.2, 0.22, 0);
      if (rig.head) rig.head.rotation.set(-0.16, 0.16, 0);
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(-2.15, 0.12, 0.6);
      if (rig.rForearm) rig.rForearm.rotation.x = -1.3;
      if (rig.lUpperArm) rig.lUpperArm.rotation.set(-0.6, 0, -0.85);
      if (rig.lForearm) rig.lForearm.rotation.x = -1.0;
      if (rig.lThigh) rig.lThigh.rotation.x = 0.15;
      if (rig.rThigh) rig.rThigh.rotation.x = -0.3;
      if (rig.lCalf) rig.lCalf.rotation.x = 0.15;
      if (rig.rCalf) rig.rCalf.rotation.x = 0.2;
      if (rig.weaponGroup && !usesLockedWeapon) rig.weaponGroup.rotation.x = wgBaseX - 0.75;
    },
  },
  intro_recovery: {
    label: 'Intro – Recovery settle (f=0.5)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const wgBaseX = usesSideWeapon ? Math.PI / 2 : Math.PI;
      if (rig.torso) rig.torso.rotation.set(0.15, 0.16, 0);
      if (rig.head) rig.head.rotation.set(-0.08, 0.08, 0);
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(-0.925, 0.06, 0.4);
      if (rig.rForearm) rig.rForearm.rotation.x = -0.9;
      if (rig.lUpperArm) rig.lUpperArm.rotation.set(-0.2, 0, -0.575);
      if (rig.lForearm) rig.lForearm.rotation.x = -0.7;
      if (rig.lThigh) rig.lThigh.rotation.x = 0.025;
      if (rig.rThigh) rig.rThigh.rotation.x = -0.2;
      if (rig.lCalf) rig.lCalf.rotation.x = 0.125;
      if (rig.rCalf) rig.rCalf.rotation.x = 0.15;
      if (rig.weaponGroup && !usesLockedWeapon) rig.weaponGroup.rotation.x = wgBaseX - 0.375;
    },
  },
  guard_high: {
    label: 'Guard – High (cross-brace)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
  setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
  // --- auto-applied pose overrides from /editor.html at 2026-07-01T21:55:10.660Z ---
  if (rig.torso) { rig.torso.rotation.set(0.15, -0.3, 0.1); rig.torso.position.set(0, 1.75 * s, 0); }
  if (rig.lUpperArm) rig.lUpperArm.rotation.set(-0.3, 1.9784, -1.2916);
  if (rig.rUpperArm) rig.rUpperArm.rotation.set(-0.1616, -0.9716, 1.2084);
  if (rig.lForearm) rig.lForearm.rotation.set(-0.9716, 0.1184, -1.2);
  if (rig.rForearm) rig.rForearm.rotation.set(-1.8516, -0.0416, -0.2816);
  if (rig.lHand) rig.lHand.rotation.set(-0.0416, 2.2984, 0);
  if (rig.rHand) rig.rHand.rotation.set(0.1184, -0.3616, -0.2816);
  if (rig.lThigh) rig.lThigh.rotation.set(-0.35, 0, -0.25);
  if (rig.rThigh) rig.rThigh.rotation.set(-0.35, 0, 0.25);
  if (rig.lCalf) rig.lCalf.rotation.set(0.4, 0, 0);
  if (rig.rCalf) rig.rCalf.rotation.set(0.4, 0, 0);
  if (rig.lFoot) rig.lFoot.rotation.set(-0.05, -0.4, 0);
  if (rig.rFoot) rig.rFoot.rotation.set(-0.05, 0.4, 0);
  if (rig.weaponGroup && !usesLockedWeapon) rig.weaponGroup.rotation.set(0.1571, 0.2, -1.428);
  // --- end auto-applied pose ---
},
  },
  guard_low: {
    label: 'Guard – Low (deep crouch)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      if (rig.torso) { rig.torso.rotation.set(0.6, -0.25, 0.08); rig.torso.position.y -= 0.45 * s; }
      if (rig.lThigh) rig.lThigh.rotation.set(-0.65, 0, -0.35);
      if (rig.lCalf) rig.lCalf.rotation.x = 0.35;
      if (rig.rThigh) rig.rThigh.rotation.set(-0.65, 0, 0.35);
      if (rig.rCalf) rig.rCalf.rotation.x = 0.35;
      if (rig.lUpperArm) rig.lUpperArm.rotation.set(0.15, 0.6, -0.5);
      if (rig.lForearm) rig.lForearm.rotation.set(0.2, 0.2, -1.0);
      if (rig.lHand && !usesLockedWeapon) rig.lHand.rotation.set(0.1, 0.3, 0);
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(0.1, -0.3, 0.6);
      if (rig.rForearm) rig.rForearm.rotation.set(0.15, 0, 0.35);
      if (rig.rHand && !usesLockedWeapon) rig.rHand.rotation.set(0, -Math.PI / 2, 0);
      if (rig.weaponGroup && !usesLockedWeapon) rig.weaponGroup.rotation.set(-0.4, 0.15, -Math.PI / 2.5);
    },
  },
  guard_mid: {
    label: 'Guard – Mid / fallback',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      if (rig.torso) { rig.torso.rotation.set(0.12, -0.28, 0.08); rig.torso.position.y -= 0.08 * s; }
      if (rig.lThigh) rig.lThigh.rotation.set(-0.32, 0, -0.22);
      if (rig.lCalf) rig.lCalf.rotation.x = 0.38;
      if (rig.rThigh) rig.rThigh.rotation.set(-0.32, 0, 0.22);
      if (rig.rCalf) rig.rCalf.rotation.x = 0.38;
      if (rig.lUpperArm) rig.lUpperArm.rotation.set(-0.28, 0.7, -0.55);
      if (rig.lForearm) rig.lForearm.rotation.set(-0.08, 0.25, -1.15);
      if (rig.lHand && !usesLockedWeapon) rig.lHand.rotation.set(0.18, 0.45, 0);
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(-0.45, -0.35, 0.75);
      if (rig.rForearm) rig.rForearm.rotation.set(-0.25, 0, 0.35);
      if (rig.rHand && !usesLockedWeapon) rig.rHand.rotation.set(0, -Math.PI / 2, 0);
      if (rig.weaponGroup && !usesLockedWeapon) rig.weaponGroup.rotation.set(Math.PI * 0.04, 0.18, -Math.PI / 2.3);
    },
  },
  air_guard: {
    label: 'Air Guard (arms overhead)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      if (rig.lThigh) rig.lThigh.rotation.x = 0.3;
      if (rig.lCalf) rig.lCalf.rotation.x = 0.4;
      if (rig.rThigh) rig.rThigh.rotation.x = 0.3;
      if (rig.rCalf) rig.rCalf.rotation.x = 0.4;
      if (rig.lUpperArm) rig.lUpperArm.rotation.set(-1.5, 0, -0.8);
      if (rig.lForearm) rig.lForearm.rotation.set(-0.5, 0, 0);
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(-1.5, 0, 0.8);
      if (rig.rForearm) rig.rForearm.rotation.set(-0.5, 0, 0);
      if (rig.weaponGroup && !usesLockedWeapon) rig.weaponGroup.rotation.set(Math.PI * 0.5, 0, -Math.PI / 2);
    },
  },
  clash: {
    label: 'Clash / Sword Lock',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      if (rig.torso) { rig.torso.rotation.set(0.3, 0.1, 0); }
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(-1.6, -0.3, 0.6);
      if (rig.rForearm) rig.rForearm.rotation.set(-0.5, 0, 0);
      if (rig.lUpperArm) rig.lUpperArm.rotation.set(-1.5, 0.5, -0.8);
      if (rig.lForearm) rig.lForearm.rotation.set(-0.4, 0, 0);
      if (rig.lThigh) rig.lThigh.rotation.set(-0.4, 0, -0.2);
      if (rig.lCalf) rig.lCalf.rotation.x = 0.5;
      if (rig.rThigh) rig.rThigh.rotation.set(-0.2, 0, 0.2);
      if (rig.rCalf) rig.rCalf.rotation.x = 0.3;
      if (rig.weaponGroup && !usesLockedWeapon) rig.weaponGroup.rotation.set(Math.PI * 0.75, 0.4, -Math.PI / 2);
    },
  },
  victory_antic: {
    label: 'Victory – Anticipation (coil)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const kneeBend = 0.45; // ANTIC_END peak in runtime source victory
      if (rig.torso) rig.torso.position.y += -0.16 * s;
      if (rig.pelvis) rig.pelvis.position.y += -0.16 * s;
      if (rig.lThigh) rig.lThigh.rotation.x -= kneeBend; if (rig.lCalf) rig.lCalf.rotation.x += kneeBend * 1.6;
      if (rig.rThigh) rig.rThigh.rotation.x -= kneeBend; if (rig.rCalf) rig.rCalf.rotation.x += kneeBend * 1.6;
      // Arms gather inward before the celebration; chin dips.
      if (rig.lUpperArm) rig.lUpperArm.rotation.x += -0.15;
      if (rig.rUpperArm) rig.rUpperArm.rotation.x += -0.15;
      if (rig.head) rig.head.rotation.x = 0.12;
    },
  },
  victory_burst: {
    label: 'Victory – Burst (leap apex)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      // Apex of the leap: full pose, body lifted, legs nearly extended. Generic
      // (non-Knight) arm pose; mirrors runtime source mid-burst envelope.
      const bodyLift = 0.15 * s, kneeBend = 0.14;
      if (rig.torso) { rig.torso.rotation.set(0.04, 0.1, 0); rig.torso.position.y += bodyLift; }
      if (rig.pelvis) { rig.pelvis.rotation.set(0, -0.05, 0); rig.pelvis.position.y += bodyLift; }
      if (rig.lThigh) { rig.lThigh.rotation.x = 0.1 - kneeBend; rig.lThigh.rotation.z = -0.3; }
      if (rig.lCalf) rig.lCalf.rotation.x = 0.15 + kneeBend * 1.6;
      if (rig.rThigh) { rig.rThigh.rotation.x = 0.1 - kneeBend; rig.rThigh.rotation.z = 0.2; }
      if (rig.rCalf) rig.rCalf.rotation.x = 0.15 + kneeBend * 1.6;
      if (rig.lUpperArm) { rig.lUpperArm.rotation.x = -1.4; rig.lUpperArm.rotation.z = -0.8; }
      if (rig.lForearm) rig.lForearm.rotation.x = -0.8;
      if (rig.rUpperArm) { rig.rUpperArm.rotation.x = -1.4; rig.rUpperArm.rotation.z = 0.8; }
      if (rig.rForearm) rig.rForearm.rotation.x = -0.8;
      if (rig.head) rig.head.rotation.x = -0.1;
    },
  },
  victory: {
    label: 'Victory – Settle (held)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      if (currentType === WarriorType.KNIGHT) {
        if (rig.torso) { rig.torso.rotation.set(0.05, -0.08, 0.1); rig.torso.position.set(-0.0167 * s, 1.85 * s, 0); }
        if (rig.pelvis) { rig.pelvis.rotation.set(0, -0.05, 0); }
        if (rig.head) { rig.head.rotation.set(-0.12, 0.26, 0); }
        if (rig.lUpperArm) { rig.lUpperArm.rotation.set(-0.3616, -0.3616, -0.5616); }
        if (rig.rUpperArm) { rig.rUpperArm.rotation.set(-1.58, -0.47, 0.8); }
        if (rig.lForearm) { rig.lForearm.rotation.set(-0.5216, 0.3184, 0.4784); }
        if (rig.rForearm) { rig.rForearm.rotation.set(-0.66, 0.13, -0.28); }
        if (rig.rHand) { rig.rHand.rotation.set(0.87, -1.001, 0); }
        if (rig.lThigh) { rig.lThigh.rotation.set(0.1, 0.26, -0.05); }
        if (rig.rThigh) { rig.rThigh.rotation.set(0.1, -0.26, 0.05); }
        if (rig.lCalf) { rig.lCalf.rotation.set(0.15, 0, 0); }
        if (rig.rCalf) { rig.rCalf.rotation.set(0.15, 0, 0); }
        if (rig.lFoot) { rig.lFoot.rotation.set(-0.25, -0.4, 0); }
        if (rig.rFoot) { rig.rFoot.rotation.set(-0.25, 0.4, 0); }
        if (rig.weaponGroup && !usesLockedWeapon) { rig.weaponGroup.rotation.set(0.9425, 0, -1.5708); }
      } else {
        if (rig.torso) { rig.torso.rotation.set(0.04, 0.1, 0); }
        if (rig.pelvis) { rig.pelvis.rotation.set(0, -0.05, 0); }
        if (rig.lThigh) { rig.lThigh.rotation.x = 0.1; rig.lThigh.rotation.z = -0.3; }
        if (rig.lCalf) rig.lCalf.rotation.x = 0.15;
        if (rig.rThigh) { rig.rThigh.rotation.x = 0.1; rig.rThigh.rotation.z = 0.2; }
        if (rig.rCalf) rig.rCalf.rotation.x = 0.15;
        if (rig.lUpperArm) { rig.lUpperArm.rotation.x = -1.4; rig.lUpperArm.rotation.z = -0.8; }
        if (rig.lForearm) rig.lForearm.rotation.x = -0.8;
        if (rig.rUpperArm) { rig.rUpperArm.rotation.x = -1.4; rig.rUpperArm.rotation.z = 0.8; }
        if (rig.rForearm) rig.rForearm.rotation.x = -0.8;
        if (rig.head) rig.head.rotation.x = -0.1;
        if (rig.weaponGroup && !usesLockedWeapon) { rig.weaponGroup.rotation.x = Math.PI * 0.3; rig.weaponGroup.rotation.z = -Math.PI / 2; }
      }
    },
  },
  // Jump phases mirror runtime source (startup crouch → ascend → descend → land).
  jump_startup: {
    label: 'Jump – Startup coil (startupP=1)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const crouchDepth = 0.6; // pow(1,0.6)*0.6
      if (rig.torso) { rig.torso.rotation.x = 0.1 + crouchDepth * 0.45; rig.torso.position.y -= crouchDepth * 0.7 * s; }
      if (rig.lThigh) rig.lThigh.rotation.x = -0.5 - crouchDepth * 0.7;
      if (rig.lCalf) rig.lCalf.rotation.x = 0.8 + crouchDepth * 0.9;
      if (rig.rThigh) rig.rThigh.rotation.x = -0.5 - crouchDepth * 0.7;
      if (rig.rCalf) rig.rCalf.rotation.x = 0.8 + crouchDepth * 0.9;
      if (rig.pelvis) { rig.pelvis.position.y -= crouchDepth * 0.6 * s; rig.pelvis.rotation.x = crouchDepth * 0.3; }
      if (rig.lUpperArm) { rig.lUpperArm.rotation.x = -0.4 + crouchDepth * 0.9; rig.lUpperArm.rotation.z = -0.3 - crouchDepth * 0.25; }
      if (rig.rUpperArm) { rig.rUpperArm.rotation.x = -0.4 + crouchDepth * 0.9; rig.rUpperArm.rotation.z = 0.3 + crouchDepth * 0.25; }
    },
  },
  jump_ascend: {
    label: 'Jump – Ascend (launch=1)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      if (rig.torso) { rig.torso.scale.y *= 1.12; rig.torso.scale.x *= 0.94; rig.torso.rotation.x = 0.18; }
      if (rig.lThigh) rig.lThigh.rotation.x = -1.45;
      if (rig.lCalf) rig.lCalf.rotation.x = 1.5;
      if (rig.rThigh) rig.rThigh.rotation.x = -0.3;
      if (rig.rCalf) rig.rCalf.rotation.x = 0.9;
      if (rig.pelvis) rig.pelvis.rotation.x = 0.25;
      if (rig.lUpperArm) rig.lUpperArm.rotation.set(-1.6, 0, -0.5);
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(-1.6, 0, 0.5);
      if (rig.head) rig.head.rotation.x = -0.15;
    },
  },
  jump_descend: {
    label: 'Jump – Descend (fall=1)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      if (rig.torso) rig.torso.rotation.x = 0.2;
      if (rig.lThigh) rig.lThigh.rotation.x = -0.75;
      if (rig.lCalf) rig.lCalf.rotation.x = 1.05;
      if (rig.rThigh) rig.rThigh.rotation.x = -0.75;
      if (rig.rCalf) rig.rCalf.rotation.x = 1.05;
      if (rig.pelvis) rig.pelvis.rotation.x = -0.1;
      if (rig.lUpperArm) rig.lUpperArm.rotation.set(0.2, 0, -0.85);
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(0.2, 0, 0.85);
      if (rig.head) rig.head.rotation.x = 0.12;
    },
  },
  jump_land: {
    label: 'Jump – Landing squash (recoveryP=0.25)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const rp = 0.25, squash = (1 - rp) * 0.22;
      if (rig.torso) { rig.torso.scale.y *= 1.0 - squash; rig.torso.scale.x *= 1.0 + squash * 0.8; rig.torso.rotation.x = 0.15 * (1 - rp); rig.torso.position.y -= squash * 0.6 * s; }
      if (rig.lThigh) rig.lThigh.rotation.x = THREE.MathUtils.lerp(-1.3, -0.1, rp);
      if (rig.lCalf) rig.lCalf.rotation.x = THREE.MathUtils.lerp(1.5, 0.1, rp);
      if (rig.rThigh) rig.rThigh.rotation.x = THREE.MathUtils.lerp(-1.3, -0.1, rp);
      if (rig.rCalf) rig.rCalf.rotation.x = THREE.MathUtils.lerp(1.5, 0.1, rp);
      if (rig.pelvis) { rig.pelvis.rotation.x = 0.25 * (1 - rp); rig.pelvis.position.y -= squash * 0.9 * s; }
      if (rig.lUpperArm) rig.lUpperArm.rotation.x = THREE.MathUtils.lerp(0.7, 0.2, rp);
      if (rig.rUpperArm) rig.rUpperArm.rotation.x = THREE.MathUtils.lerp(0.7, 0.3, rp);
    },
  },
  dash_forward: {
    label: 'Dash – Forward',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      if (rig.torso) { rig.torso.rotation.set(0.45, 0.1, 0); rig.torso.position.set(0, 1.625 * s, 0.025 * s); }
      if (rig.lUpperArm) rig.lUpperArm.rotation.set(-1.1316, 1.2884, -0.5616);
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(-0.7216, -0.2016, 0.4784);
      if (rig.lForearm) rig.lForearm.rotation.set(-1.0916, 0, 0);
      if (rig.rForearm) rig.rForearm.rotation.set(-0.2, 0, 0);
      if (rig.lHand) rig.lHand.rotation.set(-0.2016, 0.6884, 0);
      if (rig.lThigh) rig.lThigh.rotation.set(-0.5, 0, -0.2);
      if (rig.rThigh) rig.rThigh.rotation.set(0.5, 0, 0.1);
      if (rig.lCalf) rig.lCalf.rotation.set(0.6, 0, 0);
      if (rig.rCalf) rig.rCalf.rotation.set(0.2, 0, 0);
      if (rig.lFoot) rig.lFoot.rotation.set(-0.1, -0.4, 0);
      if (rig.rFoot) rig.rFoot.rotation.set(-0.7, 0.4, 0);
    },
  },
  dash_back: {
    label: 'Dash – Back',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      if (rig.torso) { rig.torso.rotation.x = -0.35; rig.torso.position.y = 1.6 * s; }
      if (rig.lThigh) { rig.lThigh.rotation.x = -0.2; rig.lThigh.rotation.z = -0.3; }
      if (rig.lCalf) rig.lCalf.rotation.x = 0.1;
      if (rig.rThigh) { rig.rThigh.rotation.x = 0.5; rig.rThigh.rotation.z = 0.2; }
      if (rig.rCalf) rig.rCalf.rotation.x = 0.3;
      if (rig.lUpperArm) { rig.lUpperArm.rotation.x = -0.8; rig.lUpperArm.rotation.z = -0.5; }
      if (rig.lForearm) rig.lForearm.rotation.x = -0.5;
      if (rig.rUpperArm) { rig.rUpperArm.rotation.x = -0.6; rig.rUpperArm.rotation.z = 0.5; }
      if (rig.rForearm) rig.rForearm.rotation.x = -0.3;
    },
  },
  dodge_side: {
    label: 'Dodge – Side step (peak)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const sideLean = 1.0; const plant = 1.0;
      if (rig.torso) { rig.torso.rotation.x = 0.08 + plant * 0.12; rig.torso.rotation.z = -sideLean * 0.34; rig.torso.position.y = (1.78 - plant * 0.18) * s; }
      if (rig.pelvis) { rig.pelvis.position.y = (1.28 - plant * 0.16) * s; rig.pelvis.rotation.z = -sideLean * 0.22; }
      if (rig.rThigh) { rig.rThigh.rotation.x = -0.28 - plant * 0.18; rig.rThigh.rotation.z = -0.42 * plant; }
      if (rig.rCalf) rig.rCalf.rotation.x = 0.42 * plant;
      if (rig.lThigh) { rig.lThigh.rotation.x = 0.18 * plant; rig.lThigh.rotation.z = 0.22 * plant; }
      if (rig.lCalf) rig.lCalf.rotation.x = 0.18 * plant;
      if (rig.lUpperArm) { rig.lUpperArm.rotation.x = -0.42 - plant * 0.18; rig.lUpperArm.rotation.z = -0.48 - sideLean * 0.18; }
      if (rig.lForearm) rig.lForearm.rotation.x = -0.58;
      if (rig.rUpperArm) { rig.rUpperArm.rotation.x = -0.22 - plant * 0.22; rig.rUpperArm.rotation.z = 0.36 + sideLean * 0.22; }
      if (rig.rForearm) rig.rForearm.rotation.x = -0.38;
    },
  },
  // Attack poses — startup peak (full wind-up), then active peak (full strike extension)
  atk_high_windup: {
    label: 'Attack High – Windup (startupP=1)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const p = 1.0;
      const vOff = usesSideWeapon ? Math.PI / 2 : 0;
      if (rig.torso) { rig.torso.rotation.x = 0.15 + 0.1 * p; rig.torso.rotation.y = 0.5 * p; rig.torso.position.y += 0.05 * s * p; rig.torso.position.x -= 0.08 * s * p; }
      if (rig.pelvis) { rig.pelvis.rotation.y = -0.3 * p; rig.pelvis.position.x = -0.05 * s * p; }
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(0.2 - 1.2 * p, -0.5 * p, -0.3 * p);
      if (rig.rForearm) rig.rForearm.rotation.set(-0.3 - 0.4 * p, 0, -0.2 * p);
      if (rig.lUpperArm) { rig.lUpperArm.rotation.x = 0.1 - 0.6 * p; rig.lUpperArm.rotation.z = -0.2 * p; }
      if (rig.lThigh) rig.lThigh.rotation.x += 0.1 * p;
      if (rig.rThigh) rig.rThigh.rotation.x += 0.15 * p;
      if (rig.lCalf) rig.lCalf.rotation.x += 0.08 * p;
      if (rig.rCalf) rig.rCalf.rotation.x += 0.1 * p;
      if (rig.weaponGroup && !usesLockedWeapon) rig.weaponGroup.rotation.set(vOff - 0.8 * p, 0.3 * p, -Math.PI / 2 + Math.PI * 0.4 * p);
    },
  },
  atk_high_strike: {
    label: 'Attack High – Strike (activeP=1)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const p = 1.0;
      const vOff = usesSideWeapon ? Math.PI / 2 : 0;
      if (rig.torso) { rig.torso.rotation.set(0.25 - 0.15 * p, 0.5 - 1.2 * p, 0); rig.torso.position.y += 0.05 * s - 0.1 * s * p; rig.torso.position.x += -0.08 * s + 0.15 * s * p; }
      if (rig.pelvis) { rig.pelvis.rotation.y = -0.3 + 0.6 * p; rig.pelvis.position.x = (-0.05 + 0.08 * p) * s; }
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(-1.0 + 0.3 * p, -0.5 + 2.2 * p, -0.3 + 0.2 * p);
      if (rig.rForearm) rig.rForearm.rotation.set(-0.7 + 0.5 * p, 0, -0.2 + 0.15 * p);
      if (rig.lUpperArm) { rig.lUpperArm.rotation.x = -0.5 + 0.4 * p; rig.lUpperArm.rotation.y = 0.2 * p; rig.lUpperArm.rotation.z = -0.2 + 0.1 * p; }
      if (rig.head) rig.head.rotation.y = 0.3 * p;
      if (rig.rFoot) rig.rFoot.rotation.x = -0.15 * p;
      if (rig.lFoot) rig.lFoot.rotation.x = 0.1 * p;
      if (rig.weaponGroup && !usesLockedWeapon) rig.weaponGroup.rotation.set(vOff - 0.8 + 1.2 * p, 0.3 - 0.6 * p, -Math.PI / 2 + Math.PI * 0.9 * p);
    },
  },
  atk_high_recovery: {
    label: 'Attack High – Recovery (recoveryP=0.5)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const p = 0.5; // mid-return sample of runtime source high recovery branch
      if (rig.torso) { rig.torso.rotation.set(0.1 + 0.05 * p, -0.7 + 0.7 * p, 0); rig.torso.position.y += (-0.05 + 0.05 * p) * s; rig.torso.position.x += (0.07 - 0.07 * p) * s; }
      if (rig.pelvis) { rig.pelvis.rotation.y = 0.3 - 0.3 * p; rig.pelvis.position.x += (0.03 - 0.03 * p) * s; }
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(-0.7 + 0.9 * p, 1.7 - 1.7 * p, -0.1 + 0.1 * p);
      if (rig.rForearm) rig.rForearm.rotation.set(-0.2 + 0.4 * p, 0, -0.05 + 0.05 * p);
      if (rig.lUpperArm) { rig.lUpperArm.rotation.x = -0.1 + 0.2 * p; rig.lUpperArm.rotation.z = -0.1 + 0.1 * p; }
      if (rig.head) rig.head.rotation.y = 0.3 - 0.3 * p;
      if (rig.rThigh) rig.rThigh.rotation.x = -0.1 + 0.2 * p;
      if (rig.rCalf) rig.rCalf.rotation.x = -0.05 + 0.15 * p;
      if (rig.lThigh) rig.lThigh.rotation.x = -0.1 + 0.2 * p;
      if (rig.lCalf) rig.lCalf.rotation.x = -0.04 + 0.12 * p;
      if (rig.rFoot) rig.rFoot.rotation.x = -0.15 + 0.15 * p;
      if (rig.lFoot) rig.lFoot.rotation.x = 0.1 - 0.1 * p;
      if (rig.weaponGroup && !usesLockedWeapon) rig.weaponGroup.rotation.set(0.4 - 0.4 * p, -0.3 + 0.3 * p, -Math.PI / 2 + Math.PI * 0.1 * p);
      // Follow-through (follow = sin(0.5π) = 1): arm wraps across, torso over-rotates.
      if (rig.torso) { rig.torso.rotation.y -= 0.2; rig.torso.rotation.x += 0.12; }
      if (rig.rUpperArm) { rig.rUpperArm.rotation.y += 0.6; rig.rUpperArm.rotation.z -= 0.2; }
      if (rig.rForearm) rig.rForearm.rotation.x -= 0.5;
      if (rig.head) rig.head.rotation.y += 0.15;
    },
  },
  atk_mid_windup: {
    label: 'Attack Mid – Windup (startupP=1)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const p = 1.0;
      if (rig.torso) { rig.torso.rotation.y = -0.4 * p; rig.torso.position.x -= 0.05 * s * p; }
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(0.3 - 1.8 * p, -1.5 * p, 0.2);
      if (rig.rForearm) rig.rForearm.rotation.set(-0.5 + 0.3 * p, 0, 0);
    },
  },
  atk_mid_strike: {
    label: 'Attack Mid – Strike (activeP=1)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const p = 1.0;
      if (rig.torso) { rig.torso.rotation.y = -0.4 + 0.8 * p; rig.torso.position.x += (-0.05 + 0.1 * p) * s; }
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(-1.8, -1.5 + 3.0 * p, 0.2);
      if (rig.rForearm) rig.rForearm.rotation.set(0.2, 0, 0);
      if (rig.pelvis) rig.pelvis.rotation.y = -0.1 + 0.3 * p;
    },
  },
  atk_mid_recovery: {
    label: 'Attack Mid – Recovery (recoveryP=0.5)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const p = 0.5; // mid-return sample of runtime source mid recovery branch
      if (rig.torso) rig.torso.rotation.y = 0.4 - 0.4 * p;
      if (rig.rUpperArm) { rig.rUpperArm.rotation.x = -1.5 + 1.8 * p; rig.rUpperArm.rotation.y = 1.5 - 1.5 * p; }
      if (rig.pelvis) rig.pelvis.rotation.y = 0.2 - 0.2 * p;
      // Follow-through (follow = sin(0.5π) = 1): slash carries across the body.
      if (rig.torso) rig.torso.rotation.y -= 0.18;
      if (rig.rUpperArm) rig.rUpperArm.rotation.y += 0.5;
      if (rig.rForearm) rig.rForearm.rotation.x -= 0.6;
      if (rig.pelvis) rig.pelvis.rotation.y -= 0.12;
      if (rig.head) rig.head.rotation.y += 0.12;
    },
  },
  atk_low_windup: {
    label: 'Attack Low – Windup (startupP=1)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const p = 1.0;
      const lowDrop = 0.4 * s;
      if (rig.torso) { rig.torso.position.y -= lowDrop * p; rig.torso.position.x -= 0.1 * s * p; rig.torso.rotation.x = 0.1 + 0.2 * p; }
      if (rig.pelvis) rig.pelvis.position.y -= lowDrop * 0.8 * p;
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(0.3 - 1.0 * p, -1.2 * p, 0.2);
    },
  },
  atk_low_strike: {
    label: 'Attack Low – Strike (activeP=1)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const p = 1.0;
      const lowDrop = 0.4 * s;
      if (rig.torso) { rig.torso.position.y -= lowDrop; rig.torso.position.x += (-0.1 + 0.5 * p) * s; rig.torso.rotation.x = 0.3 - 0.4 * p; }
      if (rig.pelvis) rig.pelvis.position.y -= lowDrop * 0.8;
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(-1.0, -1.2 + 2.4 * p, 0.2);
      if (rig.rForearm) rig.rForearm.rotation.set(0.3, 0, 0);
      const bend = 0.8;
      if (rig.lThigh) { rig.lThigh.rotation.x = -bend; } if (rig.lCalf) rig.lCalf.rotation.x = bend * 1.8;
      if (rig.rThigh) rig.rThigh.rotation.x = -bend; if (rig.rCalf) rig.rCalf.rotation.x = bend * 1.8;
    },
  },
  atk_low_recovery: {
    label: 'Attack Low – Recovery (recoveryP=0.5)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const p = 0.5; // mid-return sample of runtime source low recovery branch
      const lowDrop = 0.4 * s;
      if (rig.torso) { rig.torso.position.y -= lowDrop * (1.0 - p); rig.torso.position.x += (0.4 - 0.2 * p) * s; rig.torso.rotation.x = -0.1 + 0.2 * p; }
      if (rig.pelvis) rig.pelvis.position.y -= lowDrop * 0.8 * (1.0 - p);
      if (rig.rUpperArm) { rig.rUpperArm.rotation.x = -0.7 + 1.0 * p; rig.rUpperArm.rotation.y = 1.2 - 1.2 * p; }
      const bend = 0.8 * (1.0 - p);
      if (rig.lThigh) rig.lThigh.rotation.x = -bend; if (rig.lCalf) rig.lCalf.rotation.x = bend * 1.8;
      if (rig.rThigh) rig.rThigh.rotation.x = -bend; if (rig.rCalf) rig.rCalf.rotation.x = bend * 1.8;
      // Follow-through (follow = sin(0.5π) = 1): arm carries up/across, torso rises.
      if (rig.rUpperArm) { rig.rUpperArm.rotation.x -= 0.5; rig.rUpperArm.rotation.y += 0.5; }
      if (rig.torso) { rig.torso.rotation.x -= 0.15; rig.torso.position.y += 0.06 * s; }
    },
  },
  // Kick mirrors runtime source non-one-leg kick (right leg = kicking leg, dir=+1).
  atk_kick_chamber: {
    label: 'Attack Kick – Chamber (startupP=1)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      if (rig.rThigh) { rig.rThigh.rotation.x = -1.25; rig.rThigh.rotation.z = 0.12; }
      if (rig.rCalf) rig.rCalf.rotation.x = 1.70;
      if (rig.rFoot) rig.rFoot.rotation.x = -0.35;
      if (rig.lThigh) rig.lThigh.rotation.x = 0.12;
      if (rig.lCalf) rig.lCalf.rotation.x = 0.2;
      if (rig.torso) { rig.torso.rotation.x += -0.18; rig.torso.rotation.y += 0.14; rig.torso.position.x += -0.05 * s; }
      if (rig.pelvis) { rig.pelvis.rotation.x += -0.12; rig.pelvis.rotation.y += 0.1; }
      if (rig.lUpperArm) rig.lUpperArm.rotation.x += -0.5;
      if (rig.rUpperArm) rig.rUpperArm.rotation.x += -0.55;
      if (rig.head) rig.head.rotation.y += -0.1;
    },
  },
  atk_kick_strike: {
    label: 'Attack Kick – Extension (activeP=1)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      if (rig.rThigh) { rig.rThigh.rotation.x = -1.52; rig.rThigh.rotation.z = -0.05; }
      if (rig.rCalf) rig.rCalf.rotation.x = -0.05;
      if (rig.rFoot) rig.rFoot.rotation.x = -0.55;
      if (rig.lThigh) rig.lThigh.rotation.x = 0.2;
      if (rig.lCalf) rig.lCalf.rotation.x = 0.2;
      if (rig.lFoot) rig.lFoot.rotation.y += -0.5;
      if (rig.torso) { rig.torso.rotation.x += 0.08; rig.torso.rotation.y += -0.28; rig.torso.position.x += 0.12 * s; }
      if (rig.pelvis) { rig.pelvis.rotation.x += -0.06; rig.pelvis.rotation.y += -0.3; }
      if (rig.lUpperArm) { rig.lUpperArm.rotation.x += -0.3; rig.lUpperArm.rotation.z += -0.3; }
      if (rig.rUpperArm) { rig.rUpperArm.rotation.x += -0.35; rig.rUpperArm.rotation.z += 0.3; }
      if (rig.head) rig.head.rotation.y += -0.1;
    },
  },
  atk_kick_recovery: {
    label: 'Attack Kick – Re-chamber (recoveryP=0.5)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const settle = 0.5; // recoveryP=0.5 → reChamber = sin(π/2) = 1
      if (rig.rThigh) { rig.rThigh.rotation.x = THREE.MathUtils.lerp(-1.52, -0.1, 0.5); rig.rThigh.rotation.z = -0.05 * settle; }
      if (rig.rCalf) rig.rCalf.rotation.x = THREE.MathUtils.lerp(-0.05, 0.1, 0.5) + 1.55;
      if (rig.rFoot) rig.rFoot.rotation.x = THREE.MathUtils.lerp(-0.55, 0, 0.5);
      if (rig.lThigh) rig.lThigh.rotation.x = 0.2 * settle;
      if (rig.lCalf) rig.lCalf.rotation.x = 0.2 * settle;
      if (rig.lFoot) rig.lFoot.rotation.y += -0.5 * settle;
      if (rig.torso) { rig.torso.rotation.x += 0.08 * settle; rig.torso.rotation.y += -0.28 * settle; rig.torso.position.x += 0.12 * s * settle; }
      if (rig.pelvis) { rig.pelvis.rotation.x += -0.06 * settle; rig.pelvis.rotation.y += -0.3 * settle; }
      if (rig.lUpperArm) { rig.lUpperArm.rotation.x += -0.3 * settle; rig.lUpperArm.rotation.z += -0.3 * settle; }
      if (rig.rUpperArm) { rig.rUpperArm.rotation.x += -0.35 * settle; rig.rUpperArm.rotation.z += 0.3 * settle; }
      if (rig.head) rig.head.rotation.y += -0.1 * settle;
    },
  },
  atk_headbutt_windup: {
    label: 'Attack Headbutt – Windup (startupP=1)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      // Rear-back wind-up — mirrors runtime source headbutt startup phase (startupP=1).
      if (rig.torso) { rig.torso.rotation.x = 0; rig.torso.position.z = 0; }
      if (rig.pelvis) rig.pelvis.rotation.x = 0.1;
      if (rig.head) rig.head.rotation.x = -0.25;
      if (rig.lForearm) rig.lForearm.rotation.x = -1.2116;
      if (rig.rForearm) rig.rForearm.rotation.x = -1.2116;
      if (rig.lThigh) rig.lThigh.rotation.x += -0.13;
      if (rig.rThigh) rig.rThigh.rotation.x += -1.0116;
      if (rig.lFoot) rig.lFoot.rotation.x = -0.3684;
      if (rig.rFoot) rig.rFoot.rotation.x = 0.5132;
    },
  },
  atk_headbutt_strike: {
    label: 'Attack Headbutt – Lunge (activeP=1)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      // Full lunge — mirrors runtime source headbutt active phase (activeP=1).
      if (rig.torso) { rig.torso.rotation.set(0.5284, 0.1, 0); rig.torso.position.set(0, 1.675 * s, 0.7 * s); }
      if (rig.pelvis) { rig.pelvis.rotation.set(0.3984, 0, 0); rig.pelvis.position.set(0, 1.175 * s, 0.4083 * s); }
      if (rig.head) rig.head.rotation.x = -0.25;
      if (rig.lForearm) rig.lForearm.rotation.set(-1.2116, 0, 0.2416);
      if (rig.rForearm) rig.rForearm.rotation.set(-1.2116, 0, -0.2416);
      if (rig.lThigh) rig.lThigh.rotation.set(-0.13, 0, -0.1);
      if (rig.rThigh) rig.rThigh.rotation.set(-1.0116, 0, 0.1);
      if (rig.lFoot) rig.lFoot.rotation.set(-0.3684, -0.4, 0);
      if (rig.rFoot) rig.rFoot.rotation.set(0.5132, 0.4, 0);
    },
  },
  atk_headbutt_recovery: {
    label: 'Attack Headbutt – Recovery (recoveryP=0.5)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      const p = 0.5; // mid-return sample of runtime source headbutt recovery branch.
      // torso/pelvis Y carry over from the lunge (active set them); only Z returns.
      if (rig.torso) { rig.torso.rotation.set(0.5284 - 0.5284 * p, 0.1, 0); rig.torso.position.set(0, 1.675 * s, 0.7 * s - 0.7 * s * p); }
      if (rig.pelvis) { rig.pelvis.rotation.set(0.3984 - 0.3984 * p, 0, 0); rig.pelvis.position.set(0, 1.175 * s, 0.4083 * s - 0.4083 * s * p); }
      if (rig.head) rig.head.rotation.x = -0.25 + 0.25 * p;
      if (rig.lThigh) rig.lThigh.rotation.x = -0.13 + 0.13 * p;
      if (rig.rThigh) rig.rThigh.rotation.x = -1.0116 + 1.0116 * p;
      if (rig.lFoot) rig.lFoot.rotation.x = -0.3684 + 0.3684 * p;
      if (rig.rFoot) rig.rFoot.rotation.x = 0.5132 - 0.5132 * p;
      // Follow-through (follow = sin(0.5π) = 1): rock back onto heels, head snaps up.
      if (rig.torso) { rig.torso.rotation.x -= 0.18; rig.torso.position.z -= 0.12 * s; }
      if (rig.pelvis) rig.pelvis.rotation.x -= 0.12;
      if (rig.head) rig.head.rotation.x += 0.22;
    },
  },
  lotus: {
    label: 'Lotus / Meditation (seated)',
    fn(s, usesLockedWeapon, _usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, false);
      if (rig.torso) { rig.torso.position.y = 0.95 * s; rig.torso.rotation.set(0.03, 0, 0); }
      if (rig.pelvis) { rig.pelvis.position.y = 0.32 * s; rig.pelvis.rotation.set(-0.12, 0, 0); }
      if (rig.lThigh) rig.lThigh.rotation.set(-0.4651, 0.2697, -1.0403);
      if (rig.rThigh) rig.rThigh.rotation.set(-0.4651, -0.2697, 1.0403);
      if (rig.lCalf) rig.lCalf.rotation.set(0.5453, -0.2418, 2.416);
      if (rig.rCalf) rig.rCalf.rotation.set(0.5453, 0.2418, -2.416);
      if (rig.lFoot) rig.lFoot.rotation.set(0.0784, 0.25, 0.2);
      if (rig.rFoot) rig.rFoot.rotation.set(0.0784, -0.25, -0.2);
      if (rig.lUpperArm) rig.lUpperArm.rotation.set(0.52, 0.42, -0.62);
      if (rig.lForearm) rig.lForearm.rotation.set(-1.9316, -2.6216, 0.2384);
      if (rig.rUpperArm) rig.rUpperArm.rotation.set(0.52, -0.42, 0.62);
      if (rig.rForearm) rig.rForearm.rotation.set(-1.9316, 2.6216, -0.2384);
      if (usesLockedWeapon) {
        if (rig.lHand) rig.lHand.rotation.set(0, 3.1416, 0);
        if (rig.rHand) rig.rHand.rotation.set(0, -3.1416, 0);
        if (rig.weaponGroup) rig.weaponGroup.visible = true;
      } else {
        if (rig.lHand) rig.lHand.rotation.set(0, 0, 0);
        if (rig.rHand) rig.rHand.rotation.set(0, 0, 0);
        if (rig.weaponGroup) rig.weaponGroup.visible = false;
      }
    },
  },
  sample_dive: {
    label: 'Sample Ultimate – Dive',
    fn(s, usesLockedWeapon, usesSideWeapon) {
  setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
  // --- auto-applied pose overrides from /editor.html at 2026-07-04T00:27:00.684Z ---
  if (rig.torso) { rig.torso.rotation.set(0.03, 0, 0); rig.torso.position.set(0, 0.95 * s, 0.1 * s); }
  if (rig.pelvis) { rig.pelvis.rotation.set(-0.12, 0, 0); rig.pelvis.position.set(0, 0.32 * s, 0); }
  if (rig.lUpperArm) rig.lUpperArm.rotation.set(-0.0516, 1.2116, -0.0684);
  if (rig.rUpperArm) rig.rUpperArm.rotation.set(-0.0516, -1.2116, 0.0684);
  if (rig.lForearm) rig.lForearm.rotation.set(-1.2816, -3.1384, 0.3116);
  if (rig.rForearm) rig.rForearm.rotation.set(-1.2816, 3.1384, -0.3116);
  if (rig.lHand) rig.lHand.rotation.set(0, 3.1416, 0);
  if (rig.rHand) rig.rHand.rotation.set(0, -3.1416, 0);
  if (rig.lThigh) rig.lThigh.rotation.set(-0.4651, 0.2697, -1.0403);
  if (rig.rThigh) rig.rThigh.rotation.set(-0.4651, -0.2697, 1.0403);
  if (rig.lCalf) rig.lCalf.rotation.set(0.5453, -0.2418, 2.416);
  if (rig.rCalf) rig.rCalf.rotation.set(0.5453, 0.2418, -2.416);
  if (rig.lFoot) rig.lFoot.rotation.set(0.0398, 0.25, 0.2);
  if (rig.rFoot) rig.rFoot.rotation.set(0.0398, -0.25, -0.2);
  // --- end auto-applied pose ---
},
  },
  dead_stagger: {
    label: 'Dead – Stagger (kneeling collapse)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
  setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
  // --- auto-applied pose overrides from /editor.html at 2026-07-02T04:02:05.819Z ---
  if (rig.torso) { rig.torso.rotation.set(-0.2816, 0.1, 0); rig.torso.position.set(0, 1.2333 * s, -0.0333 * s); }
  if (rig.pelvis) { rig.pelvis.rotation.set(0.2384, 0, 0); rig.pelvis.position.set(0, 0.7583 * s, 0); }
  if (rig.head) rig.head.rotation.set(-0.1616, 0, 0);
  if (rig.lForearm) rig.lForearm.rotation.set(-0.4016, 0, 0);
  if (rig.rForearm) rig.rForearm.rotation.set(0.1984, 0, 0);
  if (rig.lThigh) rig.lThigh.rotation.set(-0.9216, 0, -0.1);
  if (rig.rThigh) rig.rThigh.rotation.set(0.0384, 0, 0.1);
  if (rig.lCalf) rig.lCalf.rotation.set(1.428, 0, 0);
  if (rig.rCalf) rig.rCalf.rotation.set(1.428, 0, 0);
  if (rig.lFoot) rig.lFoot.rotation.set(1.075, -0.4, -0.5216);
  if (rig.rFoot) rig.rFoot.rotation.set(0.1584, 0.4, 0);
  // --- end auto-applied pose ---
},
  },
  dead_forward: {
    label: 'Dead – Layout Forward (lying on face)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      if (rig.torso) { rig.torso.rotation.x = -0.3; rig.torso.position.y = 0; }
      if (rig.pelvis) { rig.pelvis.rotation.x = -0.2; rig.pelvis.position.y = 0; }
      if (rig.lThigh) rig.lThigh.rotation.x = -Math.PI / 2.5;
      if (rig.lCalf) rig.lCalf.rotation.x = Math.PI / 2.2;
      if (rig.rThigh) rig.rThigh.rotation.x = -Math.PI / 2.5;
      if (rig.rCalf) rig.rCalf.rotation.x = Math.PI / 2.2;
      if (rig.mesh) rig.mesh.rotation.x = -Math.PI / 2;
    },
  },
  dead_back: {
    label: 'Dead – Layout Back (lying on back)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      if (rig.torso) { rig.torso.rotation.x = 0.3; rig.torso.position.y = 0; }
      if (rig.pelvis) rig.pelvis.position.y = 0;
      if (rig.lUpperArm) rig.lUpperArm.rotation.z = -0.2;
      if (rig.rUpperArm) rig.rUpperArm.rotation.z = 0.2;
      if (rig.mesh) rig.mesh.rotation.x = Math.PI / 2;
    },
  },
  dead_side: {
    label: 'Dead – Layout Side (lying on side)',
    fn(s, usesLockedWeapon, usesSideWeapon) {
      setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);
      if (rig.torso) { rig.torso.rotation.x = 0.3; rig.torso.position.y = 0; }
      if (rig.pelvis) rig.pelvis.position.y = 0;
      if (rig.lUpperArm) rig.lUpperArm.rotation.z = -0.2;
      if (rig.rUpperArm) rig.rUpperArm.rotation.z = 0.2;
      if (rig.mesh) rig.mesh.rotation.z = Math.PI / 2;
    },
  },
};

let previewAnimId: string | null = null;

// Pose clipboard for copy/paste across *animation entries* (for the *same* loaded model).
// Stores raw hierarchy pos/rot captured from the *current* rig's state after load/tweak.
// IMPORTANT: Cleared automatically in loadCharacter() on Character dropdown / color variant switch.
// Reason: poses are model-specific (see profiles + builders: different scale, arm/neck Y offsets,
// hand/weapon grips (Sample claws \pm~PI + locked weaponGroup), armor children that move with bones,
// builder post-adjusts via adjustPartMeshes/direct sets, foot compensation baselines, etc.).
// Pasting absolute values from model A onto B produces wrong results (or broken locked parts).
// "Paste to sliders" and "Apply to this pose" (which calls generate + source write) always operate
// on the *current* rig/currentType. Re-copy (or re-Load a native ANIM_POSE) after switching.
let copiedPoseData: Record<string, { pos: Vec; rot: Vec }> | null = null;
let copiedPoseFromId: string | null = null;

// Apply a pose and snapshot all touched nodes. Returns a restore function.
function applyAndRestoreAnimPose(animId: string): () => void {
  const pose = ANIM_POSES[animId];
  if (!pose || !rig) return () => {};
  const usesLockedWeapon = false;
  const usesSideWeapon   = false;
  // Snapshot live transforms for restore only.
  const snaps: Array<{ o: THREE.Object3D; p: THREE.Vector3; e: THREE.Euler; c: THREE.Vector3 }> = [];
  for (const key of Object.keys(nodes)) {
    const o = nodes[key];
    snaps.push({ o, p: o.position.clone(), e: o.rotation.clone(), c: o.scale.clone() });
  }
  pose.fn(scale, usesLockedWeapon, usesSideWeapon);
  // Overlay user's editor deltas (state - baseline), not live bone values, so
  // repeated preview/load calls don't accumulate drift.
  for (const key of Object.keys(nodes)) {
    const o = nodes[key];
    const b = baseGroup[key];
    const h = state[key]?.hierarchy;
    if (!h) continue;
    o.rotation.x += h.rot.x - b.rot.x;
    o.rotation.y += h.rot.y - b.rot.y;
    o.rotation.z += h.rot.z - b.rot.z;
    o.position.x += h.pos.x - b.pos.x;
    o.position.y += h.pos.y - b.pos.y;
    o.position.z += h.pos.z - b.pos.z;
    if (b.scl.x !== 0) o.scale.x *= h.scl.x / b.scl.x;
    if (b.scl.y !== 0) o.scale.y *= h.scl.y / b.scl.y;
    if (b.scl.z !== 0) o.scale.z *= h.scl.z / b.scl.z;
  }
  return () => { for (const sn of snaps) { sn.o.position.copy(sn.p); sn.o.rotation.copy(sn.e); sn.o.scale.copy(sn.c); } };
}

// Apply pose and capture the resulting bone transforms into editor state.
// This replaces hierarchy state for all bones and resets part offsets.
function loadAnimPoseToState(animId: string) {
  const pose = ANIM_POSES[animId];
  if (!pose || !rig) return;
  recordStep(() => {
    const usesLockedWeapon = false;
    const usesSideWeapon   = false;
    // Apply the raw animation pose to all bones.
    pose.fn(scale, usesLockedWeapon, usesSideWeapon);
    // Capture resulting bone transforms into state. No delta overlay here —
    // state - baseline would double-up on repeated loads since state already
    // holds animation values after the first load.
    for (const key of Object.keys(nodes)) {
      const n = nodes[key];
      state[key].hierarchy.pos = cloneV(n.position);
      state[key].hierarchy.rot = cloneV(n.rotation);
      state[key].hierarchy.scl = cloneV(n.scale);
      state[key].part = { pos: vec(), rot: vec(), scl: one() };
    }
    // Apply all parts (drives part-mode mesh children, taper, foot compensation).
    for (const key of Object.keys(nodes)) applyPart(key);
    // Re-capture feet after foot compensation has run so state stays in sync.
    for (const fk of ['lFoot', 'rFoot']) {
      if (nodes[fk]) state[fk].hierarchy.rot = cloneV(nodes[fk].rotation);
    }
    refreshRows();
  });
}

// Generate runtime source-style animation code for bones that differ from idle defaults.
function generateAnimExport(): string {
  const usesLockedWeapon = false;
  const usesSideWeapon   = false;

  // Compute idle-default bone values so we can diff against them.
  // Snapshot current state, apply defaults, read values, restore.
  const tmpSnaps: Array<{ key: string; p: THREE.Vector3; e: THREE.Euler; c: THREE.Vector3 }> = [];
  for (const key of Object.keys(nodes)) {
    const o = nodes[key];
    tmpSnaps.push({ key, p: o.position.clone(), e: o.rotation.clone(), c: o.scale.clone() });
  }
  setIdleDefaults(scale, usesLockedWeapon, usesSideWeapon);
  const idleRot: Record<string, { x: number; y: number; z: number }> = {};
  const idlePos: Record<string, { x: number; y: number; z: number }> = {};
  for (const key of Object.keys(nodes)) {
    const o = nodes[key];
    idleRot[key] = cloneV(o.rotation);
    idlePos[key] = cloneV(o.position);
  }
  for (const { key, p, e, c } of tmpSnaps) {
    const o = nodes[key];
    o.position.copy(p); o.rotation.copy(e); o.scale.copy(c);
  }

  const out: string[] = [];
  out.push(`// === VibeEditor keyframe export — paste into runtime source animate() ===`);
  out.push(`// Character: ${WarriorType[currentType] ?? currentType}  |  s = profile.scale = ${scale}`);
  out.push(`// Only bones that differ from idle defaults are listed.`);
  let any = false;

  const eps = 1e-4;
  const fmt3 = (v: number) => { const r = Math.round(v * 10000) / 10000; return Number.isInteger(r) ? String(r) : String(r); };
  const sExprA = (n: number) => { if (Math.abs(n) < eps) return '0'; const v = n / scale; const r = Math.round(v * 10000) / 10000; return `${fmt3(r)} * s`; };

  const boneLabel: Record<string, string> = {
    torso: 'this.torso', pelvis: 'this.pelvis', neck: 'this.neck', head: 'this.head',
    lUpperArm: 'this.lUpperArm', rUpperArm: 'this.rUpperArm',
    lForearm: 'this.lForearm', rForearm: 'this.rForearm',
    lHand: 'this.lHand', rHand: 'this.rHand',
    lThigh: 'this.lThigh', rThigh: 'this.rThigh',
    lCalf: 'this.lCalf', rCalf: 'this.rCalf',
    lFoot: 'this.lFoot', rFoot: 'this.rFoot',
    weaponGroup: 'weaponGroup',
  };

  const ORDER = ['torso','pelvis','neck','head','lUpperArm','rUpperArm','lForearm','rForearm','lHand','rHand','lThigh','rThigh','lCalf','rCalf','lFoot','rFoot','weaponGroup'];
  for (const key of [...ORDER, ...Object.keys(nodes).filter(k => !ORDER.includes(k))]) {
    if (!nodes[key] || !state[key]) continue;
    const cur = state[key].hierarchy;
    const iRot = idleRot[key]; const iPos = idlePos[key];
    if (!iRot || !iPos) continue;
    const label = boneLabel[key] ?? `this.rig.${key}`;
    const lines: string[] = [];
    const rChanged = Math.abs(cur.rot.x - iRot.x) > eps || Math.abs(cur.rot.y - iRot.y) > eps || Math.abs(cur.rot.z - iRot.z) > eps;
    const pChanged = Math.abs(cur.pos.x - iPos.x) > eps || Math.abs(cur.pos.y - iPos.y) > eps || Math.abs(cur.pos.z - iPos.z) > eps;
    if (rChanged) {
      if (key === 'weaponGroup') {
        if (!usesLockedWeapon) lines.push(`this.setWGRot(${fmt3(cur.rot.x)}, ${fmt3(cur.rot.y)}, ${fmt3(cur.rot.z)});`);
        else lines.push(`// weaponGroup locked for Sample — claws follow hands`);
      } else {
        lines.push(`${label}.rotation.set(${fmt3(cur.rot.x)}, ${fmt3(cur.rot.y)}, ${fmt3(cur.rot.z)});`);
      }
    }
    if (pChanged) {
      lines.push(`${label}.position.set(${sExprA(cur.pos.x)}, ${sExprA(cur.pos.y)}, ${sExprA(cur.pos.z)});`);
    }
    if (lines.length) { any = true; out.push(''); out.push(...lines); }
  }
  if (!any) out.push('', '// (no changes from idle — adjust sliders or load a pose first)');
  return out.join('\n');
}

// -----------------------------------------------------------------------------
// Pose apply / copy / paste helpers (for auto-updating ANIM_POSES definitions).
// These let you tweak a loaded pose then persist the numbers back into the
// editor's preview poses (and transfer shapes between poses). Changes write
// via /__editor-apply (kind anim-pose) with undo support via backups.
// -----------------------------------------------------------------------------

function capturePoseData(): Record<string, { pos: Vec; rot: Vec }> {
  const out: Record<string, { pos: Vec; rot: Vec }> = {};
  for (const key of Object.keys(nodes)) {
    if (state[key]) {
      out[key] = { pos: cloneV(state[key].hierarchy.pos), rot: cloneV(state[key].hierarchy.rot) };
    }
  }
  return out;
}

function pastePoseDataToState(data: Record<string, { pos: Vec; rot: Vec }>) {
  recordStep(() => {
    for (const key of Object.keys(data)) {
      const n = nodes[key];
      if (!n || !state[key]) continue;
      const v = data[key];
      n.position.set(v.pos.x, v.pos.y, v.pos.z);
      n.rotation.set(v.rot.x, v.rot.y, v.rot.z);
      state[key].hierarchy.pos = cloneV(v.pos);
      state[key].hierarchy.rot = cloneV(v.rot);
      state[key].part = { pos: vec(), rot: vec(), scl: one() };
    }
    for (const key of Object.keys(nodes)) applyPart(key);
    for (const fk of ['lFoot', 'rFoot']) {
      if (nodes[fk]) state[fk].hierarchy.rot = cloneV(nodes[fk].rotation);
    }
    refreshRows();
  });
}

// Compute a set of "if (rig.xxx) ..." statements that, when placed after setIdleDefaults
// inside an ANIM_POSES fn, will reproduce the current edited state (diff vs idle).
function generatePoseOverrideLines(): string[] {
  const usesLockedWeapon = false;
  const usesSideWeapon   = false;

  // Snapshot current, force idle, capture idles, restore.
  const tmpSnaps: Array<{ key: string; p: THREE.Vector3; e: THREE.Euler; c: THREE.Vector3 }> = [];
  for (const key of Object.keys(nodes)) {
    const o = nodes[key];
    tmpSnaps.push({ key, p: o.position.clone(), e: o.rotation.clone(), c: o.scale.clone() });
  }
  setIdleDefaults(scale, usesLockedWeapon, usesSideWeapon);
  const idleRot: Record<string, { x: number; y: number; z: number }> = {};
  const idlePos: Record<string, { x: number; y: number; z: number }> = {};
  for (const key of Object.keys(nodes)) {
    const o = nodes[key];
    idleRot[key] = cloneV(o.rotation);
    idlePos[key] = cloneV(o.position);
  }
  for (const { key, p, e, c } of tmpSnaps) {
    const o = nodes[key];
    o.position.copy(p); o.rotation.copy(e); o.scale.copy(c);
  }

  const out: string[] = [];
  const eps = 1e-4;
  const fmt3 = (v: number) => { const r = Math.round(v * 10000) / 10000; return Number.isInteger(r) ? String(r) : String(r); };
  const sExprA = (n: number) => { if (Math.abs(n) < eps) return '0'; const v = n / scale; const r = Math.round(v * 10000) / 10000; return `${fmt3(r)} * s`; };

  const ORDER = ['torso','pelvis','neck','head','lUpperArm','rUpperArm','lForearm','rForearm','lHand','rHand','lThigh','rThigh','lCalf','rCalf','lFoot','rFoot','weaponGroup'];
  for (const key of [...ORDER, ...Object.keys(nodes).filter(k => !ORDER.includes(k))]) {
    if (!nodes[key] || !state[key]) continue;
    const cur = state[key].hierarchy;
    const iRot = idleRot[key]; const iPos = idlePos[key];
    if (!iRot || !iPos) continue;
    const rChanged = Math.abs(cur.rot.x - iRot.x) > eps || Math.abs(cur.rot.y - iRot.y) > eps || Math.abs(cur.rot.z - iRot.z) > eps;
    const pChanged = Math.abs(cur.pos.x - iPos.x) > eps || Math.abs(cur.pos.y - iPos.y) > eps || Math.abs(cur.pos.z - iPos.z) > eps;
    if (!rChanged && !pChanged) continue;

    if (key === 'weaponGroup') {
      if (rChanged) {
        out.push(`if (rig.weaponGroup && !usesLockedWeapon) rig.weaponGroup.rotation.set(${fmt3(cur.rot.x)}, ${fmt3(cur.rot.y)}, ${fmt3(cur.rot.z)});`);
      }
      if (pChanged) {
        out.push(`if (rig.weaponGroup) rig.weaponGroup.position.set(${sExprA(cur.pos.x)}, ${sExprA(cur.pos.y)}, ${sExprA(cur.pos.z)});`);
      }
      continue;
    }
    if (rChanged && pChanged) {
      out.push(`if (rig.${key}) { rig.${key}.rotation.set(${fmt3(cur.rot.x)}, ${fmt3(cur.rot.y)}, ${fmt3(cur.rot.z)}); rig.${key}.position.set(${sExprA(cur.pos.x)}, ${sExprA(cur.pos.y)}, ${sExprA(cur.pos.z)}); }`);
    } else if (rChanged) {
      out.push(`if (rig.${key}) rig.${key}.rotation.set(${fmt3(cur.rot.x)}, ${fmt3(cur.rot.y)}, ${fmt3(cur.rot.z)});`);
    } else if (pChanged) {
      out.push(`if (rig.${key}) rig.${key}.position.set(${sExprA(cur.pos.x)}, ${sExprA(cur.pos.y)}, ${sExprA(cur.pos.z)});`);
    }
  }
  return out;
}

async function applyCurrentPoseToSource(targetId?: string) {
  const id = targetId || (document.getElementById('animSel') as HTMLSelectElement | null)?.value || '';
  if (!id || !ANIM_POSES[id]) {
    showToast('Select a valid animation pose first.');
    return;
  }
  const lines = generatePoseOverrideLines();
  if (lines.length === 0) {
    showToast('No pose changes from idle — tweak something or load a non-idle pose first.');
    return;
  }
  const generatedCode = lines.join('\n');

  const autoChk = document.getElementById('autoApply') as HTMLInputElement | null;
  const doAuto = !!(autoChk && autoChk.checked);

  if (!doAuto) {
    // Manual path: prepare snippet in the export area for copy/paste into editor.ts
    const area = document.getElementById('animExport') as HTMLTextAreaElement | null;
    if (area) {
      area.value = `// Paste/replace inside ANIM_POSES['${id}'] — fn body (after keeping label):\nfn(s, usesLockedWeapon, usesSideWeapon) {\n  setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);\n${generatedCode.split('\n').map(l => '  ' + l).join('\n')}\n}`;
    }
    showToast('Auto-apply off: snippet in textarea. Manually insert into src/editor.ts (or check the box and retry).');
    return;
  }

  try {
    const res = await fetch('/__editor-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'anim-pose', animId: id, generatedCode })
    });
    const json = await res.json().catch(() => ({}));
    if (json && json.ok) {
      showToast(`Pose '${id}' applied to source. ${json.message || ''}`);
      // Note: in-memory ANIM_POSES is stale; reload page to have Load/Preview use the new numbers from disk.
    } else {
      showToast('Pose apply failed: ' + (json?.message || 'see console'));
      console.warn('[editor] anim-pose apply error', json);
    }
  } catch (e: any) {
    console.error('[editor] anim-pose apply network error', e);
    const area = document.getElementById('animExport') as HTMLTextAreaElement | null;
    if (area) {
      area.value = `// Manual fallback — insert into ANIM_POSES['${id}']:\nfn(s, usesLockedWeapon, usesSideWeapon) {\n  setIdleDefaults(s, usesLockedWeapon, usesSideWeapon);\n${generatedCode.split('\n').map(l => '  ' + l).join('\n')}\n}`;
    }
    showToast('Network/server error during pose apply (snippet in textarea for manual use).');
  }
}

async function undoLastPoseApply() {
  const sel = document.getElementById('animSel') as HTMLSelectElement | null;
  const id = sel?.value || '';
  if (!id) {
    showToast('Select a pose to undo.');
    return;
  }
  try {
    const res = await fetch('/__editor-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'anim-pose-revert', animId: id })
    });
    const json = await res.json().catch(() => ({}));
    if (json && json.ok) {
      showToast(`Undo successful for '${id}'. ${json.message || ''} — reload /editor.html to see restored values.`);
    } else {
      showToast('Undo failed: ' + (json?.message || 'no matching backup or entry not found. Backups are last-anim-pose-*.txt in project root.'));
    }
  } catch (e: any) {
    console.error(e);
    showToast('Undo request failed (network?). Backups remain on disk as last-anim-pose-*.txt; restore manually if needed.');
  }
}

function updatePoseCopyPasteUI() {
  const has = !!copiedPoseData;
  const pasteBtn = document.getElementById('pastePoseBtn') as HTMLButtonElement | null;
  const pasteOthers = document.getElementById('pastePoseToOthersBtn') as HTMLButtonElement | null;
  if (pasteBtn) pasteBtn.disabled = !has;
  if (pasteOthers) {
    pasteOthers.disabled = !has;
    if (has && copiedPoseFromId) {
      pasteOthers.textContent = `Paste from ${copiedPoseFromId}`;
    } else {
      pasteOthers.textContent = 'Paste to this (apply)';
    }
  }
}

// -----------------------------------------------------------------------------
// Wire up controls
// -----------------------------------------------------------------------------
buildRows('posRows', 'pos');
buildRows('rotRows', 'rot');
buildRows('sclRows', 'scl');
buildTaperRows();

for (const [id, ch] of [['lockPos', 'pos'], ['lockRot', 'rot'], ['lockScl', 'scl']] as const) {
  const btn = document.getElementById(id) as HTMLButtonElement;
  btn.addEventListener('click', () => {
    axisLocked[ch] = !axisLocked[ch];
    btn.textContent = axisLocked[ch] ? '🔒' : '🔓';
    btn.classList.toggle('locked', axisLocked[ch]);
  });
}

// -----------------------------------------------------------------------------
// Lighting tab
// -----------------------------------------------------------------------------
// Persisted env intensity so toggling off/on round-trips the value.
let _envIntensityMemo = scene.environmentIntensity;
let _envTexture = scene.environment;

// ── Game Lighting Preview ────────────────────────────────────────────────────
// Lets you swap the flat studio 3-point setup for a real level's actual
// lighting (built via EnvironmentManager, same code the game uses) and drop
// two fighters at their real match start positions, so you can see how the
// model you're editing actually reads under runtime light. Per-light sliders
// are generated dynamically from whatever lights that level happens to add.
const LEVEL_START_POS: Record<number, { x: number; z: number }> = {
  0: { x: 5.0, z: 0 }, 1: { x: 6.5, z: 0 }, 2: { x: 5.5, z: 0 }, 3: { x: 3.2, z: 4.8 },
  4: { x: 5.5, z: 0 }, 5: { x: 5.5, z: 0 }, 6: { x: 5.5, z: 0 }, 7: { x: 6.5, z: 0 },
  8: { x: 6.5, z: 0 }, 9: { x: 6.5, z: 0 }, 10: { x: 6.0, z: 0 }, 11: { x: 6.5, z: 0 },
  12: { x: 5.5, z: 0 }, 13: { x: 5.5, z: 0 },
};
const DEFAULT_START_POS = { x: 6.5, z: 0 };

let gameLightEnvMgr: EnvironmentManager | null = null;
let gameLightOn = false;
let gameLightLevel = 0;
let gameLightOpponent: CharacterRig | null = null;
let _preGameLightAmbientOn = true;
let _preGameLightKeyOn = true;
let _preGameLightFillOn = true;

function disposeRig(r: CharacterRig) {
  scene.remove(r.mesh);
  r.mesh.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
}

function collectGameLights(): THREE.Light[] {
  if (!gameLightEnvMgr) return [];
  const group = (gameLightEnvMgr as any).environmentGroup as THREE.Group;
  const lights: THREE.Light[] = [];
  group.traverse(o => { if (o instanceof THREE.Light) lights.push(o); });
  return lights;
}

function applyGameLightingPreview(on: boolean) {
  gameLightOn = on;
  if (on) {
    _preGameLightAmbientOn = ambient.visible;
    _preGameLightKeyOn = key.visible;
    _preGameLightFillOn = fill.visible;
    ambient.visible = false;
    key.visible = false;
    fill.visible = false;

    if (!gameLightEnvMgr) gameLightEnvMgr = new EnvironmentManager(scene);
    gameLightEnvMgr.buildEnvironment(gameLightLevel);

    const start = LEVEL_START_POS[gameLightLevel] ?? DEFAULT_START_POS;
    rig.mesh.position.set(-start.x, 0, start.z);
    rig.mesh.rotation.y = Math.PI / 2;
    if (!gameLightOpponent) gameLightOpponent = CharacterBuilder.build(currentType, scene, currentColorVariant === 2 ? 0 : 2);
    gameLightOpponent.mesh.position.set(start.x, 0, start.z);
    gameLightOpponent.mesh.rotation.y = -Math.PI / 2;
  } else {
    gameLightEnvMgr?.clearEnvironment();
    if (gameLightOpponent) { disposeRig(gameLightOpponent); gameLightOpponent = null; }
    rig.mesh.position.set(0, 0, 0);
    rig.mesh.rotation.y = 0;
    ambient.visible = _preGameLightAmbientOn;
    key.visible = _preGameLightKeyOn;
    fill.visible = _preGameLightFillOn;
  }
  buildLightingPanel();
}

function buildLightingPanel() {
  const panel = document.getElementById('lightingPanel')!;
  panel.innerHTML = '';

  // Returns the controls container (separate from the header so we can dim it).
  const makeGroup = (title: string, isOn: boolean, onToggle: (on: boolean) => void): HTMLElement => {
    const g = document.createElement('div'); g.className = 'group';
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;margin-bottom:4px';
    const t = document.createElement('div'); t.className = 'title'; t.textContent = title;
    const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = isOn;
    chk.style.cssText = 'accent-color:#f0c987;width:14px;height:14px;cursor:pointer;flex-shrink:0';
    header.append(t, chk);
    const body = document.createElement('div');
    const setDim = (on: boolean) => { body.style.opacity = on ? '' : '0.35'; body.style.pointerEvents = on ? '' : 'none'; };
    setDim(isOn);
    chk.addEventListener('change', () => { onToggle(chk.checked); setDim(chk.checked); });
    g.append(header, body); panel.append(g); return body;
  };

  const makeSlider = (
    container: HTMLElement, label: string,
    min: number, max: number, step: number, value: number,
    onChange: (v: number) => void
  ) => {
    const row = document.createElement('div'); row.className = 'light-row';
    const lbl = document.createElement('span'); lbl.textContent = label;
    const range = document.createElement('input'); range.type = 'range';
    range.min = String(min); range.max = String(max); range.step = String(step); range.value = String(value);
    const fmt = (v: number) => String(Math.round(v * 1000) / 1000);
    const num = document.createElement('input'); num.type = 'text'; num.inputMode = 'decimal'; num.className = 'num';
    num.value = fmt(value);
    row.append(lbl, range, num); container.append(row);
    range.addEventListener('input', () => { const v = parseFloat(range.value); num.value = fmt(v); onChange(v); });
    num.addEventListener('input', () => { const v = parseFloat(num.value); if (!isNaN(v)) { range.value = String(Math.min(max, Math.max(min, v))); onChange(v); } });
    num.addEventListener('keydown', e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const v = parseFloat(num.value) || 0;
      const delta = (e.key === 'ArrowUp' ? 1 : -1) * step;
      const next = Math.round(Math.min(max, Math.max(min, v + delta)) * 10000) / 10000;
      num.value = fmt(next); range.value = String(next); onChange(next);
    });
  };

  const makeColor = (container: HTMLElement, label: string, color: THREE.Color, onChange: (c: THREE.Color) => void) => {
    const row = document.createElement('div'); row.className = 'color-row';
    const lbl = document.createElement('span'); lbl.textContent = label;
    const inp = document.createElement('input'); inp.type = 'color'; inp.value = '#' + color.getHexString();
    row.append(lbl, inp); container.append(row);
    inp.addEventListener('input', () => onChange(new THREE.Color(inp.value)));
  };

  const getChk = () => panel.lastElementChild!.querySelector<HTMLInputElement>('input[type=checkbox]')!;
  const syncChk = (chk: HTMLInputElement, on: boolean, toggle: (on: boolean) => void) => {
    if (chk.checked !== on) { chk.checked = on; toggle(on); }
  };

  const envToggle = (on: boolean) => {
    if (on) { scene.environment = _envTexture; scene.environmentIntensity = _envIntensityMemo; }
    else { _envIntensityMemo = scene.environmentIntensity || _envIntensityMemo; scene.environment = null; }
  };
  const envB = makeGroup('Environment (IBL)', scene.environment !== null, envToggle);
  const envChk = getChk();
  makeSlider(envB, 'Intensity', 0, 1, 0.1, scene.environment ? scene.environmentIntensity : _envIntensityMemo, v => {
    _envIntensityMemo = v > 0 ? v : _envIntensityMemo;
    scene.environmentIntensity = v;
    syncChk(envChk, v > 0, envToggle);
  });

  const ambToggle = (on: boolean) => { ambient.visible = on; };
  const ambB = makeGroup('Ambient', ambient.visible, ambToggle);
  const ambChk = getChk();
  makeSlider(ambB, 'Intensity', 0, 1, 0.1, ambient.intensity, v => {
    ambient.intensity = v; syncChk(ambChk, v > 0, ambToggle);
  });
  makeColor(ambB, 'Color', ambient.color, c => { ambient.color.copy(c); });

  const keyToggle = (on: boolean) => { key.visible = on; };
  const keyB = makeGroup('Key Light  (white · upper-right)', key.visible, keyToggle);
  const keyChk = getChk();
  makeSlider(keyB, 'Intensity', 0, 5, 0.01, key.intensity, v => {
    key.intensity = v; syncChk(keyChk, v > 0, keyToggle);
  });
  makeColor(keyB, 'Color', key.color, c => { key.color.copy(c); });
  makeSlider(keyB, 'Pos X', -10, 10, 0.1, key.position.x, v => { key.position.x = v; });
  makeSlider(keyB, 'Pos Y', 0, 20, 0.1, key.position.y, v => { key.position.y = v; });
  makeSlider(keyB, 'Pos Z', -10, 10, 0.1, key.position.z, v => { key.position.z = v; });

  const fillToggle = (on: boolean) => { fill.visible = on; };
  const fillB = makeGroup('Fill Light  (blue · upper-left)', fill.visible, fillToggle);
  const fillChk = getChk();
  makeSlider(fillB, 'Intensity', 0, 3, 0.01, fill.intensity, v => {
    fill.intensity = v; syncChk(fillChk, v > 0, fillToggle);
  });
  makeColor(fillB, 'Color', fill.color, c => { fill.color.copy(c); });
  makeSlider(fillB, 'Pos X', -10, 10, 0.1, fill.position.x, v => { fill.position.x = v; });
  makeSlider(fillB, 'Pos Y', 0, 20, 0.1, fill.position.y, v => { fill.position.y = v; });
  makeSlider(fillB, 'Pos Z', -10, 10, 0.1, fill.position.z, v => { fill.position.z = v; });

  // ── Game Lighting Preview ──
  const gameB = makeGroup('Game Lighting Preview', gameLightOn, on => applyGameLightingPreview(on));
  const gameChk = getChk();
  void gameChk;

  const selRow = document.createElement('div'); selRow.className = 'light-row';
  const selLbl = document.createElement('span'); selLbl.textContent = 'Level';
  const levelSel = document.createElement('select');
  LEVELS.forEach((lvl, i) => {
    const opt = document.createElement('option');
    opt.value = String(i); opt.textContent = `${i}: ${lvl.name}`;
    levelSel.append(opt);
  });
  levelSel.value = String(gameLightLevel);
  levelSel.addEventListener('change', () => {
    gameLightLevel = parseInt(levelSel.value, 10);
    if (gameLightOn) applyGameLightingPreview(true);
  });
  selRow.append(selLbl, levelSel); gameB.append(selRow);

  if (gameLightOn) {
    const lights = collectGameLights();
    const counts: Record<string, number> = {};
    for (const lt of lights) {
      const n = counts[lt.type] = (counts[lt.type] ?? 0) + 1;
      const label = `${lt.type} #${n}`;
      makeSlider(gameB, `${label} Int`, 0, Math.max(5, lt.intensity * 1.5), 0.01, lt.intensity, v => { lt.intensity = v; });
      makeColor(gameB, `${label} Color`, lt.color, c => { lt.color.copy(c); });
      if (!(lt instanceof THREE.AmbientLight) && !(lt instanceof THREE.HemisphereLight)) {
        makeSlider(gameB, `${label} X`, -80, 80, 0.5, lt.position.x, v => { lt.position.x = v; });
        makeSlider(gameB, `${label} Y`, -20, 80, 0.5, lt.position.y, v => { lt.position.y = v; });
        makeSlider(gameB, `${label} Z`, -80, 80, 0.5, lt.position.z, v => { lt.position.z = v; });
      }
    }
  }
}

// Tab switching
type EditorTab = 'model' | 'lighting' | 'level';
let activeTab: EditorTab = 'model';

function switchTab(tab: EditorTab) {
  const wasLevel = activeTab === 'level';
  activeTab = tab;
  document.getElementById('modelPanel')!.style.display = tab === 'model' ? '' : 'none';
  document.getElementById('lightingPanel')!.style.display = tab === 'lighting' ? '' : 'none';
  document.getElementById('levelPanel')!.style.display = tab === 'level' ? '' : 'none';
  document.getElementById('tabModel')!.classList.toggle('active', tab === 'model');
  document.getElementById('tabLight')!.classList.toggle('active', tab === 'lighting');
  document.getElementById('tabLevel')!.classList.toggle('active', tab === 'level');
  if (tab === 'lighting') buildLightingPanel();
  if (tab === 'level') lvlEnter();
  else if (wasLevel) lvlLeave();
}

document.getElementById('tabModel')!.addEventListener('click', () => switchTab('model'));
document.getElementById('tabLight')!.addEventListener('click', () => switchTab('lighting'));
document.getElementById('tabLevel')!.addEventListener('click', () => switchTab('level'));

// Character dropdown — public sample roster.
const SAMPLE_WARRIORS: Array<{ type: number; label: string }> = [
  { type: 99, label: 'BASE MODEL' },
  { type: WarriorType.RUSTY, label: 'RANDROID / RUSTY' },
  { type: WarriorType.KNIGHT, label: 'KNIGHT' },
  { type: WarriorType.SAMURAI, label: 'SAMURAI' },
  { type: WarriorType.PIRATE, label: 'PIRATE' },
];
for (const sample of SAMPLE_WARRIORS) {
  const opt = document.createElement('option');
  opt.value = String(sample.type);
  opt.textContent = sample.label;
  charSel.append(opt);
}
charSel.value = String(WarriorType.RUSTY);
charSel.addEventListener('change', () => {
  loadCharacter(Number(charSel.value) as WarriorType);
  // Clear stale builder + pose runtime check when switching warriors (poses + model deltas are per-character)
  if (builderSrcEl) { builderSrcEl.style.display = 'none'; builderSrcEl.value = ''; }
  if (builderCheckInfo) builderCheckInfo.textContent = '';
  if (ingamePoseSrcEl) ingamePoseSrcEl.value = '';
  lastIngameSnippet = '';
  if (importIngameBtn) importIngameBtn.disabled = true;
});

// Color variant dropdown
const colorVariantSel = document.getElementById('colorVariant') as HTMLSelectElement;
colorVariantSel.addEventListener('change', () => {
  currentColorVariant = Number(colorVariantSel.value);
  loadCharacter(currentType);
});

partSel.addEventListener('change', () => selectPart(partSel.value));
hierChk.addEventListener('change', refreshRows);
document.getElementById('resetPart')!.addEventListener('click', () => recordStep(() => resetPart(partSel.value)));
document.getElementById('resetAll')!.addEventListener('click', () => recordStep(() => Object.keys(nodes).forEach(resetPart)));
document.getElementById('dupPart')!.addEventListener('click', () => charDuplicatePart());
// Idle-pose preview: poses the rig in the runtime standing idle stance (the
// same one used on the character-select previews) plus the breathing cycle,
// WITHOUT persisting to the edited transforms — every joint it touches is
// snapshotted and restored right after the render, so exports stay clean.
let breathing = false;
const breatheBtn = document.getElementById('breathe')!;
breatheBtn.addEventListener('click', () => {
  breathing = !breathing;
  breatheBtn.classList.toggle('active', breathing);
  if (breathing) {
    // Mutually exclusive with anim preview — clear it when breathe is activated.
    previewAnimId = null;
    document.getElementById('previewAnim')?.classList.remove('active');
  }
});

// Mirrors Player.update's idle stance (base rest pose + idle sway + breathing +
// foot compensation). Returns a restore() to undo it after the render.
function applyIdlePose(): () => void {
  const s = scale;
  const time = performance.now() * 0.01;                 // same clock scale as Player
  const usesLockedWeapon = false;
  const armYOffset = (rig.profile as any).armYOffset ?? 0.04;
  const neckYOffset = (rig.profile as any).neckYOffset ?? (baseGroup['neck'] ? baseGroup['neck'].pos.y / s - 0.20 : 0.28);

  const snaps: Array<{ o: THREE.Object3D; p: THREE.Vector3; e: THREE.Euler; c: THREE.Vector3 }> = [];
  const snap = <T extends THREE.Object3D | undefined>(o: T): T => {
    if (o) snaps.push({ o, p: o.position.clone(), e: o.rotation.clone(), c: o.scale.clone() });
    return o;
  };
  const torso = snap(rig.torso), pelvis = snap(rig.pelvis), neck = snap(rig.neck), head = snap(rig.head);
  const lUp = snap(rig.lUpperArm), rUp = snap(rig.rUpperArm), lFa = snap(rig.lForearm), rFa = snap(rig.rForearm);
  const lHand = snap(rig.lHand), rHand = snap(rig.rHand);
  const lThigh = snap(rig.lThigh), lCalf = snap(rig.lCalf), lFoot = snap(rig.lFoot);
  const rThigh = snap(rig.rThigh), rCalf = snap(rig.rCalf), rFoot = snap(rig.rFoot);
  const wg = snap(rig.weaponGroup);

  // --- base rest pose (Player.update GLOBAL DEFAULTS) ---
  // Torso x/z and scale.z use the builder baseline so character-editor offsets survive.
  const torsoBase = baseGroup['torso'];
  const lArmBaseY = baseGroup['lUpperArm']?.pos.y ?? 0;
  const rArmBaseY = baseGroup['rUpperArm']?.pos.y ?? 0;
  if (torso) { torso.position.set(torsoBase?.pos.x ?? 0, 1.85 * s, torsoBase?.pos.z ?? 0); torso.rotation.set(0.1, 0.1, 0); torso.scale.z = torsoBase?.scl.z ?? 1; }
  if (pelvis) { pelvis.position.set(0, 1.35 * s, 0); pelvis.rotation.set(0, 0, 0); }
  if (lUp) { lUp.position.y = lArmBaseY + armYOffset * s; lUp.rotation.set(0.2, 0, -0.3); }
  if (rUp) { rUp.position.y = rArmBaseY + armYOffset * s; rUp.rotation.set(0.3, 0, 0.2); }
  if (neck) neck.position.y = neckYOffset * s;
  if (head) head.rotation.set(0, 0, 0);
  if (lFa) lFa.rotation.set(-0.4, 0, 0);
  if (rFa) rFa.rotation.set(-0.5, 0, 0);
  // Sample's hands use ~±PI (claws forward), not ±PI/2 (sword grip).
  // Fall back to builder baseline so his claw orientation is preserved.
  if (lHand) lHand.rotation.set(0, usesLockedWeapon ? (baseGroup['lHand']?.rot.y ?? Math.PI) : Math.PI / 2, 0);
  if (rHand) rHand.rotation.set(0, usesLockedWeapon ? (baseGroup['rHand']?.rot.y ?? -Math.PI) : -Math.PI / 2, 0);
  if (lThigh) lThigh.rotation.set(-0.1, 0, -0.1);
  if (lCalf) lCalf.rotation.set(0.1, 0, 0);
  if (lFoot) lFoot.rotation.y = -0.4;
  if (rThigh) rThigh.rotation.set(-0.1, 0, 0.1);
  if (rCalf) rCalf.rotation.set(0.1, 0, 0);
  if (rFoot) rFoot.rotation.y = 0.4;
  // Sample: claw weaponGroup uses (PI,0,0) not the sword-grip (PI,0,-PI/2).
  if (wg) wg.rotation.set(
    usesLockedWeapon ? (baseGroup['weaponGroup']?.rot.x ?? Math.PI) : (false ? Math.PI / 2 : Math.PI),
    usesLockedWeapon ? (baseGroup['weaponGroup']?.rot.y ?? 0) : 0,
    usesLockedWeapon ? (baseGroup['weaponGroup']?.rot.z ?? 0) : -Math.PI / 2
  );

  // --- idle sway (additive) ---
  const sway = Math.sin(time * 0.55), sway2 = Math.sin(time * 0.37 + 1.7);
  if (torso) { torso.rotation.y += sway * 0.025; torso.rotation.x += 0.06 + sway2 * 0.012; }
  if (pelvis) pelvis.rotation.y += sway * 0.015;
  if (lUp) lUp.rotation.x += -0.25 + sway * 0.025;
  if (lFa) lFa.rotation.x += -0.45;
  if (rUp) rUp.rotation.x += -0.08 + sway2 * 0.02;
  if (rFa) rFa.rotation.x += -0.15;
  if (lThigh) lThigh.rotation.x += -0.12;
  if (lCalf) lCalf.rotation.x += 0.18;
  if (rThigh) rThigh.rotation.x += 0.05;

  // --- breathing (additive) ---
  const breath = Math.sin(time * 0.5), bv = breath * 0.03 * s;
  if (torso) torso.scale.z = (torsoBase?.scl.z ?? 1) * (1.0 + breath * 0.03);
  if (lUp) lUp.position.y += bv * 0.5;
  if (rUp) rUp.position.y += bv * 0.5;
  if (neck) neck.position.y += bv * 0.2;
  if (pelvis) pelvis.position.y -= bv * 0.2;

  // --- composite editor hierarchy deltas on top of the idle pose ---
  // The idle pose applies absolute values; we then add the delta between the
  // user's edited state (snapped before the pose ran) and the builder baseline,
  // so hierarchy edits remain visible in the breathing preview.
  for (const { o, p, e, c } of snaps) {
    const key = Object.keys(nodes).find(k => nodes[k] === o);
    if (!key) continue;
    const b = baseGroup[key];
    o.rotation.x += e.x - b.rot.x;
    o.rotation.y += e.y - b.rot.y;
    o.rotation.z += e.z - b.rot.z;
    o.position.x += p.x - b.pos.x;
    o.position.y += p.y - b.pos.y;
    o.position.z += p.z - b.pos.z;
    if (b.scl.x !== 0) o.scale.x *= c.x / b.scl.x;
    if (b.scl.y !== 0) o.scale.y *= c.y / b.scl.y;
    if (b.scl.z !== 0) o.scale.z *= c.z / b.scl.z;
  }

  // --- foot compensation (keep soles flat, using final edited rotations) ---
  if (lFoot && lThigh && lCalf && pelvis) lFoot.rotation.x = -(lThigh.rotation.x + lCalf.rotation.x + pelvis.rotation.x);
  if (rFoot && rThigh && rCalf && pelvis) rFoot.rotation.x = -(rThigh.rotation.x + rCalf.rotation.x + pelvis.rotation.x);

  return () => { for (const sn of snaps) { sn.o.position.copy(sn.p); sn.o.rotation.copy(sn.e); sn.o.scale.copy(sn.c); } };
}

document.getElementById('genExport')!.addEventListener('click', async () => {
  const code = generateExport();
  exportEl.value = code;
  await tryAutoApply('character', code);
});
document.getElementById('copyExport')!.addEventListener('click', () => {
  if (!exportEl.value) exportEl.value = generateExport();
  navigator.clipboard.writeText(exportEl.value);
});

async function tryAutoApply(kind: string, generatedCode: string) {
  const chk = document.getElementById('autoApply') as HTMLInputElement | null;
  if (!chk || !chk.checked) return;
  try {
    const payload: any = { kind, generatedCode };
    if (kind === 'character' || kind === 'char') {
      payload.warrior = WarriorType[currentType] ?? String(currentType);
      payload.colorVariant = currentColorVariant;
    }
    if (kind === 'level' || kind === 'lvl') {
      payload.index = lvlCurrentIndex;
    }
    const res = await fetch('/__editor-apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    const msg = json?.message || (json?.ok ? 'Applied.' : 'Apply failed.');
    showToast(msg);
    if (json?.target) console.log('[editor] auto-apply target:', json.target);
  } catch (e: any) {
    showToast('Auto-apply error (is dev server running the latest vite.config?): ' + (e?.message || e));
    console.warn('[editor] auto-apply failed', e);
  }
}

// Keyframe panel wiring
const animSel = document.getElementById('animSel') as HTMLSelectElement;
for (const [id, pose] of Object.entries(ANIM_POSES)) {
  const opt = document.createElement('option');
  opt.value = id; opt.textContent = pose.label;
  animSel.append(opt);
}

const previewAnimBtn = document.getElementById('previewAnim')!;
previewAnimBtn.addEventListener('click', () => {
  const id = animSel.value;
  if (previewAnimId === id) {
    previewAnimId = null;
    previewAnimBtn.classList.remove('active');
    breathing = false;
    breatheBtn.classList.remove('active');
  } else {
    previewAnimId = id;
    previewAnimBtn.classList.add('active');
    breathing = false; // mutually exclusive with idle breathe
    breatheBtn.classList.remove('active');
  }
});
animSel.addEventListener('change', () => {
  if (previewAnimId !== null) {
    previewAnimId = animSel.value;
  }
  updatePoseCopyPasteUI(); // refresh "paste from XXX" label for current selection
});

document.getElementById('loadPose')!.addEventListener('click', () => {
  loadAnimPoseToState(animSel.value);
  // Turn off preview modes after loading so sliders reflect static state.
  previewAnimId = null; previewAnimBtn.classList.remove('active');
  breathing = false; breatheBtn.classList.remove('active');
});

const animExportEl = document.getElementById('animExport') as HTMLTextAreaElement;
document.getElementById('genAnimExport')!.addEventListener('click', async () => { 
  const code = generateAnimExport(); 
  animExportEl.value = code; 
  await tryAutoApply('anim', code); 
});

// -----------------------------------------------------------------------------
// Wire new pose source apply / copy-paste-to-others controls (must have undo).
// -----------------------------------------------------------------------------
const applyPoseBtn = document.getElementById('applyPoseBtn') as HTMLButtonElement | null;
const undoPoseBtn = document.getElementById('undoPoseBtn') as HTMLButtonElement | null;
const copyPoseBtn = document.getElementById('copyPoseBtn') as HTMLButtonElement | null;
const pastePoseBtn = document.getElementById('pastePoseBtn') as HTMLButtonElement | null;
const pastePoseToOthersBtn = document.getElementById('pastePoseToOthersBtn') as HTMLButtonElement | null;

if (copyPoseBtn) copyPoseBtn.addEventListener('click', () => {
  copiedPoseData = capturePoseData();
  copiedPoseFromId = animSel.value;
  updatePoseCopyPasteUI();
  const modelName = WarriorType[currentType] ?? String(currentType);
  showToast(`Copied pose from "${copiedPoseFromId}" (on ${modelName})`);
});

if (pastePoseBtn) pastePoseBtn.addEventListener('click', () => {
  if (copiedPoseData) {
    pastePoseDataToState(copiedPoseData);
    showToast('Pasted pose values into current sliders/state');
  }
});

if (pastePoseToOthersBtn) pastePoseToOthersBtn.addEventListener('click', async () => {
  if (!copiedPoseData) return;
  // Apply the copied values to live state first (so generatePoseOverrideLines sees them)
  pastePoseDataToState(copiedPoseData);
  // Then persist to whatever is *currently selected* (allows "paste to others")
  await applyCurrentPoseToSource(animSel.value);
  updatePoseCopyPasteUI();
});

if (applyPoseBtn) applyPoseBtn.addEventListener('click', async () => {
  await applyCurrentPoseToSource();
  updatePoseCopyPasteUI();
});

if (undoPoseBtn) undoPoseBtn.addEventListener('click', async () => {
  await undoLastPoseApply();
  updatePoseCopyPasteUI();
});

// Initial state for paste buttons
updatePoseCopyPasteUI();

// -----------------------------------------------------------------------------
// Runtime cross-check (poses + models): fetch live snippets from dev server
// so on editor launch (and pose/character changes) you can confirm the editor
// ANIM_POSES / model deltas match the current authoritative runtime sources.
// This directly addresses drift between editor updates and runtime source / builders.
// -----------------------------------------------------------------------------
const ingamePoseSrcEl = document.getElementById('ingamePoseSrc') as HTMLTextAreaElement | null;
const checkIngameBtn = document.getElementById('checkIngamePoseBtn') as HTMLButtonElement | null;
const importIngameBtn = document.getElementById('importIngameBtn') as HTMLButtonElement | null;
let lastIngameSnippet: string = '';

async function loadIngamePoseSnippet(animId: string) {
  if (!ingamePoseSrcEl) return;
  ingamePoseSrcEl.value = 'Loading live runtime source excerpt...';
  try {
    const res = await fetch(`/__editor-snippet?kind=player-pose&id=${encodeURIComponent(animId)}`);
    const json = await res.json();
    const snip = (json && json.snippet) ? String(json.snippet) : '// No snippet returned';
    lastIngameSnippet = snip;
    ingamePoseSrcEl.value = snip;
    if (importIngameBtn) importIngameBtn.disabled = !snip || /No matching|not found/.test(snip);
  } catch (e: any) {
    lastIngameSnippet = '';
    ingamePoseSrcEl.value = '// Fetch failed: ' + (e?.message || e) + '\n// Is the Vite dev server running the editor plugin?';
    if (importIngameBtn) importIngameBtn.disabled = true;
  }
}

function parsePlayerSnippetToState(snippet: string) {
  if (!rig || !state || !nodes) return 0;
  // Map Player "this.xxx" or bare "weaponGroup" → rig key
  const nameToKey: Record<string, string> = {
    'this.torso': 'torso', 'torso': 'torso',
    'this.pelvis': 'pelvis', 'pelvis': 'pelvis',
    'this.neck': 'neck', 'neck': 'neck',
    'this.head': 'head', 'head': 'head',
    'this.lUpperArm': 'lUpperArm', 'lUpperArm': 'lUpperArm',
    'this.rUpperArm': 'rUpperArm', 'rUpperArm': 'rUpperArm',
    'this.lForearm': 'lForearm', 'lForearm': 'lForearm',
    'this.rForearm': 'rForearm', 'rForearm': 'rForearm',
    'this.lHand': 'lHand', 'lHand': 'lHand',
    'this.rHand': 'rHand', 'rHand': 'rHand',
    'this.lThigh': 'lThigh', 'lThigh': 'lThigh',
    'this.rThigh': 'rThigh', 'rThigh': 'rThigh',
    'this.lCalf': 'lCalf', 'lCalf': 'lCalf',
    'this.rCalf': 'rCalf', 'rCalf': 'rCalf',
    'this.lFoot': 'lFoot', 'lFoot': 'lFoot',
    'this.rFoot': 'rFoot', 'rFoot': 'rFoot',
    'this.weaponGroup': 'weaponGroup', 'weaponGroup': 'weaponGroup',
    'this.lWing': 'lWing', 'lWing': 'lWing',
    'this.rWing': 'rWing', 'rWing': 'rWing',
  };
  let applied = 0;
  // .set(x, y, z) form: this.foo.rotation.set(1.23, -0.45, 0)
  const setRe = /(this\.[a-zA-Z]+|weaponGroup|pelvis|torso)\.rotation\.set\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = setRe.exec(snippet)) !== null) {
    const key = nameToKey[m[1]];
    if (key && state[key] && nodes[key]) {
      state[key].hierarchy.rot = { x: parseFloat(m[2]), y: parseFloat(m[3]), z: parseFloat(m[4]) };
      applied++;
    }
  }
  // position.set too
  const posSetRe = /(this\.[a-zA-Z]+|weaponGroup|pelvis|torso)\.position\.set\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g;
  while ((m = posSetRe.exec(snippet)) !== null) {
    const key = nameToKey[m[1]];
    if (key && state[key] && nodes[key]) {
      state[key].hierarchy.pos = { x: parseFloat(m[2]), y: parseFloat(m[3]), z: parseFloat(m[4]) };
      applied++;
    }
  }
  // individual axis: this.foo.rotation.x = 0.123  or  this.foo.position.y -= 0.1 * s  (we take the RHS literal if simple)
  const axisRe = /(this\.[a-zA-Z]+|weaponGroup)\.(rotation|position)\.([xyz])\s*=\s*([-\d.]+)/g;
  while ((m = axisRe.exec(snippet)) !== null) {
    const key = nameToKey[m[1]];
    const kind = m[2] as 'rotation' | 'position';
    const ax = m[3] as 'x'|'y'|'z';
    const val = parseFloat(m[4]);
    if (key && state[key] && nodes[key]) {
      if (kind === 'rotation') state[key].hierarchy.rot[ax] = val;
      else state[key].hierarchy.pos[ax] = val;
      applied++;
    }
  }
  // Also handle some "+= " or direct in context if the number is the target (best effort)
  if (applied === 0) {
    // fallback: any lone "0.1234" near known bone names in the text (very loose)
    for (const [pname, key] of Object.entries(nameToKey)) {
      if (!state[key] || !nodes[key]) continue;
      const near = new RegExp(pname.replace('.', '\\.') + '[^;]{0,40}?([-.0-9]{2,})', 'i');
      const fm = near.exec(snippet);
      if (fm) {
        // crude: assume it's a rot x for demo; user sees the snippet anyway
        state[key].hierarchy.rot.x = parseFloat(fm[1]);
        applied++;
      }
    }
  }
  // Now push state to the live nodes (hierarchy mode) and refresh parts
  for (const key of Object.keys(nodes)) {
    const n = nodes[key];
    const st = state[key];
    if (!st || !n) continue;
    n.position.set(st.hierarchy.pos.x, st.hierarchy.pos.y, st.hierarchy.pos.z);
    n.rotation.set(st.hierarchy.rot.x, st.hierarchy.rot.y, st.hierarchy.rot.z);
    n.scale.set(st.hierarchy.scl.x, st.hierarchy.scl.y, st.hierarchy.scl.z);
    applyPart(key);
  }
  return applied;
}

if (checkIngameBtn) {
  checkIngameBtn.addEventListener('click', () => {
    const id = (document.getElementById('animSel') as HTMLSelectElement | null)?.value || 'guard_high';
    loadIngamePoseSnippet(id);
  });
}
if (importIngameBtn) {
  importIngameBtn.addEventListener('click', () => {
    if (!lastIngameSnippet) return;
    const n = parsePlayerSnippetToState(lastIngameSnippet);
    showToast(`Imported ~${n} bone values from runtime snippet into sliders/state. Review visually, then Apply to this pose if desired.`);
    // If auto preview was on, turn it off so edited state shows
    previewAnimId = null;
    const pBtn = document.getElementById('previewAnim') as HTMLButtonElement | null;
    if (pBtn) pBtn.classList.remove('active');
  });
}

// Auto-check the initial pose shortly after startup (gives you the "on launch" verification)
// This populates the runtime snippet viewer automatically when you open the editor so
// you can immediately see if the preview poses in ANIM_POSES are in sync with runtime source.
setTimeout(() => {
  const sel = document.getElementById('animSel') as HTMLSelectElement | null;
  if (sel && sel.value) {
    loadIngamePoseSnippet(sel.value).catch(() => {});
  }
}, 900);

// Also refresh snippet when user changes the pose dropdown (so checking is natural)
animSel.addEventListener('change', () => {
  // small delay so UI settles
  setTimeout(() => {
    const id = animSel.value;
    if (id && ingamePoseSrcEl && ingamePoseSrcEl.value.trim().length > 0) {
      // If the panel already has content (user has used the feature), auto refresh on change.
      loadIngamePoseSnippet(id).catch(() => {});
    }
  }, 60);
});

// Model / builder live source check (for the model tab)
const checkBuilderBtn = document.getElementById('checkBuilderBtn') as HTMLButtonElement | null;
const builderSrcEl = document.getElementById('builderSrc') as HTMLTextAreaElement | null;
const builderCheckInfo = document.getElementById('builderCheckInfo') as HTMLSpanElement | null;
if (checkBuilderBtn) {
  checkBuilderBtn.addEventListener('click', async () => {
    const rawType = WarriorType[currentType] ?? 'Sample';
    if (builderSrcEl) builderSrcEl.style.display = 'block';
    if (builderSrcEl) builderSrcEl.value = 'Loading current builder overrides from disk...';
    try {
      const res = await fetch(`/__editor-snippet?kind=builder&warrior=${encodeURIComponent(rawType)}`);
      const json = await res.json();
      const sn = json && json.snippet ? String(json.snippet) : '// empty';
      if (builderSrcEl) builderSrcEl.value = sn;
      if (builderCheckInfo) builderCheckInfo.textContent = json && json.id ? `(${json.id})` : '';
    } catch (e) {
      if (builderSrcEl) builderSrcEl.value = '// Network or server error fetching builder snippet.';
    }
  });
}

// When character changes, clear any stale builder snippet (user can re-check)
// (loadCharacter is called from charSel listener which does the clear; kept for future hook if needed)


// Persist auto-apply preference
const autoApplyChk = document.getElementById('autoApply') as HTMLInputElement | null;
if (autoApplyChk) {
  try { autoApplyChk.checked = localStorage.getItem('editorAutoApply') === '1'; } catch {}
  autoApplyChk.addEventListener('change', () => {
    try { localStorage.setItem('editorAutoApply', autoApplyChk.checked ? '1' : '0'); } catch {}
  });
}
document.getElementById('copyAnimExport')!.addEventListener('click', () => {
  if (!animExportEl.value) animExportEl.value = generateAnimExport();
  navigator.clipboard.writeText(animExportEl.value);
});

// =============================================================================

// Ctrl+Z / Cmd+Z — undo; Ctrl+Y / Ctrl+Shift+Z — redo.
window.addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  const inText = t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text'));

  if (inText) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
    e.preventDefault();
    if (activeTab === 'level') lvlUndo();
    else if (charActiveSubTab === 'texture') charTexUndo();
    else undo();
  } else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
    e.preventDefault();
    if (activeTab === 'level') lvlRedo();
    else if (charActiveSubTab === 'texture') charTexRedo();
    else redo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
    if (activeTab === 'level') {
      if (lvlSelectedMesh) {
        e.preventDefault();
        lvlCopyTexture();
      }
    } else if (charActiveSubTab === 'texture') {
      e.preventDefault();
      charCopyTexture();
    }
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
    if (copiedTextureSettings) {
      if (activeTab === 'level') {
        if (lvlSelection.length > 0) {
          e.preventDefault();
          lvlPasteTexture();
        }
      } else if (charActiveSubTab === 'texture') {
        e.preventDefault();
        charPasteTexture();
      }
    }
  } else if (e.key === 'Delete' && activeTab !== 'level') {
    e.preventDefault();
    deleteSelectedExtra();
  }
});

// -----------------------------------------------------------------------------
// Click a part on the model to select it
// -----------------------------------------------------------------------------
// Resolve a clicked mesh to the nearest enclosing rig node (most specific part).
function nodeKeyFromObject(obj: THREE.Object3D | null): string | null {
  const values = Object.values(nodes);
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    const idx = values.indexOf(cur);
    if (idx >= 0) return Object.keys(nodes)[idx];
    cur = cur.parent;
  }
  return null;
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downX = 0, downY = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
renderer.domElement.addEventListener('pointerup', (e) => {
  // Treat as a click only if the pointer barely moved (so orbit drags don't select).
  if (Math.abs(e.clientX - downX) > 4 || Math.abs(e.clientY - downY) > 4) return;
  if (e.button !== 0) return;
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  if (activeTab === 'level') {
    lvlHandleClick(e.ctrlKey || e.metaKey);
    return;
  }
  const hits = raycaster.intersectObject(rig.mesh, true);
  for (const hit of hits) {
    const key = nodeKeyFromObject(hit.object);
    if (key) {
      if (e.ctrlKey || e.metaKey) toggleCtrlSelect(key);
      else selectPart(key);
      break;
    }
  }
});

// -----------------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------------
loadCharacter(WarriorType.RUSTY);
resize();

// =============================================================================
// LEVEL EDITOR
// =============================================================================

// Per-object change record.
interface LvlChange {
  label: string;
  origPos: THREE.Vector3;
  origRot: THREE.Euler;
  origScale: THREE.Vector3;
  // Build-time UV baseline, captured once and never overwritten (uvRepeatU/V/
  // uvRotation below track the CURRENT values and are updated on every edit,
  // so the exporter must diff against these).
  origUvU: number;
  origUvV: number;
  origUvRot: number;
  texSetLabel: string;
  uvRepeatU: number;
  uvRepeatV: number;
  uvRotation: number;
  colorHex: number;
  roughness: number;
  metalness: number;
  emissiveHex: number;
  emissiveIntensity: number;
}

let lvlEnvMgr: EnvironmentManager | null = null;
let lvlCurrentIndex = 0;
let lvlSelectedMesh: THREE.Mesh | null = null;   // "primary" — drives the transform panel
const lvlSelection: THREE.Mesh[] = [];           // full selection set (primary is last)
const lvlSecHelpers: THREE.BoxHelper[] = [];     // box helpers for the non-primary selected meshes
let lvlBoxHelper: THREE.BoxHelper | null = null;
const lvlChanges = new Map<string, LvlChange>();
const lvlTexLoader = new THREE.TextureLoader();
// Cache loaded textures by path so we don't reload on every repeat change.
const lvlTexCache = new Map<string, THREE.Texture>();

// Saved scene/camera state to restore when leaving the level tab.
let _savedFog: THREE.Fog | THREE.FogExp2 | null = null;
let _savedBg: THREE.Color | THREE.Texture | null = null;
const _savedCamPos = new THREE.Vector3();
const _savedCamTarget = new THREE.Vector3();

// ── helpers ──────────────────────────────────────────────────────────────────
function lvlGetMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial | null {
  const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  return (mat instanceof THREE.MeshStandardMaterial) ? mat : null;
}

function lvlLoadTex(path: string): THREE.Texture {
  if (lvlTexCache.has(path)) return lvlTexCache.get(path)!;
  const t = lvlTexLoader.load(path);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (path.endsWith('.webp') || path.endsWith('.jpg')) {
    // color maps need sRGB — detect by filename convention
    if (path.includes('_color')) t.colorSpace = THREE.SRGBColorSpace;
  }
  lvlTexCache.set(path, t);
  return t;
}

function lvlObjLabel(mesh: THREE.Mesh): string {
  const gType = mesh.geometry?.type ?? 'Object';
  const wp = new THREE.Vector3();
  mesh.getWorldPosition(wp);
  return `${gType}  (${wp.x.toFixed(1)}, ${wp.y.toFixed(1)}, ${wp.z.toFixed(1)})`;
}

function lvlEnsureChange(mesh: THREE.Mesh): LvlChange {
  if (!lvlChanges.has(mesh.uuid)) {
    const mat = lvlGetMaterial(mesh);
    const srcTex = (mat?.map ?? mat?.normalMap ?? mat?.roughnessMap) as THREE.Texture | undefined;
    const colorHex = mat?.color?.getHex() ?? 0xffffff;
    lvlChanges.set(mesh.uuid, {
      label: lvlObjLabel(mesh),
      origPos: mesh.position.clone(),
      origRot: mesh.rotation.clone(),
      origScale: mesh.scale.clone(),
      origUvU: srcTex?.repeat?.x ?? 1,
      origUvV: srcTex?.repeat?.y ?? 1,
      origUvRot: srcTex?.rotation ?? 0,
      texSetLabel: '',
      uvRepeatU: srcTex?.repeat?.x ?? 1,
      uvRepeatV: srcTex?.repeat?.y ?? 1,
      uvRotation: srcTex?.rotation ?? 0,
      colorHex,
      roughness: mat?.roughness ?? 0.8,
      metalness: mat?.metalness ?? 0,
      emissiveHex: mat?.emissive?.getHex() ?? 0x000000,
      emissiveIntensity: mat?.emissiveIntensity ?? 0,
    });
  }
  return lvlChanges.get(mesh.uuid)!;
}

function lvlSetGroupsEnabled(on: boolean) {
  const ids = ['lvlPosGrp', 'lvlRotGrp', 'lvlSclGrp', 'lvlTexGrp'];
  for (const id of ids) {
    const el = document.getElementById(id)!;
    el.classList.toggle('grp-disabled', !on);
  }
  const info = document.getElementById('lvlInfo')!;
  info.classList.toggle('has-sel', on);
}

// ── enter / leave ─────────────────────────────────────────────────────────────
function lvlEnter() {
  _savedFog = scene.fog;
  _savedBg = scene.background as THREE.Color | THREE.Texture | null;
  _savedCamPos.copy(camera.position);
  _savedCamTarget.copy(controls.target);
  if (rig?.mesh) rig.mesh.visible = false;
  boxHelper.visible = false;
  grid.visible = false;
  camera.position.set(0, 8, 22);
  controls.target.set(0, 2, 0);
  controls.update();
  if (!lvlEnvMgr) lvlLoad(lvlCurrentIndex);
  else lvlEnvMgr.setVisible(true);
}

function lvlLeave() {
  scene.fog = _savedFog;
  (scene as any).background = _savedBg;
  if (rig?.mesh) rig.mesh.visible = true;
  grid.visible = true;
  camera.position.copy(_savedCamPos);
  controls.target.copy(_savedCamTarget);
  controls.update();
  lvlEnvMgr?.setVisible(false);
  lvlSelectedMesh = null;
  lvlSelection.length = 0;
  lvlRebuildSecHelpers();
  if (lvlBoxHelper) lvlBoxHelper.visible = false;
  lvlSetGroupsEnabled(false);
  document.getElementById('lvlInfo')!.textContent = 'Click a mesh in the viewport to select it';
}

/**
 * Parse a level editor export sidecar and try to apply the final positions/UVs to live meshes
 * whose *post-build* position is close to one of the "Original position" values listed in the export.
 * This lets the editor preview "remember" the last edits the user made (via Generate) across page reloads,
 * without requiring the full manual source patch in EnvironmentManager.ts to be complete yet.
 * Supports the common cases emitted by the exporter (position.set + UV repeat/rotation comments).
 */
function lvlReplayLastSidecar(index: number) {
  if (!lvlEnvMgr) return;
  const envGroup = (lvlEnvMgr as any).environmentGroup as THREE.Group;
  if (!envGroup) return;

  fetch(`/__last-level-editor-apply?index=${index}`)
    .then(r => r.ok ? r.text() : Promise.reject())
    .then(text => {
      if (!text || !text.includes('LEVEL EDITOR EXPORT')) return;
      console.log('%c[level editor] auto-replaying last sidecar for level ' + index + ' (preview stickiness)', 'color:#88aaff');

      const mgr = lvlEnvMgr as any;
      const num = (s: string) => parseFloat(s.trim());
      const parseVec = (s: string): THREE.Vector3 => {
        const p = s.split(',').map(num);
        return new THREE.Vector3(p[0], p[1], p[2]);
      };
      const parseArrOrNull = (s: string): number[] | null =>
        s.trim() === 'null' ? null : s.replace(/[\[\]]/g, '').split(',').map(num);
      const parseNumOrNull = (s: string): number | null =>
        s.trim() === 'null' ? null : (s.trim().startsWith('0x') ? parseInt(s.trim(), 16) : num(s));

      // Register a mesh in change tracking BEFORE mutating it, so its build-time
      // state is the baseline and the next Generate re-emits this edit instead
      // of silently dropping it (the old behavior that forced redoing work).
      const track = (m: THREE.Mesh | null): THREE.Mesh | null => { if (m) lvlEnsureChange(m); return m; };

      const lines = text.split(/\r?\n/);
      let legacyOrig: THREE.Vector3 | null = null;
      let legacySkipBlock = false;
      let lastTouched: THREE.Mesh | null = null;

      for (const raw of lines) {
        const ln = raw.trim();

        // ── New format: replay through the exact same helpers the pasted code calls ──
        let m = ln.match(/applyEditorDuplicate\(new THREE\.Vector3\(([^)]*)\),\s*\[([^\]]*)\],\s*(\[[^\]]*\]|null),\s*(\[[^\]]*\]|null)\);/);
        if (m) {
          const clone = mgr.applyEditorDuplicate(parseVec(m[1]), m[2].split(',').map(num), parseArrOrNull(m[3]), parseArrOrNull(m[4])) as THREE.Mesh | null;
          if (clone) {
            // Register so the next Generate re-emits this duplicate.
            const ch = lvlEnsureChange(clone);
            ch.label = `${lvlObjLabel(clone)} [copy]`;
            lastTouched = clone;
          }
          continue;
        }
        m = ln.match(/applyEditorTransform\(new THREE\.Vector3\(([^)]*)\),\s*(\[[^\]]*\]|null),\s*(\[[^\]]*\]|null),\s*(\[[^\]]*\]|null)\);/);
        if (m) {
          track(mgr.editorMeshNearest(parseVec(m[1])));
          lastTouched = mgr.applyEditorTransform(parseVec(m[1]), parseArrOrNull(m[2]), parseArrOrNull(m[3]), parseArrOrNull(m[4]));
          continue;
        }
        m = ln.match(/applyEditorMaterial\(new THREE\.Vector3\(([^)]*)\),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\);/);
        if (m) {
          track(mgr.editorMeshNearest(parseVec(m[1])));
          lastTouched = mgr.applyEditorMaterial(parseVec(m[1]), parseNumOrNull(m[2]), parseNumOrNull(m[3]), parseNumOrNull(m[4]), parseNumOrNull(m[5]), parseNumOrNull(m[6]));
          continue;
        }
        m = ln.match(/applyEditorTexSet\(new THREE\.Vector3\(([^)]*)\),\s*'([^']+)',\s*([^,]+),\s*([^,]+),\s*([^)]+)\);/);
        if (m) {
          track(mgr.editorMeshNearest(parseVec(m[1])));
          const mesh = mgr.applyEditorTexSet(parseVec(m[1]), m[2], num(m[3]), num(m[4]), num(m[5])) as THREE.Mesh | null;
          if (mesh) {
            const ch = lvlEnsureChange(mesh);
            const ts = LVL_TEX_SETS.find(s => s.loaderMethod === m![2]);
            if (ts) ch.texSetLabel = ts.label;
            ch.uvRepeatU = num(m[3]); ch.uvRepeatV = num(m[4]); ch.uvRotation = num(m[5]);
            lastTouched = mesh;
          }
          continue;
        }
        m = ln.match(/applyEditorUV\(new THREE\.Vector3\(([^)]*)\),\s*([^,]+),\s*([^,]+),\s*([^)]+)\);/);
        if (m) {
          track(mgr.editorMeshNearest(parseVec(m[1])));
          const mesh = mgr.applyEditorUV(parseVec(m[1]), num(m[2]), num(m[3]), num(m[4])) as THREE.Mesh | null;
          if (mesh) {
            const ch = lvlEnsureChange(mesh);
            ch.uvRepeatU = num(m[2]); ch.uvRepeatV = num(m[3]); ch.uvRotation = num(m[4]);
            lastTouched = mesh;
          }
          continue;
        }

        // ── Legacy format (old sidecars): position.set + UV comments ──
        // Old exports recorded duplicates as plain position.set blocks labeled
        // "[copy]"; replaying those would teleport the SOURCE mesh (the clone
        // doesn't exist after a rebuild). Skip them — old duplicates must be
        // redone once in the editor, after which the new format preserves them.
        if (/── Object .*\[copy\]/.test(ln)) { legacySkipBlock = true; continue; }
        if (/── Object /.test(ln)) { legacySkipBlock = false; continue; }
        if (legacySkipBlock) continue;
        const origMatch = ln.match(/Original position:\s*\(([^,]+),\s*([^,]+),\s*([^)]+)\)/);
        if (origMatch) { legacyOrig = new THREE.Vector3(num(origMatch[1]), num(origMatch[2]), num(origMatch[3])); continue; }
        const posMatch = ln.match(/^mesh\.position\.set\(([^,]+),\s*([^,]+),\s*([^)]+)\);/);
        if (posMatch && legacyOrig) {
          track(mgr.editorMeshNearest(legacyOrig, 1.0));
          lastTouched = mgr.applyEditorTransform(legacyOrig, [num(posMatch[1]), num(posMatch[2]), num(posMatch[3])], null, null);
          legacyOrig = null;
          continue;
        }
        const uvMatch = ln.match(/UV changed: repeat=\(([^,]+),\s*([^)]+)\)\s*rotation=([^\s]+)/);
        if (uvMatch && lastTouched) {
          const mat = lvlGetMaterial(lastTouched);
          if (mat) lvlSetRepeatOnMat(mat, num(uvMatch[1]), num(uvMatch[2]), num(uvMatch[3]));
          const ch = lvlEnsureChange(lastTouched);
          ch.uvRepeatU = num(uvMatch[1]); ch.uvRepeatV = num(uvMatch[2]); ch.uvRotation = num(uvMatch[3]);
        }
      }
      void envGroup;
    })
    .catch((e) => {
      // 404 (no sidecar) is normal; anything else deserves a console trace so
      // replay failures are never silent again.
      if (e) console.warn('[level editor] sidecar replay failed:', e);
    });
}

function lvlLoad(index: number) {
  lvlCurrentIndex = index;
  lvlChanges.clear();
  lvlSelectedMesh = null;
  lvlSelection.length = 0;
  lvlRebuildSecHelpers();
  if (lvlBoxHelper) lvlBoxHelper.visible = false;
  lvlSetGroupsEnabled(false);
  document.getElementById('lvlInfo')!.textContent = 'Click a mesh in the viewport to select it';
  document.getElementById('lvlInfo')!.classList.remove('has-sel');
  document.getElementById('lvlExport')!.textContent = '';

  if (!lvlEnvMgr) {
    lvlEnvMgr = new EnvironmentManager(scene);
    (window as any).lvlEnvMgr = lvlEnvMgr;
    lvlBoxHelper = new THREE.BoxHelper(new THREE.Object3D(), 0x44aaff);
    (lvlBoxHelper.material as THREE.LineBasicMaterial).depthTest = false;
    lvlBoxHelper.visible = false;
    scene.add(lvlBoxHelper);
  }
  // The manager caches cloned textures across builds; editor UV edits mutate
  // those shared clones, so a rebuild would silently inherit the edits and
  // corrupt the "original UV" baselines. Rebuild from a clean cache.
  (lvlEnvMgr as any).texCloneCache?.clear?.();
  (lvlEnvMgr as any).buildEnvironment(index);

  // Auto-replay the most recent level editor export sidecar (written by the dev server on Generate).
  // This makes the last visual changes the user made in the editor "stick" across page reloads
  // in the editor preview, even if the full patch hasn't been integrated into EnvironmentManager.ts yet.
  // (For the actual game the source integration is still required.)
  // We do it async+small delay so the fresh meshes from build are in the group.
  setTimeout(() => { try { lvlReplayLastSidecar(index); } catch(e){ /* ignore */ } }, 80);
}

// ── click selection ───────────────────────────────────────────────────────────
// Normal click selects a single mesh; Ctrl/Cmd+click adds/removes a mesh to the
// selection set so several objects can be transformed together as a group.
function lvlHandleClick(additive: boolean) {
  if (!lvlEnvMgr) return;
  const envGroup = (lvlEnvMgr as any).environmentGroup as THREE.Group;
  const hits = raycaster.intersectObject(envGroup, true);
  // Walk up from hit to find a Mesh (skip helpers / points / lines).
  for (const hit of hits) {
    let obj: THREE.Object3D | null = hit.object;
    while (obj) {
      if (obj instanceof THREE.Mesh && obj.geometry && !(obj instanceof THREE.Points)) {
        if (additive) lvlToggleSelect(obj);
        else lvlSelectMesh(obj);
        return;
      }
      obj = obj.parent;
    }
  }
  // Click on empty — deselect (Ctrl+click on empty keeps the current selection).
  if (!additive) lvlSelectMesh(null);
}

function lvlRebuildSecHelpers() {
  for (const bh of lvlSecHelpers) { bh.visible = false; scene.remove(bh); }
  lvlSecHelpers.length = 0;
  for (const m of lvlSelection) {
    if (m === lvlSelectedMesh) continue;
    const bh = new THREE.BoxHelper(m, 0x44aaff);
    (bh.material as THREE.LineBasicMaterial).depthTest = false;
    scene.add(bh);
    lvlSecHelpers.push(bh);
  }
}

// Refresh panel + helpers from the current selection set. `primary` becomes the
// mesh whose values populate the transform sliders.
function lvlApplySelection(primary: THREE.Mesh | null) {
  lvlSelectedMesh = primary;
  if (lvlBoxHelper) {
    lvlBoxHelper.visible = primary !== null;
    if (primary) lvlBoxHelper.setFromObject(primary);
  }
  lvlRebuildSecHelpers();

  const info = document.getElementById('lvlInfo')!;
  if (!primary) {
    info.textContent = 'Click a mesh in the viewport to select it';
    lvlSetGroupsEnabled(false);
    return;
  }
  const ch = lvlEnsureChange(primary);
  info.textContent = lvlSelection.length > 1 ? `${ch.label}  +${lvlSelection.length - 1} more` : ch.label;
  lvlSetGroupsEnabled(true);
  lvlPopulateTransform(primary);
  lvlPopulateMaterial(primary);
}

// Single select (normal click): replace the whole selection with one mesh.
function lvlSelectMesh(mesh: THREE.Mesh | null) {
  lvlSelection.length = 0;
  if (mesh) lvlSelection.push(mesh);
  lvlApplySelection(mesh);
}

// Ctrl/Cmd+click: toggle a mesh in/out of the selection set.
function lvlToggleSelect(mesh: THREE.Mesh) {
  const idx = lvlSelection.indexOf(mesh);
  if (idx >= 0) {
    lvlSelection.splice(idx, 1);
    lvlApplySelection(lvlSelection[lvlSelection.length - 1] ?? null);
  } else {
    lvlSelection.push(mesh); // newest becomes primary
    lvlApplySelection(mesh);
  }
}

// ── transform sliders ─────────────────────────────────────────────────────────
function lvlMakeSliderRow(container: HTMLElement, axis: string, min: number, max: number, step: number, value: number, onChange: (v: number) => void) {
  const row = document.createElement('div'); row.className = 'row';
  const lbl = document.createElement('span'); lbl.className = 'axis'; lbl.textContent = axis.toUpperCase();
  const range = document.createElement('input'); range.type = 'range';
  range.min = String(min); range.max = String(max); range.step = String(step); range.value = String(value);
  const num = document.createElement('input'); num.className = 'num'; num.type = 'text'; num.inputMode = 'decimal';
  const fmt = (v: number) => String(Math.round(v * 1000) / 1000);
  num.value = fmt(value);
  row.append(lbl, range, num); container.append(row);
  const fire = (v: number) => { num.value = fmt(v); range.value = String(v); onChange(v); };
  range.addEventListener('input', () => fire(parseFloat(range.value)));
  num.addEventListener('change', () => { const v = parseFloat(num.value); if (!isNaN(v)) fire(Math.min(max, Math.max(min, v))); });
  num.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const delta = (e.key === 'ArrowUp' ? 1 : -1) * step;
    fire(Math.round(Math.min(max, Math.max(min, (parseFloat(num.value) || 0) + delta)) * 100000) / 100000);
  });
  return { range, num, set: fire };
}

// Apply a transform-slider change to every selected mesh. The slider shows the
// primary's value; other meshes receive the same delta so the group moves together.
function lvlApplyAxis(prop: 'position' | 'rotation' | 'scale', ax: 'x' | 'y' | 'z', v: number) {
  if (!lvlSelectedMesh) return;
  const delta = v - (lvlSelectedMesh as any)[prop][ax];
  for (const m of lvlSelection) {
    (m as any)[prop][ax] += delta;
    lvlEnsureChange(m);
  }
  if (lvlSelection.length === 0) { // safety: primary not in set
    (lvlSelectedMesh as any)[prop][ax] = v;
    lvlEnsureChange(lvlSelectedMesh);
  }
  if (lvlBoxHelper) lvlBoxHelper.setFromObject(lvlSelectedMesh);
  for (const bh of lvlSecHelpers) bh.update();
}

// Sliders are built once (into the existing empty group containers) and updated on selection.
const lvlPosSliders: { set: (v: number) => void }[] = [];
const lvlRotSliders: { set: (v: number) => void }[] = [];
const lvlSclSliders: { set: (v: number) => void }[] = [];

function lvlBuildTransformRows() {
  const axes = ['x', 'y', 'z'] as const;

  const posC = document.getElementById('lvlPosRows')!;
  for (const ax of axes) {
    const { set } = lvlMakeSliderRow(posC, ax, -80, 80, 0.05, 0, v => {
      lvlApplyAxis('position', ax, v);
    });
    lvlPosSliders.push({ set });
  }

  const rotC = document.getElementById('lvlRotRows')!;
  for (const ax of axes) {
    const { set } = lvlMakeSliderRow(rotC, ax, -Math.PI, Math.PI, 0.01, 0, v => {
      lvlApplyAxis('rotation', ax, v);
    });
    lvlRotSliders.push({ set });
  }

  const sclC = document.getElementById('lvlSclRows')!;
  for (const ax of axes) {
    const { set } = lvlMakeSliderRow(sclC, ax, 0.01, 15, 0.01, 1, v => {
      lvlApplyAxis('scale', ax, v);
    });
    lvlSclSliders.push({ set });
  }
}

function lvlPopulateTransform(mesh: THREE.Mesh) {
  const axes = ['x', 'y', 'z'] as const;
  axes.forEach((ax, i) => {
    lvlPosSliders[i].set(Math.round(mesh.position[ax] * 1000) / 1000);
    lvlRotSliders[i].set(Math.round(mesh.rotation[ax] * 1000) / 1000);
    lvlSclSliders[i].set(Math.round(mesh.scale[ax] * 1000) / 1000);
  });
}

// ── material / texture controls ───────────────────────────────────────────────
function lvlSetRepeatOnMat(mat: THREE.MeshStandardMaterial, u: number, v: number, rot: number) {
  const maps = [mat.map, mat.normalMap, mat.roughnessMap, mat.aoMap, mat.metalnessMap, mat.emissiveMap] as (THREE.Texture | null)[];
  for (const t of maps) {
    if (!t) continue;
    t.repeat.set(u, v);
    t.center.set(0.5, 0.5);
    t.rotation = rot;
    t.needsUpdate = true;
  }
}

function lvlApplyTexSet(setIndex: number, u: number, v: number, rot: number) {
  if (!lvlSelectedMesh) return;
  const mat = lvlGetMaterial(lvlSelectedMesh);
  if (!mat) return;
  const ts = LVL_TEX_SETS[setIndex];
  if (!ts || !ts.loaderMethod) return; // "keep current" → no-op

  const loadMap = (path?: string, srgb = false): THREE.Texture | null => {
    if (!path) return null;
    const t = lvlLoadTex(path).clone();
    t.needsUpdate = true;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.repeat.set(u, v);
    t.center.set(0.5, 0.5);
    t.rotation = rot;
    return t;
  };

  mat.map          = loadMap(ts.c, true);
  mat.normalMap    = loadMap(ts.n);
  mat.roughnessMap = loadMap(ts.r);
  mat.aoMap        = loadMap(ts.ao);
  mat.metalnessMap = loadMap(ts.metal);
  mat.emissiveMap  = null;
  mat.needsUpdate = true;

  const ch = lvlEnsureChange(lvlSelectedMesh);
  ch.texSetLabel = ts.label;
  ch.uvRepeatU = u;
  ch.uvRepeatV = v;
  ch.uvRotation = rot;
}

function lvlInferTexSet(mat: THREE.MeshStandardMaterial): number {
  const tex = mat.map ?? mat.normalMap ?? mat.roughnessMap;
  const src: string = (tex?.image as HTMLImageElement | undefined)?.src ?? '';
  if (!src) return 0;
  for (let i = 1; i < LVL_TEX_SETS.length; i++) {
    const ts = LVL_TEX_SETS[i];
    const paths = [ts.c, ts.n, ts.r, ts.ao, ts.metal].filter(Boolean);
    if (paths.some(p => src.includes(p!.replace(/^\//, '')))) return i;
  }
  return 0;
}

function lvlPopulateMaterial(mesh: THREE.Mesh) {
  const mat = lvlGetMaterial(mesh);
  if (!mat) return;

  // Read from whichever map is available (normalMap is set even without a color map).
  const srcTex = (mat.map ?? mat.normalMap ?? mat.roughnessMap) as THREE.Texture | null;
  const uvRepeatU = srcTex?.repeat?.x ?? 1;
  const uvRepeatV = srcTex?.repeat?.y ?? 1;
  const uvRotation = srcTex?.rotation ?? 0;
  const roughness = mat.roughness ?? 0.8;
  const metalness = mat.metalness ?? 0;
  const colorHex = '#' + mat.color.getHexString();

  (document.getElementById('lvlUVUSlider') as HTMLInputElement).value = String(Math.min(20, Math.max(0.1, uvRepeatU)));
  (document.getElementById('lvlUVUNum') as HTMLInputElement).value = String(Math.round(uvRepeatU * 100) / 100);
  (document.getElementById('lvlUVVSlider') as HTMLInputElement).value = String(Math.min(20, Math.max(0.1, uvRepeatV)));
  (document.getElementById('lvlUVVNum') as HTMLInputElement).value = String(Math.round(uvRepeatV * 100) / 100);

  // Snap rotation display to the nearest 90° button.
  const snapRot = Math.round(uvRotation / (Math.PI / 2)) * (Math.PI / 2);
  document.querySelectorAll<HTMLButtonElement>('.uv-rot-btn').forEach(btn => {
    btn.classList.toggle('active', Math.abs(parseFloat(btn.dataset.rot ?? '0') - snapRot) < 0.01);
  });

  (document.getElementById('lvlColorPick') as HTMLInputElement).value = colorHex;

  const roughSlider = document.getElementById('lvlRoughSlider') as HTMLInputElement;
  const roughNum = document.getElementById('lvlRoughNum') as HTMLInputElement;
  roughSlider.value = String(roughness); roughNum.value = String(Math.round(roughness * 1000) / 1000);

  const metalSlider = document.getElementById('lvlMetalSlider') as HTMLInputElement;
  const metalNum = document.getElementById('lvlMetalNum') as HTMLInputElement;
  metalSlider.value = String(metalness); metalNum.value = String(Math.round(metalness * 1000) / 1000);

  const emissiveHex = '#' + mat.emissive.getHexString();
  const emissiveIntensity = mat.emissiveIntensity ?? 0;
  (document.getElementById('lvlEmissivePick') as HTMLInputElement).value = emissiveHex;
  (document.getElementById('lvlEmissiveSlider') as HTMLInputElement).value = String(emissiveIntensity);
  (document.getElementById('lvlEmissiveNum') as HTMLInputElement).value = String(Math.round(emissiveIntensity * 100) / 100);

  const ch = lvlChanges.get(mesh.uuid);
  let texIdx = 0;
  if (ch?.texSetLabel) {
    const fi = LVL_TEX_SETS.findIndex(s => s.label === ch.texSetLabel);
    if (fi >= 0) texIdx = fi;
  } else {
    texIdx = lvlInferTexSet(mat);
  }
  (document.getElementById('lvlTexSel') as HTMLSelectElement).value = String(texIdx);

  lvlUpdateShareInfo(mesh);
}

// ── isolate a mesh's material ──────────────────────────────────────────────────
// Several level meshes (e.g. the castle-wall boxes) reference one shared material
// instance, so editing UV repeat / textures on one changes them all. "Isolate"
// clones the material (and its texture wrappers) for the selected mesh so its
// scale can be tuned independently — useful when a piece is geometry-stretched.
function lvlCountSharingMaterial(mesh: THREE.Mesh): number {
  if (!lvlEnvMgr) return 1;
  const target = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (!target) return 1;
  let n = 0;
  (lvlEnvMgr as any).environmentGroup.traverse((obj: THREE.Object3D) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
    if (m === target) n++;
  });
  return n;
}

function lvlUpdateShareInfo(mesh: THREE.Mesh) {
  const info = document.getElementById('lvlShareInfo')!;
  const btn = document.getElementById('lvlIsolate') as HTMLButtonElement;
  const count = lvlCountSharingMaterial(mesh);
  if (count > 1) {
    info.textContent = `shared by ${count} meshes`;
    btn.disabled = false;
  } else {
    info.textContent = 'unique material';
    btn.disabled = true;
  }
}

function lvlCloneTex(t: THREE.Texture | null): THREE.Texture | null {
  if (!t) return null;
  const c = t.clone();          // shares the image, but gets its own repeat/offset/rotation
  c.needsUpdate = true;
  return c;
}

function lvlIsolateMesh(mesh: THREE.Mesh) {
  const cloneMat = (src: THREE.Material): THREE.Material => {
    const m = src.clone();
    if (m instanceof THREE.MeshStandardMaterial && src instanceof THREE.MeshStandardMaterial) {
      m.map = lvlCloneTex(src.map);
      m.normalMap = lvlCloneTex(src.normalMap);
      m.roughnessMap = lvlCloneTex(src.roughnessMap);
      m.aoMap = lvlCloneTex(src.aoMap);
      m.metalnessMap = lvlCloneTex(src.metalnessMap);
      m.emissiveMap = lvlCloneTex(src.emissiveMap);
    }
    m.needsUpdate = true;
    return m;
  };
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneMat) : cloneMat(mesh.material);
}

// ── export ────────────────────────────────────────────────────────────────────
function lvlGenerateExport(): string {
  const lines: string[] = [];
  lines.push(`// === LEVEL EDITOR EXPORT ===`);
  lines.push(`// Level: ${LEVELS[lvlCurrentIndex]?.name ?? lvlCurrentIndex} (index ${lvlCurrentIndex})`);

  // Only emit objects that differ meaningfully from baseline. Duplicates are
  // ALWAYS emitted (they don't exist in source at all). UV diffs compare the
  // live texture against the build-time baseline (origUv*), never against the
  // continually-updated "current" fields.
  const EPS = 0.001;
  const changed: Array<{ uuid: string; ch: LvlChange; mesh: THREE.Mesh }> = [];
  if (lvlEnvMgr) {
    const envGroup = (lvlEnvMgr as any).environmentGroup as THREE.Group;
    envGroup.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      const ch = lvlChanges.get(obj.uuid);
      if (!ch) return;
      const isDup = !!obj.userData.lvlDuplicate;
      const posDiff = !obj.position.equals(ch.origPos);
      const rotDiff = Math.abs(obj.rotation.x - ch.origRot.x) > EPS || Math.abs(obj.rotation.y - ch.origRot.y) > EPS || Math.abs(obj.rotation.z - ch.origRot.z) > EPS;
      const sclDiff = !obj.scale.equals(ch.origScale);
      const mat = lvlGetMaterial(obj);
      const matChanged = mat && (Math.abs(mat.roughness - ch.roughness) > EPS || Math.abs(mat.metalness - ch.metalness) > EPS || mat.color.getHex() !== ch.colorHex || mat.emissive.getHex() !== ch.emissiveHex || Math.abs((mat.emissiveIntensity ?? 0) - ch.emissiveIntensity) > EPS);
      const texChanged = ch.texSetLabel !== '';
      const srcTex = (mat?.map ?? mat?.normalMap ?? mat?.roughnessMap) as THREE.Texture | null;
      const uvDiff = !!srcTex && (Math.abs(srcTex.repeat.x - ch.origUvU) > EPS || Math.abs(srcTex.repeat.y - ch.origUvV) > EPS || Math.abs(srcTex.rotation - ch.origUvRot) > EPS);
      if (isDup || posDiff || rotDiff || sclDiff || matChanged || texChanged || uvDiff) changed.push({ uuid: obj.uuid, ch, mesh: obj });
    });
  }

  lines.push(`// ${changed.length} object(s) modified`);
  lines.push(`// Paste the lines below at the END of this level's build case in`);
  lines.push(`// EnvironmentManager.ts (after all geometry is created). Each call finds`);
  lines.push(`// its mesh by build-time position, so order within a level doesn't matter —`);
  lines.push(`// except duplicates, whose line must come before edits to the new copy.`);

  const f = (v: number) => String(Math.round(v * 10000) / 10000);
  const vec = (p: { x: number; y: number; z: number }) => `new THREE.Vector3(${f(p.x)}, ${f(p.y)}, ${f(p.z)})`;
  const arr = (x: number, y: number, z: number) => `[${f(x)}, ${f(y)}, ${f(z)}]`;

  for (let i = 0; i < changed.length; i++) {
    const { ch, mesh } = changed[i];
    const mat = lvlGetMaterial(mesh);
    const isDup = !!mesh.userData.lvlDuplicate;

    lines.push('');
    lines.push(`// ─── Object ${i + 1}: ${ch.label}${isDup ? ' [DUPLICATE]' : ''}`);
    lines.push(`// Original position: (${f(ch.origPos.x)}, ${f(ch.origPos.y)}, ${f(ch.origPos.z)})`);

    // The "address" used by subsequent helper calls to find this mesh: a
    // duplicate is created at its current position, so edits target that;
    // source meshes are found at their build-time position.
    const at = isDup ? mesh.position : ch.origPos;

    if (isDup) {
      const sp = mesh.userData.lvlDupSrcPos as { x: number; y: number; z: number } | undefined;
      if (sp) {
        const rotPart = arr(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z);
        const sclPart = arr(mesh.scale.x, mesh.scale.y, mesh.scale.z);
        lines.push(`this.applyEditorDuplicate(${vec(sp)}, ${arr(mesh.position.x, mesh.position.y, mesh.position.z)}, ${rotPart}, ${sclPart});`);
      } else {
        lines.push(`// !! duplicate has no recorded source position — re-duplicate in the editor to fix`);
      }
    } else {
      const posDiff = !mesh.position.equals(ch.origPos);
      const rotDiff = Math.abs(mesh.rotation.x - ch.origRot.x) > EPS || Math.abs(mesh.rotation.y - ch.origRot.y) > EPS || Math.abs(mesh.rotation.z - ch.origRot.z) > EPS;
      const sclDiff = !mesh.scale.equals(ch.origScale);
      if (posDiff || rotDiff || sclDiff) {
        const posPart = posDiff ? arr(mesh.position.x, mesh.position.y, mesh.position.z) : 'null';
        const rotPart = rotDiff ? arr(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z) : 'null';
        const sclPart = sclDiff ? arr(mesh.scale.x, mesh.scale.y, mesh.scale.z) : 'null';
        lines.push(`this.applyEditorTransform(${vec(at)}, ${posPart}, ${rotPart}, ${sclPart});`);
      }
    }

    if (mat) {
      const colorChanged = mat.color.getHex() !== ch.colorHex;
      const roughChanged = Math.abs(mat.roughness - ch.roughness) > EPS;
      const metalChanged = Math.abs(mat.metalness - ch.metalness) > EPS;
      const emisColorChanged = mat.emissive.getHex() !== ch.emissiveHex;
      const emisIntChanged = Math.abs((mat.emissiveIntensity ?? 0) - ch.emissiveIntensity) > EPS;
      if (colorChanged || roughChanged || metalChanged || emisColorChanged || emisIntChanged) {
        lines.push(`this.applyEditorMaterial(${vec(at)}, ${colorChanged ? '0x' + mat.color.getHexString() : 'null'}, ${roughChanged ? f(mat.roughness) : 'null'}, ${metalChanged ? f(mat.metalness) : 'null'}, ${emisColorChanged || emisIntChanged ? '0x' + mat.emissive.getHexString() : 'null'}, ${emisColorChanged || emisIntChanged ? f(mat.emissiveIntensity ?? 0) : 'null'});`);
      }
    }

    const srcTex = (mat?.map ?? mat?.normalMap ?? mat?.roughnessMap) as THREE.Texture | null;
    if (ch.texSetLabel) {
      const ts = LVL_TEX_SETS.find(s => s.label === ch.texSetLabel);
      const u = srcTex ? srcTex.repeat.x : ch.uvRepeatU;
      const v = srcTex ? srcTex.repeat.y : ch.uvRepeatV;
      const rot = srcTex ? srcTex.rotation : ch.uvRotation;
      lines.push(`// Texture → ${ch.texSetLabel}, UV: (${f(u)}, ${f(v)}) rotation=${f(rot)}`);
      if (ts?.loaderMethod) lines.push(`this.applyEditorTexSet(${vec(at)}, '${ts.loaderMethod}', ${f(u)}, ${f(v)}, ${f(rot)});`);
    } else if (srcTex && (Math.abs(srcTex.repeat.x - ch.origUvU) > EPS || Math.abs(srcTex.repeat.y - ch.origUvV) > EPS || Math.abs(srcTex.rotation - ch.origUvRot) > EPS)) {
      lines.push(`// UV → repeat=(${f(srcTex.repeat.x)}, ${f(srcTex.repeat.y)}) rotation=${f(srcTex.rotation)}`);
      lines.push(`this.applyEditorUV(${vec(at)}, ${f(srcTex.repeat.x)}, ${f(srcTex.repeat.y)}, ${f(srcTex.rotation)});`);
    }
  }

  if (changed.length === 0) lines.push('', '// (no changes — select and modify objects first)');
  return lines.join('\n');
}

// ── wiring ────────────────────────────────────────────────────────────────────

// Level dropdown
const lvlSelEl = document.getElementById('lvlSel') as HTMLSelectElement;
LEVELS.forEach((lvl, i) => {
  const opt = document.createElement('option');
  opt.value = String(i); opt.textContent = `${i} – ${lvl.name}`;
  lvlSelEl.append(opt);
});
lvlSelEl.addEventListener('change', () => {
  lvlLoad(Number(lvlSelEl.value));
});

// Isolate button — give the selected mesh its own material so edits stay local.
document.getElementById('lvlIsolate')!.addEventListener('click', () => {
  if (!lvlSelectedMesh) return;
  lvlIsolateMesh(lvlSelectedMesh);
  lvlEnsureChange(lvlSelectedMesh);
  lvlPopulateMaterial(lvlSelectedMesh); // refreshes share info + reads from new material
  showToast('Material isolated — edits now affect only this piece');
});

// Texture set dropdown
const lvlTexSelEl = document.getElementById('lvlTexSel') as HTMLSelectElement;
LVL_TEX_SETS.forEach((ts, i) => {
  const opt = document.createElement('option'); opt.value = String(i); opt.textContent = ts.label;
  lvlTexSelEl.append(opt);
});
lvlTexSelEl.addEventListener('change', () => {
  if (!lvlSelectedMesh) return;
  const u = parseFloat((document.getElementById('lvlUVUNum') as HTMLInputElement).value) || 4;
  const v = parseFloat((document.getElementById('lvlUVVNum') as HTMLInputElement).value) || 4;
  const rot = parseFloat(document.querySelector<HTMLButtonElement>('.uv-rot-btn.active')?.dataset.rot ?? '0');
  lvlApplyTexSet(Number(lvlTexSelEl.value), u, v, rot);
});

// UV U / V repeat + rotation
function lvlGetCurrentUVRot(): number {
  return parseFloat(document.querySelector<HTMLButtonElement>('.uv-rot-btn.active')?.dataset.rot ?? '0');
}
function lvlApplyRepeatAndRot(u: number, v: number, rot: number) {
  if (!lvlSelectedMesh) return;
  const mat = lvlGetMaterial(lvlSelectedMesh);
  if (mat) lvlSetRepeatOnMat(mat, u, v, rot);
  const ch = lvlEnsureChange(lvlSelectedMesh);
  ch.uvRepeatU = u; ch.uvRepeatV = v; ch.uvRotation = rot;
}

const lvlUVUSlider = document.getElementById('lvlUVUSlider') as HTMLInputElement;
const lvlUVUNum = document.getElementById('lvlUVUNum') as HTMLInputElement;
const lvlSetUVU = (u: number) => {
  lvlUVUSlider.value = String(u); lvlUVUNum.value = String(Math.round(u * 100) / 100);
  lvlApplyRepeatAndRot(u, parseFloat(lvlUVVNum.value) || 1, lvlGetCurrentUVRot());
};
lvlUVUSlider.addEventListener('input', () => lvlSetUVU(parseFloat(lvlUVUSlider.value)));
lvlUVUNum.addEventListener('change', () => { const v = parseFloat(lvlUVUNum.value); if (!isNaN(v)) lvlSetUVU(Math.min(20, Math.max(0.1, v))); });
lvlUVUNum.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  const cur = parseFloat(lvlUVUNum.value); if (isNaN(cur)) return;
  const delta = e.shiftKey ? 1 : 0.1;
  lvlSetUVU(Math.min(20, Math.max(0.1, Math.round((cur + (e.key === 'ArrowUp' ? delta : -delta)) * 100) / 100)));
});

const lvlUVVSlider = document.getElementById('lvlUVVSlider') as HTMLInputElement;
const lvlUVVNum = document.getElementById('lvlUVVNum') as HTMLInputElement;
const lvlSetUVV = (v: number) => {
  lvlUVVSlider.value = String(v); lvlUVVNum.value = String(Math.round(v * 100) / 100);
  lvlApplyRepeatAndRot(parseFloat(lvlUVUNum.value) || 1, v, lvlGetCurrentUVRot());
};
lvlUVVSlider.addEventListener('input', () => lvlSetUVV(parseFloat(lvlUVVSlider.value)));
lvlUVVNum.addEventListener('change', () => { const v = parseFloat(lvlUVVNum.value); if (!isNaN(v)) lvlSetUVV(Math.min(20, Math.max(0.1, v))); });
lvlUVVNum.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  const cur = parseFloat(lvlUVVNum.value); if (isNaN(cur)) return;
  const delta = e.shiftKey ? 1 : 0.1;
  lvlSetUVV(Math.min(20, Math.max(0.1, Math.round((cur + (e.key === 'ArrowUp' ? delta : -delta)) * 100) / 100)));
});

document.querySelectorAll<HTMLButtonElement>('.uv-rot-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.uv-rot-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const rot = parseFloat(btn.dataset.rot ?? '0');
    lvlApplyRepeatAndRot(parseFloat(lvlUVUNum.value) || 1, parseFloat(lvlUVVNum.value) || 1, rot);
  });
});

// Color tint
document.getElementById('lvlColorPick')!.addEventListener('input', (e) => {
  if (!lvlSelectedMesh) return;
  const mat = lvlGetMaterial(lvlSelectedMesh);
  if (!mat) return;
  mat.color.set((e.target as HTMLInputElement).value);
  const ch = lvlEnsureChange(lvlSelectedMesh); ch.colorHex = mat.color.getHex();
});

// Roughness
const lvlRoughSlider = document.getElementById('lvlRoughSlider') as HTMLInputElement;
const lvlRoughNum = document.getElementById('lvlRoughNum') as HTMLInputElement;
const lvlSetRough = (v: number) => {
  lvlRoughSlider.value = String(v); lvlRoughNum.value = String(Math.round(v * 1000) / 1000);
  if (!lvlSelectedMesh) return;
  const mat = lvlGetMaterial(lvlSelectedMesh);
  if (mat) mat.roughness = v;
};
lvlRoughSlider.addEventListener('input', () => lvlSetRough(parseFloat(lvlRoughSlider.value)));
lvlRoughNum.addEventListener('change', () => { const v = parseFloat(lvlRoughNum.value); if (!isNaN(v)) lvlSetRough(Math.min(1, Math.max(0, v))); });
lvlRoughNum.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  const cur = parseFloat(lvlRoughNum.value); if (isNaN(cur)) return;
  const delta = e.shiftKey ? 0.1 : 0.05;
  lvlSetRough(Math.min(1, Math.max(0, Math.round((cur + (e.key === 'ArrowUp' ? delta : -delta)) * 1000) / 1000)));
});

// Metalness
const lvlMetalSlider = document.getElementById('lvlMetalSlider') as HTMLInputElement;
const lvlMetalNum = document.getElementById('lvlMetalNum') as HTMLInputElement;
const lvlSetMetal = (v: number) => {
  lvlMetalSlider.value = String(v); lvlMetalNum.value = String(Math.round(v * 1000) / 1000);
  if (!lvlSelectedMesh) return;
  const mat = lvlGetMaterial(lvlSelectedMesh);
  if (mat) mat.metalness = v;
};
lvlMetalSlider.addEventListener('input', () => lvlSetMetal(parseFloat(lvlMetalSlider.value)));
lvlMetalNum.addEventListener('change', () => { const v = parseFloat(lvlMetalNum.value); if (!isNaN(v)) lvlSetMetal(Math.min(1, Math.max(0, v))); });
lvlMetalNum.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  const cur = parseFloat(lvlMetalNum.value); if (isNaN(cur)) return;
  const delta = e.shiftKey ? 0.1 : 0.05;
  lvlSetMetal(Math.min(1, Math.max(0, Math.round((cur + (e.key === 'ArrowUp' ? delta : -delta)) * 1000) / 1000)));
});

// Emissive color
document.getElementById('lvlEmissivePick')!.addEventListener('input', (e) => {
  if (!lvlSelectedMesh) return;
  const mat = lvlGetMaterial(lvlSelectedMesh);
  if (!mat) return;
  mat.emissive.set((e.target as HTMLInputElement).value);
  mat.needsUpdate = true;
});

// Emissive intensity
const lvlEmissiveSlider = document.getElementById('lvlEmissiveSlider') as HTMLInputElement;
const lvlEmissiveNum = document.getElementById('lvlEmissiveNum') as HTMLInputElement;
const lvlSetEmissive = (v: number) => {
  lvlEmissiveSlider.value = String(v); lvlEmissiveNum.value = String(Math.round(v * 100) / 100);
  if (!lvlSelectedMesh) return;
  const mat = lvlGetMaterial(lvlSelectedMesh);
  if (mat) { mat.emissiveIntensity = v; mat.needsUpdate = true; }
};
lvlEmissiveSlider.addEventListener('input', () => lvlSetEmissive(parseFloat(lvlEmissiveSlider.value)));
lvlEmissiveNum.addEventListener('change', () => { const v = parseFloat(lvlEmissiveNum.value); if (!isNaN(v)) lvlSetEmissive(Math.min(5, Math.max(0, v))); });
lvlEmissiveNum.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  const cur = parseFloat(lvlEmissiveNum.value); if (isNaN(cur)) return;
  const delta = e.shiftKey ? 0.5 : 0.1;
  lvlSetEmissive(Math.min(5, Math.max(0, Math.round((cur + (e.key === 'ArrowUp' ? delta : -delta)) * 100) / 100)));
});

// Export buttons
const lvlExportEl = document.getElementById('lvlExport') as HTMLTextAreaElement;
document.getElementById('lvlGenExport')!.addEventListener('click', async () => { 
  const code = lvlGenerateExport(); 
  lvlExportEl.value = code; 
  await tryAutoApply('level', code); 
});
document.getElementById('lvlCopyExport')!.addEventListener('click', () => {
  if (!lvlExportEl.value) lvlExportEl.value = lvlGenerateExport();
  navigator.clipboard.writeText(lvlExportEl.value);
});

function lvlApplyTextureSettings(mesh: THREE.Mesh, settings: typeof copiedTextureSettings) {
  if (!settings) return;
  const mat = lvlGetMaterial(mesh);
  if (!mat) return;
  
  const ts = LVL_TEX_SETS.find(s => s.label === settings.texSetLabel);
  if (ts && ts.loaderMethod) {
    const loadMap = (path?: string, srgb = false): THREE.Texture | null => {
      if (!path) return null;
      const t = lvlLoadTex(path).clone();
      t.needsUpdate = true;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.repeat.set(settings.uvRepeatU, settings.uvRepeatV);
      t.center.set(0.5, 0.5);
      t.rotation = settings.uvRotation;
      return t;
    };

    mat.map          = loadMap(ts.c, true);
    mat.normalMap    = loadMap(ts.n);
    mat.roughnessMap = loadMap(ts.r);
    mat.aoMap        = loadMap(ts.ao);
    mat.metalnessMap = loadMap(ts.metal);
    mat.emissiveMap  = null;
  } else {
    lvlSetRepeatOnMat(mat, settings.uvRepeatU, settings.uvRepeatV, settings.uvRotation);
  }
  
  mat.color.setHex(settings.colorHex);
  mat.roughness = settings.roughness;
  mat.metalness = settings.metalness;
  mat.emissive.setHex(settings.emissiveHex);
  mat.emissiveIntensity = settings.emissiveIntensity;
  mat.needsUpdate = true;

  const ch = lvlEnsureChange(mesh);
  ch.texSetLabel = settings.texSetLabel;
  ch.uvRepeatU = settings.uvRepeatU;
  ch.uvRepeatV = settings.uvRepeatV;
  ch.uvRotation = settings.uvRotation;
  ch.colorHex = settings.colorHex;
  ch.roughness = settings.roughness;
  ch.metalness = settings.metalness;
  ch.emissiveHex = settings.emissiveHex;
  ch.emissiveIntensity = settings.emissiveIntensity;
}

function lvlCopyTexture() {
  if (!lvlSelectedMesh) return;
  const mat = lvlGetMaterial(lvlSelectedMesh);
  if (!mat) return;
  const ch = lvlEnsureChange(lvlSelectedMesh);
  
  const srcTex = (mat.map ?? mat.normalMap ?? mat.roughnessMap) as THREE.Texture | null;
  const uvRepeatU = srcTex?.repeat?.x ?? 1;
  const uvRepeatV = srcTex?.repeat?.y ?? 1;
  const uvRotation = srcTex?.rotation ?? 0;
  
  let texSetLabel = ch.texSetLabel;
  if (!texSetLabel) {
    const texIdx = lvlInferTexSet(mat);
    texSetLabel = LVL_TEX_SETS[texIdx]?.label || '';
  }
  copiedTextureSettings = {
    texSetLabel,
    uvRepeatU,
    uvRepeatV,
    uvRotation,
    colorHex: mat.color.getHex(),
    roughness: mat.roughness,
    metalness: mat.metalness,
    emissiveHex: mat.emissive.getHex(),
    emissiveIntensity: mat.emissiveIntensity,
  };
  updateCopyPasteUI();
  showToast('Copied texture settings');
}

function lvlPasteTexture() {
  if (!copiedTextureSettings || lvlSelection.length === 0) return;
  lvlBeginStep();
  for (const mesh of lvlSelection) {
    lvlApplyTextureSettings(mesh, copiedTextureSettings);
  }
  lvlCommitStep();
  if (lvlSelectedMesh) {
    lvlPopulateMaterial(lvlSelectedMesh);
  }
  showToast('Applied texture settings');
}

document.getElementById('lvlTexCopy')!.addEventListener('click', () => lvlCopyTexture());
document.getElementById('lvlTexPaste')!.addEventListener('click', () => lvlPasteTexture());

// Build transform rows (once, into the static HTML containers)
lvlBuildTransformRows();

let _lastFrameTime = performance.now();
function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min(0.05, (now - _lastFrameTime) * 0.001);
  _lastFrameTime = now;
  if (!updateGamepadCamera(dt)) controls.update();
  const t = now * 0.001;
  if (activeTab === 'level') {
    if (lvlEnvMgr) (lvlEnvMgr as any).update(t);
    if (lvlBoxHelper?.visible && lvlSelectedMesh) lvlBoxHelper.setFromObject(lvlSelectedMesh);
    for (const bh of lvlSecHelpers) bh.update();
  } else {
    if (boxHelper.visible && nodes[partSel.value]) boxHelper.setFromObject(nodes[partSel.value]);
    for (const bh of secondaryBoxHelpers) bh.update();
    let restorePose: (() => void) | null = null;
    if (breathing && rig) restorePose = applyIdlePose();
    else if (previewAnimId && rig) restorePose = applyAndRestoreAnimPose(previewAnimId);
    renderer.render(scene, camera);
    if (restorePose) restorePose();
    return;
  }
  renderer.render(scene, camera);
}
animate();

// =============================================================================
// TOAST
// =============================================================================
let _toastTimer: ReturnType<typeof setTimeout> | null = null;
function showToast(msg: string) {
  const el = document.getElementById('toast')!;
  el.textContent = msg;
  el.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

// =============================================================================
// LEVEL EDITOR — UNDO / REDO
// =============================================================================

interface LvlMeshSnap {
  uuid: string;
  pos: { x: number; y: number; z: number };
  rot: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  colorHex: number;
  roughness: number;
  metalness: number;
  uvRepeatU: number;
  uvRepeatV: number;
  uvRotation: number;
  texSetLabel: string;
  isDuplicate: boolean;   // clone that was added to scene
}

type LvlUndoEntry = {
  snaps: LvlMeshSnap[];
  // clones present in the scene AFTER this state was recorded (so undo can remove them)
  cloneUuids: string[];
};

const lvlUndoStack: LvlUndoEntry[] = [];
const lvlRedoStack: LvlUndoEntry[] = [];
// Meshes removed from scene during undo, kept alive for redo.
const lvlOrphans = new Map<string, { mesh: THREE.Mesh; parent: THREE.Object3D }>();
const LVL_MAX_UNDO = 80;

function lvlAllTrackedMeshes(): LvlMeshSnap[] {
  const snaps: LvlMeshSnap[] = [];
  for (const [uuid, ch] of lvlChanges) {
    const mesh = lvlMeshByUuid(uuid);
    if (!mesh) continue;
    const mat = lvlGetMaterial(mesh);
    snaps.push({
      uuid,
      pos: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z },
      rot: { x: mesh.rotation.x, y: mesh.rotation.y, z: mesh.rotation.z },
      scale: { x: mesh.scale.x, y: mesh.scale.y, z: mesh.scale.z },
      colorHex: mat?.color.getHex() ?? ch.colorHex,
      roughness: mat?.roughness ?? ch.roughness,
      metalness: mat?.metalness ?? ch.metalness,
      uvRepeatU: ch.uvRepeatU,
      uvRepeatV: ch.uvRepeatV,
      uvRotation: ch.uvRotation,
      texSetLabel: ch.texSetLabel,
      isDuplicate: !!mesh.userData.lvlDuplicate,
    });
  }
  return snaps;
}

function lvlCurrentCloneUuids(): string[] {
  const out: string[] = [];
  for (const [uuid, ch] of lvlChanges) {
    void ch;
    const mesh = lvlMeshByUuid(uuid);
    if (mesh?.userData.lvlDuplicate) out.push(uuid);
  }
  return out;
}

function lvlMeshByUuid(uuid: string): THREE.Mesh | undefined {
  if (!lvlEnvMgr) return undefined;
  const envGroup = (lvlEnvMgr as any).environmentGroup as THREE.Group;
  let found: THREE.Mesh | undefined;
  envGroup.traverse(o => { if (o.uuid === uuid && o instanceof THREE.Mesh) found = o; });
  if (!found && lvlOrphans.has(uuid)) {
    // Might be detached but orphan mesh still has original uuid
    found = lvlOrphans.get(uuid)!.mesh;
  }
  return found;
}

function lvlSnapshotEntry(): LvlUndoEntry {
  return { snaps: lvlAllTrackedMeshes(), cloneUuids: lvlCurrentCloneUuids() };
}

let lvlPendingSnap: LvlUndoEntry | null = null;

function lvlBeginStep() {
  if (!lvlPendingSnap) {
    lvlPendingSnap = lvlSnapshotEntry();
    lvlRedoStack.length = 0;
  }
}

function lvlCommitStep() {
  if (!lvlPendingSnap) return;
  lvlUndoStack.push(lvlPendingSnap);
  if (lvlUndoStack.length > LVL_MAX_UNDO) lvlUndoStack.shift();
  lvlPendingSnap = null;
}

function lvlApplySnap(entry: LvlUndoEntry) {
  const envGroup = lvlEnvMgr ? (lvlEnvMgr as any).environmentGroup as THREE.Group : null;

  // Re-attach any orphaned clones that should be in this snapshot.
  const snapUuids = new Set(entry.snaps.map(s => s.uuid));
  for (const [uuid, orphan] of lvlOrphans) {
    if (snapUuids.has(uuid)) {
      orphan.parent.add(orphan.mesh);
      lvlOrphans.delete(uuid);
    }
  }

  // Remove clones that exist now but shouldn't in this snapshot.
  if (envGroup) {
    const meshesToOrphan: THREE.Mesh[] = [];
    envGroup.traverse(o => {
      if (o instanceof THREE.Mesh && o.userData.lvlDuplicate && !snapUuids.has(o.uuid)) {
        meshesToOrphan.push(o);
      }
    });
    for (const m of meshesToOrphan) {
      lvlOrphans.set(m.uuid, { mesh: m, parent: m.parent! });
      m.parent!.remove(m);
      lvlChanges.delete(m.uuid);
    }
  }

  // Apply stored transforms and material values.
  for (const snap of entry.snaps) {
    const mesh = lvlMeshByUuid(snap.uuid);
    if (!mesh) continue;
    mesh.position.set(snap.pos.x, snap.pos.y, snap.pos.z);
    mesh.rotation.set(snap.rot.x, snap.rot.y, snap.rot.z);
    mesh.scale.set(snap.scale.x, snap.scale.y, snap.scale.z);
    const mat = lvlGetMaterial(mesh);
    if (mat) {
      mat.color.setHex(snap.colorHex);
      mat.roughness = snap.roughness;
      mat.metalness = snap.metalness;
    }
    // Restore texture set if recorded.
    if (snap.texSetLabel) {
      const tsIdx = LVL_TEX_SETS.findIndex(s => s.label === snap.texSetLabel);
      if (tsIdx >= 0) lvlApplyTexSet(tsIdx, snap.uvRepeatU, snap.uvRepeatV, snap.uvRotation);
      else if (mat) lvlSetRepeatOnMat(mat, snap.uvRepeatU, snap.uvRepeatV, snap.uvRotation);
    } else if (mat) {
      lvlSetRepeatOnMat(mat, snap.uvRepeatU, snap.uvRepeatV, snap.uvRotation);
    }
    // Restore change record values.
    const ch = lvlChanges.get(snap.uuid);
    if (ch) {
      ch.colorHex = snap.colorHex;
      ch.roughness = snap.roughness;
      ch.metalness = snap.metalness;
      ch.uvRepeatU = snap.uvRepeatU;
      ch.uvRepeatV = snap.uvRepeatV;
      ch.uvRotation = snap.uvRotation;
      ch.texSetLabel = snap.texSetLabel;
    }
  }

  // Re-sync UI if the selected mesh is still valid.
  if (lvlSelectedMesh && !lvlMeshByUuid(lvlSelectedMesh.uuid)) {
    lvlSelectMesh(null);
  } else if (lvlSelectedMesh) {
    lvlPopulateTransform(lvlSelectedMesh);
    lvlPopulateMaterial(lvlSelectedMesh);
  }
  if (lvlBoxHelper?.visible && lvlSelectedMesh) lvlBoxHelper.setFromObject(lvlSelectedMesh);
}

function lvlUndo() {
  const prev = lvlUndoStack.pop();
  if (!prev) return;
  lvlRedoStack.push(lvlSnapshotEntry());
  lvlApplySnap(prev);
}

function lvlRedo() {
  const next = lvlRedoStack.pop();
  if (!next) return;
  lvlUndoStack.push(lvlSnapshotEntry());
  lvlApplySnap(next);
}

// Hook transform sliders to begin/commit steps.
// (Called after lvlBuildTransformRows builds the sliders; we wrap the existing onChange.)
function lvlHookUndoOnSliders() {
  if (!lvlEnvMgr) return; // not built yet — hooked at load time instead
  const allRanges = document.querySelectorAll<HTMLInputElement>('#lvlPosRows input[type=range], #lvlRotRows input[type=range], #lvlSclRows input[type=range]');
  allRanges.forEach(r => {
    r.addEventListener('pointerdown', () => lvlBeginStep());
    r.addEventListener('pointerup', () => lvlCommitStep());
    r.addEventListener('keydown', () => lvlBeginStep());
    r.addEventListener('change', () => lvlCommitStep());
  });
  const allNums = document.querySelectorAll<HTMLInputElement>('#lvlPosRows input.num, #lvlRotRows input.num, #lvlSclRows input.num');
  allNums.forEach(n => {
    n.addEventListener('focus', () => lvlBeginStep());
    n.addEventListener('change', () => lvlCommitStep());
  });
}
// Also hook UV/rough/metal sliders and color picker.
// (The single UV slider was split into separate U and V sliders — hook both.)
for (const id of ['lvlUVUSlider', 'lvlUVVSlider']) {
  document.getElementById(id)!.addEventListener('pointerdown', () => lvlBeginStep());
  document.getElementById(id)!.addEventListener('pointerup', () => lvlCommitStep());
}
(document.getElementById('lvlRoughSlider') as HTMLInputElement).addEventListener('pointerdown', () => lvlBeginStep());
(document.getElementById('lvlRoughSlider') as HTMLInputElement).addEventListener('pointerup', () => lvlCommitStep());
(document.getElementById('lvlMetalSlider') as HTMLInputElement).addEventListener('pointerdown', () => lvlBeginStep());
(document.getElementById('lvlMetalSlider') as HTMLInputElement).addEventListener('pointerup', () => lvlCommitStep());
document.getElementById('lvlColorPick')!.addEventListener('input', () => lvlBeginStep());
document.getElementById('lvlColorPick')!.addEventListener('change', () => lvlCommitStep());
document.getElementById('lvlTexSel')!.addEventListener('mousedown', () => lvlBeginStep());
document.getElementById('lvlTexSel')!.addEventListener('change', () => lvlCommitStep());

document.getElementById('lvlUndo')!.addEventListener('click', lvlUndo);
document.getElementById('lvlRedo')!.addEventListener('click', lvlRedo);

// =============================================================================
// LEVEL EDITOR — DUPLICATE
// =============================================================================

function lvlDuplicateSelected() {
  if (!lvlSelectedMesh || !lvlEnvMgr) { showToast('Select an object first'); return; }
  const src = lvlSelectedMesh;
  const envGroup = (lvlEnvMgr as any).environmentGroup as THREE.Group;

  // Snapshot before adding the clone.
  lvlBeginStep();
  lvlCommitStep();

  // Deep-clone the mesh and its material.
  const clone = src.clone(true) as THREE.Mesh;
  // Clone material so edits on clone don't affect original.
  if (Array.isArray(clone.material)) {
    clone.material = clone.material.map(m => m.clone());
  } else {
    clone.material = clone.material.clone();
  }
  // Offset by a small amount in local X.
  clone.position.x += src.geometry?.boundingBox
    ? (src.geometry.boundingBox.max.x - src.geometry.boundingBox.min.x) * src.scale.x + 0.3
    : 1.0;
  clone.userData.lvlDuplicate = true;
  // Remember which source mesh this was cloned from (by its build-time
  // position) so the export can emit a re-creatable applyEditorDuplicate call.
  const srcChange = lvlChanges.get(src.uuid);
  const srcBase = srcChange?.origPos ?? src.position;
  clone.userData.lvlDupSrcPos = { x: srcBase.x, y: srcBase.y, z: srcBase.z };
  (src.parent ?? envGroup).add(clone);

  // Register clone in change tracking.
  const mat = lvlGetMaterial(clone);
  const cloneTex0 = (mat?.map ?? mat?.normalMap ?? mat?.roughnessMap) as THREE.Texture | null;
  lvlChanges.set(clone.uuid, {
    label: `${lvlObjLabel(clone)} [copy]`,
    origPos: clone.position.clone(),
    origRot: clone.rotation.clone(),
    origScale: clone.scale.clone(),
    origUvU: cloneTex0?.repeat?.x ?? 1,
    origUvV: cloneTex0?.repeat?.y ?? 1,
    origUvRot: cloneTex0?.rotation ?? 0,
    texSetLabel: srcChange?.texSetLabel ?? '',
    uvRepeatU: srcChange?.uvRepeatU ?? 1,
    uvRepeatV: srcChange?.uvRepeatV ?? 1,
    uvRotation: srcChange?.uvRotation ?? 0,
    colorHex: mat?.color.getHex() ?? 0xffffff,
    roughness: mat?.roughness ?? 0.8,
    metalness: mat?.metalness ?? 0,
    emissiveHex: mat?.emissive?.getHex() ?? 0x000000,
    emissiveIntensity: mat?.emissiveIntensity ?? 0,
  });

  // Compute bounding box so position offset is accurate on undo/redo.
  clone.geometry?.computeBoundingBox?.();

  lvlSelectMesh(clone);
  showToast('Duplicated — object selected');
}

document.getElementById('lvlDup')!.addEventListener('click', lvlDuplicateSelected);
// Hook undo after transform rows exist.
lvlHookUndoOnSliders();

// Debug/test hook: lets headless regression tests (test/*.cjs) drive the level
// editor without synthesizing raycast clicks. Not used by the UI.
(window as any).__lvlDebug = {
  load: lvlLoad,
  select: lvlSelectMesh,
  duplicate: lvlDuplicateSelected,
  setUV: lvlApplyRepeatAndRot,
  generate: lvlGenerateExport,
  changes: lvlChanges,
  getEnvMgr: () => lvlEnvMgr,
};

// =============================================================================
// CHARACTER EDITOR — DUPLICATE PART
// =============================================================================

function charDuplicateOne(key: string): string | null {
  const srcNode = nodes[key];
  if (!srcNode) return null;

  const jointSet = new Set(Object.values(nodes));
  const newGroup = new THREE.Group();
  newGroup.position.copy(srcNode.position);
  newGroup.position.x += 0.18 * scale;
  newGroup.rotation.copy(srcNode.rotation);
  newGroup.scale.copy(srcNode.scale);

  for (const child of srcNode.children) {
    if (jointSet.has(child)) continue;
    const clonedChild = child.clone(true);
    clonedChild.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (Array.isArray(m.material)) m.material = m.material.map(mat => mat.clone());
      else if (m.material) m.material = (m.material as THREE.Material).clone();
    });
    newGroup.add(clonedChild);
  }

  if (newGroup.children.length === 0 && srcNode instanceof THREE.Mesh) {
    const cloned = srcNode.clone(false);
    if (Array.isArray(cloned.material)) cloned.material = cloned.material.map(m => m.clone());
    else if (cloned.material) cloned.material = (cloned.material as THREE.Material).clone();
    newGroup.add(cloned);
  }

  if (newGroup.children.length === 0) return null;

  (srcNode.parent ?? rig.mesh).add(newGroup);

  let dupIdx = 1;
  let newKey = `${key}_dup${dupIdx}`;
  while (nodes[newKey]) { dupIdx++; newKey = `${key}_dup${dupIdx}`; }

  if (!rig.extras) (rig as any).extras = {};
  (rig as any).extras[newKey] = newGroup;

  nodes[newKey] = newGroup;
  extraKeys.add(newKey);
  AUTO_HIERARCHY.add(newKey);

  baseGroup[newKey] = {
    pos: { x: newGroup.position.x, y: newGroup.position.y, z: newGroup.position.z },
    rot: { x: newGroup.rotation.x, y: newGroup.rotation.y, z: newGroup.rotation.z },
    scl: { x: newGroup.scale.x, y: newGroup.scale.y, z: newGroup.scale.z },
    taperTop: 1, taperBot: 1,
  };
  baseMeshes[newKey] = newGroup.children.map(c => ({
    obj: c,
    pos: cloneV(c.position),
    rot: cloneV(c.rotation),
    scl: cloneV(c.scale),
  }));
  baseTaperVerts[newKey] = [];
  newGroup.traverse(child => {
    if (!(child instanceof THREE.Mesh) || !child.geometry?.attributes?.position) return;
    baseTaperVerts[newKey].push({
      mesh: child,
      origPositions: new Float32Array(child.geometry.attributes.position.array),
    });
  });
  state[newKey] = {
    hierarchy: { pos: cloneV(newGroup.position), rot: cloneV(newGroup.rotation), scl: cloneV(newGroup.scale) },
    part: { pos: vec(), rot: vec(), scl: one() },
    taper: { top: 1, bottom: 1 },
  };

  return newKey;
}

function charDuplicatePart() {
  const keys = Array.from(selectedKeys);
  if (keys.length === 0) { showToast('Select a part first'); return; }

  let lastKey: string | null = null;
  let count = 0;
  recordStep(() => {
    for (const key of keys) {
      const newKey = charDuplicateOne(key);
      if (newKey) { lastKey = newKey; count++; }
    }
    if (lastKey) {
      buildPartDropdown();
      selectPart(lastKey);
    }
  });

  if (count === 0) showToast('Nothing to duplicate on selected parts');
  else showToast(count === 1 ? `Part duplicated → ${lastKey}` : `${count} parts duplicated`);
}

// =============================================================================
// CHARACTER EDITOR — DELETE EXTRA
// =============================================================================

function deleteSelectedExtra() {
  const key = partSel.value;
  if (!key || !extraKeys.has(key)) {
    if (key) showToast('Only duplicate / added parts can be deleted');
    return;
  }
  // Remove from scene graph.
  nodes[key].parent?.remove(nodes[key]);
  // Unregister from all tracking maps.
  delete nodes[key];
  extraKeys.delete(key);
  AUTO_HIERARCHY.delete(key);
  delete baseGroup[key];
  delete baseMeshes[key];
  delete baseTaperVerts[key];
  delete state[key];
  if (rig.extras) delete (rig.extras as any)[key];
  selectedKeys.delete(key);
  // Rebuild dropdown and select the first remaining part.
  buildPartDropdown();
  const remaining = Object.keys(nodes);
  if (remaining.length > 0) selectPart(remaining[0]);
  else { boxHelper.visible = false; }
  rebuildSecondaryBoxHelpers();
  showToast(`"${key}" deleted`);
}

updateCopyPasteUI();
