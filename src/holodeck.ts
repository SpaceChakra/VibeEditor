import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
// @ts-ignore
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment';
import { CharacterBuilder, WarriorType } from './CharacterBuilder';
import type { CharacterRig } from './warriors/types';
import { EnvironmentManager, LEVELS } from './EnvironmentManager';

type VecTuple = [number, number, number];
type RigKey = keyof CharacterRig & string;
type BoneState = { pos: THREE.Vector3; rot: THREE.Euler; scl: THREE.Vector3 };
type PoseOverride = { pos?: VecTuple; rot?: VecTuple; scl?: VecTuple };
type PoseMap = Partial<Record<RigKey, PoseOverride>>;
type PoseDef = { id: string; label: string; duration: number; hold: number; sample: (phase: number, s: number, base: Partial<Record<RigKey, BoneState>>) => PoseMap };

const CHARACTER_OPTIONS = [
  { label: 'Rusty / Randroid', type: WarriorType.RUSTY, variant: 0 },
  { label: 'Knight', type: WarriorType.KNIGHT, variant: 0 },
  { label: 'Samurai', type: WarriorType.SAMURAI, variant: 1 },
  { label: 'Pirate', type: WarriorType.PIRATE, variant: 2 },
];

const RIG_KEYS: RigKey[] = [
  'torso', 'pelvis', 'neck', 'head',
  'lUpperArm', 'lForearm', 'lHand',
  'rUpperArm', 'rForearm', 'rHand',
  'lThigh', 'lCalf', 'lFoot',
  'rThigh', 'rCalf', 'rFoot',
  'weaponGroup',
];

const stageEl = document.getElementById('stage') as HTMLDivElement;
const characterSelect = document.getElementById('characterSelect') as HTMLSelectElement;
const poseSelect = document.getElementById('poseSelect') as HTMLSelectElement;
const levelSelect = document.getElementById('levelSelect') as HTMLSelectElement;
const pauseToggle = document.getElementById('pauseToggle') as HTMLInputElement;
const repeatToggle = document.getElementById('repeatToggle') as HTMLInputElement;
const poseStatus = document.getElementById('poseStatus') as HTMLDivElement;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.45;
stageEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x20242c);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
scene.environmentIntensity = 0.45;

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.position.set(0, 2.45, 7.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.35, -0.25);
controls.enableDamping = true;

const key = new THREE.DirectionalLight(0xfff0dd, 3.0);
key.position.set(4, 7, 4.8);
key.castShadow = true;
scene.add(key);

const fill = new THREE.DirectionalLight(0x84b7ff, 0.85);
fill.position.set(-5, 2.8, 4);
scene.add(fill);

const rim = new THREE.DirectionalLight(0xffd39c, 1.0);
rim.position.set(0, 3.2, -5);
scene.add(rim);

const envMgr = new EnvironmentManager(scene);
let rig: CharacterRig | null = null;
let baseState: Partial<Record<RigKey, BoneState>> = {};
let activePoseIndex = 0;
let previousPoseIndex = 0;
let poseElapsed = 0;
let holdElapsed = 0;
let transitionElapsed = 0;
let transitionFromMap: PoseMap | null = null;
let lastTime = performance.now();

const POSES: PoseDef[] = [
  {
    id: 'idle',
    label: 'Idle Breathing',
    duration: 1.8,
    hold: 0.7,
    sample: (phase, s, base) => {
      const sway = Math.sin(phase * Math.PI * 2);
      return {
        torso: { rot: [0.08 + sway * 0.025, sway * 0.05, 0], scl: [1, 1, 1 + sway * 0.02] },
        head: { rot: [-0.03, sway * 0.08, 0] },
        lUpperArm: { rot: [0.12 + sway * 0.04, 0, -0.34] },
        rUpperArm: { rot: [0.18 - sway * 0.035, 0, 0.28] },
        lForearm: { rot: [-0.45, 0, 0] },
        rForearm: { rot: [-0.48, 0, 0] },
        lThigh: { rot: [-0.1, 0, -0.1] },
        rThigh: { rot: [-0.1, 0, 0.1] },
        pelvis: { pos: offsetPos(base, 'pelvis', 0, -sway * 0.012 * s, 0) },
      };
    },
  },
  {
    id: 'guard',
    label: 'High Guard',
    duration: 1.25,
    hold: 0.9,
    sample: (_phase, s, base) => ({
      torso: { pos: offsetPos(base, 'torso', 0, -0.07 * s, 0), rot: [0.16, -0.26, 0.08] },
      head: { rot: [-0.05, 0.18, 0] },
      lUpperArm: { rot: [-0.35, 1.15, -1.12] },
      lForearm: { rot: [-0.95, 0.12, -0.82] },
      lHand: { rot: [0.1, 0.55, 0] },
      rUpperArm: { rot: [-0.28, -0.85, 1.08] },
      rForearm: { rot: [-1.25, -0.08, -0.18] },
      rHand: { rot: [0.04, -0.75, -0.18] },
      weaponGroup: { rot: [0.45, 0.18, -1.35] },
      lThigh: { rot: [-0.34, 0, -0.2] },
      rThigh: { rot: [-0.34, 0, 0.2] },
      lCalf: { rot: [0.38, 0, 0] },
      rCalf: { rot: [0.38, 0, 0] },
    }),
  },
  {
    id: 'strike',
    label: 'Overhead Strike',
    duration: 1.45,
    hold: 0.55,
    sample: (phase, s, base) => {
      const p = easeInOut(Math.min(1, phase * 1.25));
      return {
        torso: { pos: offsetPos(base, 'torso', 0, -0.04 * s, 0.04 * s * p), rot: [0.12 + 0.32 * p, -0.28 + 0.52 * p, 0.06] },
        head: { rot: [-0.12 + 0.24 * p, 0.2 - 0.35 * p, 0] },
        rUpperArm: { rot: [-2.2 + 1.45 * p, -0.25, 0.75] },
        rForearm: { rot: [-1.15 + 0.8 * p, 0.1, 0.2] },
        lUpperArm: { rot: [-0.65, 0.62, -1.1] },
        lForearm: { rot: [-0.85, 0.12, -0.45] },
        weaponGroup: { rot: [0.75 + 1.25 * p, 0.35 - 0.4 * p, -1.28 + 0.45 * p] },
        lThigh: { rot: [-0.28, 0, -0.18] },
        rThigh: { rot: [-0.16 - 0.18 * p, 0, 0.2] },
        lCalf: { rot: [0.32, 0, 0] },
        rCalf: { rot: [0.22 + 0.18 * p, 0, 0] },
      };
    },
  },
  {
    id: 'dash',
    label: 'Forward Dash',
    duration: 1.1,
    hold: 0.65,
    sample: (phase, s, base) => {
      const p = Math.sin(Math.PI * phase);
      return {
        torso: { pos: offsetPos(base, 'torso', 0, -0.18 * s * p, 0.2 * s * p), rot: [0.2 + 0.35 * p, 0.12, 0] },
        pelvis: { pos: offsetPos(base, 'pelvis', 0, -0.1 * s * p, 0.08 * s * p), rot: [0.08 * p, 0, 0] },
        head: { rot: [-0.18 * p, -0.08, 0] },
        lUpperArm: { rot: [-1.15, 0.85, -0.52] },
        lForearm: { rot: [-1.0, 0, 0] },
        rUpperArm: { rot: [-0.72, -0.25, 0.5] },
        rForearm: { rot: [-0.25, 0, 0] },
        lThigh: { rot: [-0.72, 0, -0.18] },
        rThigh: { rot: [0.2, 0, 0.16] },
        lCalf: { rot: [0.75, 0, 0] },
        rCalf: { rot: [0.16, 0, 0] },
      };
    },
  },
  {
    id: 'jump',
    label: 'Jump Apex',
    duration: 1.35,
    hold: 0.55,
    sample: (phase, s, base) => {
      const lift = Math.sin(Math.PI * phase);
      return {
        torso: { pos: offsetPos(base, 'torso', 0, 0.32 * s * lift, 0), rot: [0.12, 0, 0] },
        pelvis: { pos: offsetPos(base, 'pelvis', 0, 0.32 * s * lift, 0), rot: [0.22, 0, 0] },
        lUpperArm: { rot: [-1.45, 0, -0.55] },
        rUpperArm: { rot: [-1.45, 0, 0.55] },
        lForearm: { rot: [-0.62, 0, 0] },
        rForearm: { rot: [-0.62, 0, 0] },
        lThigh: { rot: [-1.05, 0, -0.15] },
        rThigh: { rot: [-0.42, 0, 0.15] },
        lCalf: { rot: [1.05, 0, 0] },
        rCalf: { rot: [0.8, 0, 0] },
      };
    },
  },
  {
    id: 'victory',
    label: 'Victory Hold',
    duration: 1.5,
    hold: 1.0,
    sample: (phase, s, base) => {
      const bounce = Math.sin(Math.PI * phase);
      return {
        torso: { pos: offsetPos(base, 'torso', 0, 0.1 * s * bounce, 0), rot: [0.02, 0.15, 0] },
        pelvis: { pos: offsetPos(base, 'pelvis', 0, 0.08 * s * bounce, 0), rot: [0, -0.08, 0] },
        head: { rot: [-0.12, -0.08, 0] },
        lUpperArm: { rot: [-1.55, 0.2, -0.9] },
        rUpperArm: { rot: [-1.55, -0.2, 0.9] },
        lForearm: { rot: [-0.75, 0, 0] },
        rForearm: { rot: [-0.75, 0, 0] },
        weaponGroup: { rot: [0.9, 0, -1.45] },
        lThigh: { rot: [0.04, 0.18, -0.22] },
        rThigh: { rot: [0.04, -0.18, 0.22] },
        lCalf: { rot: [0.15, 0, 0] },
        rCalf: { rot: [0.15, 0, 0] },
      };
    },
  },
];

function offsetPos(base: Partial<Record<RigKey, BoneState>>, key: RigKey, x: number, y: number, z: number): VecTuple {
  const pos = base[key]?.pos || new THREE.Vector3();
  return [pos.x + x, pos.y + y, pos.z + z];
}

function easeInOut(t: number) {
  return t * t * (3 - 2 * t);
}

function populateControls() {
  characterSelect.replaceChildren(...CHARACTER_OPTIONS.map((entry, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = entry.label;
    return opt;
  }));

  poseSelect.replaceChildren(...POSES.map((pose, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = pose.label;
    return opt;
  }));

  levelSelect.replaceChildren(...LEVELS.map((level, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = level.name;
    return opt;
  }));
}

function disposeObject(root: THREE.Object3D) {
  root.traverse(obj => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach(mat => mat.dispose());
      else obj.material.dispose();
    }
  });
}

function loadCharacter(index: number) {
  if (rig) {
    scene.remove(rig.mesh);
    rig.pets.forEach(pet => {
      scene.remove(pet.mesh);
      disposeObject(pet.mesh);
    });
    disposeObject(rig.mesh);
  }

  const choice = CHARACTER_OPTIONS[index] || CHARACTER_OPTIONS[0];
  rig = CharacterBuilder.build(choice.type, scene, choice.variant);
  rig.mesh.position.set(0, 0, 0);
  rig.mesh.rotation.y = 0;
  baseState = captureBaseState(rig);
  poseElapsed = 0;
  holdElapsed = 0;
  transitionElapsed = 0;
  transitionFromMap = null;
  applyPose(POSES[activePoseIndex].sample(0, rig.profile.scale, baseState), null, 1);
}

function captureBaseState(nextRig: CharacterRig) {
  const state: Partial<Record<RigKey, BoneState>> = {};
  for (const key of RIG_KEYS) {
    const obj = nextRig[key] as THREE.Object3D | undefined;
    if (!obj) continue;
    state[key] = { pos: obj.position.clone(), rot: obj.rotation.clone(), scl: obj.scale.clone() };
  }
  return state;
}

function buildState(key: RigKey, override?: PoseOverride) {
  const base = baseState[key];
  if (!base) return null;
  return {
    pos: override?.pos ? new THREE.Vector3(...override.pos) : base.pos.clone(),
    rot: override?.rot ? new THREE.Euler(...override.rot) : base.rot.clone(),
    scl: override?.scl ? new THREE.Vector3(...override.scl) : base.scl.clone(),
  };
}

function applyPose(toMap: PoseMap, fromMap: PoseMap | null, mix: number) {
  if (!rig) return;
  const keys = new Set<RigKey>([...Object.keys(baseState), ...Object.keys(toMap), ...Object.keys(fromMap || {})] as RigKey[]);
  for (const key of keys) {
    const obj = rig[key] as THREE.Object3D | undefined;
    if (!obj) continue;
    const to = buildState(key, toMap[key]);
    const from = buildState(key, fromMap?.[key]);
    if (!to || !from) continue;
    obj.position.lerpVectors(from.pos, to.pos, mix);
    obj.rotation.set(
      THREE.MathUtils.lerp(from.rot.x, to.rot.x, mix),
      THREE.MathUtils.lerp(from.rot.y, to.rot.y, mix),
      THREE.MathUtils.lerp(from.rot.z, to.rot.z, mix),
    );
    obj.scale.lerpVectors(from.scl, to.scl, mix);
  }
}

function choosePose(index: number, keepTransition = true) {
  if (!rig) return;
  previousPoseIndex = activePoseIndex;
  activePoseIndex = ((index % POSES.length) + POSES.length) % POSES.length;
  poseSelect.value = String(activePoseIndex);
  transitionFromMap = keepTransition
    ? POSES[previousPoseIndex].sample(Math.min(1, poseElapsed / POSES[previousPoseIndex].duration), rig.profile.scale, baseState)
    : null;
  poseElapsed = 0;
  holdElapsed = 0;
  transitionElapsed = 0;
}

function loadLevel(index: number) {
  envMgr.buildEnvironment(index);
  levelSelect.value = String(index);
}

function update(dt: number) {
  if (!rig) return;
  const pose = POSES[activePoseIndex];
  if (!pauseToggle.checked) {
    if (poseElapsed < pose.duration) poseElapsed += dt;
    else holdElapsed += dt;

    if (holdElapsed >= pose.hold) {
      const next = repeatToggle.checked ? activePoseIndex : activePoseIndex + 1;
      choosePose(next);
    }
  }

  const phase = Math.min(1, poseElapsed / pose.duration);
  const targetMap = pose.sample(phase, rig.profile.scale, baseState);
  transitionElapsed += pauseToggle.checked ? 0 : dt;
  const mix = transitionFromMap ? Math.min(1, transitionElapsed / 0.32) : 1;
  applyPose(targetMap, transitionFromMap, easeInOut(mix));
  if (mix >= 1) transitionFromMap = null;

  const label = `${CHARACTER_OPTIONS[Number(characterSelect.value)]?.label || 'Character'} - ${pose.label}`;
  poseStatus.textContent = pauseToggle.checked ? `${label} (paused)` : label;
  rig.pets.forEach(pet => pet.update(performance.now() / 1000, rig!.mesh.position, rig!.mesh.rotation.y));
}

function resize() {
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  renderer.setSize(w, h);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

function frame(now: number) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  update(dt);
  controls.update();
  envMgr.update(now / 1000);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

populateControls();
loadLevel(0);
loadCharacter(0);
choosePose(0, false);
resize();
window.addEventListener('resize', resize);
characterSelect.addEventListener('change', () => loadCharacter(Number(characterSelect.value)));
poseSelect.addEventListener('change', () => choosePose(Number(poseSelect.value)));
levelSelect.addEventListener('change', () => loadLevel(Number(levelSelect.value)));
requestAnimationFrame(frame);
