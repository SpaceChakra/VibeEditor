// -----------------------------------------------------------------------------
// PartGizmos — draggable 3D viewport gizmos (Move / Rotate / Scale / Taper)
// for the character editor, on desktop (mouse) and mobile (touch).
//
// This is a custom implementation rather than three's TransformControls because
// the handles must drive the editor's slider state machine (setValue routes
// through the same code path as the panel sliders: undo steps, mirror,
// multi-select delta propagation, foot compensation) instead of mutating
// objects directly — and because Taper has no stock three.js gizmo.
//
// Exact slider correspondence:
// - Move arrows are aligned with the frame the position value lives in
//   (parent space for hierarchy mode, node space for part mode), so dragging
//   an arrow by one world unit changes the slider by exactly 1 / frameScale.
// - Rotation rings follow the Euler XYZ chain: the X ring is the frame's X
//   axis, the Y ring is the X-rotated Y axis, the Z ring is the fully rotated
//   Z axis. The angle swept around each ring maps 1:1 onto that Euler
//   component.
// - Scale handles map screen-space drag distance additively onto the slider
//   (100px ≈ +0.8); the center cube scales all three axes multiplicatively.
// - Taper rings hug the part's tapered geometry at each end; the ring tracks
//   the pointer's radial distance so the band follows your finger.
// -----------------------------------------------------------------------------

import * as THREE from 'three';

export const GIZMO_MODES = ['off', 'move', 'rotate', 'scale', 'taper'] as const;
export type GizmoMode = typeof GIZMO_MODES[number];
export type GizmoAxis = 'x' | 'y' | 'z';

export interface GizmoHost {
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  domElement: HTMLElement; // renderer canvas
  overlayEl: HTMLElement;  // #view wrapper (capture-phase listeners + readout)
  /** The selected part's node, or null when the editor isn't in a gizmo-editable state. */
  getNode(): THREE.Object3D | null;
  getMode(): 'hierarchy' | 'part';
  getValue(ch: 'pos' | 'rot' | 'scl', axis: GizmoAxis): number;
  setValue(ch: 'pos' | 'rot' | 'scl', axis: GizmoAxis, v: number): void;
  getTaper(which: 'top' | 'bottom'): number;
  setTaper(which: 'top' | 'bottom', v: number): void;
  getTaperMeshes(): THREE.Mesh[];
  beginStep(): void;
  commitStep(): void;
}

type HandleKind = 'move' | 'rotate' | 'scale' | 'uniform' | 'taper';

interface Handle {
  kind: HandleKind;
  mode: GizmoMode;            // which gizmo mode shows this handle
  axis?: GizmoAxis;           // move / rotate / scale
  which?: 'top' | 'bottom';   // taper
  container: THREE.Group;
  visuals: THREE.Mesh[];
  hit: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  baseColor: THREE.Color;
  hoverColor: THREE.Color;
}

interface DragBase {
  pointerId: number;
  handle: Handle;
  startX: number;
  startY: number;
}
interface MoveDrag extends DragBase {
  kind: 'move'; axis: GizmoAxis;
  lineOrigin: THREE.Vector3; lineDir: THREE.Vector3; axisLen: number; t0: number;
  startVal: number;
}
interface RotateDrag extends DragBase {
  kind: 'rotate'; axis: GizmoAxis;
  planeCenter: THREE.Vector3; planeNormal: THREE.Vector3;
  prevV: THREE.Vector3; accum: number; startVal: number;
  pixelDir: THREE.Vector2 | null; // non-null = ring edge-on, screen-space fallback
}
interface ScaleDrag extends DragBase {
  kind: 'scale'; axis: GizmoAxis;
  pixelDir: THREE.Vector2; startVal: number;
}
interface UniformDrag extends DragBase {
  kind: 'uniform';
  startVals: { x: number; y: number; z: number };
}
interface TaperDrag extends DragBase {
  kind: 'taper'; which: 'top' | 'bottom';
  planeCenter: THREE.Vector3; planeNormal: THREE.Vector3;
  d0: number; startVal: number;
  pixelDir: THREE.Vector2 | null; // non-null = ring plane edge-on, screen-space fallback
}
type DragState = MoveDrag | RotateDrag | ScaleDrag | UniformDrag | TaperDrag;

const AXIS_COLOR: Record<GizmoAxis, number> = { x: 0xe0566e, y: 0x7dc87d, z: 0x4f8fe8 };
const TAPER_COLOR: Record<'top' | 'bottom', number> = { top: 0xf0c987, bottom: 0xd9a05c };
const GIZMO_PX = 105;         // gizmo nominal radius on screen, in pixels
const BASE_OPACITY = 0.9;
const SCALE_PER_PX = 0.008;   // per-axis scale handle: slider units per pixel
const UNIFORM_PER_PX = 0.004; // center cube: scale factor change per pixel
const ROT_RAD_PER_PX = 0.01;  // rotation fallback when ring is edge-on
const TAPER_PER_PX = 0.006;   // taper fallback when ring plane is edge-on
const EDGE_ON_DOT = 0.1;      // |ray·normal| below this = ring edge-on, use pixel fallback
const MIN_TAPER = 0.05;       // taper value floor for radius math, so rings near 0 stay draggable

const AXES: GizmoAxis[] = ['x', 'y', 'z'];
const AXIS_INDEX: Record<GizmoAxis, number> = { x: 0, y: 1, z: 2 };
const UNIT: Record<GizmoAxis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1),
};
// Base orientations that bring a torus (normal = +Z) to face each axis.
const RING_BASE: Record<GizmoAxis, THREE.Quaternion> = {
  x: new THREE.Quaternion().setFromAxisAngle(UNIT.y, Math.PI / 2),
  y: new THREE.Quaternion().setFromAxisAngle(UNIT.x, -Math.PI / 2),
  z: new THREE.Quaternion(),
};
// One shared material for all invisible hit meshes (never mutated).
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });

export class GizmoManager {
  private host: GizmoHost;
  private root = new THREE.Group();
  private handles: Handle[] = [];
  private uniformHandle!: Handle;
  private mode: GizmoMode = 'off';
  private drag: DragState | null = null;
  private hovered: Handle | null = null;
  private readout: HTMLDivElement;
  // Hit meshes of the currently visible handles, rebuilt when the mode changes.
  private activeHits: THREE.Mesh[] = [];
  private hitCacheMode: GizmoMode | null = null;
  private overlayRect: DOMRect | null = null; // cached for the drag's duration

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  // scratch
  private _v1 = new THREE.Vector3(); private _v2 = new THREE.Vector3(); private _v3 = new THREE.Vector3();
  private _q1 = new THREE.Quaternion(); private _q2 = new THREE.Quaternion();
  private _e1 = new THREE.Euler();
  private _m1 = new THREE.Matrix4(); private _m2 = new THREE.Matrix4();
  private _plane = new THREE.Plane();
  private _box = new THREE.Box3(); private _box2 = new THREE.Box3();
  private _origin = new THREE.Vector3();

  constructor(host: GizmoHost) {
    this.host = host;
    this.root.visible = false;
    host.scene.add(this.root);
    this.buildHandles();

    this.readout = document.createElement('div');
    this.readout.id = 'gizmoReadout';
    host.overlayEl.appendChild(this.readout);

    // Capture phase on the viewport wrapper so a hit on a gizmo handle wins
    // over OrbitControls (which listens on the canvas itself).
    host.overlayEl.addEventListener('pointerdown', this.onPointerDown, { capture: true });
    window.addEventListener('pointermove', this.onPointerMove, { capture: true });
    window.addEventListener('pointerup', this.onPointerUp, { capture: true });
    window.addEventListener('pointercancel', this.onPointerUp, { capture: true });
  }

  setMode(m: GizmoMode) {
    if (this.drag) this.endDrag();
    this.mode = m;
    this.setHover(null);
    // No eager update() — the render loop calls update() every frame, and this
    // can run at module-init time before the editor's tab state exists.
  }

  // ---------------------------------------------------------------------------
  // Handle construction
  // ---------------------------------------------------------------------------
  private addHandle(kind: HandleKind, color: number,
                    visualGeos: THREE.BufferGeometry[], hitGeo: THREE.BufferGeometry,
                    opts: { axis?: GizmoAxis; which?: 'top' | 'bottom'; doubleSide?: boolean } = {}): Handle {
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: BASE_OPACITY, depthTest: false, depthWrite: false,
      side: opts.doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
    mat.toneMapped = false;
    const container = new THREE.Group();
    const visuals = visualGeos.map(g => {
      const mesh = new THREE.Mesh(g, mat);
      mesh.renderOrder = 9999;
      container.add(mesh);
      return mesh;
    });
    const hit = new THREE.Mesh(hitGeo, HIT_MAT);
    container.add(hit);
    this.root.add(container);
    const handle: Handle = {
      kind, mode: kind === 'uniform' ? 'scale' : kind,
      axis: opts.axis, which: opts.which,
      container, visuals, hit, mat,
      baseColor: new THREE.Color(color),
      hoverColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55),
    };
    hit.userData.gizmoHandle = handle;
    this.handles.push(handle);
    return handle;
  }

  private buildHandles() {
    // Move: arrow (shaft + cone) built along +Y; oriented per-frame per axis.
    for (const axis of AXES) {
      const shaft = new THREE.CylinderGeometry(0.02, 0.02, 0.78, 8).translate(0, 0.54, 0);
      const cone = new THREE.ConeGeometry(0.07, 0.24, 12).translate(0, 1.05, 0);
      const hit = new THREE.CylinderGeometry(0.18, 0.18, 1.15, 8).translate(0, 0.62, 0);
      this.addHandle('move', AXIS_COLOR[axis], [shaft, cone], hit, { axis });
    }
    // Rotate: rings (torus normal = +Z, re-oriented per frame).
    for (const axis of AXES) {
      const ring = new THREE.TorusGeometry(1, 0.022, 10, 64);
      const hit = new THREE.TorusGeometry(1, 0.16, 8, 32);
      this.addHandle('rotate', AXIS_COLOR[axis], [ring], hit, { axis });
    }
    // Scale: shaft + cube tip along +Y; plus a center cube for uniform scale.
    for (const axis of AXES) {
      const shaft = new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8).translate(0, 0.46, 0);
      const cube = new THREE.BoxGeometry(0.15, 0.15, 0.15).translate(0, 0.85, 0);
      const hit = new THREE.CylinderGeometry(0.18, 0.18, 1.05, 8).translate(0, 0.57, 0);
      this.addHandle('scale', AXIS_COLOR[axis], [shaft, cube], hit, { axis });
    }
    this.uniformHandle = this.addHandle('uniform', 0xf0c987,
      [new THREE.BoxGeometry(0.17, 0.17, 0.17)], new THREE.BoxGeometry(0.42, 0.42, 0.42));
    // Taper: open cylinder bands hugging the part at each end (scaled per frame).
    for (const which of ['top', 'bottom'] as const) {
      const band = new THREE.CylinderGeometry(1, 1, 1, 48, 1, true);
      const hit = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
      this.addHandle('taper', TAPER_COLOR[which], [band], hit, { which, doubleSide: true });
    }
  }

  // ---------------------------------------------------------------------------
  // Per-frame update: place, orient, and size all handles for the current
  // selection, mode, and camera.
  // ---------------------------------------------------------------------------
  update() {
    const node = this.mode !== 'off' ? this.host.getNode() : null;
    if (!node) {
      this.root.visible = false;
      if (this.hovered) this.setHover(null);
      return;
    }
    this.root.visible = true;
    node.updateWorldMatrix(true, false);
    this._origin.setFromMatrixPosition(node.matrixWorld);
    const gscale = this.worldPerPixel(this._origin) * GIZMO_PX;

    if (this.hitCacheMode !== this.mode) {
      this.hitCacheMode = this.mode;
      for (const h of this.handles) h.container.visible = h.mode === this.mode;
      this.activeHits = this.handles.filter(h => h.container.visible).map(h => h.hit);
    }

    if (this.mode === 'move' || this.mode === 'scale') {
      // Arrows point along the frame axes the value lives in.
      const frame = this.mode === 'move' ? this.moveFrameObject(node) : node;
      for (const h of this.handles) {
        if (!h.container.visible || h.kind === 'uniform') continue;
        const dir = this.frameColumn(frame.matrixWorld, h.axis!, this._v1);
        const len = dir.length();
        if (len > 1e-9) dir.divideScalar(len); else dir.copy(UNIT[h.axis!]);
        h.container.position.copy(this._origin);
        h.container.quaternion.setFromUnitVectors(UNIT.y, dir);
        h.container.scale.setScalar(gscale);
      }
      if (this.uniformHandle.container.visible) {
        this.uniformHandle.container.position.copy(this._origin);
        this.uniformHandle.container.quaternion.identity();
        this.uniformHandle.container.scale.setScalar(gscale);
      }
    } else if (this.mode === 'rotate') {
      // Euler XYZ chain: X ring in frame space, Y ring after Rx, Z ring after Rx*Ry.
      const qF = this.rotationFrameQuat(node, this._q1);
      const rx = this.host.getValue('rot', 'x');
      const ry = this.host.getValue('rot', 'y');
      for (const h of this.handles) {
        if (!h.container.visible) continue;
        h.container.position.copy(this._origin);
        h.container.quaternion.copy(qF);
        if (h.axis === 'y') {
          this._q2.setFromAxisAngle(UNIT.x, rx);
          h.container.quaternion.multiply(this._q2);
        } else if (h.axis === 'z') {
          this._e1.set(rx, ry, 0, 'XYZ');
          this._q2.setFromEuler(this._e1);
          h.container.quaternion.multiply(this._q2);
        }
        h.container.quaternion.multiply(RING_BASE[h.axis!]);
        h.container.scale.setScalar(gscale);
      }
    } else if (this.mode === 'taper') {
      this.updateTaperHandles(node);
    }
  }

  private updateTaperHandles(node: THREE.Object3D) {
    // Bounding box of the taper target meshes, in node-local space. Recomputed
    // every frame because applyTaper mutates vertices in place (cheap: parts
    // are low-poly).
    this._m1.copy(node.matrixWorld).invert();
    this._box.makeEmpty();
    // node's ancestors are already fresh from update(); refresh descendants once.
    node.updateWorldMatrix(false, true);
    for (const mesh of this.host.getTaperMeshes()) {
      mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox) continue;
      this._box2.copy(mesh.geometry.boundingBox);
      this._m2.multiplyMatrices(this._m1, mesh.matrixWorld);
      this._box2.applyMatrix4(this._m2);
      this._box.union(this._box2);
    }
    const empty = this._box.isEmpty();
    const cx = empty ? 0 : (this._box.min.x + this._box.max.x) / 2;
    const cz = empty ? 0 : (this._box.min.z + this._box.max.z) / 2;
    const radiusLocal = empty ? 0.3 : Math.max(this._box.max.x - cx, this._box.max.z - cz, 0.02) * 1.3;
    const yTop = empty ? 0.3 : this._box.max.y;
    const yBot = empty ? -0.3 : this._box.min.y;
    node.getWorldQuaternion(this._q1);
    node.getWorldScale(this._v2);
    const wsXZ = Math.max(Math.abs(this._v2.x), Math.abs(this._v2.z), 1e-6);
    // The bbox is of the already-tapered geometry, so its XZ radius reflects
    // the widest end. Back out the pre-taper radius and give each ring its own
    // end's width so the bands hug the geometry and follow the drag.
    const tTop = this.host.getTaper('top');
    const tBot = this.host.getTaper('bottom');
    const r0 = radiusLocal / Math.max(tTop, tBot, MIN_TAPER);
    for (const h of this.handles) {
      if (!h.container.visible || h.kind !== 'taper') continue;
      this._v1.set(cx, h.which === 'top' ? yTop : yBot, cz);
      node.localToWorld(this._v1);
      const px = this.worldPerPixel(this._v1);
      const rEnd = r0 * Math.max(h.which === 'top' ? tTop : tBot, 0.12);
      const r = rEnd * wsXZ + px * 8;
      h.container.position.copy(this._v1);
      h.container.quaternion.copy(this._q1);
      h.container.scale.set(1, 1, 1);
      h.visuals[0].scale.set(r, px * 7, r);
      h.hit.scale.set(r, px * 44, r);
    }
  }

  // Frame whose axes/scale the position value lives in.
  private moveFrameObject(node: THREE.Object3D): THREE.Object3D {
    return this.host.getMode() === 'hierarchy' ? (node.parent ?? node) : node;
  }

  // Frame quaternion the Euler rotation is applied within.
  private rotationFrameQuat(node: THREE.Object3D, target: THREE.Quaternion): THREE.Quaternion {
    if (this.host.getMode() === 'hierarchy') {
      if (node.parent) node.parent.getWorldQuaternion(target);
      else target.identity();
    } else {
      node.getWorldQuaternion(target);
    }
    return target;
  }

  private frameColumn(m: THREE.Matrix4, axis: GizmoAxis, out: THREE.Vector3): THREE.Vector3 {
    return out.setFromMatrixColumn(m, AXIS_INDEX[axis]);
  }

  private worldPerPixel(at: THREE.Vector3): number {
    const dist = this.host.camera.position.distanceTo(at);
    const h = Math.max(1, this.host.domElement.clientHeight);
    return (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.host.camera.fov / 2))) / h;
  }

  // ---------------------------------------------------------------------------
  // Pointer interaction
  // ---------------------------------------------------------------------------
  private setRayFromEvent(e: PointerEvent) {
    const rect = this.host.domElement.getBoundingClientRect();
    this.ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.ndc, this.host.camera);
  }

  private pickHandle(e: PointerEvent): { handle: Handle; point: THREE.Vector3 } | null {
    this.setRayFromEvent(e);
    const hits = this.raycaster.intersectObjects(this.activeHits, false);
    if (!hits.length) return null;
    // The center uniform-scale cube wins over axis handles: a camera-aligned
    // axis shaft would otherwise always shadow it.
    const uni = hits.find(hit => (hit.object.userData.gizmoHandle as Handle).kind === 'uniform');
    const best = uni ?? hits[0];
    return { handle: best.object.userData.gizmoHandle as Handle, point: best.point };
  }

  private onPointerDown = (e: PointerEvent) => {
    if (this.drag) { e.stopPropagation(); return; } // ignore extra touches mid-drag
    if (!this.root.visible) return;
    if (e.target !== this.host.domElement) return;  // let HUD buttons work
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const picked = this.pickHandle(e);
    if (!picked) return;
    e.stopPropagation();
    e.preventDefault();
    try { this.host.domElement.setPointerCapture(e.pointerId); } catch {}
    this.host.beginStep();
    this.startDrag(picked.handle, picked.point, e);
  };

  private startDrag(handle: Handle, hitPoint: THREE.Vector3, e: PointerEvent) {
    const node = this.host.getNode()!;
    const base = { pointerId: e.pointerId, handle, startX: e.clientX, startY: e.clientY };

    if (handle.kind === 'move') {
      const axis = handle.axis!;
      const frame = this.moveFrameObject(node);
      const col = this.frameColumn(frame.matrixWorld, axis, this._v1);
      const axisLen = Math.max(col.length(), 1e-9);
      const lineDir = col.clone().divideScalar(axisLen);
      const lineOrigin = this._origin.clone();
      this.drag = {
        ...base, kind: 'move', axis, lineOrigin, lineDir, axisLen,
        t0: this.lineParamForRay(lineOrigin, lineDir),
        startVal: this.host.getValue('pos', axis),
      };
    } else if (handle.kind === 'rotate') {
      const axis = handle.axis!;
      const planeCenter = this._origin.clone();
      // Ring axis = container quaternion applied to the torus normal (+Z).
      const planeNormal = UNIT.z.clone().applyQuaternion(handle.container.quaternion).normalize();
      const prevV = new THREE.Vector3();
      let pixelDir: THREE.Vector2 | null = null;
      if (Math.abs(this.raycaster.ray.direction.dot(planeNormal)) < EDGE_ON_DOT) {
        // Ring nearly edge-on: fall back to dragging along the ring tangent in screen space.
        this._v1.copy(hitPoint).sub(planeCenter);
        this._v2.crossVectors(planeNormal, this._v1).normalize();
        pixelDir = this.screenDir(hitPoint, this._v2);
      } else {
        const p = this.intersectPlane(planeCenter, planeNormal, this._v1);
        prevV.copy(p ?? hitPoint).sub(planeCenter);
      }
      this.drag = {
        ...base, kind: 'rotate', axis, planeCenter, planeNormal, prevV, accum: 0,
        startVal: this.host.getValue('rot', axis), pixelDir,
      };
    } else if (handle.kind === 'scale') {
      const axis = handle.axis!;
      const col = this.frameColumn(node.matrixWorld, axis, this._v1);
      if (col.lengthSq() > 1e-18) col.normalize(); else col.copy(UNIT[axis]);
      this.drag = {
        ...base, kind: 'scale', axis,
        pixelDir: this.screenDir(this._origin, col),
        startVal: this.host.getValue('scl', axis),
      };
    } else if (handle.kind === 'uniform') {
      this.drag = {
        ...base, kind: 'uniform',
        startVals: {
          x: this.host.getValue('scl', 'x'),
          y: this.host.getValue('scl', 'y'),
          z: this.host.getValue('scl', 'z'),
        },
      };
    } else {
      const which = handle.which!;
      const planeCenter = handle.container.position.clone();
      const planeNormal = UNIT.y.clone().applyQuaternion(handle.container.quaternion).normalize();
      let d0 = 1;
      let pixelDir: THREE.Vector2 | null = null;
      const p = Math.abs(this.raycaster.ray.direction.dot(planeNormal)) >= EDGE_ON_DOT
        ? this.intersectPlane(planeCenter, planeNormal, this._v1) : null;
      if (p) {
        d0 = Math.max(p.distanceTo(planeCenter), 1e-6);
      } else {
        // Ring plane edge-on: fall back to dragging along the radial direction in screen space.
        this._v2.copy(hitPoint).sub(planeCenter);
        this._v2.addScaledVector(planeNormal, -this._v2.dot(planeNormal));
        if (this._v2.lengthSq() < 1e-12) this._v2.set(1, 0, 0);
        pixelDir = this.screenDir(hitPoint, this._v2.normalize());
      }
      this.drag = {
        ...base, kind: 'taper', which, planeCenter, planeNormal, d0,
        startVal: this.host.getTaper(which), pixelDir,
      };
    }

    this.overlayRect = this.host.overlayEl.getBoundingClientRect();
    this.host.domElement.style.cursor = 'grabbing';
    // Dim the other handles so the active one reads clearly.
    for (const h of this.handles) {
      if (h.container.visible && h !== handle) h.mat.opacity = 0.18;
    }
    handle.mat.color.copy(handle.hoverColor);
    handle.mat.opacity = 1;
    this.updateReadout(e);
  }

  private onPointerMove = (e: PointerEvent) => {
    if (this.drag) {
      if (e.pointerId !== this.drag.pointerId) return;
      e.preventDefault();
      this.applyDrag(e);
      this.updateReadout(e);
      return;
    }
    // Hover highlight (desktop): only when the pointer is over the canvas.
    if (!this.root.visible || e.target !== this.host.domElement) {
      if (this.hovered) this.setHover(null);
      return;
    }
    const picked = this.pickHandle(e);
    this.setHover(picked?.handle ?? null);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.drag || e.pointerId !== this.drag.pointerId) return;
    // Consume the drag-ending pointerup so the editor's click-to-select
    // handler (bubble phase on the canvas) never sees it.
    e.stopPropagation();
    this.endDrag();
  };

  private endDrag() {
    if (!this.drag) return;
    try { this.host.domElement.releasePointerCapture(this.drag.pointerId); } catch {}
    this.host.commitStep();
    const dragged = this.drag.handle;
    this.drag = null;
    for (const h of this.handles) h.mat.opacity = BASE_OPACITY;
    dragged.mat.color.copy(dragged.baseColor);
    this.host.domElement.style.cursor = '';
    this.readout.style.display = 'none';
  }

  private applyDrag(e: PointerEvent) {
    const d = this.drag!;
    this.setRayFromEvent(e);
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    if (d.kind === 'move') {
      const t = this.lineParamForRay(d.lineOrigin, d.lineDir);
      this.host.setValue('pos', d.axis, d.startVal + (t - d.t0) / d.axisLen);
    } else if (d.kind === 'rotate') {
      if (d.pixelDir) {
        this.host.setValue('rot', d.axis, d.startVal + (dx * d.pixelDir.x + dy * d.pixelDir.y) * ROT_RAD_PER_PX);
      } else {
        const p = this.intersectPlane(d.planeCenter, d.planeNormal, this._v1);
        if (!p) return;
        this._v2.copy(p).sub(d.planeCenter);
        if (this._v2.lengthSq() < 1e-12 || d.prevV.lengthSq() < 1e-12) return;
        this._v3.crossVectors(d.prevV, this._v2);
        const ang = Math.atan2(this._v3.dot(d.planeNormal), d.prevV.dot(this._v2));
        d.accum += ang;
        d.prevV.copy(this._v2);
        this.host.setValue('rot', d.axis, d.startVal + d.accum);
      }
    } else if (d.kind === 'scale') {
      const along = dx * d.pixelDir.x + dy * d.pixelDir.y;
      this.host.setValue('scl', d.axis, Math.max(0.01, d.startVal + along * SCALE_PER_PX));
    } else if (d.kind === 'uniform') {
      const f = Math.max(0.02, 1 + (dx - dy) * UNIFORM_PER_PX);
      for (const axis of AXES) {
        this.host.setValue('scl', axis, Math.max(0.01, d.startVals[axis] * f));
      }
    } else {
      let val: number;
      if (d.pixelDir) {
        val = d.startVal + (dx * d.pixelDir.x + dy * d.pixelDir.y) * TAPER_PER_PX;
      } else {
        const p = this.intersectPlane(d.planeCenter, d.planeNormal, this._v1);
        if (!p) return;
        val = Math.max(d.startVal, MIN_TAPER) * (p.distanceTo(d.planeCenter) / d.d0);
      }
      this.host.setTaper(d.which, Math.min(2, Math.max(0, val)));
    }
  }

  private updateReadout(e: PointerEvent) {
    const d = this.drag;
    if (!d) return;
    let text = '';
    if (d.kind === 'move') text = `pos ${d.axis.toUpperCase()}  ${this.host.getValue('pos', d.axis).toFixed(3)}`;
    else if (d.kind === 'rotate') {
      const v = this.host.getValue('rot', d.axis);
      text = `rot ${d.axis.toUpperCase()}  ${v.toFixed(3)} (${(v * 180 / Math.PI).toFixed(1)}°)`;
    } else if (d.kind === 'scale') text = `scale ${d.axis.toUpperCase()}  ${this.host.getValue('scl', d.axis).toFixed(3)}`;
    else if (d.kind === 'uniform') text = `scale  ${this.host.getValue('scl', 'x').toFixed(2)} / ${this.host.getValue('scl', 'y').toFixed(2)} / ${this.host.getValue('scl', 'z').toFixed(2)}`;
    else text = `taper ${d.which === 'top' ? 'T' : 'B'}  ${this.host.getTaper(d.which).toFixed(3)}`;
    const rect = this.overlayRect ?? this.host.overlayEl.getBoundingClientRect();
    this.readout.textContent = text;
    this.readout.style.display = 'block';
    this.readout.style.left = `${e.clientX - rect.left + 16}px`;
    this.readout.style.top = `${e.clientY - rect.top - 30}px`;
  }

  private setHover(h: Handle | null) {
    if (this.hovered === h) return;
    if (this.hovered) {
      this.hovered.mat.color.copy(this.hovered.baseColor);
      this.hovered.mat.opacity = BASE_OPACITY;
    }
    this.hovered = h;
    if (h) {
      h.mat.color.copy(h.hoverColor);
      h.mat.opacity = 1;
    }
    this.host.domElement.style.cursor = this.drag ? 'grabbing' : h ? 'grab' : '';
  }

  // Closest-point parameter along the line (origin + t*dir) for the current pointer ray.
  private lineParamForRay(origin: THREE.Vector3, dir: THREE.Vector3): number {
    const ray = this.raycaster.ray;
    this._v3.copy(origin).sub(ray.origin); // w0 = A - O
    const b = dir.dot(ray.direction);
    const denom = 1 - b * b;
    if (Math.abs(denom) < 1e-9) return 0; // line parallel to ray
    const d0 = dir.dot(this._v3);
    const ev = ray.direction.dot(this._v3);
    return (b * ev - d0) / denom;
  }

  private intersectPlane(center: THREE.Vector3, normal: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 | null {
    this._plane.setFromNormalAndCoplanarPoint(normal, center);
    return this.raycaster.ray.intersectPlane(this._plane, out);
  }

  // Screen-space direction (in client px) of a world-space direction at a world point.
  private screenDir(at: THREE.Vector3, worldDir: THREE.Vector3): THREE.Vector2 {
    const cam = this.host.camera;
    const rect = this.host.domElement.getBoundingClientRect();
    const a = this._v2.copy(at).project(cam);
    const b = this._v3.copy(at).addScaledVector(worldDir, 0.001 + at.distanceTo(cam.position) * 0.05).project(cam);
    const dir = new THREE.Vector2((b.x - a.x) * rect.width / 2, -(b.y - a.y) * rect.height / 2);
    if (dir.lengthSq() < 1e-12) dir.set(1, 0);
    else dir.normalize();
    return dir;
  }
}
