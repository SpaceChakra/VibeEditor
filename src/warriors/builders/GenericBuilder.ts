import * as THREE from 'three';
import { BaseWarriorBuilder } from './BaseWarriorBuilder';
import { CharacterRig, WarriorProfile } from '../types';
import { makeToon, createBladeGeo } from '../parts';

export class GenericBuilder extends BaseWarriorBuilder {
    public build(rig: CharacterRig, s: number, profile: WarriorProfile): void {

        const toonMat = makeToon(profile.color);
        const steelToonMat = this.createMetalMaterial(0x9999aa);

        this.buildBaseHumanoid(rig, s, toonMat);

        // --- WEAPON (Simple double-edged sword) ---
        rig.weaponGroup.clear();
        const bladeGeo = createBladeGeo((profile.weaponWidth || 0.12) * 1.4 * s, profile.swordLength, 0.03 * s, { edge: 'double', tip: 'point', tipLength: 0.25, baseTaper: 0.35 });
        const blade = this.createPart(bladeGeo, steelToonMat);
        blade.position.y = 0.15 * s;
        rig.weaponGroup.add(blade);
        rig.sword = blade;

        const guard = this.createPart(new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.03 * s, 24), steelToonMat);
        guard.position.y = 0.15 * s;
        rig.weaponGroup.add(guard);

        const grip = this.createPart(new THREE.CylinderGeometry(0.026 * s, 0.03 * s, 0.24 * s, 24), toonMat);
        rig.weaponGroup.add(grip);

        rig.weaponGroup.rotation.set(Math.PI / 2, 0, -Math.PI / 2);
    
    }
}
