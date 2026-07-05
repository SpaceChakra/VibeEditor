import * as THREE from 'three';

// ============================================================
// CLOTH SIM
// Lightweight verlet cloth for capes, banners and flags. A grid
// of particles is simulated in WORLD space (so a cape naturally
// trails its wearer with inertia) while one edge stays pinned to
// an anchor object. The mesh stays an ordinary child of the
// anchor; each frame the simulated world positions are converted
// back to anchor-local space before being written to the
// geometry, so normal scene-graph transforms/visibility apply.
// ============================================================

export interface ClothCollider {
    /** Body part the sphere tracks (e.g. rig.torso). */
    object: THREE.Object3D;
    /** Local offset from the object's origin to the sphere center. */
    offset: THREE.Vector3;
    radius: number;
}

/**
 * A half-space constraint expressed in another object's LOCAL frame (e.g.
 * rig.torso), rather than world space. Sphere colliders alone can't stop a
 * cape from reading as "in front" of the body: a symmetric sphere has no
 * concept of front/back, so when the wearer's facing flips instantly
 * (mesh.rotation.y snaps, no interpolation) the free-hanging cloth's
 * world-space inertia can land on what is now the front side before the
 * sphere pushout ever sees it as a violation. Clamping in the body's own
 * local frame is immune to that: "front" and "back" stay fixed relative to
 * the anchor no matter how the world-space transform jumps around.
 */
export interface ClothBackstop {
    /** Object whose local frame defines the plane (e.g. rig.torso). */
    object: THREE.Object3D;
    /** Local-space point the plane passes through. */
    point: THREE.Vector3;
    /** Local-space outward normal. Particles are kept on the (point - normal)
     *  side — i.e. (localPos - point)·normal must stay <= 0. */
    normal: THREE.Vector3;
}

export interface ClothOptions {
    /** Object whose world transform carries the pinned edge. */
    anchor: THREE.Object3D;
    /** Cloth size in the anchor's local units (before anchor scaling). */
    width: number;
    height: number;
    segX?: number;
    segY?: number;
    /** Material for a newly created mesh. Ignored when `mesh` is given. */
    material?: THREE.Material;
    /**
     * Adopt an existing plane mesh (level banners): its material is kept,
     * its local transform is captured as the rest pose, and its geometry
     * is replaced with the simulated grid.
     */
    mesh?: THREE.Mesh;
    /** Rest-pose placement relative to the anchor (created meshes only). */
    localPos?: THREE.Vector3;
    localRot?: THREE.Euler;
    /** Top edge sits at the local origin (like geometries translated -h/2). */
    originTop?: boolean;
    /** Which edge is fixed: 'top' = hanging banner/cape, 'left' = pole flag. */
    pinEdge?: 'top' | 'left';
    gravity?: number;
    /** Wind strength multiplier; 0 disables wind. */
    windScale?: number;
    windDir?: THREE.Vector3;
    windPhase?: number;
    damping?: number;
    iterations?: number;
    colliders?: ClothCollider[];
    backstops?: ClothBackstop[];
    castShadow?: boolean;
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _wind = new THREE.Vector3();
const _inv = new THREE.Matrix4();
const _bInv = new THREE.Matrix4();

export class ClothSim {
    readonly mesh: THREE.Mesh;

    private anchor: THREE.Object3D;
    private nx: number;              // vertices per row
    private ny: number;              // rows
    private pos: Float32Array;       // world positions
    private prev: Float32Array;
    private restLocal: Float32Array; // anchor-local rest positions
    private pinned: Uint8Array;
    private consA: Uint16Array;      // constraint particle indices
    private consB: Uint16Array;
    private consRest: Float32Array;  // world-space rest lengths (from init)
    private inited = false;

    private gravity: number;
    private windScale: number;
    private windDir: THREE.Vector3;
    private windPhase: number;
    private damping: number;
    private iterations: number;
    private colliders: ClothCollider[];
    private backstops: ClothBackstop[];
    private lastPin = new THREE.Vector3();
    private timeAcc = 0;

    constructor(opts: ClothOptions) {
        this.anchor = opts.anchor;
        const segX = opts.segX ?? 5;
        const segY = opts.segY ?? 7;
        this.nx = segX + 1;
        this.ny = segY + 1;
        const n = this.nx * this.ny;
        this.pos = new Float32Array(n * 3);
        this.prev = new Float32Array(n * 3);
        this.restLocal = new Float32Array(n * 3);
        this.pinned = new Uint8Array(n);
        this.gravity = opts.gravity ?? 7;
        this.windScale = opts.windScale ?? 1;
        this.windDir = (opts.windDir ?? new THREE.Vector3(0.8, 0.05, 0.45)).clone().normalize();
        this.windPhase = opts.windPhase ?? Math.random() * 10;
        this.damping = opts.damping ?? 0.98;
        this.iterations = opts.iterations ?? 3;
        this.colliders = opts.colliders ?? [];
        this.backstops = opts.backstops ?? [];

        const geo = new THREE.PlaneGeometry(opts.width, opts.height, segX, segY);

        // Bake the rest pose (anchor-local): plane grid -> optional top-origin
        // shift -> adopted/explicit local transform.
        let localPos = opts.localPos ?? new THREE.Vector3();
        let localRot = opts.localRot ?? new THREE.Euler();
        let localScale = new THREE.Vector3(1, 1, 1);
        if (opts.mesh) {
            localPos = opts.mesh.position.clone();
            localRot = opts.mesh.rotation.clone();
            localScale = opts.mesh.scale.clone();
        }
        const q = new THREE.Quaternion().setFromEuler(localRot);
        const planePos = geo.attributes.position;
        for (let i = 0; i < n; i++) {
            _v.set(
                planePos.getX(i) * localScale.x,
                (planePos.getY(i) + (opts.originTop ? -opts.height / 2 : 0)) * localScale.y,
                0
            ).applyQuaternion(q).add(localPos);
            this.restLocal[i * 3] = _v.x;
            this.restLocal[i * 3 + 1] = _v.y;
            this.restLocal[i * 3 + 2] = _v.z;
        }

        // Pins along the chosen edge.
        const pinEdge = opts.pinEdge ?? 'top';
        for (let iy = 0; iy < this.ny; iy++) {
            for (let ix = 0; ix < this.nx; ix++) {
                if ((pinEdge === 'top' && iy === 0) || (pinEdge === 'left' && ix === 0)) {
                    this.pinned[iy * this.nx + ix] = 1;
                }
            }
        }

        // Constraints: structural (right/down) + shear (both diagonals).
        const a: number[] = [], b: number[] = [];
        for (let iy = 0; iy < this.ny; iy++) {
            for (let ix = 0; ix < this.nx; ix++) {
                const i = iy * this.nx + ix;
                if (ix + 1 < this.nx) { a.push(i); b.push(i + 1); }
                if (iy + 1 < this.ny) { a.push(i); b.push(i + this.nx); }
                if (ix + 1 < this.nx && iy + 1 < this.ny) {
                    a.push(i); b.push(i + this.nx + 1);
                    a.push(i + 1); b.push(i + this.nx);
                }
            }
        }
        this.consA = new Uint16Array(a);
        this.consB = new Uint16Array(b);
        this.consRest = new Float32Array(a.length);

        if (opts.mesh) {
            this.mesh = opts.mesh;
            this.mesh.geometry.dispose();
            this.mesh.geometry = geo;
            // The captured local transform is baked into restLocal; the mesh
            // itself now renders identity-relative to its parent.
            this.mesh.position.set(0, 0, 0);
            this.mesh.rotation.set(0, 0, 0);
            this.mesh.scale.set(1, 1, 1);
            const mats = Array.isArray(this.mesh.material) ? this.mesh.material : [this.mesh.material];
            mats.forEach(m => { m.side = THREE.DoubleSide; });
        } else {
            const mat = opts.material!;
            mat.side = THREE.DoubleSide;
            this.mesh = new THREE.Mesh(geo, mat);
            this.mesh.castShadow = opts.castShadow ?? true;
            this.mesh.receiveShadow = true;
            this.anchor.add(this.mesh);
        }
        this.mesh.frustumCulled = false;

        // Static preview (editor, menus): show the authored rest drape until
        // the first simulation step overwrites it.
        const attr = geo.attributes.position as THREE.BufferAttribute;
        (attr.array as Float32Array).set(this.restLocal);
        attr.needsUpdate = true;
        geo.computeVertexNormals();
    }

    /** Snap every particle to its rest pose under the current anchor transform. */
    reset() {
        this.anchor.updateWorldMatrix(true, false);
        const m = this.anchor.matrixWorld;
        const n = this.nx * this.ny;
        for (let i = 0; i < n; i++) {
            _v.fromArray(this.restLocal, i * 3).applyMatrix4(m);
            this.pos[i * 3] = _v.x; this.pos[i * 3 + 1] = _v.y; this.pos[i * 3 + 2] = _v.z;
            this.prev[i * 3] = _v.x; this.prev[i * 3 + 1] = _v.y; this.prev[i * 3 + 2] = _v.z;
        }
        if (!this.inited) {
            for (let c = 0; c < this.consA.length; c++) {
                const ia = this.consA[c] * 3, ib = this.consB[c] * 3;
                const dx = this.pos[ia] - this.pos[ib];
                const dy = this.pos[ia + 1] - this.pos[ib + 1];
                const dz = this.pos[ia + 2] - this.pos[ib + 2];
                this.consRest[c] = Math.sqrt(dx * dx + dy * dy + dz * dz);
            }
            this.inited = true;
        }
        this.lastPin.set(this.pos[0], this.pos[1], this.pos[2]);
        this.writeGeometry(m);
    }

    update(dt: number, time: number) {
        if (dt <= 0) return;
        // Skip (and freeze) while hidden anywhere up the chain.
        for (let o: THREE.Object3D | null = this.mesh; o; o = o.parent) {
            if (!o.visible) return;
        }
        if (!this.inited) { this.reset(); return; }

        this.anchor.updateWorldMatrix(true, false);
        const m = this.anchor.matrixWorld;

        // Teleport guard: if the pinned edge jumped (round reset, respawn),
        // re-drape instead of streaking across the arena.
        _v.fromArray(this.restLocal, 0).applyMatrix4(m);
        if (_v.distanceToSquared(this.lastPin) > 2.0 * 2.0) { this.reset(); return; }
        this.lastPin.copy(_v);

        const h = 1 / 60;
        const steps = Math.min(3, Math.max(1, Math.round(dt / h)));
        this.timeAcc = time;

        for (let s = 0; s < steps; s++) this.step(h, m);

        // Collision after solve so pads of cloth sit outside body spheres.
        for (const col of this.colliders) {
            col.object.updateWorldMatrix(true, false);
            _w.copy(col.offset).applyMatrix4(col.object.matrixWorld);
            const r = col.radius;
            const n = this.nx * this.ny;
            for (let i = 0; i < n; i++) {
                if (this.pinned[i]) continue;
                const ix = i * 3;
                const dx = this.pos[ix] - _w.x, dy = this.pos[ix + 1] - _w.y, dz = this.pos[ix + 2] - _w.z;
                const d2 = dx * dx + dy * dy + dz * dz;
                if (d2 < r * r && d2 > 1e-8) {
                    const d = Math.sqrt(d2), k = r / d;
                    this.pos[ix] = _w.x + dx * k;
                    this.pos[ix + 1] = _w.y + dy * k;
                    this.pos[ix + 2] = _w.z + dz * k;
                }
            }
        }

        this.writeGeometry(m);
    }

    private step(h: number, anchorM: THREE.Matrix4) {
        const n = this.nx * this.ny;
        const t = this.timeAcc;

        // Gusty wind: slow strength swell + a lighter high-frequency ripple.
        const swell = Math.sin(t * 1.9 + this.windPhase) * 0.6 + Math.sin(t * 0.7 + this.windPhase * 1.7) * 0.4;
        const wStrength = this.windScale * (1.5 + 1.7 * swell);
        _wind.copy(this.windDir).multiplyScalar(wStrength);
        _wind.x += Math.sin(t * 2.6 + this.windPhase * 3.1) * 0.4 * this.windScale;
        _wind.z += Math.cos(t * 2.2 + this.windPhase * 2.3) * 0.4 * this.windScale;

        const ax = _wind.x, ay = _wind.y - this.gravity, az = _wind.z;
        const h2 = h * h;
        const maxStep = 0.14; // per-substep travel cap tames spikes

        for (let i = 0; i < n; i++) {
            const ix = i * 3;
            if (this.pinned[i]) {
                _v.fromArray(this.restLocal, ix).applyMatrix4(anchorM);
                this.pos[ix] = _v.x; this.pos[ix + 1] = _v.y; this.pos[ix + 2] = _v.z;
                this.prev[ix] = _v.x; this.prev[ix + 1] = _v.y; this.prev[ix + 2] = _v.z;
                continue;
            }
            let vx = (this.pos[ix] - this.prev[ix]) * this.damping;
            let vy = (this.pos[ix + 1] - this.prev[ix + 1]) * this.damping;
            let vz = (this.pos[ix + 2] - this.prev[ix + 2]) * this.damping;
            const sp = Math.sqrt(vx * vx + vy * vy + vz * vz);
            if (sp > maxStep) { const k = maxStep / sp; vx *= k; vy *= k; vz *= k; }
            this.prev[ix] = this.pos[ix];
            this.prev[ix + 1] = this.pos[ix + 1];
            this.prev[ix + 2] = this.pos[ix + 2];
            this.pos[ix] += vx + ax * h2;
            this.pos[ix + 1] += vy + ay * h2;
            this.pos[ix + 2] += vz + az * h2;
        }

        for (let it = 0; it < this.iterations; it++) {
            for (let c = 0; c < this.consA.length; c++) {
                const ia = this.consA[c] * 3, ib = this.consB[c] * 3;
                let dx = this.pos[ib] - this.pos[ia];
                let dy = this.pos[ib + 1] - this.pos[ia + 1];
                let dz = this.pos[ib + 2] - this.pos[ia + 2];
                const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (d < 1e-8) continue;
                const diff = (d - this.consRest[c]) / d;
                const pa = this.pinned[this.consA[c]], pb = this.pinned[this.consB[c]];
                if (pa && pb) continue;
                const wa = pa ? 0 : (pb ? 1 : 0.5);
                const wb = pb ? 0 : (pa ? 1 : 0.5);
                dx *= diff; dy *= diff; dz *= diff;
                this.pos[ia] += dx * wa; this.pos[ia + 1] += dy * wa; this.pos[ia + 2] += dz * wa;
                this.pos[ib] -= dx * wb; this.pos[ib + 1] -= dy * wb; this.pos[ib + 2] -= dz * wb;
            }
        }

        // Half-space backstops, resolved every substep (not once per frame)
        // so a fast facing flip can't let a particle tunnel to the wrong side
        // before the constraint ever sees it.
        for (const bs of this.backstops) {
            bs.object.updateWorldMatrix(true, false);
            _bInv.copy(bs.object.matrixWorld).invert();
            for (let i = 0; i < n; i++) {
                if (this.pinned[i]) continue;
                const ix = i * 3;
                _v.set(this.pos[ix], this.pos[ix + 1], this.pos[ix + 2]).applyMatrix4(_bInv);
                const d = (_v.x - bs.point.x) * bs.normal.x + (_v.y - bs.point.y) * bs.normal.y + (_v.z - bs.point.z) * bs.normal.z;
                if (d > 0) {
                    _v.x -= bs.normal.x * d;
                    _v.y -= bs.normal.y * d;
                    _v.z -= bs.normal.z * d;
                    _v.applyMatrix4(bs.object.matrixWorld);
                    this.pos[ix] = _v.x; this.pos[ix + 1] = _v.y; this.pos[ix + 2] = _v.z;
                }
            }
        }
    }

    /** Convert simulated world positions back to anchor-local space so the
     *  mesh renders correctly as an ordinary child of the anchor. */
    private writeGeometry(anchorM: THREE.Matrix4) {
        _inv.copy(anchorM).invert();
        const attr = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
        const arr = attr.array as Float32Array;
        const n = this.nx * this.ny;
        for (let i = 0; i < n; i++) {
            _v.fromArray(this.pos, i * 3).applyMatrix4(_inv);
            arr[i * 3] = _v.x; arr[i * 3 + 1] = _v.y; arr[i * 3 + 2] = _v.z;
        }
        attr.needsUpdate = true;
        this.mesh.geometry.computeVertexNormals();
    }
}
