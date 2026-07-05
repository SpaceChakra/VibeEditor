import * as THREE from 'three';
import { BaseWarriorBuilder } from './BaseWarriorBuilder';
import { CharacterRig, WarriorProfile } from '../types';
import { makeToon, makeSkin, makeShingleArmor, createAnatomicalTorsoGeo, createBeveledBox, createBladeGeo, createMuscleGeo, createAnatomicalHead, adjustPartMeshes, taperMeshesY } from '../parts';

export class SamuraiBuilder extends BaseWarriorBuilder {
    public build(rig: CharacterRig, s: number, profile: WarriorProfile): void {

        let crimson = makeShingleArmor(0x9e1212); // Crimson lacquered plate with shingle kozane detail
        if (profile.colorVariant === 1) crimson = makeShingleArmor(0x111111);
        const darkGrey = makeToon(0x222222); // Undersuit
        const gold = this.createGoldMaterial(0xccaa11); // Gold accents
        const skin = makeSkin(0xc4a478);
        const steel = this.createMetalMaterial(0x8899aa);
        const wood = makeToon(0x4a3018);

        // Build anatomical base
        this.buildBaseHumanoid(rig, s, skin, darkGrey, darkGrey);
        // Abdomen sphere matches the crimson cuirass instead of the dark undersuit.
        (rig.extras!.abdomen as THREE.Mesh).material = crimson;

        // --- ARMOR OVERLAY ---
        // Torso (Do - Cuirass)
        const douGeo = createAnatomicalTorsoGeo(s);
        douGeo.scale(1.06, 1.02, 1.15);
        const dou = this.createPart(douGeo, crimson);
        rig.torso.add(dou);
        rig.extras!.cuirass = dou;

        // Gold trim on Cuirass
        const chestTrimGeo = createBeveledBox(0.52 * s, 0.05 * s, 0.37 * s);
        const chestTrim = this.createPart(chestTrimGeo, gold);
        chestTrim.position.y = 0.15 * s;
        rig.torso.add(chestTrim);
        rig.extras!.chestTrim = chestTrim;

        // Kusazuri panels — front half (i=0..2: right-side + front arc) and
        // back half (i=3..5: left-side + back arc) are separate groups for editor control.
        const kusazuriFront = new THREE.Group();
        const kusazuriBack = new THREE.Group();
        for(let i = 0; i < 6; i++) {
            const angle = (i / 6) * Math.PI * 2;
            const panelGeo = createBeveledBox(0.25 * s, 0.4 * s, 0.06 * s);
            panelGeo.translate(0, -0.2 * s, 0);
            const panel = this.createPart(panelGeo, crimson);
            panel.position.set(Math.cos(angle) * 0.38 * s, 0.1 * s, Math.sin(angle) * 0.38 * s);
            panel.rotation.y = -angle + Math.PI / 2;
            panel.rotation.x = 0.25;
            (i < 3 ? kusazuriFront : kusazuriBack).add(panel);
        }
        rig.pelvis.add(kusazuriFront);
        rig.pelvis.add(kusazuriBack);
        rig.extras!.kusazuriFront = kusazuriFront;
        rig.extras!.kusazuriBack = kusazuriBack;

        // --- BACK FLAGS (Sashimono) ---
        const sashimonoGroup = new THREE.Group();
        // Pushed further back off the spine so the banner clears the helmet
        // instead of clipping into it.
        sashimonoGroup.position.set(0, 0.31 * s, -0.34 * s);
        
        const centerPole = this.createPart(createBeveledBox(0.05 * s, 1.5 * s, 0.05 * s), wood);
        centerPole.position.y = 0.6 * s;
        sashimonoGroup.add(centerPole);
        
        const crossPole = this.createPart(createBeveledBox(0.8 * s, 0.05 * s, 0.05 * s), wood);
        crossPole.position.y = 1.2 * s;
        sashimonoGroup.add(crossPole);

        rig.torso.add(sashimonoGroup);

        // Cloth flags hanging from the crossbar. The red accent square that
        // used to be a separate box is baked into a small canvas texture.
        const flagCanvas = document.createElement('canvas');
        flagCanvas.width = 32; flagCanvas.height = 96;
        const fctx = flagCanvas.getContext('2d')!;
        fctx.fillStyle = '#eeeeee'; fctx.fillRect(0, 0, 32, 96);
        fctx.fillStyle = '#9e1212';
        fctx.fillRect(Math.round(32 * 0.17), Math.round(96 * 0.20), Math.round(32 * 0.66), Math.round(96 * 0.20));
        const flagTex = new THREE.CanvasTexture(flagCanvas);
        flagTex.colorSpace = THREE.SRGBColorSpace;
        const flagMat = new THREE.MeshStandardMaterial({ map: flagTex, roughness: 0.85, metalness: 0.02 });

        const makeFlagCloth = (side: -1 | 1) => this.addCloth(rig, {
            anchor: sashimonoGroup,
            width: 0.3 * s, height: 1.0 * s,
            segX: 3, segY: 8,
            material: side < 0 ? flagMat : flagMat.clone(),
            localPos: new THREE.Vector3(side * 0.25 * s, 1.2 * s, 0),
            localRot: new THREE.Euler(0, side * -0.1, 0),
            originTop: true,
            windScale: 0.5,
            windPhase: side * 2.4,
        });
        const lFlag = makeFlagCloth(-1).mesh;
        const rFlag = makeFlagCloth(1).mesh;

        rig.extras!.sashimono = sashimonoGroup;
        rig.extras!.lFlag = lFlag;
        rig.extras!.rFlag = rFlag;

        // --- HEAD (Complete Kabuto & Mempo) ---
        rig.head.clear();
        
        // Face/Head under helmet
        const faceHead = createAnatomicalHead(s, skin);
        rig.head.add(faceHead);
        // Editor adjustment: nudge & shrink the eyes. Applied to THIS head's
        // eyeballs (the ones CharacterBuilder re-binds to rig.lEyeball/rEyeball).
        {
            const lEyeball = faceHead.userData.lEyeball as THREE.Group;
            const rEyeball = faceHead.userData.rEyeball as THREE.Group;
            lEyeball.position.set(0, 0.03 * s, 0);
            lEyeball.rotation.set(0.21, 0, 0);
            lEyeball.scale.set(0.81, 0.63, 1.12);
            rEyeball.position.set(0, 0.03 * s, 0);
            rEyeball.rotation.set(0.21, 0, 0);
            rEyeball.scale.set(0.81, 0.63, 1.12);
            const lBrow = faceHead.userData.lEyebrow as THREE.Object3D;
            const rBrow = faceHead.userData.rEyebrow as THREE.Object3D;
            lBrow.position.set(-0.03 * s, 0.02 * s, 0.09 * s);
            lBrow.rotation.set(0, -0.06, -0.3);
            lBrow.scale.set(1.53, 2.15, 5.28);
            rBrow.position.set(0.03 * s, 0.02 * s, 0.09 * s);
            rBrow.rotation.set(0, 0.06, 0.3);
            rBrow.scale.set(1.53, 2.15, 5.28);
            this.applyEyeTexture(lEyeball, rEyeball, 0x0d0604, s); // nearly black
            // Eyeball child mesh gaze offsets derived in the editor
            {
                const _joints: THREE.Object3D[] = [];
                lEyeball.children.forEach(c => {
                    if (_joints.includes(c)) return;
                    c.position.add(new THREE.Vector3(0.005 * s, 0, 0));
                    c.rotation.set(c.rotation.x + -0.0516, c.rotation.y + -0.9216, c.rotation.z + 0.0084);
                });
                rEyeball.children.forEach(c => {
                    if (_joints.includes(c)) return;
                    c.rotation.set(c.rotation.x + 0, c.rotation.y + -0.9216, c.rotation.z + 0);
                });
            }
        }
        // Editor adjustment: raise the head.
        rig.head.position.set(0, 0.31 * s, 0);
        
        // All helmet pieces live in a dedicated group so they can be scaled
        // independently of the face (rig.head scale affects both; helmet scale is helmet-only).
        const helmetGroup = new THREE.Group();
        rig.head.add(helmetGroup);
        rig.extras!.helmet = helmetGroup;

        // Kabuto Dome (Hachi)
        const kabutoGeo = new THREE.SphereGeometry(0.19 * s, 96, 96, 0, Math.PI * 2, 0, Math.PI / 2);
        const kabuto = this.createPart(kabutoGeo, crimson);
        kabuto.position.y = 0.05 * s;
        helmetGroup.add(kabuto);

        // Shikoro (Neck Guard - Multi-tiered)
        const shikoroMat = crimson.clone();
        shikoroMat.side = THREE.DoubleSide; // Guarantee visibility

        for (let i = 0; i < 3; i++) {
            // Tighter radii at the top, natural flare at bottom
            const rTop = (0.19 + i * 0.01) * s;
            const rBot = (0.26 + i * 0.03) * s;
            // Wider front opening (Math.PI / 2.8 instead of Math.PI / 4) to avoid clipping front flaps
            const shikoroGeo = new THREE.CylinderGeometry(rTop, rBot, 0.08 * s, 96, 1, true, Math.PI / 2.8, Math.PI * 1.3);
            const guard = this.createPart(shikoroGeo, shikoroMat);
            // Connected to the helmet rim (0.05) and tiered downwards
            guard.position.y = 0.05 * s - (i * 0.06 * s);
            guard.rotation.x = 0.15; // Natural hang
            helmetGroup.add(guard);
        }

        // Fukigaeshi (Winged ear guards)
        for (let side of [-1, 1]) {
            const fukiGeo = createBeveledBox(0.12 * s, 0.2 * s, 0.03 * s);
            fukiGeo.translate(side * 0.06 * s, 0, 0);
            const fuki = this.createPart(fukiGeo, crimson);
            // Moved inward and backward to close the gap with the helmet
            fuki.position.set(side * 0.19 * s, -0.02 * s, 0.11 * s);
            // Rotate outwards (-side * 0.5) so the front face is visible
            fuki.rotation.y = -side * 0.5;
            fuki.rotation.x = -0.15;

            // Gold border/trim for the front face of the wing
            const fukiTrim = this.createPart(createBeveledBox(0.12 * s, 0.2 * s, 0.01 * s), gold);
            fukiTrim.position.set(side * 0.06 * s, 0, 0.016 * s);
            fuki.add(fukiTrim);

            // Inner crimson panel to create the gold trim look
            const innerPanel = this.createPart(createBeveledBox(0.08 * s, 0.16 * s, 0.015 * s), crimson);
            innerPanel.position.set(side * 0.06 * s, 0, 0.018 * s);
            fuki.add(innerPanel);

            helmetGroup.add(fuki);
        }

        // Kuwagata Maedate (Antler-style gold crest)
        const crestGroup = new THREE.Group();

        // Base plate for the crest
        const basePlate = this.createPart(createBeveledBox(0.12 * s, 0.08 * s, 0.02 * s), gold);
        basePlate.position.set(0, 0.14 * s, 0.19 * s);
        basePlate.rotation.x = 0.2;
        crestGroup.add(basePlate);

        // The flat, wide horns (Kuwagata)
        const hornShape = createBeveledBox(0.06 * s, 0.45 * s, 0.01 * s);
        hornShape.translate(0, 0.22 * s, 0);

        for (let side of [-1, 1]) {
            const horn = this.createPart(hornShape, gold);
            horn.position.set(side * 0.04 * s, 0.14 * s, 0.2 * s);
            // Splayed out and angled forward
            horn.rotation.set(0.4, 0, -side * 0.7);

            // Tips of the horns curved further outward
            const tipGeo = createBeveledBox(0.06 * s, 0.2 * s, 0.01 * s);
            tipGeo.translate(0, 0.1 * s, 0);
            const tip = this.createPart(tipGeo, gold);
            tip.position.y = 0.45 * s;
            tip.rotation.z = side * 0.45;
            horn.add(tip);

            crestGroup.add(horn);
        }

        // Central circular emblem (Mon)
        const monGeo = new THREE.CylinderGeometry(0.07 * s, 0.07 * s, 0.02 * s, 64);
        const mon = this.createPart(monGeo, gold);
        mon.rotation.x = Math.PI / 2 + 0.2;
        mon.position.set(0, 0.16 * s, 0.21 * s);
        crestGroup.add(mon);

        helmetGroup.add(crestGroup);

        // Mempo (Face Mask)
        const mempoGeo = new THREE.SphereGeometry(0.16 * s, 64, 64, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        mempoGeo.scale(1, 0.8, 1.1);
        const mempo = this.createPart(mempoGeo, darkGrey);
        mempo.position.set(0, -0.05 * s, 0.05 * s);
        helmetGroup.add(mempo);

        // Mask Nose Guard
        const noseGeo = createBeveledBox(0.06 * s, 0.08 * s, 0.1 * s);
        const nose = this.createPart(noseGeo, darkGrey);
        nose.position.set(0, 0, 0.15 * s);
        mempo.add(nose);

        rig.head.position.set(0, 0.2833 * s, 0);

        // --- SODE (Shoulder Guards) ---
        // Narrow from the side, wide from front-to-back to cover arms properly
        const sodeGeo = createBeveledBox(0.12 * s, 0.35 * s, 0.45 * s);
        sodeGeo.translate(0, -0.15 * s, 0);

        const lSode = this.createPart(sodeGeo, crimson);
        lSode.position.set(-0.07 * s, 0.12 * s, 0);
        lSode.rotation.set(0, 0, -0.4616);
        lSode.scale.set(0.63, 1, 1);
        this.getPadSocket(rig, 'l').add(lSode);

        const rSode = this.createPart(sodeGeo, crimson);
        rSode.position.set(0.07 * s, 0.12 * s, 0);
        rSode.rotation.set(0, 0, 0.4616);
        rSode.scale.set(0.63, 1, 1);
        this.getPadSocket(rig, 'r').add(rSode);
        rig.extras!.lPauldron = lSode;
        rig.extras!.rPauldron = rSode;

        // Gold trim on Sode
        const sodeTrimGeo = createBeveledBox(0.14 * s, 0.05 * s, 0.47 * s);
        const lSodeTrim = this.createPart(sodeTrimGeo, gold);
        lSodeTrim.position.y = 0.02 * s;
        lSode.add(lSodeTrim);
        const rSodeTrim = this.createPart(sodeTrimGeo, gold);
        rSodeTrim.position.y = 0.02 * s;
        rSode.add(rSodeTrim);

        rig.extras!.lSode = lSode;
        rig.extras!.rSode = rSode;
        rig.extras!.lSodeTrim = lSodeTrim;
        rig.extras!.rSodeTrim = rSodeTrim;

        // Armor on limbs
        rig.lForearm.add(this.createPart(createMuscleGeo(0.11 * s, 0.13 * s, 0.08 * s, 0.45 * s), crimson));
        rig.rForearm.add(this.createPart(createMuscleGeo(0.11 * s, 0.13 * s, 0.08 * s, 0.45 * s), crimson));

        // --- WEAPON (Katana) ---
        rig.weaponGroup.clear();
        const bladeGeo = createBladeGeo(0.07 * s, profile.swordLength, 0.022 * s, { edge: 'single', tip: 'clip', curve: 0.06 * s });
        const blade = this.createPart(bladeGeo, steel);
        blade.position.y = 0.1 * s;
        blade.rotation.x = 0.05;
        rig.weaponGroup.add(blade);
        rig.sword = blade;

        const tsubaGeo = new THREE.CylinderGeometry(0.12 * s, 0.12 * s, 0.03 * s, 96);
        const tsuba = this.createPart(tsubaGeo, gold);
        tsuba.position.y = 0.1 * s;
        rig.weaponGroup.add(tsuba);

        const hiltGeo = createBeveledBox(0.04 * s, 0.25 * s, 0.06 * s);
        const hilt = this.createPart(hiltGeo, darkGrey);
        hilt.position.y = -0.025 * s;
        rig.weaponGroup.add(hilt);

        rig.weaponGroup.rotation.set(Math.PI / 2, 0, -Math.PI / 2);

        rig.lUpperArm.position.set(0, -0.1 * s, 0);
        rig.rUpperArm.position.set(0, -0.1 * s, 0);
        taperMeshesY(rig.lUpperArm, 1.73, 1, [rig.lForearm]);
        taperMeshesY(rig.rUpperArm, 1.73, 1, [rig.rForearm]);

        adjustPartMeshes(rig.lShoulder, { pos: [0, -0.01 * s, 0] }, [rig.lUpperArm, rig.lPadSocket!]);

        adjustPartMeshes(rig.rShoulder, { pos: [0, -0.01 * s, 0] }, [rig.rUpperArm, rig.rPadSocket!]);

        rig.lShoulder.scale.set(1, 0.76, 1);
        rig.rShoulder.scale.set(1, 0.76, 1);

        rig.extras!.sashimono.rotation.set(-0.14, 0, 0);

        // --- CHARACTER EDITOR ADJUSTMENTS — wide horse-stance & turned pelvis ---
        rig.pelvis.rotation.set(0, 0.23, 0);
        adjustPartMeshes(rig.pelvis, { scl: [1.12, 1, 1] }, [rig.extras!.abdomen, rig.lThigh, rig.rThigh]);

        rig.lThigh.rotation.set(0, -0.23, 0);
        adjustPartMeshes(rig.lThigh, { scl: [0.8, 1, 0.8] }, [rig.lCalf]);
        // taper: top XZ ×1, bottom XZ ×1.47
        taperMeshesY(rig.lThigh, 1, 1.47, [rig.extras!.lPatella, rig.lCalf]);
        // lShin
        // taper: top XZ ×0.74, bottom XZ ×0.91
        taperMeshesY(rig.lShin!, 0.74, 0.91);

        rig.rThigh.rotation.set(-0.1516, 0.1984, 0.0084);
        adjustPartMeshes(rig.rThigh, { scl: [0.8, 1, 0.8] }, [rig.rCalf]);

        rig.rShin!.rotation.set(0.4584, 0, 0);
        // rShin
        // taper: top XZ ×0.74, bottom XZ ×1
        taperMeshesY(rig.rShin!, 0.74, 1);

        rig.lFoot.position.set(0.03 * s, -0.55 * s, 0);
        rig.rFoot.position.set(-0.03 * s, -0.51 * s, -0.3 * s);
        rig.rFoot.rotation.set(0.1984, 0, 0);

        adjustPartMeshes(rig.lUpperArm, { scl: [0.8, 1, 0.8] }, [rig.lForearm]);
        adjustPartMeshes(rig.rUpperArm, { scl: [0.8, 1, 0.8] }, [rig.rForearm]);

        // Reseat & angle the arms, and re-plant the feet.
        rig.lUpperArm.position.set(0, -0.04 * s, 0);
        rig.lUpperArm.rotation.set(0, 0, -0.1684);
        rig.lForearm.position.set(0, -0.58 * s, 0.1 * s);
        rig.lForearm.rotation.set(-0.3, 0, 0.01);
        rig.rUpperArm.position.set(0, -0.04 * s, 0);
        rig.rUpperArm.rotation.set(0, 0, 0.1684);
        rig.rForearm.position.set(0, -0.58 * s, 0.1 * s);
        rig.rForearm.rotation.set(-0.3, 0, -0.01);

        rig.lFoot.position.set(0.03 * s, -0.55 * s, 0);
        rig.lFoot.rotation.set(0, 0.01, 0.04);
        rig.rFoot.position.set(-0.03 * s, -0.51 * s, -0.3 * s);
        // Helmet: scale down uniformly.
        rig.extras!.helmet.scale.set(0.8, 0.8, 0.8);
        rig.neck.position.set(0, 0.54 * s, 0);
        rig.torso.position.set(0, 1.65 * s, 0.05 * s);

        rig.rFoot.rotation.set(0.1516, 0, 0);

        adjustPartMeshes(rig.extras!.cuirass, { scl: [1, 1, 0.92] });

        rig.extras!.chestTrim.position.set(0, 0.15 * s, 0.26 * s);
        rig.extras!.chestTrim.rotation.set(1.5984, 0, 0);
        adjustPartMeshes(rig.extras!.chestTrim, { pos: [0, 0.02 * s, 0], scl: [1, 0.63, 0.58] });

        for (const kGroup of [rig.extras!.kusazuriFront, rig.extras!.kusazuriBack]) {
            kGroup.children.forEach(c => {
                c.rotation.set(c.rotation.x - 0.23, c.rotation.y - 0.04, c.rotation.z);
                c.scale.set(c.scale.x * 0.9, c.scale.y * 0.87, c.scale.z * 0.82);
            });
        }

        rig.extras!.kusazuriFront.position.set(0, 0.05 * s, 0);
        rig.extras!.kusazuriFront.rotation.set(-0.04, -0.5716, 0);
        rig.extras!.kusazuriFront.scale.set(0.94, 1, 0.79);

        rig.extras!.kusazuriBack.position.set(0, 0.04 * s, -0.02 * s);
        rig.extras!.kusazuriBack.rotation.set(0.108, -0.47, 0);
        rig.extras!.kusazuriBack.scale.set(0.98, 1, 0.73);

        this.addCrotchFill(rig, s, darkGrey);

        adjustPartMeshes(rig.extras!.crotch, { pos: [0, 0.07 * s, 0] });
    }
}
