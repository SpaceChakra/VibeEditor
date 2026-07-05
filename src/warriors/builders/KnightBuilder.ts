import * as THREE from 'three';
import { BaseWarriorBuilder } from './BaseWarriorBuilder';
import { CharacterRig, WarriorProfile } from '../types';
import { makeToon, makeFabric, makeSilverArmor, createAnatomicalTorsoGeo, createBeveledBox, createBladeGeo, createMuscleGeo, applyArmorOffset, adjustPartMeshes, taperMeshesY } from '../parts';

export class KnightBuilder extends BaseWarriorBuilder {
    public build(rig: CharacterRig, s: number, profile: WarriorProfile): void {

        const steel = this.createMetalMaterial(0x8899aa, 0.67);
        const darkSteel = makeSilverArmor(0xffffff, 0.875);
        let bloodRed = makeToon(0x7a0a0a, undefined, 1.33);
        if (profile.colorVariant === 1) bloodRed = makeToon(0x0a1a7a, undefined, 1.33);
        const leather = makeToon(0x1a1a1a);
        const chain = this.createChainmailMaterial(0x777788, 0.875);

        // Build anatomical base
        // Use chainmail for visible hauberk areas: neck (collar), hands (mail mitts), shoulders/upper arms (sleeves), torso base (under plate)
        this.buildBaseHumanoid(rig, s, chain, chain, darkSteel);
        // Abdomen sphere matches the tabard so it doesn't show the undersuit colour.
        (rig.extras!.abdomen as THREE.Mesh).material = bloodRed;

        // Torso chainmail UV U = 2.38 (wider horizontal repeat on the LatheGeometry)
        { let _n = 0;
          rig.torso.traverse(o => {
            if (!(o instanceof THREE.Mesh) || _n++ !== 0) return;
            const mat = o.material as THREE.MeshStandardMaterial;
            (['normalMap', 'roughnessMap', 'aoMap', 'metalnessMap'] as const).forEach(k => {
                const t = mat[k]; if (t) { t.repeat.x = 2.38; t.needsUpdate = true; }
            });
            mat.needsUpdate = true;
          }); }

        // Silver metal on shoulders, upper arms, hands (U=2.38, V=0.875)
        { const _silverNodes = [rig.lShoulder, rig.rShoulder, rig.lUpperArm, rig.rUpperArm, rig.lHand, rig.rHand];
          const _silverMat = () => {
            const m = makeSilverArmor(0xffffff, 0.875);
            (['map', 'normalMap', 'roughnessMap', 'aoMap', 'metalnessMap'] as const).forEach(k => {
                const t = (m as any)[k] as THREE.Texture | null | undefined;
                if (t) { t.repeat.x = 2.38; t.needsUpdate = true; }
            });
            return m;
          };
          _silverNodes.forEach(node => {
            let _n = 0;
            node.traverse(o => { if (o instanceof THREE.Mesh && _n++ === 0) o.material = _silverMat(); });
          }); }

        // --- ARMOR OVERLAY ---
        // Torso/Chestplate
        const chestplateGeo = createAnatomicalTorsoGeo(s);
        chestplateGeo.scale(1.05, 1.05, 1.1);
        const chestplate = this.createPart(chestplateGeo, darkSteel);
        applyArmorOffset(chestplate.children[0] instanceof THREE.Mesh ? (chestplate.children[0] as THREE.Mesh).material as THREE.Material : darkSteel, 1);
        rig.torso.add(chestplate);
        rig.extras!.chestplate = chestplate;

        // Tabard (worn over the armor)
        const tabardGeo = createAnatomicalTorsoGeo(s);
        tabardGeo.scale(1.08, 1.08, 1.15); // Slightly larger than chestplate
        const tabard = this.createPart(tabardGeo, bloodRed);
        applyArmorOffset(tabard.children[0] instanceof THREE.Mesh ? (tabard.children[0] as THREE.Mesh).material as THREE.Material : bloodRed, 2);
        rig.torso.add(tabard);
        rig.extras!.tabard = tabard;

        // Tabard lower skirt (draping over pelvis)
        const skirtGeo = new THREE.CylinderGeometry(0.2585 * s, 0.3339 * s, 0.3 * s, 96);
        const skirt = this.createPart(skirtGeo, bloodRed);
        skirt.position.y = -0.1 * s;
        rig.pelvis.add(skirt);
        rig.extras!.skirt = skirt;

        // Leather Belt with Gold Buckle
        const beltGeo = new THREE.CylinderGeometry(0.29 * s, 0.29 * s, 0.08 * s, 96);
        const belt = this.createPart(beltGeo, leather);
        belt.position.y = 0.05 * s;

        const buckleGeo = createBeveledBox(0.12 * s, 0.12 * s, 0.02 * s);
        const buckle = this.createPart(buckleGeo, this.createGoldMaterial(0xddaa11));
        buckle.position.set(0, 0, 0.30 * s);
        belt.add(buckle);
        rig.pelvis.add(belt);
        rig.extras!.belt = belt;

        // Pauldrons — LatheGeometry dome profile instead of SphereGeometry so UV coordinates
        // wrap uniformly around the circumference (same as LatheGeometry arms) and the silver
        // metal normal map renders identically to the upper arm rather than looking darker/muddy
        // from the degenerate UV pole that SphereGeometry produces at the apex.
        const _pauldronPts: THREE.Vector2[] = [];
        { const _r = 0.215 * s, _a = Math.PI / 1.8, _n = 24;
          for (let i = _n; i >= 0; i--) { const t = (i / _n) * _a; _pauldronPts.push(new THREE.Vector2(Math.sin(t) * _r, Math.cos(t) * _r)); }
          // Close the rim back to the axis so the revolve gets a flat bottom cap
          // instead of leaving the dome open/hollow — otherwise the camera can see
          // straight through into the empty interior from below/behind.
          _pauldronPts.unshift(new THREE.Vector2(0, _pauldronPts[0].y)); }
        const pauldronGeo = new THREE.LatheGeometry(_pauldronPts, 48);
        const lPauldron = this.createPart(pauldronGeo, darkSteel);
        lPauldron.position.y = 0.12 * s;
        lPauldron.rotation.z = 0.3;
        this.getPadSocket(rig, 'l').add(lPauldron);

        const rPauldron = this.createPart(pauldronGeo, darkSteel);
        rPauldron.position.y = 0.12 * s;
        rPauldron.rotation.z = -0.3;
        this.getPadSocket(rig, 'r').add(rPauldron);
        rig.extras!.lPauldron = lPauldron;
        rig.extras!.rPauldron = rPauldron;
        // Assign fresh silver armor materials so pauldrons are not affected by any
        // shared texture state from the darkSteel clone.
        (lPauldron.children[0] as THREE.Mesh).material = makeSilverArmor(0xffffff, 0.875);
        (rPauldron.children[0] as THREE.Mesh).material = makeSilverArmor(0xffffff, 0.875);

        // --- HEAD (Authentic Templar/Crusader Greathelm) ---
        rig.head.clear(); // Replace anatomical head with helm
        
        const helmGroup = new THREE.Group();
        // Main helm shape (tapered cylinder with rounded top)
        const domeGeo = new THREE.SphereGeometry(0.18 * s, 96, 96, 0, Math.PI * 2, 0, Math.PI / 2);
        const dome = this.createPart(domeGeo, darkSteel);
        dome.position.y = 0.15 * s;
        helmGroup.add(dome);

        const faceGeo = new THREE.CylinderGeometry(0.18 * s, 0.16 * s, 0.3 * s, 96, 1, false);
        const face = this.createPart(faceGeo, darkSteel);
        helmGroup.add(face);
        
        // Brass/Gold cross — both bars are raw meshes sharing one material instance directly
        // on helmCross (no createPart wrapper) so the editor sees them as the same group
        // with no risk of cloning or baseline-restore separating them.
        const brassMat = this.createGoldMaterial(0xbba53d);
        const helmCross = new THREE.Group();
        const crossVMesh = new THREE.Mesh(createBeveledBox(0.04 * s, 0.25 * s, 0.04 * s), brassMat);
        crossVMesh.castShadow = true; crossVMesh.receiveShadow = true;
        crossVMesh.position.set(0, 0.02 * s, 0.16 * s);
        crossVMesh.rotation.x = -0.05;
        helmCross.add(crossVMesh);
        const crossHMesh = new THREE.Mesh(createBeveledBox(0.25 * s, 0.04 * s, 0.04 * s), brassMat);
        crossHMesh.castShadow = true; crossHMesh.receiveShadow = true;
        crossHMesh.position.set(0, 0.08 * s, 0.16 * s);
        crossHMesh.rotation.x = -0.05;
        helmCross.add(crossHMesh);
        helmGroup.add(helmCross);
        rig.extras!.helmCross = helmCross;

        // Visor slits (cut into the horizontal cross)
        const slitGeo = createBeveledBox(0.08 * s, 0.02 * s, 0.01 * s);
        const slitMat = new THREE.MeshBasicMaterial({color: 0x000000});
        const lSlit = new THREE.Mesh(slitGeo, slitMat);
        lSlit.position.set(-0.06 * s, 0.08 * s, 0.181 * s);
        lSlit.rotation.x = -0.05;
        helmGroup.add(lSlit);
        const rSlit = new THREE.Mesh(slitGeo, slitMat);
        rSlit.position.set(0.06 * s, 0.08 * s, 0.181 * s);
        rSlit.rotation.x = -0.05;
        helmGroup.add(rSlit);

        // Ventilation holes on the lower half
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 3; j++) {
                const ventGeo = new THREE.CircleGeometry(0.008 * s, 8);
                const vent = new THREE.Mesh(ventGeo, slitMat);
                vent.position.set((j - 1) * 0.04 * s, -0.04 * s - (i * 0.03 * s), 0.165 * s);
                vent.rotation.x = -0.05;
                helmGroup.add(vent);
            }
        }
        
        helmGroup.position.y = 0.05 * s;
        rig.head.add(helmGroup);
        rig.extras!.helm = helmGroup;

        // ARMS (Armor)
        const bracerGeo = createMuscleGeo(0.115 * s, 0.135 * s, 0.095 * s, 0.4 * s);
        bracerGeo.translate(0, -0.2 * s, 0);
        const lBracer = this.createPart(bracerGeo, darkSteel);
        const rBracer = this.createPart(bracerGeo, darkSteel);
        rig.lForearm.add(lBracer);
        rig.rForearm.add(rBracer);
        rig.extras!.lBracer = lBracer;
        rig.extras!.rBracer = rBracer;

        // LEGS (Armor)
        const greaveGeo = createMuscleGeo(0.155 * s, 0.185 * s, 0.12 * s, 0.6 * s);
        greaveGeo.translate(0, -0.3 * s, 0);
        const lGreave = this.createPart(greaveGeo, darkSteel);
        const rGreave = this.createPart(greaveGeo, darkSteel);
        rig.lCalf.add(lGreave);
        rig.rCalf.add(rGreave);
        rig.extras!.lGreave = lGreave;
        rig.extras!.rGreave = rGreave;

        // --- WEAPON (Broadsword) ---
        rig.weaponGroup.clear();
        const swordBladeGeo = createBladeGeo(0.1 * s, profile.swordLength, 0.028 * s, { edge: 'double', tip: 'point', tipLength: 0.22 });
        const swordBlade = this.createPart(swordBladeGeo, steel);
        rig.weaponGroup.add(swordBlade);
        rig.sword = swordBlade;

        // Cruciform hilt: crossguard bar, wrapped grip, disc pommel
        const crossguard = this.createPart(createBeveledBox(0.3 * s, 0.04 * s, 0.05 * s), steel);
        rig.weaponGroup.add(crossguard);

        const grip = this.createPart(new THREE.CylinderGeometry(0.028 * s, 0.032 * s, 0.24 * s, 24), leather);
        grip.position.y = -0.14 * s;
        rig.weaponGroup.add(grip);

        const pommel = this.createPart(new THREE.SphereGeometry(0.045 * s, 24, 24), steel);
        pommel.position.y = -0.27 * s;
        rig.weaponGroup.add(pommel);

        rig.weaponGroup.rotation.set(Math.PI / 2, 0, -Math.PI / 2);

        // === Character editor output — paste into the builder (s = profile.scale = 1.2) ===
        // weaponGroup
        rig.weaponGroup.position.set(0.1083 * s, -0.1 * s, 0.04 * s);

        // --- CHARACTER EDITOR ADJUSTMENTS (applied last; part-only blocks scale
        //     own meshes only, leaving child joints in place) ---
        // Deepen the torso plate.
        adjustPartMeshes(rig.torso, { scl: [1, 1, 1.38] }, [rig.neck, rig.lShoulder, rig.rShoulder]);
        // Reshape the pelvis (wider, shorter, shallower).
        adjustPartMeshes(rig.pelvis, { scl: [1.13, 0.73, 0.9] }, [rig.lThigh, rig.rThigh]);
        // Lengthen the skirt.
        adjustPartMeshes(rig.extras!.skirt, { scl: [1, 1.57, 1] });
        // Widen & toe-in the shoulders.
        rig.lShoulder.position.set(-0.425 * s, -0.0167 * s, 0);
        rig.lShoulder.rotation.set(0, 0.01, 0);
        rig.rShoulder.position.set(0.425 * s, -0.0167 * s, 0);
        rig.rShoulder.rotation.set(0, -0.01, 0);
        // Enlarge the pauldrons (own meshes only; upper-arm joints unaffected).
        adjustPartMeshes(rig.lShoulder, { scl: [1.2, 1.2, 1.2] }, [rig.lUpperArm]);
        adjustPartMeshes(rig.rShoulder, { scl: [1.2, 1.2, 1.2] }, [rig.rUpperArm]);
        // Slim the bare shins so the leg no longer clips through the greaves.
        rig.lShin!.scale.set(1, 1, 0.72);
        rig.rShin!.scale.set(1, 1, 0.72);

        // Trim the torso depth a little further.
        adjustPartMeshes(rig.torso, { scl: [1, 1, 0.86] }, [rig.neck, rig.lShoulder, rig.rShoulder]);
        // Rotate the upper arms slightly outward.
        rig.lUpperArm.rotation.set(0, 0, -0.15);
        rig.rUpperArm.rotation.set(0, 0, 0.15);
        // Slim & slightly lengthen the thighs.
        adjustPartMeshes(rig.lThigh, { pos: [0, 0.0083 * s, 0], scl: [0.81, 1.04, 0.8] }, [rig.lCalf]);
        adjustPartMeshes(rig.rThigh, { pos: [0, 0.0083 * s, 0], scl: [0.81, 1.04, 0.8] }, [rig.rCalf]);
        rig.torso.position.set(0, 1.65 * s, 0.0667 * s);
        rig.neck.position.set(0, 0.4717 * s, 0);

        // neck
        adjustPartMeshes(rig.neck, { pos: [0, 0.1083 * s, 0], rot: [0, 3.02, 0], scl: [1.24, 1.24, 1.24] }, [rig.head]);
        // head
        adjustPartMeshes(rig.head, { pos: [0, 0.0083 * s, 0], scl: [0.78, 0.78, 0.78] });

        rig.lShoulder.scale.set(1, 0.73, 1);
        adjustPartMeshes(rig.lShoulder, { pos: [0, 0.5 * s, 0], scl: [0.9, 0.9, 0.9] }, [rig.lUpperArm]);

        rig.rShoulder.scale.set(1, 0.73, 1);
        adjustPartMeshes(rig.rShoulder, { pos: [0, 0.5 * s, 0], scl: [0.9, 0.9, 0.9] }, [rig.rUpperArm]);

        rig.lUpperArm.position.set(0, 0.3083 * s, 0);
        rig.rUpperArm.position.set(0, 0.3083 * s, 0);

        // lUpperArm
        adjustPartMeshes(rig.lUpperArm, { scl: [1.29, 1, 1.29] }, [rig.lForearm]);
        // rUpperArm
        adjustPartMeshes(rig.rUpperArm, { scl: [1.29, 1, 1.29] }, [rig.rForearm]);
        // taper: top XZ ×1, bottom XZ ×1
        taperMeshesY(rig.rUpperArm, 1, 1, [rig.rForearm]);
        // lForearm
        // taper: top XZ ×1, bottom XZ ×0.53
        taperMeshesY(rig.lForearm, 1, 0.53, [rig.lHand, rig.extras!.lBracer]);

        // lPatella
        rig.extras!.lPatella.scale.set(2.2, 2.5, 2.5);
        // taper: top XZ ×1.17, bottom XZ ×0.6
        taperMeshesY(rig.extras!.lPatella, 1.17, 0.6);

        // rPatella
        rig.extras!.rPatella.scale.set(2.2, 2.5, 2.5);
        // taper: top XZ ×1.17, bottom XZ ×0.6
        taperMeshesY(rig.extras!.rPatella, 1.17, 0.6);

        // lGreave
        // taper: top XZ ×0.95, bottom XZ ×0.76
        taperMeshesY(rig.extras!.lGreave, 0.95, 0.76);

        // rGreave
        // taper: top XZ ×0.95, bottom XZ ×0.76
        taperMeshesY(rig.extras!.rGreave, 0.95, 0.76);

        // lBracer
        // part-only adjust for lBracer (own meshes; child joints unaffected)
        adjustPartMeshes(rig.extras!.lBracer, { scl: [1, 1.03, 1] });
        // taper: top XZ ×1.16, bottom XZ ×0.62
        taperMeshesY(rig.extras!.lBracer, 1.16, 0.62);

        // rBracer
        // part-only adjust for rBracer (own meshes; child joints unaffected)
        adjustPartMeshes(rig.extras!.rBracer, { scl: [1, 1.03, 1] });
        // taper: top XZ ×1.16, bottom XZ ×1
        taperMeshesY(rig.extras!.rBracer, 1.16, 1);

        // belt
        adjustPartMeshes(rig.extras!.belt, { pos: [0, 0, 0.0167 * s] });
        // Belt: fabric PBR, blood red, U=2.3 V=0.7
        { const _bm = rig.extras!.belt.children[0] as THREE.Mesh;
          const _bmat = makeFabric(0x7a0a0a, 2.3, 0.7);
          _bmat.normalScale.set(0.45, 0.45);
          _bmat.aoMapIntensity = 0.5;
          _bmat.roughness = 0.66;
          _bmat.metalness = 0.46;
          _bmat.emissiveIntensity = 1.4;
          _bmat.needsUpdate = true;
          _bm.material = _bmat; }

        // tabard
        rig.extras!.tabard.rotation.set(0, 3.1384, 0);
        // taper: top XZ ×1, bottom XZ ×0.98
        taperMeshesY(rig.extras!.tabard, 1, 0.98);

        adjustPartMeshes(rig.pelvis, { scl: [1.03, 1.17, 1.05] }, [rig.extras!.abdomen, rig.lThigh, rig.rThigh]);

        this.addCrotchFill(rig, s, darkSteel);
    }
}
