import * as THREE from 'three';
import { WARRIOR_PROFILES } from './warriors/profiles';
import { WarriorType } from './warriors/types';
import type { CharacterRig } from './warriors/types';

import { KnightBuilder } from './warriors/builders/KnightBuilder';
import { SamuraiBuilder } from './warriors/builders/SamuraiBuilder';
import { PirateBuilder } from './warriors/builders/PirateBuilder';
import { RustyBuilder } from './warriors/builders/RustyBuilder';
import { GenericBuilder } from './warriors/builders/GenericBuilder';
import { BaseWarriorBuilder } from './warriors/builders/BaseWarriorBuilder';

export { WarriorType, HitLevel } from './warriors/types';
export type { MoveData, WarriorProfile } from './warriors/types';
export { WARRIOR_PROFILES } from './warriors/profiles';

export class CharacterBuilder {
    private static builders: Record<number, BaseWarriorBuilder> = {
        [WarriorType.KNIGHT]: new KnightBuilder(),
        [WarriorType.SAMURAI]: new SamuraiBuilder(),
        [WarriorType.PIRATE]: new PirateBuilder(),
        [WarriorType.RUSTY]: new RustyBuilder(),
    };

    private static genericBuilder = new GenericBuilder();

    public static build(type: WarriorType, scene: THREE.Scene, colorVariant = 0): CharacterRig {
        const baseProfile = WARRIOR_PROFILES[type] || WARRIOR_PROFILES[WarriorType.KNIGHT];
        const profile = colorVariant > 0 ? { ...baseProfile, colorVariant } : baseProfile;
        const s = profile.scale;

        // Rig properties to be populated
        let rig: Partial<CharacterRig> = {
            mesh: new THREE.Group(),
            profile: profile,
            pets: [],
            extras: {}
        };
        rig.mesh!.rotation.order = 'YXZ';

        const builder = this.builders[type] || this.genericBuilder;
        builder.build(rig as CharacterRig, s, profile);

        // Re-bind facial features to whatever anatomical head actually ended up in
        // the graph. Many builders clear rig.head and re-add a fresh anatomical
        // head as a child, which would leave the eyeball/eyebrow/lip handles
        // pointing at detached meshes. Scanning the final head subtree makes
        // eyeballs, eyebrows and lips editable on every character that has them.
        rig.lEyeball = undefined;
        rig.rEyeball = undefined;
        const extras = rig.extras!;
        delete extras.lEyebrow; delete extras.rEyebrow; delete extras.lips;
        rig.head!.traverse(o => {
            const u = o.userData || {};
            if (u.eyeSide === 'l') rig.lEyeball = o as THREE.Group;
            else if (u.eyeSide === 'r') rig.rEyeball = o as THREE.Group;
            if (u.browSide === 'l') extras.lEyebrow = o;
            else if (u.browSide === 'r') extras.rEyebrow = o;
            if (u.isLips) extras.lips = o;
        });

        rig.pets!.forEach(pet => scene.add(pet.mesh));
        scene.add(rig.mesh!);
        return rig as CharacterRig;
    }
}
