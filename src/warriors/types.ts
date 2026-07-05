import * as THREE from 'three';

export enum WarriorType {
  KNIGHT,
  SAMURAI,
  PIRATE,
  RUSTY,
}

export enum HitLevel {
  HIGH = 1,
  MID = 2,
  LOW = 3,
  THROW = 4,
}

export interface MoveData {
  name: string;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  hitstun: number;
  blockstun: number;
  hitboxOffset: THREE.Vector3;
  hitboxSize: THREE.Vector3;
  isDashingAttack?: boolean;
  hitLevel: HitLevel;
  guardMeterIncrement: number;
  guardMeterAirMultiplier: number;
  blockAdvantage: number;
  hitActiveStart?: number;
  hitActiveEnd?: number;
}

export interface WarriorProfile {
  walkSpeed: number;
  jumpForce: number;
  defense: number;
  attacks: Record<string, MoveData>;
  color: number;
  scale: number;
  swordLength: number;
  weaponWidth?: number;
  healthMultiplier?: number;
  armYOffset?: number;
  neckYOffset?: number;
  colorVariant?: number;
}

export interface Pet {
  mesh: THREE.Group;
  type: number;
  update: (time: number, ownerPos: THREE.Vector3, ownerRot: number) => void;
  onBark?: () => void;
  strike?: (targetPos: THREE.Vector3, onConnect: () => void, onComplete: () => void) => void;
}

export interface CharacterRig {
  mesh: THREE.Group;
  torso: THREE.Group;
  pelvis: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  lShoulder: THREE.Group;
  rShoulder: THREE.Group;
  lPadSocket?: THREE.Group;
  rPadSocket?: THREE.Group;
  cloths?: import('../ClothSim').ClothSim[];
  lUpperArm: THREE.Group;
  lForearm: THREE.Group;
  lHand: THREE.Group;
  rUpperArm: THREE.Group;
  rForearm: THREE.Group;
  rHand: THREE.Group;
  lThigh: THREE.Group;
  lCalf: THREE.Group;
  lFoot: THREE.Group;
  rThigh: THREE.Group;
  rCalf: THREE.Group;
  rFoot: THREE.Group;
  weaponGroup: THREE.Group;
  sword: THREE.Group | THREE.Object3D;
  profile: WarriorProfile;
  pets: Pet[];
  lShin?: THREE.Group;
  rShin?: THREE.Group;
  hair?: THREE.Group;
  lShinArmor?: THREE.Group;
  rShinArmor?: THREE.Group;
  lFootArmor?: THREE.Group;
  rFootArmor?: THREE.Group;
  lClaw?: THREE.Group;
  rClaw?: THREE.Group;
  bagpipes?: THREE.Group;
  belt?: THREE.Group;
  jacketHem?: THREE.Group;
  lWing?: THREE.Group;
  rWing?: THREE.Group;
  lEye?: THREE.Group;
  rEye?: THREE.Group;
  lEyeball?: THREE.Group;
  rEyeball?: THREE.Group;
  extras?: Record<string, THREE.Object3D>;
}
