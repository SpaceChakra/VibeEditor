import * as THREE from 'three';
import { BaseWarriorBuilder } from './BaseWarriorBuilder';
import { CharacterRig, WarriorProfile } from '../types';
import { adjustPartMeshes, createAnatomicalFootGeo, createAnatomicalHead, createAnatomicalTorsoGeo, createBladeGeo, createMuscleGeo, makeBeardMat, makeSkin, makeStriped, makeToon, makeWood, taperMeshesY } from '../parts';
import { addCurvedHair, addHairMass, addHairStrut } from '../hair';
import { PetBuilder, PetType } from '../../PetBuilder';

// Tricorne brim: an annular sheet whose outer edge folds up at three
// points 120 deg apart (front, back-left, back-right), with the corners
// between the folds left low — the classic trifold silhouette.
// Built as a closed solid (top + bottom skins + edge walls) so the
// inverted-hull outline in createPart renders correctly.
function createTricorneBrimGeo(s: number): THREE.BufferGeometry {
    const NT = 96, NR = 8;
    const rIn = 0.125 * s, rOut = 0.295 * s, thick = 0.013 * s;

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const smooth = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
    // 1 at the three fold centres, 0 at the corner points between them
    const foldAt = (th: number) => Math.pow(0.5 + 0.5 * Math.cos(3 * th), 1.7);

    const positions: number[] = [];
    const vid = (layer: number, it: number, ir: number) => layer * (NT + 1) * (NR + 1) + it * (NR + 1) + ir;

    for (let layer = 0; layer < 2; layer++) {
        for (let it = 0; it <= NT; it++) {
            const th = (it / NT) * Math.PI * 2;
            const fold = foldAt(th);
            for (let ir = 0; ir <= NR; ir++) {
                const fr = ir / NR;
                const r = rIn + (rOut - rIn) * fr;
                const curl = Math.pow(smooth((fr - 0.35) / 0.65), 1.5); // fold starts ~35% out
                const lift = ((0.02 + 0.155 * fold) * curl - 0.012 * (1 - fold) * curl) * s;
                const re = r - 0.085 * s * fold * curl * curl;          // cocked edge hugs the crown
                positions.push(Math.sin(th) * re, lift + (layer === 1 ? -thick : 0), Math.cos(th) * re);
            }
        }
    }

    const indices: number[] = [];
    for (let it = 0; it < NT; it++) {
        for (let ir = 0; ir < NR; ir++) {
            const a0 = vid(0, it, ir), b0 = vid(0, it + 1, ir), c0 = vid(0, it + 1, ir + 1), d0 = vid(0, it, ir + 1);
            indices.push(a0, d0, c0, a0, c0, b0);                       // top skin (+y)
            const a1 = vid(1, it, ir), b1 = vid(1, it + 1, ir), c1 = vid(1, it + 1, ir + 1), d1 = vid(1, it, ir + 1);
            indices.push(a1, c1, d1, a1, b1, c1);                       // bottom skin (-y)
        }
        const tA = vid(0, it, NR), tB = vid(0, it + 1, NR), bA = vid(1, it, NR), bB = vid(1, it + 1, NR);
        indices.push(tA, bA, bB, tA, bB, tB);                           // outer wall
        const tA0 = vid(0, it, 0), tB0 = vid(0, it + 1, 0), bA0 = vid(1, it, 0), bB0 = vid(1, it + 1, 0);
        indices.push(tA0, bB0, bA0, tA0, tB0, bB0);                     // inner wall (under crown)
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

export class PirateBuilder extends BaseWarriorBuilder {
    public build(rig: CharacterRig, s: number, profile: WarriorProfile): void {

        let navy = makeToon(0x1a2a4a, undefined, 2.0);
        if (profile.colorVariant === 1) navy = makeToon(0x4a0a0a, undefined, 2.0);
        const crimson = new THREE.MeshStandardMaterial({ color: 0x8a0303 }); 
        const brown = makeWood(0x4a3018);
        const gold = this.createGoldMaterial(0xc49a45); 
        const weatheredSkin = makeSkin(0xb8783a, true);
        const steel = this.createMetalMaterial(0x8899aa);
        const vestMat = new THREE.MeshStandardMaterial({ color: 0x5c4033 });
        const stripedPants = makeStriped(0xffffff, 0x8a0303, 12);
        const blackHair = makeBeardMat(0x17100c);   // near-black for dark hair/beard

        // 1. Foundation
        this.buildBaseHumanoid(rig, s, weatheredSkin, vestMat, stripedPants);
        rig.neck.position.y = 0.56 * s;
        rig.head.position.set(0, 0.33 * s, 0.035 * s);
        rig.head.rotation.set(-0.19, -0.15, 0.05);
        
        // 2. Head Details (Bandana & Hat)
        rig.head.clear();
        const faceHead = createAnatomicalHead(s, weatheredSkin);
        rig.head.add(faceHead);
        // Editor adjustment: tweak eyes & right eyebrow. Applied to THIS head's
        // features (the ones CharacterBuilder re-binds to the rig handles).
        (faceHead.userData.lEyeball as THREE.Group).scale.set(1.04, 0.86, 1);
        (faceHead.userData.rEyeball as THREE.Group).rotation.set(0.0184, 0, -0.0516);
        (faceHead.userData.rEyeball as THREE.Group).scale.set(1.04, 0.86, 1);
        this.applyEyeTexture(
            faceHead.userData.lEyeball as THREE.Group,
            faceHead.userData.rEyeball as THREE.Group,
            0x6b3a1f, // brown
            s
        );
        // Eyeball child mesh gaze offsets derived in the editor
        {
            const _joints: THREE.Object3D[] = [];
            (faceHead.userData.lEyeball as THREE.Group).children.forEach(c => {
                if (_joints.includes(c)) return;
                c.position.add(new THREE.Vector3(0.005 * s, 0, 0));
                c.rotation.set(c.rotation.x + -0.0516, c.rotation.y + -0.9216, c.rotation.z + 0.0084);
            });
            (faceHead.userData.rEyeball as THREE.Group).children.forEach(c => {
                if (_joints.includes(c)) return;
                c.rotation.set(c.rotation.x + 0, c.rotation.y + -0.9216, c.rotation.z + 0);
            });
        }
        const lBrow = faceHead.userData.lEyebrow as THREE.Object3D;
        lBrow.position.set(-0.03 * s, 0.02 * s, 0.1 * s);
        lBrow.rotation.set(0, -0.0916, -0.3);
        lBrow.scale.set(1.31, 2.39, 1.46);
        const rBrow = faceHead.userData.rEyebrow as THREE.Object3D;
        rBrow.position.set(0.045 * s, 0.01 * s, 0.1 * s);
        rBrow.rotation.set(-0.6416, 0.2784, 0.3484);
        rBrow.scale.set(1.31, 2.39, 1.46);

        const hairDetail = makeBeardMat(0x24170f);  // very dark brown for beard highlight/tip detail
        const hairMass = (
            radius: number,
            scale: [number, number, number],
            position: [number, number, number],
            rotation: [number, number, number] = [0, 0, 0],
            material: THREE.Material = blackHair,
            parent: THREE.Group = rig.head,
        ) => addHairMass(parent, s, material, radius, scale, position, rotation);
        const hairStrut = (
            from: [number, number, number],
            to: [number, number, number],
            radius: number,
            material: THREE.Material = blackHair,
            parent: THREE.Group = rig.head,
        ) => addHairStrut(parent, s, material, from, to, radius);
        const curvedHair = (
            points: [number, number, number][],
            radius: number,
            material: THREE.Material = hairDetail,
            parent: THREE.Group = rig.head,
        ) => addCurvedHair(parent, s, material, points, radius);

        // Group the scalp/side hair so the whole hair (under the tricorne) can be
        // moved/scaled/rotated together in the editor as `hair`.
        const hairGroup = new THREE.Group();
        rig.head.add(hairGroup);
        rig.hair = hairGroup;

        // Separate beard controls per user's request: mustache as one,
        // chin (jaw/chin body) as one, and lower beard split into L/R for
        // independent control of the dangling side parts.
        const mustacheGroup = new THREE.Group();
        const chinBeardGroup = new THREE.Group();
        const beardLowerL = new THREE.Group();
        const beardLowerR = new THREE.Group();
        rig.head.add(mustacheGroup, chinBeardGroup, beardLowerL, beardLowerR);
        if (!rig.extras) rig.extras = {};
        rig.extras.mustache = mustacheGroup;
        rig.extras.chinBeard = chinBeardGroup;
        rig.extras.beardLowerL = beardLowerL;
        rig.extras.beardLowerR = beardLowerR;

        // Fitted scalp and side hair: broad, overlapping masses under the hat
        // so the hair reads as attached to the skull instead of floating locks.
        hairMass(0.17, [1.03, 0.54, 0.98], [0, 0.09, -0.03], [-0.12, 0, 0], blackHair, hairGroup);
        hairMass(0.12, [0.42, 1.18, 0.54], [-0.118, -0.015, 0.005], [0.06, -0.12, -0.1], blackHair, hairGroup);
        hairMass(0.12, [0.42, 1.18, 0.54], [0.118, -0.015, 0.005], [0.06, 0.12, 0.1], blackHair, hairGroup);
        hairMass(0.13, [1.05, 0.9, 0.36], [0, -0.025, -0.112], [-0.18, 0, 0], blackHair, hairGroup);
        for (const side of [-1, 1] as const) {
            hairStrut([side * 0.115, 0.045, 0.022], [side * 0.105, -0.108, 0.075], 0.034, blackHair, hairGroup);
            hairStrut([side * 0.135, 0.02, -0.02], [side * 0.112, -0.145, -0.015], 0.026, hairDetail, hairGroup);
            curvedHair([
                [side * 0.105, 0.03, -0.085],
                [side * 0.12, -0.05, -0.105],
                [side * 0.09, -0.18, -0.075],
            ], 0.018, hairDetail, hairGroup);
        }

        // Connected beard volume: overlapping cheek, jaw and chin patches sit
        // directly on the lower-face plane and cover the seams between strands.
        hairMass(0.09, [0.86, 0.92, 0.32], [-0.083, -0.12, 0.105], [0.06, -0.22, -0.08], blackHair, chinBeardGroup);
        hairMass(0.09, [0.86, 0.92, 0.32], [0.083, -0.12, 0.105], [0.06, 0.22, 0.08], blackHair, chinBeardGroup);
        hairMass(0.085, [0.72, 0.82, 0.28], [-0.112, -0.075, 0.098], [0.08, -0.35, -0.12], blackHair, chinBeardGroup);
        hairMass(0.085, [0.72, 0.82, 0.28], [0.112, -0.075, 0.098], [0.08, 0.35, 0.12], blackHair, chinBeardGroup);
        hairMass(0.105, [1.22, 0.68, 0.34], [0, -0.132, 0.118], [0.12, 0, 0], blackHair, chinBeardGroup);
        hairMass(0.115, [0.82, 1.28, 0.42], [0, -0.198, 0.104], [0.05, 0, 0], blackHair, chinBeardGroup);
        hairMass(0.076, [0.68, 0.9, 0.3], [-0.05, -0.235, 0.086], [0.04, -0.1, -0.04], hairDetail, beardLowerL);
        hairMass(0.076, [0.68, 0.9, 0.3], [0.05, -0.235, 0.086], [0.04, 0.1, 0.04], hairDetail, beardLowerR);

        // Moustache as two swept, connected capsules plus a small center blend.
        hairMass(0.038, [1.15, 0.44, 0.6], [0, -0.077, 0.126], [0.12, 0, 0], blackHair, mustacheGroup);
        for (const side of [-1, 1] as const) {
            hairStrut([side * 0.006, -0.074, 0.132], [side * 0.085, -0.087, 0.125], 0.022, blackHair, mustacheGroup);
            hairStrut([side * 0.047, -0.101, 0.124], [side * 0.096, -0.128, 0.107], 0.018, hairDetail, mustacheGroup);
            curvedHair([
                [side * 0.025, -0.11, 0.13],
                [side * 0.055, -0.17, 0.118],
                [side * 0.032, -0.255, 0.088],
            ], 0.014, hairDetail, mustacheGroup);
        }

        // Red Bandana
        const bandanaGeo = new THREE.CylinderGeometry(0.13 * s, 0.13 * s, 0.05 * s, 32);
        const bandana = this.createPart(bandanaGeo, crimson);
        bandana.position.y = 0.09 * s;
        bandana.rotation.z = 0.1;
        rig.head.add(bandana);
        rig.extras!.bandana = bandana;

        // Weathered Tricorne Hat (Brown) — round crown, brim cocked up on three sides
        const hatGroup = new THREE.Group();
        hatGroup.position.set(0, 0.165 * s, -0.02 * s);
        hatGroup.rotation.set(0.04, 0, 0);
        rig.head.add(hatGroup);

        const hatMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, side: THREE.DoubleSide });

        // Crown dome
        const crownGeo = new THREE.SphereGeometry(0.15 * s, 48, 24, 0, Math.PI * 2, 0, Math.PI / 1.65);
        crownGeo.scale(1, 0.95, 1.04);
        const crown = this.createPart(crownGeo, hatMat);
        crown.position.y = 0.01 * s;
        hatGroup.add(crown);

        // Leather band at the crown base
        const bandGeo = new THREE.CylinderGeometry(0.152 * s, 0.156 * s, 0.035 * s, 48, 1, true);
        const hatBand = this.createPart(bandGeo, brown);
        hatBand.position.y = 0.025 * s;
        hatGroup.add(hatBand);

        // Trifold brim (folds at front, back-left, back-right)
        const brim = this.createPart(createTricorneBrimGeo(s), hatMat);
        hatGroup.add(brim);

        // Gold braid following the folded brim edge
        const edgePts: THREE.Vector3[] = [];
        for (let i = 0; i < 72; i++) {
            const th = (i / 72) * Math.PI * 2;
            const fold = Math.pow(0.5 + 0.5 * Math.cos(3 * th), 1.7);
            const lift = ((0.02 + 0.155 * fold) - 0.012 * (1 - fold)) * s;
            const re = 0.295 * s - 0.085 * s * fold;
            edgePts.push(new THREE.Vector3(Math.sin(th) * re, lift - 0.0065 * s, Math.cos(th) * re));
        }
        const trimGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edgePts, true), 144, 0.011 * s, 8, true);
        hatGroup.add(this.createPart(trimGeo, gold));

        // Feather tucked into the back-left fold
        const featherGeo = new THREE.CylinderGeometry(0.008 * s, 0.05 * s, 0.32 * s, 8);
        featherGeo.translate(0, 0.16 * s, 0);
        const featherMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const feather = this.createPart(featherGeo, featherMat);
        feather.position.set(-0.145 * s, 0.05 * s, -0.085 * s);
        feather.rotation.set(-0.35, 0, 0.6);
        hatGroup.add(feather);
        rig.extras!.hat = hatGroup;
        rig.extras!.hatFeather = feather;

        // 3. Torso (Long Coat & Scarf)
        const coatGeo = createAnatomicalTorsoGeo(s);
        coatGeo.scale(1.1, 1.05, 1.2);
        const coat = this.createPart(coatGeo, navy);
        rig.torso.add(coat);
        if (!rig.extras) rig.extras = {};
        rig.extras.coat = coat;

        // Coat Skirt front half
        const skirtGeo = new THREE.CylinderGeometry(0.42 * s, 0.5 * s, 0.6 * s, 32, 1, true, -Math.PI / 2, Math.PI);
        const skirt = this.createPart(skirtGeo, navy);
        skirt.position.y = -0.4 * s;
        rig.torso.add(skirt);
        rig.extras.coatSkirtFront = skirt;

        // Coat Skirt back half (mirror arc of the front)
        const skirtBackGeo = new THREE.CylinderGeometry(0.42 * s, 0.5 * s, 0.6 * s, 32, 1, true, Math.PI / 2, Math.PI);
        const skirtBack = this.createPart(skirtBackGeo, navy);
        skirtBack.position.y = -0.4 * s;
        rig.torso.add(skirtBack);
        rig.extras.coatSkirtBack = skirtBack;

        // Red Scarf/Neckerchief
        const scarfGeo = new THREE.TorusGeometry(0.15 * s, 0.04 * s, 8, 32);
        const scarf = this.createPart(scarfGeo, crimson);
        scarf.rotation.x = Math.PI / 2;
        scarf.position.y = 0.34 * s;
        scarf.scale.set(0.9, 0.9, 0.9);
        rig.torso.add(scarf);
        rig.extras.coatScarf = scarf;

        // Gold Buttons (grouped so they move/scale together)
        const buttonGroup = new THREE.Group();
        for (let side of [-1, 1]) {
            for (let i = 0; i < 4; i++) {
                const btn = this.createPart(new THREE.SphereGeometry(0.025 * s, 16, 16), gold);
                btn.position.set(side * 0.15 * s, (0.2 - i * 0.15) * s, 0.32 * s);
                buttonGroup.add(btn);
            }
        }
        rig.torso.add(buttonGroup);
        rig.extras.coatButtons = buttonGroup;

        // 4. Legs (Left Peg, Right Human)
        // Helper to clear only mesh parts (to preserve the rig hierarchy)
        const clearMeshes = (group: THREE.Group) => {
            const partsToRemove = group.children.filter(c => 
                c instanceof THREE.Group && 
                c.children.length > 0 && 
                c.children[0] instanceof THREE.Mesh &&
                !c.children.some(child => child instanceof THREE.Group)
            );
            partsToRemove.forEach(m => group.remove(m));
        };

        // LEFT LEG -> PEG LEG (This is his right side in player perception)
        clearMeshes(rig.lThigh); rig.lThigh.add(rig.lCalf);
        const lThighGeo = createMuscleGeo(0.18 * s, 0.22 * s, 0.15 * s, 0.6 * s);
        lThighGeo.translate(0, -0.275 * s, 0); 
        rig.lThigh.add(this.createPart(lThighGeo, stripedPants));

        clearMeshes(rig.lCalf); rig.lCalf.add(rig.lFoot);
        const socket = this.createPart(new THREE.CylinderGeometry(0.15 * s, 0.1 * s, 0.1 * s, 32), steel);
        rig.lCalf.add(socket);
        const shaft = this.createPart(new THREE.CylinderGeometry(0.05 * s, 0.03 * s, 0.5 * s, 32), brown);
        shaft.position.y = -0.25 * s;
        rig.lCalf.add(shaft);
        const tip = this.createPart(new THREE.CylinderGeometry(0.04 * s, 0.06 * s, 0.05 * s, 32), steel);
        tip.position.y = -0.52 * s;
        rig.lCalf.add(tip);
        clearMeshes(rig.lFoot); // No foot on peg side

        // RIGHT LEG -> HUMAN LEG (This is his left side in player perception)
        clearMeshes(rig.rThigh); rig.rThigh.add(rig.rCalf);
        const rThighGeo = createMuscleGeo(0.18 * s, 0.22 * s, 0.18 * s, 0.6 * s);
        rThighGeo.translate(0, -0.275 * s, 0);
        rig.rThigh.add(this.createPart(rThighGeo, stripedPants));
        
        clearMeshes(rig.rCalf); rig.rCalf.add(rig.rFoot);
        const rCalfGeo = createMuscleGeo(0.18 * s, 0.2 * s, 0.15 * s, 0.6 * s);
        rCalfGeo.translate(0, -0.275 * s, 0);
        rig.rCalf.add(this.createPart(rCalfGeo, stripedPants));
        
        const rBoot = this.createPart(new THREE.CylinderGeometry(0.18 * s, 0.14 * s, 0.4 * s, 32), brown);
        rBoot.position.y = -0.2 * s;
        rig.rCalf.add(rBoot);

        clearMeshes(rig.rFoot);
        // Correct mirrored foot for right side — leather texture (peg leg counterpart)
        const footLeather = makeToon(0x2e1a0e, undefined, 3.0);
        rig.rFoot.add(this.createPart(createAnatomicalFootGeo(s, false), footLeather));

        // 6. Weapon (Cutlass)
        rig.weaponGroup.clear();
        const cutlassBlade = this.createPart(createBladeGeo(0.09 * s, profile.swordLength, 0.025 * s, { edge: 'single', tip: 'clip', tipLength: 0.18, curve: 0.14 * s }), steel);
        rig.weaponGroup.add(cutlassBlade);
        rig.sword = cutlassBlade;
        rig.extras!.cutlassBlade = cutlassBlade;

        const basket = this.createPart(new THREE.SphereGeometry(0.14 * s, 32, 32, 0, Math.PI, 0, Math.PI), gold);
        basket.position.set(0, 0.08 * s, 0);
        basket.rotation.set(1.5708, 3.1384, 0);
        rig.weaponGroup.add(basket);
        rig.extras!.cutlassBasket = basket;

        const hilt = this.createPart(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.25 * s, 16), brown);
        hilt.position.y = -0.05 * s;
        rig.weaponGroup.add(hilt);
        rig.extras!.cutlassHilt = hilt;
        
        rig.weaponGroup.rotation.set(Math.PI / 2, 0, -Math.PI / 2);

        // 7. Pet Parrot
        rig.pets.push(PetBuilder.build(PetType.PARROT, s));

        // --- CHARACTER EDITOR ADJUSTMENTS ---
        taperMeshesY(rig.torso, 0.73, 1, [rig.neck, rig.lShoulder, rig.rShoulder, rig.extras!.coat, rig.extras!.coatSkirtFront, rig.extras!.coatSkirtBack, rig.extras!.coatScarf, rig.extras!.coatButtons]);

        adjustPartMeshes(rig.neck, { pos: [0, 0.05 * s, 0] }, [rig.head]);

        taperMeshesY(rig.extras!.coat, 0.88, 1);

        taperMeshesY(rig.extras!.coatSkirtFront, 1, 1.28);

        adjustPartMeshes(rig.pelvis, { pos: [0, -0.13 * s, 0], rot: [0, -0.2416, 0] }, [rig.extras!.abdomen, rig.lThigh, rig.rThigh]);

        rig.lShoulder.position.set(-0.4 * s, 0.27 * s, 0);
        rig.lUpperArm.position.set(0, -0.05 * s, 0);

        adjustPartMeshes(rig.rShoulder, { pos: [0, 0.05 * s, 0] }, [rig.rUpperArm]);
        rig.rUpperArm.position.set(0, 0.03 * s, 0);
        adjustPartMeshes(rig.rUpperArm, { pos: [0, -0.03 * s, 0] }, [rig.rForearm]);

        adjustPartMeshes(rig.lThigh, { scl: [0.8, 1, 0.8] }, [rig.lCalf]);
        rig.lCalf.position.set(0, -0.57 * s, 0);
        rig.lCalf.scale.set(1, 1.13, 1);

        rig.rThigh.position.set(0.2 * s, -0.15 * s, -0.02 * s);
        rig.rThigh.rotation.set(0, 0.1984, 0);
        rig.rThigh.scale.set(1, 1, 1.01);
        adjustPartMeshes(rig.rThigh, { scl: [0.8, 1, 0.8] }, [rig.rCalf]);
        adjustPartMeshes(rig.rCalf, { scl: [0.8, 1, 0.8] }, [rig.rFoot]);
        rig.rFoot.position.set(-0.02 * s, -0.56 * s, 0);
        rig.rFoot.rotation.set(0, -0.3516, -0.052);
        adjustPartMeshes(rig.rFoot, { pos: [0, 0, -0.06 * s], rot: [0.1, 0, 0], scl: [0.88, 0.71, 0.53] });

        rig.hair.position.set(0, 0.02 * s, 0);
        rig.hair.scale.set(0.94, 0.84, 1.23);

        if (rig.rEyeball) adjustPartMeshes(rig.rEyeball, { rot: [-0.49, 2.21, 0] });

        rig.extras!.mustache.position.set(0, 0.01 * s, 0.02 * s);

        rig.extras!.chinBeard.position.set(0, -0.01 * s, 0);
        rig.extras!.chinBeard.scale.set(1, 0.68, 1);

        rig.extras!.beardLowerL.position.set(-0.03 * s, 0.09 * s, -0.13 * s);
        adjustPartMeshes(rig.extras!.beardLowerL, { pos: [0, 0, 0.13 * s] });

        rig.extras!.beardLowerR.position.set(0.03 * s, 0.09 * s, 0);

        rig.extras!.bandana.position.set(0, 0.07 * s, 0);
        rig.extras!.bandana.scale.set(0.91, 0.91, 0.91);

        rig.extras!.hat.position.set(0, 0.115 * s, -0.03 * s);
        rig.extras!.hat.rotation.set(0, 0.0384, -0.2416);
        rig.extras!.hat.scale.set(1, 1, 1.1);
        rig.extras!.hatFeather.position.set(-0.145 * s, 0.05 * s, -0.02 * s);
        rig.extras!.hatFeather.rotation.set(-0.6816, 0.0584, -0.2716);
        rig.extras!.hatFeather.scale.set(0.01, 1.07, 1);

        rig.extras!.coatSkirtFront.scale.set(0.83, 1, 0.71);
        adjustPartMeshes(rig.extras!.coatSkirtFront, { pos: [0, 0.04 * s, -0.03 * s] });

        adjustPartMeshes(rig.extras!.coatSkirtBack, { pos: [0, 0, -0.01 * s], scl: [1, 1, 0.58] });
        taperMeshesY(rig.extras!.coatSkirtBack, 0.82, 1.06);

        adjustPartMeshes(rig.extras!.coatScarf, { pos: [-0.02 * s, 0.09 * s, -0.11 * s], rot: [0.058, -0.002, 0.848], scl: [1.49, 1.5, 0.94] });
        taperMeshesY(rig.extras!.coatScarf, 0.18, 2);

        rig.extras!.coatButtons.position.set(0, 0, -0.03 * s);
        rig.extras!.coatButtons.rotation.set(0.04, 0, 0.02);

    
  // --- auto-applied from /editor.html at 2026-07-02T04:15:38.331Z ---
  // pelvis
  // taper: top XZ ×1, bottom XZ ×0.67
  taperMeshesY(rig.pelvis, 1, 0.67, [rig.extras!.abdomen, rig.lThigh, rig.rThigh]);
  // rFoot
  // taper: top XZ ×1, bottom XZ ×1.6
  taperMeshesY(rig.rFoot, 1, 1.6);
  // coat
  // part-only adjust for coat (own meshes; child joints unaffected)
  adjustPartMeshes(rig.extras!.coat, { rot: [0, 3.1384, 0] });
  // --- end auto-applied ---
}
}
