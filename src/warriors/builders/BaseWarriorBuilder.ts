import * as THREE from 'three';
import { createPart, createMuscleGeo, createAnatomicalHead, createAnatomicalTorsoGeo, createShoulderGeo, makeSilverArmor, makeGold, makeChainmail, createAnatomicalThighGeo, createAnatomicalCalfGeo, createAnatomicalFootGeo, createAnatomicalHand, createJointSleeveGeo, WEAPON_GRIP_OFFSET, adjustPartMeshes } from '../parts';
import { CharacterRig, WarriorProfile } from '../types';
import { ClothSim, ClothOptions } from '../../ClothSim';

export abstract class BaseWarriorBuilder {
    protected createPart(geo: THREE.BufferGeometry, mat: THREE.Material, outlineScale: number = 1.08) {
        return createPart(geo, mat, outlineScale);
    }

    protected createMetalMaterial(color: number, repeat = 2.0): THREE.MeshStandardMaterial {
        const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        const dark = lum < 0.45;
        return makeSilverArmor(color, repeat, 1.5, dark ? 0.45 : 0.38, dark ? 0.72 : 0.88, 1.2);
    }

    protected createGoldMaterial(color: number): THREE.MeshStandardMaterial {
        return makeGold(color);
    }

    protected createChainmailMaterial(color?: number, repeat?: number, vertRings = false): THREE.MeshStandardMaterial {
        return makeChainmail(color, repeat, vertRings);
    }

    public abstract build(rig: CharacterRig, s: number, profile: WarriorProfile): void;

    /** Tapered crotch-fill cylinder parented to the pelvis — closes the gap between the
     *  thighs, registered as rig.extras.crotch so the editor can move/scale it. */
    protected addCrotchFill(rig: CharacterRig, s: number, mat: THREE.Material): void {
        if (!rig.extras) rig.extras = {};
        // Wide at top (flush with pelvis bottom face), narrow at bottom
        const crotch = this.createPart(
            new THREE.CylinderGeometry(0.28 * s, 0.09 * s, 0.28 * s, 32),
            mat
        );
        // Pelvis is 0.3 s tall centred at origin → bottom face = -0.15 s;
        // place crotch centre half its own height below that.
        crotch.position.set(0, -0.29 * s, 0);
        rig.pelvis.add(crotch);
        rig.extras.crotch = crotch;
    }

    /** Creates a verlet cloth piece (cape, flag) and registers it on the rig
     *  so Player steps the simulation every frame. Standard body colliders
     *  for capes should be passed via opts.colliders. */
    protected addCloth(rig: CharacterRig, opts: ClothOptions): ClothSim {
        const sim = new ClothSim(opts);
        (rig.cloths ??= []).push(sim);
        return sim;
    }

    /** Lazily creates the shoulder-pad socket: a joint group at the shoulder
     *  pivot that Player.updateShoulderPadFollow rotates a fraction of the way
     *  toward big arm raises. Parent pauldrons/sodes/shoulder guards here — not
     *  to the shoulder group (torso-locked, so a raised arm clips straight
     *  through them) and not to the upper arm (they flip backward when the arm
     *  goes overhead). Local space matches the shoulder group at rest. */
    protected getPadSocket(rig: CharacterRig, side: 'l' | 'r'): THREE.Group {
        const key = side === 'l' ? 'lPadSocket' : 'rPadSocket';
        if (!rig[key]) {
            const socket = new THREE.Group();
            (side === 'l' ? rig.lShoulder : rig.rShoulder).add(socket);
            rig[key] = socket;
        }
        return rig[key]!;
    }

    /** Adds a smooth, outline-free sphere at the elbow pivot (bottom of upperArm,
     *  y = -0.45*s) parented to the upper arm so it stays at the joint and fills
     *  the gap that opens between the upper-arm and forearm meshes when the arm bends.
     *  No outline shell — same blending trick as the deltoid and abdomen connectors. */
    protected addElbowCap(upperArm: THREE.Group, s: number, mat: THREE.Material) {
        const geo = new THREE.SphereGeometry(0.108 * s, 24, 18);
        const cap = new THREE.Mesh(geo, mat.clone());
        cap.castShadow = true;
        cap.receiveShadow = true;
        cap.position.y = -0.45 * s; // elbow pivot — same Y as lForearm/rForearm
        upperArm.add(cap);
    }

    /** Adds a smooth, outline-free ball at the top of an upper-arm group. Because
     *  it is parented to the arm it tracks every rotation, so the deltoid/upper-arm
     *  seam stays filled whether the arm hangs, swings, or raises overhead. Built
     *  without a toon outline (in the arm's own material) so it blends instead of
     *  leaving a black crease where it overlaps the deltoid. */
    protected addDeltoidBlend(upperArm: THREE.Group, s: number, mat: THREE.Material) {
        const geo = new THREE.SphereGeometry(0.125 * s, 32, 24);
        geo.scale(1.05, 1.15, 1.05);
        const blend = new THREE.Mesh(geo, mat.clone());
        blend.castShadow = true;
        blend.receiveShadow = true;
        blend.position.y = -0.04 * s; // just below the shoulder pivot, into the socket
        upperArm.add(blend);
    }

    protected buildBaseHumanoid(rig: CharacterRig, s: number, skinMat: THREE.Material, shirtMat: THREE.Material = skinMat, pantsMat: THREE.Material = skinMat, female: boolean = false) {
        // --- STANDARD PROPORTIONS ---
        // Torso height and V-taper
        rig.torso = this.createPart(createAnatomicalTorsoGeo(s), shirtMat);
        rig.torso.position.set(0, 1.65 * s, 0);
        rig.mesh.add(rig.torso);

        // Pelvis (Narrower waist, wider hips)
        rig.pelvis = this.createPart(new THREE.CylinderGeometry(0.245 * s, 0.305 * s, 0.3 * s, 96), pantsMat);
        rig.pelvis.position.y = 1.2 * s;
        rig.mesh.add(rig.pelvis);

        // Abdominal connector: fills the gap between torso (y=1.65) and pelvis (y=1.2)
        // Parented to pelvis so it follows pelvis movement/rotation automatically.
        // Built WITHOUT the usual toon outline and in the torso's own material, so
        // that when the body bends and it clips through the torso it simply blends
        // in (a black outline shell would otherwise poke through and look bad).
        const abdoGeo = new THREE.SphereGeometry(0.19 * s, 32, 32);
        const abdoMesh = new THREE.Mesh(abdoGeo, shirtMat.clone());
        abdoMesh.castShadow = true;
        abdoMesh.receiveShadow = true;
        abdoMesh.position.y = 0.22 * s; // local offset from pelvis center (1.42 - 1.2)
        abdoMesh.scale.set(1.0, 1.3, 0.9);
        rig.pelvis.add(abdoMesh);
        if (rig.extras) rig.extras.abdomen = abdoMesh; // editor-selectable; recolourable per builder

        // Neck (Muscular, thick base)
        rig.neck = this.createPart(new THREE.CylinderGeometry(0.10 * s, 0.13 * s, 0.2 * s, 96), skinMat);
        rig.neck.position.y = 0.53 * s;
        rig.torso.add(rig.neck);

        // Trapezius wedge: blends the neck into the shoulder line
        const trapGeo = new THREE.SphereGeometry(0.2 * s, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2);
        trapGeo.scale(1.5, 0.55, 0.8);
        const traps = this.createPart(trapGeo, shirtMat);
        traps.position.y = 0.34 * s;
        rig.torso.add(traps);

        // Head (Skull-shaped)
        rig.head = createAnatomicalHead(s, skinMat, female);
        // Expose the anatomical eyeball clusters & lips for editor control.
        rig.lEyeball = rig.head.userData.lEyeball as THREE.Group;
        rig.rEyeball = rig.head.userData.rEyeball as THREE.Group;
        if (rig.extras) rig.extras.lips = rig.head.userData.lips as THREE.Group;
        rig.head.position.set(0, 0.245 * s, 0.0417 * s);
        rig.head.rotation.set(0.07, 0, 0);
        // Heroic proportions: ~7 heads tall now that the body is slimmer.
        // Warrior helmets attach to this group and inherit the scale.
        rig.head.scale.setScalar(1.24);
        rig.neck.add(rig.head);

        // --- SHOULDERS & ARMS ---
        rig.lShoulder = createShoulderGeo(s, shirtMat);
        rig.lShoulder.position.set(-0.3833 * s, 0.1533 * s, 0);
        rig.torso.add(rig.lShoulder);

        rig.rShoulder = createShoulderGeo(s, shirtMat);
        rig.rShoulder.position.set(0.3833 * s, 0.1533 * s, 0);
        rig.torso.add(rig.rShoulder);

        const upperArmGeo = createMuscleGeo(0.10 * s, 0.134 * s, 0.094 * s, 0.45 * s);
        upperArmGeo.translate(0, -0.225 * s, 0);
        const forearmGeo = createMuscleGeo(0.108 * s, 0.125 * s, 0.085 * s, 0.45 * s);
        forearmGeo.translate(0, -0.225 * s, 0);

        rig.lUpperArm = new THREE.Group(); rig.lUpperArm.add(this.createPart(upperArmGeo, shirtMat));
        rig.lUpperArm.position.set(0, -0.0667 * s, 0);
        rig.lShoulder.add(rig.lUpperArm);
        // Shoulder cap connector: fills gap between shoulder sphere and upper arm
        const lShoulderCapGeo = new THREE.CylinderGeometry(0.108 * s, 0.10 * s, 0.12 * s, 32);
        const lShoulderCap = this.createPart(lShoulderCapGeo, shirtMat);
        lShoulderCap.position.y = -0.06 * s;
        rig.lShoulder.add(lShoulderCap);
        // Deltoid blend: a no-outline ball parented to the upper arm so it
        // rotates with it, filling the shoulder socket seam in every pose (same
        // trick as the abdomen connector — a black outline shell would crease).
        this.addDeltoidBlend(rig.lUpperArm, s, shirtMat);
        rig.lForearm = new THREE.Group(); rig.lForearm.add(this.createPart(forearmGeo, shirtMat));
        rig.lForearm.position.y = -0.45 * s; rig.lUpperArm.add(rig.lForearm);
        this.addElbowCap(rig.lUpperArm, s, shirtMat);
        
        rig.lHand = createAnatomicalHand(s, skinMat, true, 'fist'); // off-hand: fist
        rig.lHand.position.y = -0.45 * s; rig.lForearm.add(rig.lHand);

        rig.rUpperArm = new THREE.Group(); rig.rUpperArm.add(this.createPart(upperArmGeo, shirtMat));
        rig.rUpperArm.position.set(0, -0.0667 * s, 0);
        rig.rShoulder.add(rig.rUpperArm);
        // Shoulder cap connector: fills gap between shoulder sphere and upper arm
        const rShoulderCapGeo = new THREE.CylinderGeometry(0.108 * s, 0.10 * s, 0.12 * s, 32);
        const rShoulderCap = this.createPart(rShoulderCapGeo, shirtMat);
        rShoulderCap.position.y = -0.06 * s;
        rig.rShoulder.add(rShoulderCap);
        this.addDeltoidBlend(rig.rUpperArm, s, shirtMat);
        rig.rForearm = new THREE.Group(); rig.rForearm.add(this.createPart(forearmGeo, shirtMat));
        rig.rForearm.position.y = -0.45 * s; rig.rUpperArm.add(rig.rForearm);
        this.addElbowCap(rig.rUpperArm, s, shirtMat);
        
        rig.rHand = createAnatomicalHand(s, skinMat, false, 'grip'); // weapon hand: wraps the hilt
        rig.rHand.position.y = -0.45 * s; rig.rForearm.add(rig.rHand);

        // Weapon Positioning: hilt passes through the gripped fingers
        rig.weaponGroup = new THREE.Group();
        rig.weaponGroup.position.set(0, WEAPON_GRIP_OFFSET.y * s, WEAPON_GRIP_OFFSET.z * s);
        rig.rHand.add(rig.weaponGroup);

        // --- LEGS ---
        const thighGeo = createAnatomicalThighGeo(s);
        thighGeo.translate(0, -0.275 * s, 0);
        const calfGeo = createAnatomicalCalfGeo(s);
        calfGeo.translate(0, -0.275 * s, 0);

        // Patella (Knee Cap)
        const patellaGeo = new THREE.SphereGeometry(0.06 * s, 32, 16);
        patellaGeo.scale(1, 1.2, 0.6);
        
        // Joint Sleeve (Hides internal skin gap)
        const sleeveGeo = createJointSleeveGeo(0.14 * s, 0.15 * s);

        rig.lThigh = new THREE.Group(); rig.lThigh.add(this.createPart(thighGeo, pantsMat));
        rig.lThigh.position.set(-0.2 * s, -0.15 * s, 0); rig.pelvis.add(rig.lThigh);
        
        // Add sleeve and patella to thigh so they cover the pivot
        const lSleeve = this.createPart(sleeveGeo, pantsMat);
        lSleeve.position.y = -0.55 * s;
        rig.lThigh.add(lSleeve);
        const lPatella = this.createPart(patellaGeo, pantsMat); // Match pants/armor color
        lPatella.position.set(0, -0.55 * s, 0.15 * s);
        rig.lThigh.add(lPatella);
        if (rig.extras) rig.extras.lPatella = lPatella;

        rig.lCalf = new THREE.Group();
        rig.lShin = this.createPart(calfGeo, pantsMat); // bare leg mesh — adjustable apart from boot/greave
        rig.lCalf.add(rig.lShin);
        rig.lCalf.position.y = -0.55 * s; rig.lThigh.add(rig.lCalf);
        
        rig.lFoot = new THREE.Group();
        const lFootPart = this.createPart(createAnatomicalFootGeo(s, true), pantsMat);
        rig.lFoot.add(lFootPart);
        rig.lFoot.position.set(0, -0.55 * s, 0); rig.lCalf.add(rig.lFoot);
        adjustPartMeshes(rig.lFoot, { pos: [0, 0, -0.0583 * s], rot: [0.1584, 0, 0], scl: [1, 1, 1.12] });

        rig.rThigh = new THREE.Group(); rig.rThigh.add(this.createPart(thighGeo, pantsMat));
        rig.rThigh.position.set(0.2 * s, -0.15 * s, 0); rig.pelvis.add(rig.rThigh);
        
        const rSleeve = this.createPart(sleeveGeo, pantsMat);
        rSleeve.position.y = -0.55 * s;
        rig.rThigh.add(rSleeve);
        const rPatella = this.createPart(patellaGeo, pantsMat); // Match pants/armor color
        rPatella.position.set(0, -0.55 * s, 0.15 * s);
        rig.rThigh.add(rPatella);
        if (rig.extras) rig.extras.rPatella = rPatella;

        rig.rCalf = new THREE.Group();
        rig.rShin = this.createPart(calfGeo, pantsMat); // bare leg mesh — adjustable apart from boot/greave
        rig.rCalf.add(rig.rShin);
        rig.rCalf.position.y = -0.55 * s; rig.rThigh.add(rig.rCalf);
        
        rig.rFoot = new THREE.Group();
        const rFootPart = this.createPart(createAnatomicalFootGeo(s, false), pantsMat);
        rig.rFoot.add(rFootPart);
        rig.rFoot.position.set(0, -0.55 * s, 0); rig.rCalf.add(rig.rFoot);
        adjustPartMeshes(rig.rFoot, { pos: [0, 0, -0.0583 * s], rot: [0.1584, 0, 0], scl: [1, 1, 1.12] });
    }

    /** Applies the robot_eye.png texture to the sclera sphere and removes the
     *  iris/pupil discs so the texture is fully visible. */
    protected applyEyeTexture(lEyeball: THREE.Group, rEyeball: THREE.Group, _irisColor: number = 0x6b3a1f, _s: number = 1.0): void {
        if (typeof document === 'undefined') return;
        
        for (const eyeball of [lEyeball, rEyeball]) {
            if (!eyeball) continue;
            
            // Get non-uniform scale of the eyeball group to compensate for stretching
            const scaleX = eyeball.scale.x;
            const scaleY = eyeball.scale.y;
            const stretchRatio = scaleY > 0 ? scaleX / scaleY : 1.0;
            
            // Standard sphere wrapping is stretched horizontally by 2.0.
            // We multiply by stretchRatio to counteract non-uniform group scaling.
            const repeatX = 2.0 * stretchRatio;
            
            // Center the pupil on the front (U = 0.5).
            // Formula: (0.5 * repeatX + offsetX) mod 1 = 0.75 (the pupil's position in robot_eye.png)
            let offsetX = 0.75 - 0.5 * repeatX;
            offsetX = ((offsetX % 1) + 1) % 1; // standard modulo in JS

            const tex = new THREE.TextureLoader().load('/textures/robot_eye.png');
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(repeatX, 1);
            tex.offset.set(offsetX, 0);

            const scleraMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.1, metalness: 0.0 });
            
            const sclera = eyeball.children[0];
            if (sclera instanceof THREE.Mesh) sclera.material = scleraMat;
            
            // Remove iris (index 1) and pupil (index 2) so the texture shows through
            const toRemove = eyeball.children.filter(
                (_, i) => i === 1 || i === 2
            );
            toRemove.forEach(c => eyeball.remove(c));
        }
    }
}
