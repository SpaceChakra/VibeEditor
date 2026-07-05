import * as THREE from 'three';
import { BaseWarriorBuilder } from './BaseWarriorBuilder';
import { CharacterRig, WarriorProfile } from '../types';
import { makeToon, createBeveledBox, taperMeshesY } from '../parts';

export class RustyBuilder extends BaseWarriorBuilder {
    public build(rig: CharacterRig, s: number, profile: WarriorProfile): void {
        // Red metal body (standard), Industrial Blue (Alt 1), or Rusted Dark Iron (Alt 2)
        let bodyColor = 0xa32a2a;
        if (profile.colorVariant === 1) {
            bodyColor = 0x2a5ca3;
        } else if (profile.colorVariant === 2) {
            bodyColor = 0x5a554a;
        }
        const metalMat = this.createMetalMaterial(bodyColor);
        
        // Copper trim instead of gold
        const copperMat = new THREE.MeshStandardMaterial({
            color: 0xc87042,
            metalness: 0.9,
            roughness: 0.25,
            emissive: 0x2b1008,
            emissiveIntensity: 0.2
        });
        
        const bellowsMat = makeToon(0x2a5c3d); // green bellows/corrugated joints
        const darkMetal = this.createMetalMaterial(0x333333);

        // Build base humanoid skeleton to establish animation bone hierarchy/rig
        this.buildBaseHumanoid(rig, s, bellowsMat, metalMat, metalMat);

        // === Character editor output ===
        // torso
        rig.torso.scale.set(1.24, 1.24, 1.24);

        // neck
        rig.neck.position.set(0, 0.3455 * s, 0);
        rig.neck.scale.set(0.58, 0.58, 0.58);

        // head
        rig.head.scale.set(1.14, 0.78, 0.78);
        // Zero rot/pos (base buildBaseHumanoid gives anatomical 0.07 tilt + 0.245s offset).
        // Runtime (Player.animate GLOBAL DEFAULTS) + editor idle/breathing previews always
        // force head.rotation=(0,0,0) and neckYOffset-adjusted neck; make the as-built rig
        // match so raw editor view == runtime (and breathe) for the camera head.
        rig.head.position.set(0, 0.5 * s, 0); // raised so the sensor unit pokes above the chassis
        rig.head.rotation.set(0, 0, 0);

        // lUpperArm
        rig.lUpperArm.position.set(0, -0.0118 * s, 0);

        // rUpperArm
        rig.rUpperArm.position.set(0, -0.0118 * s, 0);

        // rForearm
        rig.rForearm.rotation.set(0, 0, 0.1984);

        // rHand
        rig.rHand.rotation.set(0, 0, -0.162);
        rig.rHand.scale.set(1.22, 1.22, 1.22);

        // lFoot
        rig.lFoot.scale.set(1, 0.69, 1.48);
        taperMeshesY(rig.lFoot, 0.5, 1);

        // rFoot
        rig.rFoot.scale.set(1, 0.69, 1.48);
        taperMeshesY(rig.rFoot, 0.5, 1);

        // Define a Set of all bone groups so we don't delete the skeletal joints
        const rigBones = new Set([
            rig.torso, rig.pelvis, rig.neck, rig.head,
            rig.lShoulder, rig.rShoulder, rig.lUpperArm, rig.lForearm, rig.lHand,
            rig.rUpperArm, rig.rForearm, rig.rHand,
            rig.lThigh, rig.lCalf, rig.lFoot,
            rig.rThigh, rig.rCalf, rig.rFoot
        ]);

        // Helper to remove original humanoid meshes from a group while keeping sub-groups/bones intact
        const clearHumanoidMeshes = (group: THREE.Object3D) => {
            const toRemove = group.children.filter(child => !rigBones.has(child as any));
            toRemove.forEach(child => group.remove(child));
        };

        // Clear default body shapes so we can replace them with robotic ones
        const bodyParts = [
            rig.torso, rig.pelvis, rig.neck, rig.head,
            rig.lShoulder, rig.rShoulder, rig.lUpperArm, rig.lForearm, rig.lHand,
            rig.rUpperArm, rig.rForearm, rig.rHand,
            rig.lThigh, rig.lCalf, rig.lFoot,
            rig.rThigh, rig.rCalf, rig.rFoot
        ];
        bodyParts.forEach(part => {
            if (part) clearHumanoidMeshes(part);
        });

        // Remove extra details from base humanoid that don't belong on a robot
        if (rig.extras) {
            delete rig.extras.crotch;
            delete rig.extras.lips;
            delete rig.extras.abdomen;
            delete rig.extras.lPatella;
            delete rig.extras.rPatella;
        }

        // ==========================================
        // 1. HEAD (Camera Head with Side Lights)
        // ==========================================
        // Small copper sensor module (like the concept's head-top camera cluster)
        const camGeo = createBeveledBox(0.24 * s, 0.2 * s, 0.2 * s);
        const camMesh = this.createPart(camGeo, copperMat);
        rig.head.add(camMesh);

        // Side pod on the sensor (asymmetric detail from the concept)
        const podMesh = this.createPart(createBeveledBox(0.1 * s, 0.12 * s, 0.14 * s), copperMat);
        podMesh.position.set(0.15 * s, 0.02 * s, 0);
        rig.head.add(podMesh);

        // Center Lens (dark cylinder)
        const lensGeo = new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.08 * s, 16);
        const lensMesh = this.createPart(lensGeo, darkMetal);
        lensMesh.rotation.x = Math.PI / 2; // point forward
        lensMesh.position.set(0, 0, 0.11 * s);
        rig.head.add(lensMesh);

        // Lens glass reflection (blue sphere)
        const glassGeo = new THREE.SphereGeometry(0.04 * s, 8, 8);
        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x00ccff,
            emissive: 0x004488,
            emissiveIntensity: 1.2,
            roughness: 0.1,
            metalness: 0.9
        });
        const glassMesh = new THREE.Mesh(glassGeo, glassMat);
        glassMesh.position.set(0, 0, 0.14 * s);
        rig.head.add(glassMesh);

        // Two lights at each side (like LEDs / flashlights)
        const lightGeo = new THREE.SphereGeometry(0.035 * s, 8, 8);
        const lightMat = new THREE.MeshStandardMaterial({
            color: 0xffcc33,
            emissive: 0xff9900,
            emissiveIntensity: 2.0,
            roughness: 0.1
        });

        // Left Light
        const leftLight = new THREE.Mesh(lightGeo, lightMat);
        leftLight.position.set(-0.16 * s, 0, 0.06 * s);
        rig.head.add(leftLight);

        // Right Light
        const rightLight = new THREE.Mesh(lightGeo, lightMat);
        rightLight.position.set(0.16 * s, 0, 0.06 * s);
        rig.head.add(rightLight);

        // Tiny Antenna on the camera head (copper color)
        const antBase = this.createPart(new THREE.CylinderGeometry(0.012 * s, 0.012 * s, 0.06 * s, 8), copperMat);
        antBase.position.set(0, 0.14 * s, -0.04 * s);
        const antBall = this.createPart(new THREE.SphereGeometry(0.02 * s, 8, 8), copperMat);
        antBall.position.set(0, 0.17 * s, -0.04 * s);
        rig.head.add(antBase);
        rig.head.add(antBall);

        // ==========================================
        // 2. NECK (Short copper piston)
        // ==========================================
        const neckPiston = this.createPart(new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.55 * s, 16), copperMat);
        neckPiston.position.y = 0.25 * s;
        rig.neck.add(neckPiston);

        // ==========================================
        // 3. TORSO (TV Boiler Chassis with Smiley Face)
        // ==========================================
        // Chassis Box
        const torsoGeo = createBeveledBox(0.6 * s, 0.65 * s, 0.5 * s);
        const torsoMesh = this.createPart(torsoGeo, metalMat);
        rig.torso.add(torsoMesh);

        // TV Face Screen Canvas
        const faceCanvas = document.createElement('canvas');
        faceCanvas.width = 128;
        faceCanvas.height = 128;
        const faceCtx = faceCanvas.getContext('2d')!;
        faceCtx.fillStyle = '#07230c'; // dark green screen background
        faceCtx.fillRect(0, 0, 128, 128);
        faceCtx.fillStyle = '#3aff4d'; // bright green glow pixels
        // Angry angled eyes (\  /) like the concept art
        faceCtx.save();
        faceCtx.translate(40, 48);
        faceCtx.rotate(0.32); // left brow slants down toward center
        faceCtx.fillRect(-14, -5, 28, 10);
        faceCtx.restore();
        faceCtx.save();
        faceCtx.translate(88, 48);
        faceCtx.rotate(-0.32); // right brow mirrors it
        faceCtx.fillRect(-14, -5, 28, 10);
        faceCtx.restore();
        // Mouth (centered flat bar)
        faceCtx.fillRect(49, 82, 30, 10);

        const faceTex = new THREE.CanvasTexture(faceCanvas);
        const screenMat = new THREE.MeshBasicMaterial({ map: faceTex });

        // TV Screen Beveled Frame — copper/brass bezel like the concept art
        const frameGeo = createBeveledBox(0.5 * s, 0.46 * s, 0.04 * s);
        const frameMesh = this.createPart(frameGeo, copperMat);
        frameMesh.position.set(0, 0, 0.231 * s);
        rig.torso.add(frameMesh);

        // TV Screen Plate (holds texture)
        const screenGeo = new THREE.PlaneGeometry(0.44 * s, 0.4 * s);
        const screenMesh = new THREE.Mesh(screenGeo, screenMat);
        screenMesh.position.set(0, 0, 0.252 * s);
        rig.torso.add(screenMesh);

        // Back panel with round cooling fan (concept art's rear grille)
        const ventGeo = createBeveledBox(0.44 * s, 0.44 * s, 0.05 * s);
        const ventMesh = this.createPart(ventGeo, darkMetal);
        ventMesh.position.set(0, 0, -0.26 * s);
        rig.torso.add(ventMesh);

        // Fan housing ring (copper)
        const fanRing = this.createPart(new THREE.TorusGeometry(0.14 * s, 0.025 * s, 12, 24), copperMat);
        fanRing.position.set(0, 0.04 * s, -0.29 * s);
        rig.torso.add(fanRing);

        // Fan hub + blades
        const fanHub = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 0.03 * s, 12), copperMat);
        fanHub.rotation.x = Math.PI / 2;
        fanHub.position.set(0, 0.04 * s, -0.29 * s);
        rig.torso.add(fanHub);
        for (let i = 0; i < 5; i++) {
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.115 * s, 0.045 * s, 0.012 * s), darkMetal);
            const a = (i / 5) * Math.PI * 2;
            blade.position.set(Math.cos(a) * 0.075 * s, 0.04 * s + Math.sin(a) * 0.075 * s, -0.29 * s);
            blade.rotation.z = a;
            rig.torso.add(blade);
        }

        // ==========================================
        // 4. PELVIS (Mechanical waist block)
        // ==========================================
        const pelvisGeo = createBeveledBox(0.45 * s, 0.22 * s, 0.4 * s);
        const pelvisMesh = this.createPart(pelvisGeo, metalMat);
        rig.pelvis.add(pelvisMesh);

        // ==========================================
        // 5. JOINTS (Copper spherical connectors - all aligned to skeletal pivots)
        // ==========================================
        const addJointBall = (parent: THREE.Group, pos: THREE.Vector3) => {
            const ball = this.createPart(new THREE.SphereGeometry(0.11 * s, 16, 16), copperMat);
            ball.position.copy(pos);
            parent.add(ball);
        };

        // Shoulders (origin of lShoulder/rShoulder)
        addJointBall(rig.lShoulder, new THREE.Vector3(0, 0, 0));
        addJointBall(rig.rShoulder, new THREE.Vector3(0, 0, 0));

        // Big red armored pauldrons with copper rims (signature look from the concept)
        const addPauldron = (parent: THREE.Group, sideSign: number) => {
            const shellGeo = new THREE.SphereGeometry(0.165 * s, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.6);
            shellGeo.scale(1.0, 1.15, 1.0);
            const shell = this.createPart(shellGeo, metalMat);
            shell.position.set(sideSign * 0.06 * s, 0.02 * s, 0);
            shell.rotation.z = -sideSign * 0.25; // tilt outward over the arm
            parent.add(shell);
        };
        addPauldron(this.getPadSocket(rig, 'l'), -1);
        addPauldron(this.getPadSocket(rig, 'r'), 1);

        // Elbows (bottom of upperArm / top of forearm pivot)
        addJointBall(rig.lUpperArm, new THREE.Vector3(0, -0.45 * s, 0));
        addJointBall(rig.rUpperArm, new THREE.Vector3(0, -0.45 * s, 0));

        // Wrists (origin of lHand/rHand pivot)
        addJointBall(rig.lHand, new THREE.Vector3(0, 0, 0));
        addJointBall(rig.rHand, new THREE.Vector3(0, 0, 0));

        // Hips (origin of thighs, attached to pelvis lower sockets)
        addJointBall(rig.lThigh, new THREE.Vector3(0, 0, 0));
        addJointBall(rig.rThigh, new THREE.Vector3(0, 0, 0));

        // Knees (bottom of thighs / top of calf pivot)
        addJointBall(rig.lThigh, new THREE.Vector3(0, -0.55 * s, 0));
        addJointBall(rig.rThigh, new THREE.Vector3(0, -0.55 * s, 0));

        // Ankles (bottom of calves / top of foot pivot)
        addJointBall(rig.lCalf, new THREE.Vector3(0, -0.55 * s, 0));
        addJointBall(rig.rCalf, new THREE.Vector3(0, -0.55 * s, 0));

        // ==========================================
        // 6. BELLOWS / CORRUGATED LIMB SEGMENTS
        // ==========================================
        const createBellowsGeo = (radius: number, height: number, ripples: number) => {
            const points = [];
            const segments = 40;
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const y = (t - 0.5) * height;
                const r = radius + 0.02 * s * Math.sin(t * Math.PI * ripples * 2);
                points.push(new THREE.Vector2(r, y));
            }
            return new THREE.LatheGeometry(points, 24);
        };

        // Waist: green corrugated bellows between chassis and pelvis (concept art midriff)
        const waistBellows = this.createPart(createBellowsGeo(0.19 * s, 0.2 * s, 3.0), bellowsMat);
        waistBellows.position.y = 0.06 * s;
        rig.pelvis.add(waistBellows);

        // Upper Arms: green bellows wrapper, made thinner (radius = 0.05 * s)
        const armBellows = this.createPart(createBellowsGeo(0.05 * s, 0.34 * s, 5.0), bellowsMat);
        armBellows.position.y = -0.225 * s;
        rig.lUpperArm.add(armBellows.clone());
        rig.rUpperArm.add(armBellows.clone());

        // Upper Legs (Thighs): green bellows wrapper, made thinner (radius = 0.07 * s)
        const thighBellows = this.createPart(createBellowsGeo(0.07 * s, 0.43 * s, 6.0), bellowsMat);
        thighBellows.position.y = -0.275 * s;
        rig.lThigh.add(thighBellows.clone());
        rig.rThigh.add(thighBellows.clone());

        // Forearms: left is red casing; right (claw arm) gets copper plating like the concept
        const forearmMesh = this.createPart(new THREE.CylinderGeometry(0.065 * s, 0.05 * s, 0.34 * s, 16), metalMat);
        forearmMesh.position.y = -0.225 * s;
        rig.lForearm.add(forearmMesh.clone());
        const rForearmMesh = this.createPart(new THREE.CylinderGeometry(0.07 * s, 0.055 * s, 0.34 * s, 16), copperMat);
        rForearmMesh.position.y = -0.225 * s;
        rig.rForearm.add(rForearmMesh);

        // Calves: red metal casing cylinder (no bellows, fits between knee and ankle ball)
        const calfMesh = this.createPart(new THREE.CylinderGeometry(0.08 * s, 0.06 * s, 0.43 * s, 16), metalMat);
        calfMesh.position.y = -0.275 * s;
        rig.lCalf.add(calfMesh.clone());
        rig.rCalf.add(calfMesh.clone());

        // ==========================================
        // 7. WEAPON CLAW & HAND SETUP
        // ==========================================
        // Left hand (facing arm on the left): normal hand with red claws and copper cuffs (scaled up)
        const addLeftHand = (handGroup: THREE.Group) => {
            const cuff = this.createPart(new THREE.CylinderGeometry(0.09 * s, 0.1 * s, 0.1 * s, 12), copperMat);
            cuff.position.y = -0.06 * s;
            handGroup.add(cuff);

            // Claw base
            const clawBase = this.createPart(new THREE.SphereGeometry(0.1 * s, 8, 8), metalMat);
            clawBase.position.y = -0.13 * s;
            handGroup.add(clawBase);

            // 3 red claw fingers arranged around base
            for (let i = 0; i < 3; i++) {
                const angle = (i / 3) * Math.PI * 2;
                const finger = new THREE.Group();
                const part1 = this.createPart(createBeveledBox(0.04 * s, 0.1 * s, 0.04 * s), metalMat);
                part1.position.y = -0.05 * s;
                finger.add(part1);

                const part2 = this.createPart(createBeveledBox(0.03 * s, 0.08 * s, 0.03 * s), metalMat);
                part2.position.set(0, -0.12 * s, -0.02 * s);
                part2.rotation.x = -0.4;
                finger.add(part2);

                finger.position.set(Math.cos(angle) * 0.08 * s, -0.13 * s, Math.sin(angle) * 0.08 * s);
                finger.rotation.y = -angle;
                finger.rotation.x = 0.3; // flare outwards slightly
                handGroup.add(finger);
            }

            // Center drill bit (the concept's tool-hand): copper shaft + dark tapering tip
            const drillShaft = this.createPart(new THREE.CylinderGeometry(0.028 * s, 0.028 * s, 0.1 * s, 10), copperMat);
            drillShaft.position.y = -0.2 * s;
            handGroup.add(drillShaft);
            const drillTip = this.createPart(new THREE.ConeGeometry(0.022 * s, 0.14 * s, 10), darkMetal);
            drillTip.rotation.x = Math.PI; // point downward
            drillTip.position.y = -0.3 * s;
            handGroup.add(drillTip);
        };

        // Right arm (arm on the right when facing him): Large weapon claw! (scaled up)
        const addRightWeaponClaw = (handGroup: THREE.Group) => {
            // Large cuff
            const cuff = this.createPart(new THREE.CylinderGeometry(0.12 * s, 0.14 * s, 0.12 * s, 12), copperMat);
            cuff.position.y = -0.07 * s;
            handGroup.add(cuff);

            // Huge claw body
            const clawBase = this.createPart(new THREE.CylinderGeometry(0.14 * s, 0.17 * s, 0.18 * s, 16), metalMat);
            clawBase.position.y = -0.19 * s;
            handGroup.add(clawBase);

            // 2 opposing giant pincers
            for (const side of [-1, 1]) {
                const pincer = new THREE.Group();
                
                // Main curved claw segment (red metal)
                const seg1 = this.createPart(createBeveledBox(0.06 * s, 0.22 * s, 0.07 * s), metalMat);
                seg1.position.y = -0.11 * s;
                pincer.add(seg1);
                
                // Sharp claw tip (copper color)
                const seg2 = this.createPart(createBeveledBox(0.045 * s, 0.14 * s, 0.045 * s), copperMat);
                seg2.position.set(0, -0.24 * s, -side * 0.045 * s);
                seg2.rotation.x = side * 0.5;
                pincer.add(seg2);

                pincer.position.set(0, -0.26 * s, side * 0.1 * s);
                pincer.rotation.x = -side * 0.25; // angled inwards
                handGroup.add(pincer);
            }
        };

        addLeftHand(rig.lHand);
        addRightWeaponClaw(rig.rHand);

        // HACK: Set empty weapon so animations referencing weaponGroup don't crash
        rig.weaponGroup = new THREE.Group();
        rig.rHand.add(rig.weaponGroup);
        rig.sword = new THREE.Object3D();

        // ==========================================
        // 8. BLOCKY FEET (Scaled up)
        // ==========================================
        const buildBlockyFoot = (footGroup: THREE.Group) => {
            const footMesh = this.createPart(createBeveledBox(0.24 * s, 0.15 * s, 0.36 * s), metalMat);
            footMesh.position.set(0, -0.03 * s, 0.06 * s);
            footGroup.add(footMesh);
            // Dark sole plate + copper toe cap accent from the concept boots
            const sole = this.createPart(createBeveledBox(0.26 * s, 0.05 * s, 0.38 * s), darkMetal);
            sole.position.set(0, -0.1 * s, 0.06 * s);
            footGroup.add(sole);
            const toeCap = this.createPart(createBeveledBox(0.2 * s, 0.1 * s, 0.08 * s), copperMat);
            toeCap.position.set(0, -0.04 * s, 0.23 * s);
            footGroup.add(toeCap);
        };

        buildBlockyFoot(rig.lFoot);
        buildBlockyFoot(rig.rFoot);
    }
}
