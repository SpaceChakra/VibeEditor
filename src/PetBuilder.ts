import * as THREE from 'three';
import { makeToon, makeBeardMat, createBeveledBox } from './warriors/parts';

export enum PetType {
    HOUND, EAGLE, PARROT, RAVEN, SERPENT
}

export interface Pet {
    mesh: THREE.Group;
    type: PetType;
    update: (time: number, ownerPos: THREE.Vector3, ownerRot: number) => void;
    onBark?: () => void;
    // Ultimate strike: dive/lunge to targetPos, fire onConnect at the contact
    // frame, then return to the owner and fire onComplete. While striking the
    // pet ignores its normal idle positioning.
    strike?: (targetPos: THREE.Vector3, onConnect: () => void, onComplete: () => void) => void;
}

export class PetBuilder {
    // Cached scale maps for the sample serpent so its surface reads
    // with real surface detail instead of a flat toon fill.
    private static _snakeMaps: { map: THREE.Texture, normalMap: THREE.Texture } | null = null;
    private static snakeMaps() {
        if (!this._snakeMaps) {
            const loader = new THREE.TextureLoader();
            const load = (url: string, srgb = false) => {
                const t = loader.load(url);
                t.wrapS = t.wrapT = THREE.RepeatWrapping;
                t.repeat.set(2, 2);
                if (srgb) t.colorSpace = THREE.SRGBColorSpace;
                return t;
            };
            this._snakeMaps = {
                map: load('/textures/snake_color.jpg', true),
                normalMap: load('/textures/snake_normal.png'),
            };
        }
        return this._snakeMaps;
    }

    private static createPart(geo: THREE.BufferGeometry, mat: THREE.Material, outlineScale: number = 1.08) {
        const group = new THREE.Group();
        const partMat = mat.clone();
        const main = new THREE.Mesh(geo, partMat);
        main.castShadow = true;
        main.receiveShadow = true;
        group.add(main);
        void outlineScale;
        return group;
    }

    public static build(type: PetType, s: number): Pet {
        if (type === PetType.HOUND) return this.buildHound(s);
        if (type === PetType.EAGLE) return this.buildEagle(s);
        if (type === PetType.PARROT) return this.buildParrot(s);
        if (type === PetType.RAVEN) return this.buildRaven(s);
        if (type === PetType.SERPENT) return this.buildSerpent(s);
        throw new Error("Unknown pet type");
    }

    private static buildHound(s: number): Pet {
        const houndFur = makeBeardMat(0x2b2724);    // dark grey-brown base coat
        const darkFur = makeBeardMat(0x151312);     // near-black markings
        const tanFur = makeBeardMat(0x8a6a45);      // warm tan for muzzle/underbelly
        const pawMat = makeToon(0x1c1917);           // paw pads stay smooth
        const eyeMat = makeToon(0xf4e2b4);
        const noseMat = makeToon(0x070606);
        const tongueMat = makeToon(0xa84a4a);
        const group = new THREE.Group();
        group.scale.setScalar(1.15);

        const body = new THREE.Group();
        body.position.y = 0.48 * s;
        group.add(body);

        const torso = this.createPart(new THREE.CapsuleGeometry(0.18 * s, 0.58 * s, 8, 32), houndFur);
        torso.rotation.x = Math.PI / 2;
        torso.scale.set(1.05, 0.92, 1.0);
        body.add(torso);

        const chest = this.createPart(new THREE.SphereGeometry(0.22 * s, 18, 14), darkFur, 1.05);
        chest.scale.set(1.15, 1.0, 0.9);
        chest.position.set(0, 0.03 * s, 0.24 * s);
        body.add(chest);

        const hips = this.createPart(new THREE.SphereGeometry(0.19 * s, 18, 14), houndFur, 1.05);
        hips.scale.set(1.0, 0.9, 0.95);
        hips.position.set(0, -0.01 * s, -0.28 * s);
        body.add(hips);

        const bellyPatch = this.createPart(new THREE.SphereGeometry(0.13 * s, 14, 10), tanFur, 1.03);
        bellyPatch.scale.set(0.9, 0.45, 1.35);
        bellyPatch.position.set(0, -0.11 * s, 0.05 * s);
        body.add(bellyPatch);

        const hHeadGroup = new THREE.Group();
        const neck = this.createPart(new THREE.CapsuleGeometry(0.09 * s, 0.16 * s, 5, 16), houndFur, 1.05);
        neck.rotation.x = -0.45;
        neck.position.set(0, -0.03 * s, -0.05 * s);
        hHeadGroup.add(neck);

        const hSkull = this.createPart(new THREE.SphereGeometry(0.16 * s, 18, 14), houndFur, 1.05);
        hSkull.scale.set(0.95, 0.92, 1.14);
        hHeadGroup.add(hSkull);

        const brow = this.createPart(createBeveledBox(0.25 * s, 0.06 * s, 0.08 * s), darkFur, 1.04);
        brow.position.set(0, 0.05 * s, 0.1 * s);
        hHeadGroup.add(brow);

        const hSnout = this.createPart(createBeveledBox(0.12 * s, 0.11 * s, 0.24 * s), tanFur, 1.04);
        hSnout.position.set(0, -0.035 * s, 0.18 * s);
        hHeadGroup.add(hSnout);

        const jaw = this.createPart(createBeveledBox(0.105 * s, 0.035 * s, 0.18 * s), tanFur, 1.03);
        jaw.position.set(0, -0.095 * s, 0.205 * s);
        hHeadGroup.add(jaw);

        const tongue = this.createPart(createBeveledBox(0.045 * s, 0.012 * s, 0.09 * s), tongueMat, 1.02);
        tongue.position.set(0, -0.118 * s, 0.235 * s);
        hHeadGroup.add(tongue);

        const nose = this.createPart(new THREE.SphereGeometry(0.035 * s, 12, 8), noseMat, 1.02);
        nose.scale.set(1.1, 0.75, 0.75);
        nose.position.set(0, -0.03 * s, 0.32 * s);
        hHeadGroup.add(nose);

        for (const x of [-0.055, 0.055]) {
            const eye = this.createPart(new THREE.SphereGeometry(0.017 * s, 8, 6), eyeMat, 1.01);
            eye.position.set(x * s, 0.035 * s, 0.142 * s);
            hHeadGroup.add(eye);

            const pupil = this.createPart(new THREE.SphereGeometry(0.008 * s, 6, 4), noseMat, 1.0);
            pupil.position.set(x * s, 0.033 * s, 0.156 * s);
            hHeadGroup.add(pupil);
        }

        const earGeo = new THREE.ConeGeometry(0.055 * s, 0.18 * s, 4);
        earGeo.translate(0, 0.09 * s, 0);
        const leftEar = this.createPart(earGeo, darkFur, 1.04);
        leftEar.position.set(-0.09 * s, 0.12 * s, 0.01 * s);
        leftEar.rotation.set(0.55, 0.12, 0.42);
        hHeadGroup.add(leftEar);
        const rightEar = this.createPart(earGeo, darkFur, 1.04);
        rightEar.position.set(0.09 * s, 0.12 * s, 0.01 * s);
        rightEar.rotation.set(0.55, -0.12, -0.42);
        hHeadGroup.add(rightEar);

        const barkMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0, depthWrite: false });
        const barkPulse = new THREE.Mesh(new THREE.TorusGeometry(0.08 * s, 0.006 * s, 6, 24), barkMat);
        barkPulse.rotation.x = Math.PI / 2;
        barkPulse.position.set(0, -0.035 * s, 0.34 * s);
        hHeadGroup.add(barkPulse);

        hHeadGroup.position.set(0, 0.13 * s, 0.48 * s);
        body.add(hHeadGroup);

        const createLeg = (x: number, z: number) => {
            const leg = new THREE.Group();
            leg.position.set(x * s, 0.0, z * s);

            const upper = this.createPart(new THREE.CylinderGeometry(0.042 * s, 0.036 * s, 0.23 * s, 12), houndFur, 1.05);
            upper.position.y = -0.1 * s;
            leg.add(upper);

            const lower = new THREE.Group();
            lower.position.y = -0.2 * s;
            const shin = this.createPart(new THREE.CylinderGeometry(0.032 * s, 0.026 * s, 0.22 * s, 12), darkFur, 1.05);
            shin.position.y = -0.1 * s;
            lower.add(shin);
            const paw = this.createPart(createBeveledBox(0.085 * s, 0.045 * s, 0.15 * s), pawMat, 1.04);
            paw.position.set(0, -0.22 * s, 0.045 * s);
            lower.add(paw);
            leg.add(lower);

            body.add(leg);
            return { leg, lower };
        };

        const frontLeft = createLeg(-0.11, 0.23);
        const frontRight = createLeg(0.11, 0.23);
        const backLeft = createLeg(-0.12, -0.24);
        const backRight = createLeg(0.12, -0.24);

        const tail = new THREE.Group();
        tail.position.set(0, 0.06 * s, -0.48 * s);
        const tailMain = this.createPart(new THREE.CapsuleGeometry(0.035 * s, 0.38 * s, 5, 12), darkFur, 1.05);
        tailMain.rotation.x = Math.PI / 2.7;
        tailMain.position.z = -0.16 * s;
        tail.add(tailMain);
        body.add(tail);

        group.position.set(0, 0, -1.5 * s);
        let previousPos = group.position.clone();
        let wasBarkActive = false;

        // Strike state (lunge ultimate)
        let striking = false, strikePhase = 0, strikeTimer = 0, connectFired = false;
        const strikeTarget = new THREE.Vector3();
        const hScratch = new THREE.Vector3();
        let onConnectCb: (() => void) | null = null;
        let onCompleteCb: (() => void) | null = null;
        const LUNGE_FRAMES = 14, RETREAT_FRAMES = 20;

        const pet: Pet = {
            mesh: group,
            type: PetType.HOUND,
            strike: (target, onConnect, onComplete) => {
                striking = true; strikePhase = 0; strikeTimer = 0; connectFired = false;
                strikeTarget.copy(target);
                onConnectCb = onConnect; onCompleteCb = onComplete;
            },
            update: (time: number, ownerPos: THREE.Vector3, ownerRot: number) => {
                if (striking) {
                    strikeTimer++;
                    if (strikePhase === 0) {
                        const attack = hScratch.copy(strikeTarget); attack.y += 0.4 * s;
                        const p = Math.min(1, strikeTimer / LUNGE_FRAMES);
                        group.position.lerp(attack, 0.25 + p * p * 0.45);
                        const lookDir = hScratch.subVectors(attack, group.position);
                        if (lookDir.lengthSq() > 1e-6) group.rotation.y = Math.atan2(lookDir.x, lookDir.z);
                        jaw.rotation.x = 0.7;
                        if (strikeTimer >= LUNGE_FRAMES) {
                            if (!connectFired) { connectFired = true; onConnectCb?.(); }
                            strikePhase = 1; strikeTimer = 0;
                        }
                    } else {
                        const home = hScratch.set(-1.2 * s, 0, -1.2 * s)
                            .applyAxisAngle(new THREE.Vector3(0, 1, 0), ownerRot).add(ownerPos);
                        group.position.lerp(home, 0.16);
                        jaw.rotation.x = 0.2;
                        if (strikeTimer >= RETREAT_FRAMES) { striking = false; onCompleteCb?.(); }
                    }
                    previousPos.copy(group.position);
                    return;
                }

                const target = new THREE.Vector3(-1.2 * s, 0, -1.2 * s);
                target.applyAxisAngle(new THREE.Vector3(0, 1, 0), ownerRot);
                target.add(ownerPos);
                group.position.lerp(target, 0.085);

                const movement = new THREE.Vector3().subVectors(group.position, previousPos);
                const speed = movement.length();
                if (speed > 0.0008) {
                    const targetRot = Math.atan2(movement.x, movement.z);
                    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, targetRot, 0.18);
                } else {
                    group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, ownerRot, 0.08);
                }
                previousPos.copy(group.position);

                const moving = speed > 0.0015;
                const stride = moving ? time * 12 : time * 2.2;
                const gait = Math.sin(stride);
                const counterGait = Math.sin(stride + Math.PI);
                const lift = moving ? 0.34 : 0.06;

                frontLeft.leg.rotation.x = gait * lift;
                backRight.leg.rotation.x = gait * lift;
                frontRight.leg.rotation.x = counterGait * lift;
                backLeft.leg.rotation.x = counterGait * lift;
                frontLeft.lower.rotation.x = Math.max(0, -gait) * 0.45;
                backRight.lower.rotation.x = Math.max(0, -gait) * 0.45;
                frontRight.lower.rotation.x = Math.max(0, -counterGait) * 0.45;
                backLeft.lower.rotation.x = Math.max(0, -counterGait) * 0.45;

                body.position.y = 0.48 * s + Math.abs(Math.sin(stride)) * (moving ? 0.025 : 0.006) * s;
                body.rotation.z = Math.sin(stride) * (moving ? 0.035 : 0.012);

                const barkPhase = (time + 0.35) % 4.1;
                const bark = barkPhase < 0.34 ? Math.sin((barkPhase / 0.34) * Math.PI) : 0;
                jaw.rotation.x = bark * 0.62;
                tongue.rotation.x = bark * 0.36;
                hHeadGroup.rotation.x = -0.04 + Math.sin(time * 4.5) * 0.035 - bark * 0.16;
                hHeadGroup.rotation.y = Math.sin(time * 1.7) * 0.07;
                tail.rotation.x = 0.38 + Math.sin(time * 8.5) * 0.12;
                tail.rotation.y = Math.sin(time * 12) * 0.35;

                barkPulse.visible = bark > 0.01;
                barkPulse.scale.setScalar(1 + bark * 2.2);
                barkMat.opacity = bark * 0.55;

                const isBarkActive = bark > 0.01;
                if (isBarkActive && !wasBarkActive) pet.onBark?.();
                wasBarkActive = isBarkActive;
            }
        };
        return pet;
    }

    private static buildEagle(s: number): Pet {
        const eagleFeather = makeToon(0x3b2718);
        const darkFeather = makeToon(0x1f1712);
        const goldFeather = makeToon(0x8a5a2a);
        const paleHead = makeToon(0xd8c7a0);
        const eagleBeak = makeToon(0xd99a22);
        const talonMat = makeToon(0x2a2119);
        const eyeMat = makeToon(0x050505);
        const group = new THREE.Group();

        const eBody = this.createPart(new THREE.CapsuleGeometry(0.105 * s, 0.34 * s, 8, 24), eagleFeather, 1.05);
        eBody.rotation.x = Math.PI / 2.4;
        eBody.scale.set(0.95, 1.0, 1.18);
        group.add(eBody);

        const chest = this.createPart(new THREE.SphereGeometry(0.078 * s, 16, 10), goldFeather, 1.04);
        chest.scale.set(0.9, 0.58, 0.76);
        chest.position.set(0, -0.055 * s, 0.1 * s);
        group.add(chest);

        const createWing = (dir: number) => {
            const wing = new THREE.Group();
            wing.position.set(dir * 0.075 * s, 0.035 * s, 0.01 * s);
            const upper = this.createPart(createBeveledBox(0.34 * s, 0.024 * s, 0.13 * s), eagleFeather, 1.04);
            upper.position.set(dir * 0.18 * s, 0, 0.01 * s);
            upper.rotation.z = dir * -0.12;
            wing.add(upper);
            for (let i = 0; i < 7; i++) {
                const len = (0.34 + i * 0.055) * s;
                const feather = this.createPart(createBeveledBox(len, 0.014 * s, 0.04 * s), i < 3 ? eagleFeather : darkFeather, 1.035);
                feather.position.set(dir * (0.2 + i * 0.055) * s, (-0.018 - i * 0.01) * s, (-0.085 + i * 0.033) * s);
                feather.rotation.y = dir === 1 ? 0 : Math.PI;
                feather.rotation.z = dir * (-0.16 - i * 0.045);
                feather.rotation.x = -0.05;
                wing.add(feather);
            }
            const covert = this.createPart(createBeveledBox(0.22 * s, 0.02 * s, 0.12 * s), goldFeather, 1.04);
            covert.position.set(dir * 0.12 * s, 0.018 * s, 0.052 * s);
            covert.rotation.z = dir * -0.1;
            wing.add(covert);
            return wing;
        };

        const lWing = createWing(1);
        const rWing = createWing(-1);
        group.add(lWing);
        group.add(rWing);

        const neck = this.createPart(new THREE.CapsuleGeometry(0.04 * s, 0.09 * s, 5, 12), paleHead, 1.04);
        neck.rotation.x = -0.4;
        neck.position.set(0, 0.064 * s, 0.155 * s);
        group.add(neck);
        const eHead = this.createPart(new THREE.SphereGeometry(0.064 * s, 16, 12), paleHead, 1.04);
        eHead.scale.set(0.92, 1.0, 1.12);
        eHead.position.set(0, 0.105 * s, 0.22 * s);
        group.add(eHead);
        const eBeak = this.createPart(new THREE.ConeGeometry(0.024 * s, 0.085 * s, 5), eagleBeak, 1.02);
        eBeak.position.set(0, 0.098 * s, 0.29 * s);
        eBeak.rotation.x = Math.PI / 2;
        group.add(eBeak);
        for (const x of [-0.027, 0.027]) {
            const eye = this.createPart(new THREE.SphereGeometry(0.008 * s, 8, 6), eyeMat, 1.01);
            eye.position.set(x * s, 0.118 * s, 0.265 * s);
            group.add(eye);
        }

        for (let i = 0; i < 5; i++) {
            const tail = this.createPart(createBeveledBox(0.045 * s, 0.014 * s, 0.28 * s), i % 2 === 0 ? darkFeather : eagleFeather, 1.035);
            tail.position.set((i - 2) * 0.028 * s, -0.035 * s, -0.22 * s);
            tail.rotation.x = 0.36;
            tail.rotation.z = (i - 2) * 0.06;
            group.add(tail);
        }

        for (const x of [-0.04, 0.04]) {
            const leg = this.createPart(new THREE.CylinderGeometry(0.006 * s, 0.006 * s, 0.075 * s, 5), eagleBeak, 1.02);
            leg.position.set(x * s, -0.105 * s, 0.025 * s);
            leg.rotation.x = 0.52;
            group.add(leg);
            const talon = this.createPart(new THREE.ConeGeometry(0.006 * s, 0.035 * s, 5), talonMat, 1.02);
            talon.position.set(x * s, -0.14 * s, 0.055 * s);
            talon.rotation.x = Math.PI / 2.3;
            group.add(talon);
        }

        group.position.set(1.8 * s, 4.1 * s, -1.0 * s);
        let previousPos = group.position.clone();

        // Strike state (dive-bomb ultimate)
        let striking = false, strikePhase = 0, strikeTimer = 0, connectFired = false;
        const strikeTarget = new THREE.Vector3();
        const scratch = new THREE.Vector3();
        let onConnectCb: (() => void) | null = null;
        let onCompleteCb: (() => void) | null = null;
        const DIVE_FRAMES = 16, RETURN_FRAMES = 22;

        const pet: Pet = {
            mesh: group,
            type: PetType.EAGLE,
            strike: (target, onConnect, onComplete) => {
                striking = true; strikePhase = 0; strikeTimer = 0; connectFired = false;
                strikeTarget.copy(target);
                onConnectCb = onConnect; onCompleteCb = onComplete;
            },
            update: (time: number, ownerPos: THREE.Vector3, _ownerRot: number) => {
                if (striking) {
                    strikeTimer++;
                    if (strikePhase === 0) {
                        const attack = scratch.copy(strikeTarget); attack.y += 1.5 * s;
                        const p = Math.min(1, strikeTimer / DIVE_FRAMES);
                        group.position.lerp(attack, 0.2 + p * p * 0.5);
                        const flap = Math.sin(time * 24);
                        lWing.rotation.z = -0.55 - flap * 0.5;
                        rWing.rotation.z = 0.55 + flap * 0.5;
                        group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, 0.6, 0.2);
                        if (strikeTimer >= DIVE_FRAMES) {
                            if (!connectFired) { connectFired = true; onConnectCb?.(); }
                            strikePhase = 1; strikeTimer = 0;
                        }
                    } else {
                        const home = scratch.set(ownerPos.x + 1.8 * s, ownerPos.y + 4.1 * s, ownerPos.z - 1.0 * s);
                        group.position.lerp(home, 0.12);
                        const flap = Math.sin(time * 14);
                        lWing.rotation.z = -0.35 - flap * 0.45;
                        rWing.rotation.z = 0.35 + flap * 0.45;
                        group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, -0.14, 0.15);
                        if (strikeTimer >= RETURN_FRAMES) { striking = false; onCompleteCb?.(); }
                    }
                    previousPos.copy(group.position);
                    return;
                }

                const radius = 3.1 * s;
                const target = new THREE.Vector3(
                    Math.cos(time * 1.05) * radius,
                    3.95 * s + Math.sin(time * 2.1) * 0.42 * s,
                    Math.sin(time * 1.05) * radius * 0.72
                );
                target.add(ownerPos);
                group.position.lerp(target, 0.055);

                const movement = new THREE.Vector3().subVectors(group.position, previousPos);
                const lookDir = movement.lengthSq() > 0.000001 ? movement.normalize() : new THREE.Vector3().subVectors(ownerPos, group.position).normalize();
                const targetRot = Math.atan2(lookDir.x, lookDir.z);
                group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, targetRot, 0.12);
                group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, -0.14 + Math.sin(time * 2.1) * 0.05, 0.08);
                group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, -lookDir.x * 0.42, 0.08);

                const flap = Math.sin(time * 10.5);
                const lift = 0.28 + Math.abs(flap) * 0.42;
                lWing.rotation.z = -lift - flap * 0.36;
                rWing.rotation.z = lift + flap * 0.36;
                lWing.rotation.x = -0.12 + flap * 0.12;
                rWing.rotation.x = -0.12 - flap * 0.12;
                previousPos.copy(group.position);
            }
        };
        return pet;
    }

    private static buildParrot(s: number): Pet {
        const red = makeToon(0xc41e3a);
        const green = makeToon(0x1f8f4a);
        const yellow = makeToon(0xffcc00);
        const blue = makeToon(0x0047ab);
        const darkBlue = makeToon(0x08265f);
        const white = makeToon(0xf4f0df);
        const black = makeToon(0x050505);
        const beakMat = makeToon(0xf0b23a);

        const group = new THREE.Group();
        const pBody = this.createPart(new THREE.CapsuleGeometry(0.075 * s, 0.19 * s, 8, 32), red);
        pBody.rotation.x = Math.PI / 2.15;
        group.add(pBody);

        const belly = this.createPart(new THREE.SphereGeometry(0.055 * s, 16, 10), yellow, 1.05);
        belly.scale.set(0.9, 0.45, 0.7);
        belly.position.set(0, -0.035 * s, 0.015 * s);
        group.add(belly);

        const createWing = (dir: number) => {
            const wing = new THREE.Group();
            wing.position.set(dir * 0.055 * s, 0.035 * s, 0.005 * s);
            wing.rotation.z = dir * -0.18;
            wing.rotation.x = -0.18;

            const wingPanel = this.createPart(createBeveledBox(0.22 * s, 0.018 * s, 0.12 * s), green, 1.04);
            wingPanel.position.set(dir * 0.12 * s, 0, 0.01 * s);
            wingPanel.rotation.z = dir * -0.08;
            wing.add(wingPanel);

            for (let i = 0; i < 5; i++) {
                const len = (0.22 + i * 0.035) * s;
                const feather = this.createPart(createBeveledBox(len, 0.012 * s, 0.035 * s), i < 3 ? blue : darkBlue, 1.04);
                feather.position.set(dir * (0.12 + i * 0.04) * s, -0.006 * i * s, (-0.06 + i * 0.028) * s);
                feather.rotation.z = dir * (-0.18 - i * 0.045);
                feather.rotation.y = dir === 1 ? 0 : Math.PI;
                wing.add(feather);
            }

            const coverts = this.createPart(createBeveledBox(0.16 * s, 0.016 * s, 0.075 * s), yellow, 1.04);
            coverts.position.set(dir * 0.08 * s, 0.015 * s, 0.045 * s);
            coverts.rotation.z = dir * -0.12;
            wing.add(coverts);
            return wing;
        };

        const lWing = createWing(1);
        group.add(lWing);
        const rWing = createWing(-1);
        group.add(rWing);

        const head = this.createPart(new THREE.SphereGeometry(0.058 * s, 18, 14), red);
        head.scale.set(0.95, 1.05, 1);
        head.position.set(0, 0.075 * s, 0.13 * s);
        group.add(head);

        const facePatch = this.createPart(new THREE.SphereGeometry(0.032 * s, 12, 8), white, 1.04);
        facePatch.scale.set(1.15, 0.65, 0.35);
        facePatch.position.set(0, 0.077 * s, 0.172 * s);
        group.add(facePatch);

        const beak = this.createPart(new THREE.ConeGeometry(0.025 * s, 0.07 * s, 5), beakMat);
        beak.position.set(0, 0.073 * s, 0.215 * s);
        beak.rotation.x = Math.PI / 2;
        group.add(beak);

        for (const x of [-0.018, 0.018]) {
            const eyeWhite = this.createPart(new THREE.SphereGeometry(0.008 * s, 8, 6), white, 1.02);
            eyeWhite.position.set(x * s, 0.09 * s, 0.19 * s);
            group.add(eyeWhite);
            const pupil = this.createPart(new THREE.SphereGeometry(0.0045 * s, 6, 4), black, 1.0);
            pupil.position.set(x * s, 0.091 * s, 0.198 * s);
            group.add(pupil);
        }

        for (let i = 0; i < 3; i++) {
            const tailMat = i === 0 ? blue : (i === 1 ? green : yellow);
            const tail = this.createPart(createBeveledBox(0.04 * s, 0.012 * s, 0.26 * s), tailMat, 1.04);
            tail.position.set((i - 1) * 0.035 * s, -0.01 * s, -0.18 * s);
            tail.rotation.x = 0.28;
            tail.rotation.z = (i - 1) * 0.12;
            group.add(tail);
        }

        for (const x of [-0.035, 0.035]) {
            const foot = new THREE.Group();
            const leg = this.createPart(new THREE.CylinderGeometry(0.004 * s, 0.004 * s, 0.045 * s, 5), yellow, 1.04);
            leg.rotation.x = 0.65;
            foot.add(leg);
            for (let i = -1; i <= 1; i++) {
                const claw = this.createPart(new THREE.ConeGeometry(0.004 * s, 0.025 * s, 5), black, 1.02);
                claw.position.set(i * 0.008 * s, -0.026 * s, 0.012 * s);
                claw.rotation.x = Math.PI / 2.4;
                claw.rotation.z = i * 0.28;
                foot.add(claw);
            }
            foot.position.set(x * s, -0.065 * s, 0.015 * s);
            foot.rotation.x = -0.55;
            group.add(foot);
        }

        // Start parrot at a reasonable position (not world origin) to avoid startup glitch
        group.position.set(1.0 * s, 2.75 * s, 0);

        return {
            mesh: group,
            type: PetType.PARROT,
            update: (time: number, ownerPos: THREE.Vector3, _ownerRot: number) => {
                // Orbit only in X-Y plane — keeping Z=0 so the parrot stays visible in 2.5D
                const radius = 1.35 * s;
                const target = new THREE.Vector3(
                    Math.cos(time * 1.9) * radius,
                    2.72 * s + Math.sin(time * 3.2) * 0.28 * s,
                    Math.sin(time * 1.9) * 0.18 * s
                );
                target.add(ownerPos);
                group.position.lerp(target, 0.1);

                const lookDir = new THREE.Vector3().subVectors(target, group.position).normalize();
                if (lookDir.lengthSq() < 0.001) lookDir.set(Math.sin(time), 0, Math.cos(time));
                const targetRot = Math.atan2(lookDir.x, lookDir.z);
                group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, targetRot, 0.12);
                group.rotation.x = THREE.MathUtils.lerp(group.rotation.x, -0.16 + Math.sin(time * 3.2) * 0.06, 0.12);
                group.rotation.z = THREE.MathUtils.lerp(group.rotation.z, Math.sin(time * 1.9) * 0.18, 0.08);

                const flap = Math.sin(time * 16) * 0.85;
                const wingLift = 0.28 + Math.abs(Math.sin(time * 16)) * 0.16;
                lWing.rotation.z = -wingLift - flap * 0.55;
                rWing.rotation.z = wingLift + flap * 0.55;
                lWing.rotation.x = -0.24 + flap * 0.16;
                rWing.rotation.x = -0.24 - flap * 0.16;
            }
        };
    }

    private static buildRaven(s: number): Pet {
        const black = makeToon(0x111111);
        const group = new THREE.Group();
        const body = this.createPart(new THREE.CapsuleGeometry(0.07 * s, 0.18 * s, 4, 64), black);
        group.add(body);

        const wingGeo = createBeveledBox(0.35 * s, 0.01 * s, 0.12 * s);
        wingGeo.translate(0.17 * s, 0, 0);
        const lWing = this.createPart(wingGeo, black);
        lWing.position.set(0.05 * s, 0.05 * s, 0);
        group.add(lWing);
        const rWing = this.createPart(wingGeo, black);
        rWing.position.set(-0.05 * s, 0.05 * s, 0);
        rWing.rotation.y = Math.PI;
        group.add(rWing);

        const head = this.createPart(new THREE.SphereGeometry(0.06 * s, 8, 64), black);
        head.position.set(0, 0.12 * s, 0.08 * s);
        group.add(head);

        return {
            mesh: group,
            type: PetType.RAVEN,
            update: (time: number, ownerPos: THREE.Vector3, ownerRot: number) => {
                            const target = new THREE.Vector3(
                                Math.sin(time) * 1.5 * s,
                                4.0 * s + Math.cos(time * 2) * 0.2 * s,
                                -2.0 * s + Math.cos(time) * 1.0 * s
                            );
                            target.applyAxisAngle(new THREE.Vector3(0, 1, 0), ownerRot);
                            target.add(ownerPos);
                            group.position.lerp(target, 0.02);

                            group.rotation.y = THREE.MathUtils.lerp(group.rotation.y, ownerRot + Math.PI, 0.04);
                const flap = Math.sin(time * 6) * 0.4;
                lWing.rotation.z = flap;
                rWing.rotation.z = -flap;
            }
        };
    }

    // A large feathered blue serpent that slithers around its owner with a mind
    // of its own. The head wanders under its own
    // steering brain; the body segments follow along a recorded trail so the
    // whole serpent reads as a single coiling creature rather than a rigid rig.
    private static buildSerpent(s: number): Pet {
        const snake = this.snakeMaps();
        const scaleMain = makeToon(0x1d54a8);   // rich cobalt blue
        scaleMain.map = snake.map;              // real snake-skin scales
        scaleMain.normalMap = snake.normalMap;
        scaleMain.normalScale = new THREE.Vector2(0.8, 0.8);
        scaleMain.roughness = 0.6;
        scaleMain.needsUpdate = true;
        const scaleDark = makeToon(0x0c2a60);   // deep navy back pattern
        const belly = makeToon(0x8fc2e8);       // pale sky-blue underside
        const featherJade = makeToon(0x12a37a); // crest feathers
        const featherGold = makeToon(0xe0b023);
        const eyeMat = makeToon(0xf2c14e);       // amber eye
        const black = makeToon(0x050505);
        const tongueMat = makeToon(0xc11f3a);
        const fangMat = makeToon(0xf4f0df);

        const group = new THREE.Group();
        group.visible = false; // hidden until first update positions it in world space

        const NUM_BODY = 16;
        const SPACING = 0.16 * s;       // world distance between segment centers
        const GROUND_Y = 0.16 * s;      // body rests low on the ground

        // ---- Head -------------------------------------------------------
        // Built facing +Z (snout forward) so Object3D.lookAt orients it correctly.
        const headGroup = new THREE.Group();

        const skull = this.createPart(new THREE.SphereGeometry(0.2 * s, 18, 14), scaleMain, 1.05);
        skull.scale.set(1.05, 0.82, 1.3);
        headGroup.add(skull);

        const snout = this.createPart(new THREE.SphereGeometry(0.13 * s, 16, 12), scaleMain, 1.04);
        snout.scale.set(0.9, 0.7, 1.0);
        snout.position.set(0, -0.02 * s, 0.22 * s);
        headGroup.add(snout);

        const jaw = new THREE.Group();
        const jawMesh = this.createPart(createBeveledBox(0.16 * s, 0.05 * s, 0.24 * s), scaleDark, 1.03);
        jawMesh.position.set(0, 0, 0.06 * s);
        jaw.add(jawMesh);
        jaw.position.set(0, -0.075 * s, 0.08 * s);
        headGroup.add(jaw);

        for (const dir of [-1, 1]) {
            const brow = this.createPart(createBeveledBox(0.09 * s, 0.04 * s, 0.12 * s), scaleDark, 1.04);
            brow.position.set(dir * 0.1 * s, 0.085 * s, 0.06 * s);
            brow.rotation.y = dir * 0.18;
            headGroup.add(brow);

            const eye = this.createPart(new THREE.SphereGeometry(0.045 * s, 12, 10), eyeMat, 1.03);
            eye.scale.set(1, 1, 0.85);
            eye.position.set(dir * 0.115 * s, 0.05 * s, 0.1 * s);
            headGroup.add(eye);

            const pupil = this.createPart(new THREE.SphereGeometry(0.022 * s, 8, 8), black, 1.0);
            pupil.scale.set(0.4, 1.1, 0.6); // vertical reptilian slit
            pupil.position.set(dir * 0.13 * s, 0.05 * s, 0.115 * s);
            headGroup.add(pupil);

            const nostril = this.createPart(new THREE.SphereGeometry(0.012 * s, 6, 6), black, 1.0);
            nostril.position.set(dir * 0.04 * s, -0.02 * s, 0.3 * s);
            headGroup.add(nostril);

            const fang = this.createPart(new THREE.ConeGeometry(0.018 * s, 0.075 * s, 6), fangMat, 1.02);
            fang.position.set(dir * 0.07 * s, -0.1 * s, 0.16 * s);
            fang.rotation.x = Math.PI;
            headGroup.add(fang);
        }

        // Feathered crest sweeping back over the skull
        const crest = new THREE.Group();
        for (let i = 0; i < 7; i++) {
            const f = (i - 3) / 3;
            const len = (0.26 - Math.abs(f) * 0.1) * s;
            const feather = this.createPart(new THREE.ConeGeometry(0.035 * s, len, 5), i % 2 === 0 ? featherJade : featherGold, 1.04);
            feather.position.set(f * 0.11 * s, 0.16 * s, -0.06 * s);
            feather.rotation.x = -1.15;            // sweep back
            feather.rotation.z = f * 0.45;          // fan out
            crest.add(feather);
        }
        headGroup.add(crest);

        // Forked tongue (flicks out periodically)
        const tongue = new THREE.Group();
        const tongueBase = this.createPart(createBeveledBox(0.02 * s, 0.015 * s, 0.16 * s), tongueMat, 1.02);
        tongueBase.position.z = 0.08 * s;
        tongue.add(tongueBase);
        for (const dir of [-1, 1]) {
            const prong = this.createPart(createBeveledBox(0.014 * s, 0.012 * s, 0.09 * s), tongueMat, 1.02);
            prong.position.set(dir * 0.025 * s, 0, 0.19 * s);
            prong.rotation.y = dir * 0.45;
            tongue.add(prong);
        }
        tongue.position.set(0, -0.06 * s, 0.26 * s);
        tongue.scale.z = 0;
        headGroup.add(tongue);

        group.add(headGroup);

        // ---- Body segments ---------------------------------------------
        const segs: THREE.Group[] = [];
        for (let i = 0; i < NUM_BODY; i++) {
            const t = i / (NUM_BODY - 1);
            const bulge = 1 + 0.22 * Math.sin(t * Math.PI);
            const r = (0.03 + 0.155 * (1 - t)) * s * bulge;

            const seg = new THREE.Group();
            const main = this.createPart(new THREE.SphereGeometry(r, 16, 12), scaleMain, 1.05);
            main.scale.set(1, 0.9, 1.05);
            seg.add(main);

            const bellyMesh = this.createPart(new THREE.SphereGeometry(r * 0.68, 12, 8), belly, 1.03);
            bellyMesh.scale.set(0.9, 0.55, 1.05);
            bellyMesh.position.y = -r * 0.45;
            seg.add(bellyMesh);

            if (i % 2 === 0 && i < NUM_BODY - 3) {
                const diamond = this.createPart(createBeveledBox(r * 0.95, r * 0.3, r * 0.95), scaleDark, 1.04);
                diamond.position.y = r * 0.55;
                diamond.rotation.y = Math.PI / 4;
                seg.add(diamond);
            }

            group.add(seg);
            segs.push(seg);
        }

        // ---- Slither brain & trail follower -----------------------------
        const lerpAngle = (a: number, b: number, t: number) => {
            let d = b - a;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            return a + d * t;
        };

        const trail: THREE.Vector3[] = [];
        const TRAIL_CAP = 360;
        const headPos = new THREE.Vector3();
        const target = new THREE.Vector3();
        let heading = 0;
        let wanderTimer = 0;
        let tongueTimer = 1 + Math.random() * 2;
        let lastTime = 0;
        let initialized = false;

        const pickTarget = (ownerPos: THREE.Vector3, pullBack: boolean) => {
            const ang = Math.random() * Math.PI * 2;
            const radius = pullBack ? (0.8 + Math.random() * 0.8) * s : (1.5 + Math.random() * 2.2) * s;
            target.set(ownerPos.x + Math.cos(ang) * radius, GROUND_Y, ownerPos.z + Math.sin(ang) * radius);
            wanderTimer = 1.5 + Math.random() * 2.5;
        };

        const tmp = new THREE.Vector3();
        const sampleTrail = (dist: number, out: THREE.Vector3) => {
            let acc = 0;
            for (let i = 0; i < trail.length - 1; i++) {
                const seg = trail[i].distanceTo(trail[i + 1]);
                if (acc + seg >= dist) {
                    out.lerpVectors(trail[i], trail[i + 1], seg > 1e-6 ? (dist - acc) / seg : 0);
                    return;
                }
                acc += seg;
            }
            out.copy(trail[trail.length - 1]);
        };

        const positions: THREE.Vector3[] = [];
        for (let i = 0; i <= NUM_BODY; i++) positions.push(new THREE.Vector3());

        // Strike state (neck-bite ultimate)
        let striking = false, strikePhase = 0, strikeTimer = 0, connectFired = false;
        const strikeTarget = new THREE.Vector3();
        let onConnectCb: (() => void) | null = null;
        let onCompleteCb: (() => void) | null = null;
        const STRIKE_FRAMES = 16, SRETURN_FRAMES = 24;

        return {
            mesh: group,
            type: PetType.SERPENT,
            strike: (target, onConnect, onComplete) => {
                striking = true; strikePhase = 0; strikeTimer = 0; connectFired = false;
                strikeTarget.copy(target);
                onConnectCb = onConnect; onCompleteCb = onComplete;
            },
            update: (time: number, ownerPos: THREE.Vector3, ownerRot: number) => {
                if (!initialized) {
                    const off = new THREE.Vector3(-1.3 * s, GROUND_Y, -1.3 * s).applyAxisAngle(new THREE.Vector3(0, 1, 0), ownerRot);
                    headPos.copy(ownerPos).add(off);
                    headPos.y = GROUND_Y;
                    heading = ownerRot + Math.PI;
                    for (let i = 0; i < TRAIL_CAP; i++) trail.push(headPos.clone());
                    pickTarget(ownerPos, false);
                    lastTime = time;
                    initialized = true;
                    group.visible = true;
                }

                let dt = time - lastTime;
                lastTime = time;
                if (dt <= 0 || dt > 0.1) dt = 0.016; // spike / pause guard

                let travel: number;
                if (striking) {
                    strikeTimer++;
                    // Phase 0: rear up and lunge at the neck; Phase 1: return to owner.
                    const aim = strikePhase === 0
                        ? strikeTarget
                        : tmp.set(-1.3 * s, GROUND_Y, -1.3 * s).applyAxisAngle(new THREE.Vector3(0, 1, 0), ownerRot).add(ownerPos);
                    const toX = aim.x - headPos.x, toZ = aim.z - headPos.z;
                    const horiz = Math.hypot(toX, toZ);
                    travel = horiz > 1e-4 ? Math.atan2(toX, toZ) : heading;
                    heading = travel;
                    const lungeSpeed = (strikePhase === 0 ? 11 : 7) * s;
                    const step = Math.min(horiz, lungeSpeed * dt);
                    if (horiz > 1e-4) { headPos.x += (toX / horiz) * step; headPos.z += (toZ / horiz) * step; }
                    if (strikePhase === 0) {
                        headPos.y = THREE.MathUtils.lerp(headPos.y, GROUND_Y + 1.5 * s, 0.3);
                        if (strikeTimer >= STRIKE_FRAMES || horiz < 0.35 * s) {
                            if (!connectFired) { connectFired = true; onConnectCb?.(); }
                            strikePhase = 1; strikeTimer = 0;
                        }
                    } else {
                        headPos.y = THREE.MathUtils.lerp(headPos.y, GROUND_Y, 0.2);
                        if (strikeTimer >= SRETURN_FRAMES) { striking = false; onCompleteCb?.(); }
                    }
                } else {
                    // --- brain: wander with a leash back to the owner ---
                    wanderTimer -= dt;
                    const dx = headPos.x - ownerPos.x;
                    const dz = headPos.z - ownerPos.z;
                    const distOwner = Math.hypot(dx, dz);
                    const strayed = distOwner > 4.5 * s;
                    const arrived = Math.hypot(target.x - headPos.x, target.z - headPos.z) < 0.5 * s;
                    if (wanderTimer <= 0 || arrived || strayed) pickTarget(ownerPos, strayed);

                    // --- steer the head toward the target, then add a slither weave ---
                    const desired = Math.atan2(target.x - headPos.x, target.z - headPos.z);
                    heading = lerpAngle(heading, desired, 1 - Math.pow(0.5, dt * 3.5));
                    const weave = Math.sin(time * 4.5) * 0.5;
                    travel = heading + weave;
                    const speed = (1.7 + Math.sin(time * 1.3) * 0.3) * s;
                    headPos.x += Math.sin(travel) * speed * dt;
                    headPos.z += Math.cos(travel) * speed * dt;
                    headPos.y = GROUND_Y;
                }

                // --- record trail ---
                trail.unshift(headPos.clone());
                if (trail.length > TRAIL_CAP) trail.pop();

                // --- sample body positions along the trail with vertical ripple ---
                positions[0].copy(headPos);
                for (let i = 1; i <= NUM_BODY; i++) {
                    sampleTrail(i * SPACING, positions[i]);
                    positions[i].y = GROUND_Y + Math.sin(time * 6 - i * 0.7) * 0.025 * s;
                }

                // head sits raised and alert, easing down into the body
                // (during a strike the head rides at headPos.y — keep that height)
                if (!striking) {
                    positions[0].y = GROUND_Y + 0.18 * s;
                    if (positions.length > 1) positions[1].y = GROUND_Y + 0.09 * s;
                }

                for (let i = 0; i < NUM_BODY; i++) {
                    const seg = segs[i];
                    seg.position.copy(positions[i + 1]);
                    seg.lookAt(positions[i]); // face toward the segment ahead (head side)
                }

                headGroup.position.copy(positions[0]);
                tmp.set(Math.sin(travel), 0, Math.cos(travel)).add(positions[0]);
                tmp.y = positions[0].y;
                headGroup.lookAt(tmp);

                // --- tongue flick ---
                tongueTimer -= dt;
                let flick = 0;
                if (tongueTimer < 0.45) {
                    flick = Math.sin(Math.max(0, (0.45 - tongueTimer) / 0.45) * Math.PI);
                    if (tongueTimer <= 0) tongueTimer = 1.5 + Math.random() * 3;
                }
                tongue.scale.z = flick;
                jaw.rotation.x = flick * 0.22;
            }
        };
    }
}
