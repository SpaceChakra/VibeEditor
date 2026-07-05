import * as THREE from 'three';
import { WarriorType, HitLevel, WarriorProfile } from './types';

const move = (
  name: string,
  startup: number,
  active: number,
  recovery: number,
  damage: number,
  y: number,
  level: HitLevel,
) => ({
  name,
  startup,
  active,
  recovery,
  damage,
  hitstun: recovery + 6,
  blockstun: recovery + 12,
  hitboxOffset: new THREE.Vector3(1.2, y, 0),
  hitboxSize: new THREE.Vector3(1.6, 0.6, 1),
  hitLevel: level,
  guardMeterIncrement: Math.max(5, Math.round(damage / 2)),
  guardMeterAirMultiplier: 1.5,
  blockAdvantage: -Math.max(4, Math.round(recovery / 2)),
});

const attacks = (theme: string) => ({
  low: move(`${theme} Low`, 6, 4, 12, 12, 0.4, HitLevel.LOW),
  mid: move(`${theme} Mid`, 7, 4, 14, 18, 1.0, HitLevel.MID),
  high: move(`${theme} High`, 10, 5, 18, 28, 1.5, HitLevel.HIGH),
  kick: move(`${theme} Kick`, 7, 3, 12, 10, 0.8, HitLevel.MID),
  dashAttack: { ...move(`${theme} Dash`, 8, 5, 16, 20, 1.1, HitLevel.MID), isDashingAttack: true },
  dashLow: { ...move(`${theme} Dash Low`, 7, 5, 16, 16, 0.4, HitLevel.LOW), isDashingAttack: true },
  dashMid: { ...move(`${theme} Dash Mid`, 8, 5, 16, 20, 1.1, HitLevel.MID), isDashingAttack: true },
  dashHigh: { ...move(`${theme} Dash High`, 10, 5, 18, 24, 1.6, HitLevel.HIGH), isDashingAttack: true },
  dashKick: { ...move(`${theme} Dash Kick`, 8, 5, 16, 16, 0.8, HitLevel.MID), isDashingAttack: true },
});

export const WARRIOR_PROFILES: Record<WarriorType, WarriorProfile> = {
  [WarriorType.KNIGHT]: {
    walkSpeed: 2.0,
    jumpForce: 10.0,
    defense: 0.7,
    color: 0x888899,
    scale: 1.2,
    swordLength: 1.6,
    armYOffset: 0.15,
    attacks: attacks('Knight'),
  },
  [WarriorType.SAMURAI]: {
    walkSpeed: 3.5,
    jumpForce: 12.0,
    defense: 1.0,
    color: 0xaa3333,
    scale: 1.0,
    swordLength: 1.2,
    attacks: attacks('Samurai'),
  },
  [WarriorType.PIRATE]: {
    walkSpeed: 3.5,
    jumpForce: 12.0,
    defense: 1.0,
    color: 0x334455,
    scale: 1.0,
    swordLength: 1.0,
    weaponWidth: 0.15,
    attacks: attacks('Pirate'),
  },
  [WarriorType.RUSTY]: {
    walkSpeed: 2.4,
    jumpForce: 10.0,
    defense: 0.65,
    color: 0xa32a2a,
    scale: 1.05,
    swordLength: 1.0,
    weaponWidth: 0.18,
    armYOffset: 0.15,
    neckYOffset: 0.28,
    attacks: attacks('Rusty'),
  },
};
