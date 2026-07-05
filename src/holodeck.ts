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
type PanelState = 'collapsed' | 'open' | 'expanded';
type PoseDef = {
  id: string;
  label: string;
  duration: number;
  hold: number;
  grounding?: 'feet' | 'body';
  sample: (phase: number, s: number, base: Partial<Record<RigKey, BoneState>>) => PoseMap;
};

const CHARACTER_OPTIONS = [
  { label: 'Rusty / Randroid', type: WarriorType.RUSTY, variant: 0 },
  { label: 'Knight', type: WarriorType.KNIGHT, variant: 0 },
  { label: 'Samurai', type: WarriorType.SAMURAI, variant: 1 },
  { label: 'Pirate', type: WarriorType.PIRATE, variant: 2 },
];

const RIG_KEYS: RigKey[] = [
  'mesh',
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
const poseStatus = document.getElementById('poseStatus') as HTMLDivElement;
const controlPanel = document.getElementById('controlPanel') as HTMLDivElement;
const panelHandle = document.getElementById('panelHandle') as HTMLButtonElement;
const loadingSpinner = document.getElementById('loadingSpinner') as HTMLDivElement;
const playlistAddButton = document.getElementById('playlistAddButton') as HTMLButtonElement;
const playlistStartButton = document.getElementById('playlistStartButton') as HTMLButtonElement;
const playlistResetButton = document.getElementById('playlistResetButton') as HTMLButtonElement;
const playlistList = document.getElementById('playlistList') as HTMLOListElement;

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
const FOOT_CLEARANCE = 0.006;
const STANDING_SURFACE_Y = [0.05, 0, 0, 0];
const footBounds = new THREE.Box3();
const bodyBounds = new THREE.Box3();
let rig: CharacterRig | null = null;
let baseState: Partial<Record<RigKey, BoneState>> = {};
let activePoseIndex = 0;
let previousPoseIndex = 0;
let poseElapsed = 0;
let holdElapsed = 0;
let transitionFromMap: PoseMap | null = null;
let lastTime = performance.now();
let panelPointerY = 0;
let panelPointerActive = false;
let suppressPanelClick = false;
let panelState: PanelState = 'open';
let loadingHideTimer = 0;
let poseSelectInteracting = false;
let playlistPoseIndexes: number[] = [];
let activePlaylistIndex = 0;

const SHOWCASE_POSES: PoseDef[] = [
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

function staticPose(
  id: string,
  label: string,
  map: (s: number, base: Partial<Record<RigKey, BoneState>>) => PoseMap,
  grounding: 'feet' | 'body' = 'feet',
): PoseDef {
  return { id: `editor_${id}`, label, duration: 1, hold: 1.2, grounding, sample: (_phase, s, base) => map(s, base) };
}

const EDITOR_POSES: PoseDef[] = [
  staticPose('idle', 'Idle (standing)', () => ({
    torso: { rot: [0.1, 0.1, 0] },
    pelvis: { rot: [0, 0, 0] },
    head: { rot: [0, 0, 0] },
    lUpperArm: { rot: [0.2, 0, -0.3] },
    rUpperArm: { rot: [0.3, 0, 0.2] },
    lForearm: { rot: [-0.4, 0, 0] },
    rForearm: { rot: [-0.5, 0, 0] },
    lThigh: { rot: [-0.1, 0, -0.1] },
    rThigh: { rot: [-0.1, 0, 0.1] },
    lCalf: { rot: [0.1, 0, 0] },
    rCalf: { rot: [0.1, 0, 0] },
    lFoot: { rot: [0, -0.4, 0] },
    rFoot: { rot: [0, 0.4, 0] },
  })),
  staticPose('intro_setup', 'Intro - Setup coil (anticipation)', s => ({
    torso: { pos: [0, 1.67 * s, 0], rot: [0.05, -0.35, 0] },
    pelvis: { pos: [0, 1.21 * s, 0] },
    head: { rot: [0.12, -0.22, 0] },
    lUpperArm: { rot: [0.05, 0, -0.45] },
    rUpperArm: { rot: [0.0384, 0.1584, 0.3184] },
    lForearm: { rot: [-0.7, -Math.PI, 0] },
    rForearm: { rot: [-1.0116, 2.8584, 0.2384] },
    lThigh: { rot: [-0.4, 0, -0.1] },
    rThigh: { rot: [-0.4, 0, 0.1] },
    lCalf: { rot: [0.5, 0, 0] },
    rCalf: { rot: [0.5, 0, 0] },
    lFoot: { rot: [-0.1, -0.4, 0] },
    rFoot: { rot: [-0.1, 0.4, 0] },
  })),
  staticPose('intro_execution', 'Intro - Execution hoist (peak)', () => ({
    torso: { rot: [0.2, 0.22, 0] },
    head: { rot: [-0.16, 0.16, 0] },
    rUpperArm: { rot: [-2.15, 0.12, 0.6] },
    rForearm: { rot: [-1.3, 0, 0] },
    lUpperArm: { rot: [-0.6, 0, -0.85] },
    lForearm: { rot: [-1.0, 0, 0] },
    lThigh: { rot: [0.15, 0, 0] },
    rThigh: { rot: [-0.3, 0, 0] },
    lCalf: { rot: [0.15, 0, 0] },
    rCalf: { rot: [0.2, 0, 0] },
    weaponGroup: { rot: [Math.PI - 0.75, 0, -Math.PI / 2] },
  })),
  staticPose('intro_recovery', 'Intro - Recovery settle (f=0.5)', () => ({
    torso: { rot: [0.15, 0.16, 0] },
    head: { rot: [-0.08, 0.08, 0] },
    rUpperArm: { rot: [-0.925, 0.06, 0.4] },
    rForearm: { rot: [-0.9, 0, 0] },
    lUpperArm: { rot: [-0.2, 0, -0.575] },
    lForearm: { rot: [-0.7, 0, 0] },
    lThigh: { rot: [0.025, 0, 0] },
    rThigh: { rot: [-0.2, 0, 0] },
    lCalf: { rot: [0.125, 0, 0] },
    rCalf: { rot: [0.15, 0, 0] },
    weaponGroup: { rot: [Math.PI - 0.375, 0, -Math.PI / 2] },
  })),
  staticPose('guard_high', 'Guard - High (cross-brace)', s => ({
    torso: { pos: [0, 1.75 * s, 0], rot: [0.15, -0.3, 0.1] },
    lUpperArm: { rot: [-0.3, 1.9784, -1.2916] },
    rUpperArm: { rot: [-0.1616, -0.9716, 1.2084] },
    lForearm: { rot: [-0.9716, 0.1184, -1.2] },
    rForearm: { rot: [-1.8516, -0.0416, -0.2816] },
    lHand: { rot: [-0.0416, 2.2984, 0] },
    rHand: { rot: [0.1184, -0.3616, -0.2816] },
    lThigh: { rot: [-0.35, 0, -0.25] },
    rThigh: { rot: [-0.35, 0, 0.25] },
    lCalf: { rot: [0.4, 0, 0] },
    rCalf: { rot: [0.4, 0, 0] },
    lFoot: { rot: [-0.05, -0.4, 0] },
    rFoot: { rot: [-0.05, 0.4, 0] },
    weaponGroup: { rot: [0.1571, 0.2, -1.428] },
  })),
  staticPose('guard_low', 'Guard - Low (deep crouch)', s => ({
    torso: { pos: [0, 1.4 * s, 0], rot: [0.6, -0.25, 0.08] },
    lThigh: { rot: [-0.65, 0, -0.35] },
    rThigh: { rot: [-0.65, 0, 0.35] },
    lCalf: { rot: [0.35, 0, 0] },
    rCalf: { rot: [0.35, 0, 0] },
    lUpperArm: { rot: [0.15, 0.6, -0.5] },
    lForearm: { rot: [0.2, 0.2, -1.0] },
    rUpperArm: { rot: [0.1, -0.3, 0.6] },
    rForearm: { rot: [0.15, 0, 0.35] },
    weaponGroup: { rot: [-0.4, 0.15, -Math.PI / 2.5] },
  })),
  staticPose('guard_mid', 'Guard - Mid / fallback', s => ({
    torso: { pos: [0, 1.77 * s, 0], rot: [0.12, -0.28, 0.08] },
    lThigh: { rot: [-0.32, 0, -0.22] },
    rThigh: { rot: [-0.32, 0, 0.22] },
    lCalf: { rot: [0.38, 0, 0] },
    rCalf: { rot: [0.38, 0, 0] },
    lUpperArm: { rot: [-0.28, 0.7, -0.55] },
    lForearm: { rot: [-0.08, 0.25, -1.15] },
    rUpperArm: { rot: [-0.45, -0.35, 0.75] },
    rForearm: { rot: [-0.25, 0, 0.35] },
    weaponGroup: { rot: [Math.PI * 0.04, 0.18, -Math.PI / 2.3] },
  })),
  staticPose('air_guard', 'Air Guard (arms overhead)', () => ({
    lThigh: { rot: [0.3, 0, 0] },
    rThigh: { rot: [0.3, 0, 0] },
    lCalf: { rot: [0.4, 0, 0] },
    rCalf: { rot: [0.4, 0, 0] },
    lUpperArm: { rot: [-1.5, 0, -0.8] },
    rUpperArm: { rot: [-1.5, 0, 0.8] },
    lForearm: { rot: [-0.5, 0, 0] },
    rForearm: { rot: [-0.5, 0, 0] },
    weaponGroup: { rot: [Math.PI * 0.5, 0, -Math.PI / 2] },
  })),
  staticPose('clash', 'Clash / Sword Lock', () => ({
    torso: { rot: [0.3, 0.1, 0] },
    rUpperArm: { rot: [-1.6, -0.3, 0.6] },
    rForearm: { rot: [-0.5, 0, 0] },
    lUpperArm: { rot: [-1.5, 0.5, -0.8] },
    lForearm: { rot: [-0.4, 0, 0] },
    lThigh: { rot: [-0.4, 0, -0.2] },
    rThigh: { rot: [-0.2, 0, 0.2] },
    lCalf: { rot: [0.5, 0, 0] },
    rCalf: { rot: [0.3, 0, 0] },
    weaponGroup: { rot: [Math.PI * 0.75, 0.4, -Math.PI / 2] },
  })),
  staticPose('victory_antic', 'Victory - Anticipation (coil)', s => ({
    torso: { pos: [0, 1.69 * s, 0] },
    pelvis: { pos: [0, 1.19 * s, 0] },
    head: { rot: [0.12, 0, 0] },
    lThigh: { rot: [-0.55, 0, -0.1] },
    rThigh: { rot: [-0.55, 0, 0.1] },
    lCalf: { rot: [0.82, 0, 0] },
    rCalf: { rot: [0.82, 0, 0] },
    lUpperArm: { rot: [0.05, 0, -0.3] },
    rUpperArm: { rot: [0.15, 0, 0.2] },
  })),
  staticPose('victory_burst', 'Victory - Burst (leap apex)', s => ({
    torso: { pos: [0, 2.0 * s, 0], rot: [0.04, 0.1, 0] },
    pelvis: { pos: [0, 1.5 * s, 0], rot: [0, -0.05, 0] },
    lThigh: { rot: [-0.04, 0, -0.3] },
    rThigh: { rot: [-0.04, 0, 0.2] },
    lCalf: { rot: [0.374, 0, 0] },
    rCalf: { rot: [0.374, 0, 0] },
    lUpperArm: { rot: [-1.4, 0, -0.8] },
    rUpperArm: { rot: [-1.4, 0, 0.8] },
    lForearm: { rot: [-0.8, 0, 0] },
    rForearm: { rot: [-0.8, 0, 0] },
    head: { rot: [-0.1, 0, 0] },
  })),
  staticPose('victory', 'Victory - Settle (held)', () => ({
    torso: { rot: [0.04, 0.1, 0] },
    pelvis: { rot: [0, -0.05, 0] },
    lThigh: { rot: [0.1, 0, -0.3] },
    rThigh: { rot: [0.1, 0, 0.2] },
    lCalf: { rot: [0.15, 0, 0] },
    rCalf: { rot: [0.15, 0, 0] },
    lUpperArm: { rot: [-1.4, 0, -0.8] },
    rUpperArm: { rot: [-1.4, 0, 0.8] },
    lForearm: { rot: [-0.8, 0, 0] },
    rForearm: { rot: [-0.8, 0, 0] },
    head: { rot: [-0.1, 0, 0] },
    weaponGroup: { rot: [Math.PI * 0.3, 0, -Math.PI / 2] },
  })),
  staticPose('jump_startup', 'Jump - Startup coil (startupP=1)', s => ({
    torso: { pos: [0, 1.43 * s, 0], rot: [0.37, 0.1, 0] },
    pelvis: { pos: [0, 0.99 * s, 0], rot: [0.18, 0, 0] },
    lThigh: { rot: [-0.92, 0, -0.1] },
    rThigh: { rot: [-0.92, 0, 0.1] },
    lCalf: { rot: [1.34, 0, 0] },
    rCalf: { rot: [1.34, 0, 0] },
    lUpperArm: { rot: [0.14, 0, -0.45] },
    rUpperArm: { rot: [0.24, 0, 0.45] },
  })),
  staticPose('jump_ascend', 'Jump - Ascend (launch=1)', () => ({
    torso: { rot: [0.18, 0.1, 0], scl: [0.94, 1.12, 1] },
    pelvis: { rot: [0.25, 0, 0] },
    lThigh: { rot: [-1.45, 0, -0.1] },
    rThigh: { rot: [-0.3, 0, 0.1] },
    lCalf: { rot: [1.5, 0, 0] },
    rCalf: { rot: [0.9, 0, 0] },
    lUpperArm: { rot: [-1.6, 0, -0.5] },
    rUpperArm: { rot: [-1.6, 0, 0.5] },
    head: { rot: [-0.15, 0, 0] },
  })),
  staticPose('jump_descend', 'Jump - Descend (fall=1)', () => ({
    torso: { rot: [0.2, 0.1, 0] },
    pelvis: { rot: [-0.1, 0, 0] },
    lThigh: { rot: [-0.75, 0, -0.1] },
    rThigh: { rot: [-0.75, 0, 0.1] },
    lCalf: { rot: [1.05, 0, 0] },
    rCalf: { rot: [1.05, 0, 0] },
    lUpperArm: { rot: [0.2, 0, -0.85] },
    rUpperArm: { rot: [0.2, 0, 0.85] },
    head: { rot: [0.12, 0, 0] },
  })),
  staticPose('jump_land', 'Jump - Landing squash (recoveryP=0.25)', s => ({
    torso: { pos: [0, 1.77 * s, 0], rot: [0.1125, 0.1, 0], scl: [1.132, 0.835, 1] },
    pelvis: { pos: [0, 1.2 * s, 0], rot: [0.1875, 0, 0] },
    lThigh: { rot: [-1.0, 0, -0.1] },
    rThigh: { rot: [-1.0, 0, 0.1] },
    lCalf: { rot: [1.15, 0, 0] },
    rCalf: { rot: [1.15, 0, 0] },
    lUpperArm: { rot: [0.575, 0, -0.3] },
    rUpperArm: { rot: [0.6, 0, 0.2] },
  })),
  staticPose('dash_forward', 'Dash - Forward', s => ({
    torso: { pos: [0, 1.625 * s, 0.025 * s], rot: [0.45, 0.1, 0] },
    lUpperArm: { rot: [-1.1316, 1.2884, -0.5616] },
    rUpperArm: { rot: [-0.7216, -0.2016, 0.4784] },
    lForearm: { rot: [-1.0916, 0, 0] },
    rForearm: { rot: [-0.2, 0, 0] },
    lHand: { rot: [-0.2016, 0.6884, 0] },
    lThigh: { rot: [-0.5, 0, -0.2] },
    rThigh: { rot: [0.5, 0, 0.1] },
    lCalf: { rot: [0.6, 0, 0] },
    rCalf: { rot: [0.2, 0, 0] },
    lFoot: { rot: [-0.1, -0.4, 0] },
    rFoot: { rot: [-0.7, 0.4, 0] },
  })),
  staticPose('dash_back', 'Dash - Back', s => ({
    torso: { pos: [0, 1.6 * s, 0], rot: [-0.35, 0.1, 0] },
    lThigh: { rot: [-0.2, 0, -0.3] },
    rThigh: { rot: [0.5, 0, 0.2] },
    lCalf: { rot: [0.1, 0, 0] },
    rCalf: { rot: [0.3, 0, 0] },
    lUpperArm: { rot: [-0.8, 0, -0.5] },
    rUpperArm: { rot: [-0.6, 0, 0.5] },
    lForearm: { rot: [-0.5, 0, 0] },
    rForearm: { rot: [-0.3, 0, 0] },
  })),
  staticPose('dodge_side', 'Dodge - Side step (peak)', s => ({
    torso: { pos: [0, 1.6 * s, 0], rot: [0.2, 0.1, -0.34] },
    pelvis: { pos: [0, 1.12 * s, 0], rot: [0, 0, -0.22] },
    rThigh: { rot: [-0.46, 0, -0.42] },
    rCalf: { rot: [0.42, 0, 0] },
    lThigh: { rot: [0.18, 0, 0.22] },
    lCalf: { rot: [0.18, 0, 0] },
    lUpperArm: { rot: [-0.6, 0, -0.66] },
    rUpperArm: { rot: [-0.44, 0, 0.58] },
    lForearm: { rot: [-0.58, 0, 0] },
    rForearm: { rot: [-0.38, 0, 0] },
  })),
  staticPose('atk_high_windup', 'Attack High - Windup (startupP=1)', s => ({
    torso: { pos: [-0.08 * s, 1.9 * s, 0], rot: [0.25, 0.5, 0] },
    pelvis: { pos: [-0.05 * s, 1.35 * s, 0], rot: [0, -0.3, 0] },
    rUpperArm: { rot: [-1.0, -0.5, -0.3] },
    rForearm: { rot: [-0.7, 0, -0.2] },
    lUpperArm: { rot: [-0.5, 0, -0.2] },
    weaponGroup: { rot: [-0.8, 0.3, -Math.PI / 2 + Math.PI * 0.4] },
  })),
  staticPose('atk_high_strike', 'Attack High - Strike (activeP=1)', s => ({
    torso: { pos: [0.07 * s, 1.8 * s, 0], rot: [0.1, -0.7, 0] },
    pelvis: { pos: [0.03 * s, 1.35 * s, 0], rot: [0, 0.3, 0] },
    rUpperArm: { rot: [-0.7, 1.7, -0.1] },
    rForearm: { rot: [-0.2, 0, -0.05] },
    lUpperArm: { rot: [-0.1, 0.2, -0.1] },
    head: { rot: [0, 0.3, 0] },
    rFoot: { rot: [-0.15, 0.4, 0] },
    lFoot: { rot: [0.1, -0.4, 0] },
    weaponGroup: { rot: [0.4, -0.3, -Math.PI / 2 + Math.PI * 0.9] },
  })),
  staticPose('atk_high_recovery', 'Attack High - Recovery (recoveryP=0.5)', s => ({
    torso: { pos: [0.035 * s, 1.825 * s, 0], rot: [0.245, -0.55, 0] },
    pelvis: { pos: [0.015 * s, 1.35 * s, 0], rot: [0, 0.03, 0] },
    rUpperArm: { rot: [0.2, 1.45, -0.3] },
    rForearm: { rot: [-0.5, 0, -0.025] },
    lUpperArm: { rot: [0, 0, -0.05] },
    head: { rot: [0, 0.3, 0] },
    weaponGroup: { rot: [0.2, -0.15, -Math.PI / 2 + Math.PI * 0.05] },
  })),
  staticPose('atk_mid_windup', 'Attack Mid - Windup (startupP=1)', s => ({
    torso: { pos: [-0.05 * s, 1.85 * s, 0], rot: [0.1, -0.4, 0] },
    rUpperArm: { rot: [-1.5, -1.5, 0.2] },
    rForearm: { rot: [-0.2, 0, 0] },
  })),
  staticPose('atk_mid_strike', 'Attack Mid - Strike (activeP=1)', s => ({
    torso: { pos: [0.05 * s, 1.85 * s, 0], rot: [0.1, 0.4, 0] },
    pelvis: { rot: [0, 0.2, 0] },
    rUpperArm: { rot: [-1.8, 1.5, 0.2] },
    rForearm: { rot: [0.2, 0, 0] },
  })),
  staticPose('atk_mid_recovery', 'Attack Mid - Recovery (recoveryP=0.5)', () => ({
    torso: { rot: [0.1, 0.02, 0] },
    pelvis: { rot: [0, -0.02, 0] },
    rUpperArm: { rot: [-0.6, 1.0, 0.2] },
    rForearm: { rot: [-0.6, 0, 0] },
    head: { rot: [0, 0.12, 0] },
  })),
  staticPose('atk_low_windup', 'Attack Low - Windup (startupP=1)', s => ({
    torso: { pos: [-0.1 * s, 1.45 * s, 0], rot: [0.3, 0.1, 0] },
    pelvis: { pos: [0, 1.03 * s, 0] },
    rUpperArm: { rot: [-0.7, -1.2, 0.2] },
  })),
  staticPose('atk_low_strike', 'Attack Low - Strike (activeP=1)', s => ({
    torso: { pos: [0.4 * s, 1.45 * s, 0], rot: [-0.1, 0.1, 0] },
    pelvis: { pos: [0, 1.03 * s, 0] },
    rUpperArm: { rot: [-1.0, 1.2, 0.2] },
    rForearm: { rot: [0.3, 0, 0] },
    lThigh: { rot: [-0.8, 0, -0.1] },
    rThigh: { rot: [-0.8, 0, 0.1] },
    lCalf: { rot: [1.44, 0, 0] },
    rCalf: { rot: [1.44, 0, 0] },
  })),
  staticPose('atk_low_recovery', 'Attack Low - Recovery (recoveryP=0.5)', s => ({
    torso: { pos: [0.3 * s, 1.71 * s, 0], rot: [-0.15, 0.1, 0] },
    pelvis: { pos: [0, 1.19 * s, 0] },
    rUpperArm: { rot: [-0.8, 0.6, 0.2] },
    lThigh: { rot: [-0.4, 0, -0.1] },
    rThigh: { rot: [-0.4, 0, 0.1] },
    lCalf: { rot: [0.72, 0, 0] },
    rCalf: { rot: [0.72, 0, 0] },
  })),
  staticPose('atk_kick_chamber', 'Attack Kick - Chamber (startupP=1)', s => ({
    torso: { pos: [-0.05 * s, 1.85 * s, 0], rot: [-0.08, 0.24, 0] },
    pelvis: { rot: [-0.12, 0.1, 0] },
    rThigh: { rot: [-1.25, 0, 0.12] },
    rCalf: { rot: [1.7, 0, 0] },
    rFoot: { rot: [-0.35, 0.4, 0] },
    lThigh: { rot: [0.12, 0, -0.1] },
    lCalf: { rot: [0.2, 0, 0] },
    lUpperArm: { rot: [-0.3, 0, -0.3] },
    rUpperArm: { rot: [-0.25, 0, 0.2] },
    head: { rot: [0, -0.1, 0] },
  })),
  staticPose('atk_kick_strike', 'Attack Kick - Extension (activeP=1)', s => ({
    torso: { pos: [0.12 * s, 1.85 * s, 0], rot: [0.18, -0.18, 0] },
    pelvis: { rot: [-0.06, -0.3, 0] },
    rThigh: { rot: [-1.52, 0, -0.05] },
    rCalf: { rot: [-0.05, 0, 0] },
    rFoot: { rot: [-0.55, 0.4, 0] },
    lThigh: { rot: [0.2, 0, -0.1] },
    lCalf: { rot: [0.2, 0, 0] },
    lFoot: { rot: [0, -0.9, 0] },
    lUpperArm: { rot: [-0.1, 0, -0.6] },
    rUpperArm: { rot: [-0.05, 0, 0.5] },
    head: { rot: [0, -0.1, 0] },
  })),
  staticPose('atk_kick_recovery', 'Attack Kick - Re-chamber (recoveryP=0.5)', s => ({
    torso: { pos: [0.06 * s, 1.85 * s, 0], rot: [0.18, -0.18, 0] },
    pelvis: { rot: [-0.06, -0.3, 0] },
    rThigh: { rot: [-0.81, 0, -0.05] },
    rCalf: { rot: [1.575, 0, 0] },
    rFoot: { rot: [-0.275, 0.4, 0] },
    lThigh: { rot: [0.1, 0, -0.1] },
    lCalf: { rot: [0.1, 0, 0] },
    lFoot: { rot: [0, -0.65, 0] },
  })),
  staticPose('atk_headbutt_windup', 'Attack Headbutt - Windup (startupP=1)', () => ({
    torso: { rot: [0, 0.1, 0] },
    pelvis: { rot: [0.1, 0, 0] },
    head: { rot: [-0.25, 0, 0] },
    lForearm: { rot: [-1.2116, 0, 0] },
    rForearm: { rot: [-1.2116, 0, 0] },
    lThigh: { rot: [-0.23, 0, -0.1] },
    rThigh: { rot: [-1.1116, 0, 0.1] },
    lFoot: { rot: [-0.3684, -0.4, 0] },
    rFoot: { rot: [0.5132, 0.4, 0] },
  })),
  staticPose('atk_headbutt_strike', 'Attack Headbutt - Lunge (activeP=1)', s => ({
    torso: { pos: [0, 1.675 * s, 0.7 * s], rot: [0.5284, 0.1, 0] },
    pelvis: { pos: [0, 1.175 * s, 0.4083 * s], rot: [0.3984, 0, 0] },
    head: { rot: [-0.25, 0, 0] },
    lForearm: { rot: [-1.2116, 0, 0.2416] },
    rForearm: { rot: [-1.2116, 0, -0.2416] },
    lThigh: { rot: [-0.13, 0, -0.1] },
    rThigh: { rot: [-1.0116, 0, 0.1] },
    lFoot: { rot: [-0.3684, -0.4, 0] },
    rFoot: { rot: [0.5132, 0.4, 0] },
  })),
  staticPose('atk_headbutt_recovery', 'Attack Headbutt - Recovery (recoveryP=0.5)', s => ({
    torso: { pos: [0, 1.675 * s, 0.23 * s], rot: [0.0842, 0.1, 0] },
    pelvis: { pos: [0, 1.175 * s, 0.2042 * s], rot: [0.0792, 0, 0] },
    head: { rot: [0.095, 0, 0] },
    lThigh: { rot: [-0.065, 0, -0.1] },
    rThigh: { rot: [-0.5058, 0, 0.1] },
    lFoot: { rot: [-0.1842, -0.4, 0] },
    rFoot: { rot: [0.2566, 0.4, 0] },
  })),
  staticPose('lotus', 'Lotus / Meditation (seated)', s => ({
    torso: { pos: [0, 0.95 * s, 0], rot: [0.03, 0, 0] },
    pelvis: { pos: [0, 0.32 * s, 0], rot: [-0.12, 0, 0] },
    lThigh: { rot: [-0.4651, 0.2697, -1.0403] },
    rThigh: { rot: [-0.4651, -0.2697, 1.0403] },
    lCalf: { rot: [0.5453, -0.2418, 2.416] },
    rCalf: { rot: [0.5453, 0.2418, -2.416] },
    lFoot: { rot: [0.0784, 0.25, 0.2] },
    rFoot: { rot: [0.0784, -0.25, -0.2] },
    lUpperArm: { rot: [0.52, 0.42, -0.62] },
    rUpperArm: { rot: [0.52, -0.42, 0.62] },
    lForearm: { rot: [-1.9316, -2.6216, 0.2384] },
    rForearm: { rot: [-1.9316, 2.6216, -0.2384] },
    lHand: { rot: [0, 0, 0] },
    rHand: { rot: [0, 0, 0] },
  }), 'body'),
  staticPose('sample_dive', 'Sample Ultimate - Dive', s => ({
    torso: { pos: [0, 0.95 * s, 0.1 * s], rot: [0.03, 0, 0] },
    pelvis: { pos: [0, 0.32 * s, 0], rot: [-0.12, 0, 0] },
    lUpperArm: { rot: [-0.0516, 1.2116, -0.0684] },
    rUpperArm: { rot: [-0.0516, -1.2116, 0.0684] },
    lForearm: { rot: [-1.2816, -3.1384, 0.3116] },
    rForearm: { rot: [-1.2816, 3.1384, -0.3116] },
    lHand: { rot: [0, Math.PI, 0] },
    rHand: { rot: [0, -Math.PI, 0] },
    lThigh: { rot: [-0.4651, 0.2697, -1.0403] },
    rThigh: { rot: [-0.4651, -0.2697, 1.0403] },
    lCalf: { rot: [0.5453, -0.2418, 2.416] },
    rCalf: { rot: [0.5453, 0.2418, -2.416] },
    lFoot: { rot: [0.0398, 0.25, 0.2] },
    rFoot: { rot: [0.0398, -0.25, -0.2] },
  }), 'body'),
  staticPose('dead_stagger', 'Dead - Stagger (kneeling collapse)', s => ({
    torso: { pos: [0, 1.2333 * s, -0.0333 * s], rot: [-0.2816, 0.1, 0] },
    pelvis: { pos: [0, 0.7583 * s, 0], rot: [0.2384, 0, 0] },
    head: { rot: [-0.1616, 0, 0] },
    lForearm: { rot: [-0.4016, 0, 0] },
    rForearm: { rot: [0.1984, 0, 0] },
    lThigh: { rot: [-0.9216, 0, -0.1] },
    rThigh: { rot: [0.0384, 0, 0.1] },
    lCalf: { rot: [1.428, 0, 0] },
    rCalf: { rot: [1.428, 0, 0] },
    lFoot: { rot: [1.075, -0.4, -0.5216] },
    rFoot: { rot: [0.1584, 0.4, 0] },
  }), 'body'),
  staticPose('dead_forward', 'Dead - Layout Forward (lying on face)', () => ({
    mesh: { rot: [-Math.PI / 2, 0, 0] },
    torso: { pos: [0, 0, 0], rot: [-0.3, 0.1, 0] },
    pelvis: { pos: [0, 0, 0], rot: [-0.2, 0, 0] },
    lThigh: { rot: [-Math.PI / 2.5, 0, -0.1] },
    rThigh: { rot: [-Math.PI / 2.5, 0, 0.1] },
    lCalf: { rot: [Math.PI / 2.2, 0, 0] },
    rCalf: { rot: [Math.PI / 2.2, 0, 0] },
  }), 'body'),
  staticPose('dead_back', 'Dead - Layout Back (lying on back)', () => ({
    mesh: { rot: [Math.PI / 2, 0, 0] },
    torso: { pos: [0, 0, 0], rot: [0.3, 0.1, 0] },
    pelvis: { pos: [0, 0, 0] },
    lUpperArm: { rot: [0.2, 0, -0.2] },
    rUpperArm: { rot: [0.3, 0, 0.2] },
  }), 'body'),
  staticPose('dead_side', 'Dead - Layout Side (lying on side)', () => ({
    mesh: { rot: [0, 0, Math.PI / 2] },
    torso: { pos: [0, 0, 0], rot: [0.3, 0.1, 0] },
    pelvis: { pos: [0, 0, 0] },
    lUpperArm: { rot: [0.2, 0, -0.2] },
    rUpperArm: { rot: [0.3, 0, 0.2] },
  }), 'body'),
];

const POSES: PoseDef[] = [
  ...SHOWCASE_POSES,
  ...EDITOR_POSES,
];

playlistPoseIndexes = POSES.map((_, i) => i);

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

  renderPlaylist();
}

function createPoseOptions(selectedPoseIndex: number) {
  return POSES.map((pose, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = pose.label;
    opt.selected = i === selectedPoseIndex;
    return opt;
  });
}

function markActivePlaylistEntry() {
  [...playlistList.children].forEach((child, i) => {
    child.classList.toggle('is-active', i === activePlaylistIndex);
    child.toggleAttribute('aria-current', i === activePlaylistIndex);
  });
}

function renderPlaylist() {
  playlistList.replaceChildren(...playlistPoseIndexes.map((poseIndex, entryIndex) => {
    const item = document.createElement('li');
    item.className = 'playlist-item';

    const select = document.createElement('select');
    select.className = 'playlist-pose-select';
    select.setAttribute('aria-label', `Playlist slot ${entryIndex + 1}`);
    select.replaceChildren(...createPoseOptions(poseIndex));
    select.addEventListener('change', () => {
      playlistPoseIndexes[entryIndex] = Number(select.value);
      choosePlaylistEntry(entryIndex, true, true);
    });

    const tools = document.createElement('div');
    tools.className = 'playlist-tools';

    const upButton = makePlaylistButton('Up', entryIndex === 0, () => movePlaylistEntry(entryIndex, entryIndex - 1));
    const downButton = makePlaylistButton('Down', entryIndex === playlistPoseIndexes.length - 1, () => movePlaylistEntry(entryIndex, entryIndex + 1));
    const copyButton = makePlaylistButton('Copy', false, () => duplicatePlaylistEntry(entryIndex));
    const removeButton = makePlaylistButton('Remove', playlistPoseIndexes.length <= 1, () => removePlaylistEntry(entryIndex));

    tools.append(upButton, downButton, copyButton, removeButton);
    item.append(select, tools);
    return item;
  }));
  markActivePlaylistEntry();
}

function makePlaylistButton(label: string, disabled: boolean, onClick: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mini-button';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function movePlaylistEntry(fromIndex: number, toIndex: number) {
  if (toIndex < 0 || toIndex >= playlistPoseIndexes.length) return;
  const [entry] = playlistPoseIndexes.splice(fromIndex, 1);
  playlistPoseIndexes.splice(toIndex, 0, entry);
  if (activePlaylistIndex === fromIndex) activePlaylistIndex = toIndex;
  else if (fromIndex < activePlaylistIndex && toIndex >= activePlaylistIndex) activePlaylistIndex -= 1;
  else if (fromIndex > activePlaylistIndex && toIndex <= activePlaylistIndex) activePlaylistIndex += 1;
  renderPlaylist();
}

function duplicatePlaylistEntry(entryIndex: number) {
  playlistPoseIndexes.splice(entryIndex + 1, 0, playlistPoseIndexes[entryIndex]);
  if (activePlaylistIndex > entryIndex) activePlaylistIndex += 1;
  renderPlaylist();
}

function removePlaylistEntry(entryIndex: number) {
  if (playlistPoseIndexes.length <= 1) return;
  playlistPoseIndexes.splice(entryIndex, 1);
  if (activePlaylistIndex === entryIndex) {
    activePlaylistIndex = Math.min(entryIndex, playlistPoseIndexes.length - 1);
    renderPlaylist();
    choosePlaylistEntry(activePlaylistIndex, true, true);
    return;
  }
  if (activePlaylistIndex > entryIndex) activePlaylistIndex -= 1;
  renderPlaylist();
}

function resetPlaylistToAllPoses() {
  playlistPoseIndexes = POSES.map((_, i) => i);
  activePlaylistIndex = Math.min(activePoseIndex, playlistPoseIndexes.length - 1);
  renderPlaylist();
}

function startPlaylistWithSelectedPose() {
  playlistPoseIndexes = [Number(poseSelect.value)];
  activePlaylistIndex = 0;
  renderPlaylist();
  choosePlaylistEntry(0, true, true);
}

function addSelectedPoseToPlaylist() {
  playlistPoseIndexes.push(Number(poseSelect.value));
  activePlaylistIndex = playlistPoseIndexes.length - 1;
  renderPlaylist();
  choosePlaylistEntry(activePlaylistIndex, true, true);
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

function getStandingSurfaceY() {
  return STANDING_SURFACE_Y[Number(levelSelect.value)] ?? 0;
}

function keepCharacterOnSurface() {
  if (!rig) return;
  rig.mesh.updateMatrixWorld(true);
  const activePose = POSES[activePoseIndex];
  if (activePose?.grounding === 'body') {
    bodyBounds.setFromObject(rig.mesh);
    if (bodyBounds.isEmpty()) return;
    const offset = getStandingSurfaceY() + FOOT_CLEARANCE - bodyBounds.min.y;
    if (!Number.isFinite(offset) || Math.abs(offset) < 0.0001) return;
    rig.mesh.position.y += offset;
    rig.mesh.updateMatrixWorld(true);
    return;
  }

  footBounds.makeEmpty();
  footBounds.expandByObject(rig.lFoot);
  footBounds.expandByObject(rig.rFoot);
  if (footBounds.isEmpty()) footBounds.setFromObject(rig.mesh);
  const offset = getStandingSurfaceY() + FOOT_CLEARANCE - footBounds.min.y;
  if (!Number.isFinite(offset) || Math.abs(offset) < 0.0001) return;
  rig.mesh.position.y += offset;
  rig.mesh.updateMatrixWorld(true);
}

function withLoading(fn: () => void) {
  window.clearTimeout(loadingHideTimer);
  loadingSpinner.classList.add('is-loading');
  try {
    fn();
  } finally {
    loadingHideTimer = window.setTimeout(() => {
      loadingSpinner.classList.remove('is-loading');
    }, 420);
  }
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
  transitionFromMap = null;
  applyPose(POSES[activePoseIndex].sample(0, rig.profile.scale, baseState), null, 1);
  keepCharacterOnSurface();
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

function isPoseSelectInteracting() {
  return poseSelectInteracting || document.activeElement === poseSelect;
}

function syncPoseSelectToActive() {
  poseSelect.value = String(activePoseIndex);
}

function syncPlaylistToActivePose() {
  if (playlistPoseIndexes[activePlaylistIndex] === activePoseIndex) {
    markActivePlaylistEntry();
    return;
  }
  const matchingIndex = playlistPoseIndexes.findIndex(index => index === activePoseIndex);
  if (matchingIndex >= 0) activePlaylistIndex = matchingIndex;
  markActivePlaylistEntry();
}

function choosePose(index: number, keepTransition = true, syncSelect = true, syncPlaylist = true) {
  if (!rig) return;
  previousPoseIndex = activePoseIndex;
  activePoseIndex = ((index % POSES.length) + POSES.length) % POSES.length;
  if (syncSelect) syncPoseSelectToActive();
  if (syncPlaylist) syncPlaylistToActivePose();
  // The transition blend only advances while playing (transitionElapsed is
  // frozen when paused), so keeping a transition while paused would leave mix
  // stuck at 0 and render the PREVIOUS pose, one behind the selection. When
  // paused, snap straight to the chosen pose instead.
  transitionFromMap = keepTransition && !pauseToggle.checked
    ? POSES[previousPoseIndex].sample(Math.min(1, poseElapsed / POSES[previousPoseIndex].duration), rig.profile.scale, baseState)
    : null;
  poseElapsed = 0;
  holdElapsed = 0;
}

function choosePlaylistEntry(entryIndex: number, keepTransition = true, syncSelect = true) {
  if (playlistPoseIndexes.length === 0) return;
  activePlaylistIndex = ((entryIndex % playlistPoseIndexes.length) + playlistPoseIndexes.length) % playlistPoseIndexes.length;
  choosePose(playlistPoseIndexes[activePlaylistIndex], keepTransition, syncSelect, false);
  markActivePlaylistEntry();
}

function getNextPlaylistIndex() {
  if (playlistPoseIndexes.length === 0) return activePlaylistIndex;
  if (playlistPoseIndexes[activePlaylistIndex] !== activePoseIndex) return 0;
  return (activePlaylistIndex + 1) % playlistPoseIndexes.length;
}

function loadLevel(index: number) {
  envMgr.buildEnvironment(index);
  levelSelect.value = String(index);
  keepCharacterOnSurface();
}

function update(dt: number) {
  if (!rig) return;
  let pose = POSES[activePoseIndex];
  if (!pauseToggle.checked) {
    if (poseElapsed < pose.duration) poseElapsed += dt;
    else holdElapsed += dt;

    if (holdElapsed >= pose.hold) {
      choosePlaylistEntry(getNextPlaylistIndex(), true, !isPoseSelectInteracting());
      pose = POSES[activePoseIndex];
    }
  }

  const phase = Math.min(1, poseElapsed / pose.duration);
  const targetMap = pose.sample(phase, rig.profile.scale, baseState);
  const mix = transitionFromMap ? phase : 1;
  applyPose(targetMap, transitionFromMap, easeInOut(mix));
  if (mix >= 1) transitionFromMap = null;
  keepCharacterOnSurface();

  const label = `${CHARACTER_OPTIONS[Number(characterSelect.value)]?.label || 'Character'} - ${pose.label}`;
  poseStatus.textContent = pauseToggle.checked ? `${label} (paused)` : label;
  rig.pets.forEach(pet => pet.update(performance.now() / 1000, rig!.mesh.position, rig!.mesh.rotation.y));
}

function resize() {
  const w = stageEl.clientWidth;
  const h = stageEl.clientHeight;
  const mobile = w <= 760;
  camera.position.set(0, mobile ? 2.65 : 2.45, mobile ? 8.8 : 7.2);
  controls.target.set(0, mobile ? 1.55 : 1.35, -0.25);
  renderer.setSize(w, h);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}

function setPanelState(nextState: PanelState) {
  panelState = nextState;
  controlPanel.classList.toggle('is-collapsed', panelState === 'collapsed');
  controlPanel.classList.toggle('is-open', panelState === 'open');
  controlPanel.classList.toggle('is-expanded', panelState === 'expanded');
  panelHandle.setAttribute('aria-expanded', String(panelState !== 'collapsed'));
  panelHandle.setAttribute(
    'aria-label',
    panelState === 'collapsed'
      ? 'Open controls'
      : panelState === 'open'
        ? 'Collapse controls'
        : 'Collapse controls',
  );
}

function togglePanel() {
  const nextState: PanelState = panelState === 'collapsed' ? 'open' : panelState === 'expanded' ? 'open' : 'collapsed';
  setPanelState(nextState);
}

function beginPanelGesture(event: PointerEvent) {
  const rect = controlPanel.getBoundingClientRect();
  if (event.clientY > rect.top + 56) return;
  panelPointerY = event.clientY;
  panelPointerActive = true;
  controlPanel.setPointerCapture(event.pointerId);
}

function finishPanelGesture(event: PointerEvent) {
  if (!panelPointerActive) return;
  const delta = event.clientY - panelPointerY;
  panelPointerActive = false;
  controlPanel.releasePointerCapture(event.pointerId);
  suppressPanelClick = true;
  if (Math.abs(delta) >= 18) {
    if (delta < 0) {
      setPanelState(panelState === 'collapsed' ? 'open' : 'expanded');
    } else {
      setPanelState(panelState === 'expanded' ? 'open' : 'collapsed');
    }
  } else {
    togglePanel();
  }
}

function handlePanelClick() {
  if (suppressPanelClick) {
    suppressPanelClick = false;
    return;
  }
  togglePanel();
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

withLoading(() => {
  populateControls();
  loadLevel(0);
  loadCharacter(0);
  choosePose(0, false);
  resize();
});
window.addEventListener('resize', resize);
characterSelect.addEventListener('change', () => withLoading(() => loadCharacter(Number(characterSelect.value))));
poseSelect.addEventListener('pointerdown', () => { poseSelectInteracting = true; });
poseSelect.addEventListener('focus', () => { poseSelectInteracting = true; });
poseSelect.addEventListener('keydown', () => { poseSelectInteracting = true; });
poseSelect.addEventListener('blur', () => {
  poseSelectInteracting = false;
  syncPoseSelectToActive();
});
poseSelect.addEventListener('change', () => {
  poseSelectInteracting = false;
  withLoading(() => choosePose(Number(poseSelect.value), true, true));
});
levelSelect.addEventListener('change', () => withLoading(() => loadLevel(Number(levelSelect.value))));
playlistAddButton.addEventListener('click', addSelectedPoseToPlaylist);
playlistStartButton.addEventListener('click', startPlaylistWithSelectedPose);
playlistResetButton.addEventListener('click', resetPlaylistToAllPoses);
panelHandle.addEventListener('click', handlePanelClick);
controlPanel.addEventListener('pointerdown', beginPanelGesture);
controlPanel.addEventListener('pointerup', finishPanelGesture);
controlPanel.addEventListener('pointercancel', () => { panelPointerActive = false; });
requestAnimationFrame(frame);
