import * as THREE from 'three';

export const LEVELS = [
  { name: 'Sample Yard', description: 'A neutral outdoor test space with modular floor plates, walls, crates, and beams.', pal: 0 },
  { name: 'Material Lab', description: 'A compact material preview stage with simple props for texture and lighting checks.', pal: 1 },
  { name: 'Breakaway Test', description: 'A small destructible-object sandbox made from duplicated blocks and panels.', pal: 2 },
];

type TextureSet = {
  map?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
  aoMap?: THREE.Texture;
  metalnessMap?: THREE.Texture;
};

export class EnvironmentManager {
  public environmentGroup = new THREE.Group();
  public texCloneCache = new Map<string, THREE.Texture>();

  private textureLoader = new THREE.TextureLoader();

  constructor(private scene: THREE.Scene) {
    this.environmentGroup.name = 'sample-environment';
    this.scene.add(this.environmentGroup);
  }

  setVisible(visible: boolean) {
    this.environmentGroup.visible = visible;
  }

  buildEnvironment(index = 0) {
    this.clear();
    this.environmentGroup.name = `sample-environment-${index}`;

    const level = ((index % LEVELS.length) + LEVELS.length) % LEVELS.length;
    if (level === 1) this.buildMaterialLab();
    else if (level === 2) this.buildBreakawayTest();
    else this.buildSampleYard();
  }

  clearEnvironment() {
    this.clear();
  }

  update(_time: number) {}

  editorMeshNearest(pos: THREE.Vector3, maxDist = 0.75): THREE.Mesh | null {
    const target = pos.clone();
    let best: THREE.Mesh | null = null;
    let bestDist = maxDist;
    const world = new THREE.Vector3();

    this.environmentGroup.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.getWorldPosition(world);
      const dist = world.distanceTo(target);
      if (dist < bestDist) {
        best = obj;
        bestDist = dist;
      }
    });

    return best;
  }

  applyEditorDuplicate(srcPos: THREE.Vector3, pos: number[], rot?: number[] | null, scl?: number[] | null): THREE.Mesh | null {
    const source = this.editorMeshNearest(srcPos, 1.5);
    if (!source) return null;
    const clone = source.clone();
    clone.geometry = source.geometry.clone();
    if (Array.isArray(source.material)) clone.material = source.material.map(mat => mat.clone());
    else clone.material = source.material.clone();
    clone.position.fromArray(pos);
    if (rot) clone.rotation.set(rot[0] ?? clone.rotation.x, rot[1] ?? clone.rotation.y, rot[2] ?? clone.rotation.z);
    if (scl) clone.scale.set(scl[0] ?? clone.scale.x, scl[1] ?? clone.scale.y, scl[2] ?? clone.scale.z);
    this.environmentGroup.add(clone);
    return clone;
  }

  applyEditorTransform(pos: THREE.Vector3, nextPos?: number[] | null, rot?: number[] | null, scl?: number[] | null): THREE.Mesh | null {
    const mesh = this.editorMeshNearest(pos);
    if (!mesh) return null;
    if (nextPos) mesh.position.set(nextPos[0] ?? mesh.position.x, nextPos[1] ?? mesh.position.y, nextPos[2] ?? mesh.position.z);
    if (rot) mesh.rotation.set(rot[0] ?? mesh.rotation.x, rot[1] ?? mesh.rotation.y, rot[2] ?? mesh.rotation.z);
    if (scl) mesh.scale.set(scl[0] ?? mesh.scale.x, scl[1] ?? mesh.scale.y, scl[2] ?? mesh.scale.z);
    return mesh;
  }

  applyEditorMaterial(pos: THREE.Vector3, color?: number | null, roughness?: number | null, metalness?: number | null, emissive?: number | null, emissiveIntensity?: number | null): THREE.Mesh | null {
    const mesh = this.editorMeshNearest(pos);
    if (!mesh) return null;
    const mat = this.ensureStandardMaterial(mesh);
    if (typeof color === 'number') mat.color.setHex(color);
    if (typeof roughness === 'number') mat.roughness = roughness;
    if (typeof metalness === 'number') mat.metalness = metalness;
    if (typeof emissive === 'number') mat.emissive.setHex(emissive);
    if (typeof emissiveIntensity === 'number') mat.emissiveIntensity = emissiveIntensity;
    mat.needsUpdate = true;
    return mesh;
  }

  applyEditorTexSet(pos: THREE.Vector3, loaderMethod: string, repeatU = 1, repeatV = 1, rotation = 0): THREE.Mesh | null {
    const mesh = this.editorMeshNearest(pos);
    if (!mesh) return null;
    const loader = (this as any)[loaderMethod];
    if (typeof loader !== 'function') return mesh;
    const set = loader.call(this) as TextureSet;
    const mat = this.ensureStandardMaterial(mesh);
    mat.map = this.configureTexture(set.map, repeatU, repeatV, rotation, true) || null;
    mat.normalMap = this.configureTexture(set.normalMap, repeatU, repeatV, rotation) || null;
    mat.roughnessMap = this.configureTexture(set.roughnessMap, repeatU, repeatV, rotation) || null;
    mat.aoMap = this.configureTexture(set.aoMap, repeatU, repeatV, rotation) || null;
    mat.metalnessMap = this.configureTexture(set.metalnessMap, repeatU, repeatV, rotation) || null;
    mat.needsUpdate = true;
    return mesh;
  }

  applyEditorUV(pos: THREE.Vector3, repeatU = 1, repeatV = 1, rotation = 0): THREE.Mesh | null {
    const mesh = this.editorMeshNearest(pos);
    if (!mesh) return null;
    const mat = this.ensureStandardMaterial(mesh);
    for (const tex of [mat.map, mat.normalMap, mat.roughnessMap, mat.aoMap, mat.metalnessMap]) {
      this.configureTexture(tex || undefined, repeatU, repeatV, rotation);
    }
    mat.needsUpdate = true;
    return mesh;
  }

  loadRock() { return this.loadSet('rock', 'webp'); }
  loadCastleWall() { return this.loadSet('castle_wall', 'webp', true); }
  loadWood() { return this.loadSet('wood', 'webp', true); }
  loadGravel() { return this.loadSet('gravel', 'webp', true); }
  loadMarble() { return this.loadSet('marble', 'jpg', true, 'png'); }
  loadCrackedGround() { return this.loadSet('cracked_ground', 'jpg', true, 'png'); }
  loadConcrete() { return this.loadSet('concrete', 'webp'); }
  loadShingle() { return this.loadSet('shingle', 'webp', true, undefined, false); }
  loadMetal() { return this.loadSet('metal', 'webp', false, undefined, true); }
  loadSilverMetal() { return this.loadSet('silver_metal', 'webp', true, undefined, true); }
  loadFabric() { return this.loadSet('fabric', 'webp'); }
  loadSkin() { return this.loadSet('skin', 'webp'); }
  loadChainmail() { return this.loadSet('chainmail', 'webp', true, undefined, true); }
  loadPlanks() { return this.loadSet('planks', 'jpg', true, 'png', true, false); }
  loadPlanksNails() { return this.loadSet('planks_nails', 'jpg', true, 'png', true); }
  loadBeard() { return this.loadSet('beard', 'jpg', true, 'png'); }
  loadFur() { return this.loadSet('fur', 'jpg', true, 'png'); }
  loadSnake() { return this.loadSet('snake', 'jpg', true, 'png'); }
  loadCroc() { return this.loadSet('croc', 'webp', true); }
  loadAluminum() { return this.loadSet('aluminum', 'jpg', true, 'png', true, false); }
  loadLava() { return this.loadSet('lava', 'jpg', true, 'webp'); }

  private clear() {
    while (this.environmentGroup.children.length) {
      const obj = this.environmentGroup.children.pop();
      if (!obj) continue;
      obj.traverse(child => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose());
          else child.material.dispose();
        }
      });
    }
  }

  private buildSampleYard() {
    const floorMat = this.makeTexturedMat(this.loadGravel(), 0xb8b7a0, 0.86, 0.0, 7, 5);
    const wallMat = this.makeTexturedMat(this.loadCastleWall(), 0x9aa0a2, 0.78, 0.0, 6, 2);
    const crateMat = this.makeTexturedMat(this.loadPlanks(), 0xc18a4d, 0.72, 0.0, 2.2, 2.2);
    const blockMat = this.makeTexturedMat(this.loadRock(), 0x8a9697, 0.82, 0.0, 1.6, 1.6);
    const beamMat = this.makeTexturedMat(this.loadWood(), 0x8b5a35, 0.68, 0.0, 5, 1);

    this.addFloor(floorMat, 15, 10);
    this.addBox('back-wall', [15, 2.2, 0.25], [0, 1.1, -5], wallMat);
    this.addBox('left-crate', [1.6, 1.2, 1.6], [-4.2, 0.6, -1.5], crateMat);
    this.addBox('right-stone-block', [1.2, 1.8, 1.2], [4.1, 0.9, -1.2], blockMat);
    this.addBox('wood-beam', [7, 0.18, 0.24], [0, 2.25, -2.8], beamMat, [0, 0.1, 0]);
    this.addLight('warm-key', [3.5, 5.5, 2.5], 0xfff0d8, 2.2);
    this.addLight('cool-fill', [-4, 3, 4], 0x9ab8ff, 0.8);
  }

  private buildMaterialLab() {
    this.addFloor(this.makeTexturedMat(this.loadConcrete(), 0x505762, 0.76, 0.0, 5, 4), 12, 8);
    const mats = [
      this.makeTexturedMat(this.loadSilverMetal(), 0xc6c6c6, 0.25, 0.75, 1.2, 1.2),
      this.makeTexturedMat(this.loadWood(), 0xa36b3b, 0.58, 0.0, 1.5, 1.5),
      this.makeTexturedMat(this.loadChainmail(), 0x657080, 0.38, 0.45, 2, 2),
      this.makeTexturedMat(this.loadFabric(), 0x8b7252, 0.9, 0.0, 2, 2),
    ];
    for (let i = 0; i < mats.length; i++) {
      this.addBox(`material-block-${i + 1}`, [1.25, 1.25, 1.25], [-3 + i * 2, 0.65, -1.2], mats[i], [0.05, i * 0.2, 0]);
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), mats[i].clone());
      sphere.name = `material-sphere-${i + 1}`;
      sphere.position.set(-3 + i * 2, 0.6, 1.3);
      sphere.castShadow = true;
      sphere.receiveShadow = true;
      this.environmentGroup.add(sphere);
    }
    this.addLight('lab-softbox', [0, 5.5, 2.8], 0xffffff, 3.0);
    this.addLight('lab-rim', [-3.5, 2.5, -2.5], 0x88aaff, 1.2);
  }

  private buildBreakawayTest() {
    this.addFloor(this.makeTexturedMat(this.loadCrackedGround(), 0x89877c, 0.84, 0.0, 6, 4), 14, 9);
    const matA = this.makeTexturedMat(this.loadConcrete(), 0x7e8790, 0.74, 0.0, 1.4, 1.4);
    const matB = this.makeTexturedMat(this.loadCastleWall(), 0x806047, 0.68, 0.0, 1.2, 1.2);
    for (let x = -2; x <= 2; x++) {
      for (let y = 0; y < 3; y++) {
        this.addBox(`break-block-${x}-${y}`, [0.85, 0.48, 0.55], [x * 0.9, 0.25 + y * 0.52, -1.7], (x + y) % 2 ? matA.clone() : matB.clone(), [0, 0, 0]);
      }
    }
    this.addBox('test-panel', [3.2, 1.2, 0.16], [0, 0.75, 1.5], this.makeTexturedMat(this.loadMetal(), 0x5a7282, 0.48, 0.35, 2, 1), [0, 0.15, 0]);
    this.addBox('loose-beam-a', [2.3, 0.18, 0.18], [-3.8, 0.55, 0.4], this.makeTexturedMat(this.loadWood(), 0x8a5935, 0.65, 0.0, 2.5, 1), [0.15, 0.55, 0.1]);
    this.addBox('loose-beam-b', [2.0, 0.18, 0.18], [3.8, 0.48, 0.6], this.makeTexturedMat(this.loadWood(), 0x8a5935, 0.65, 0.0, 2.2, 1), [0.08, -0.45, -0.08]);
    this.addLight('break-key', [2.8, 5.5, 3.2], 0xfff2dc, 2.5);
  }

  private addFloor(material: THREE.MeshStandardMaterial, width: number, depth: number) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, depth), material);
    floor.name = 'floor';
    floor.position.y = -0.04;
    floor.receiveShadow = true;
    this.environmentGroup.add(floor);
  }

  private addBox(name: string, size: number[], pos: number[], material: THREE.MeshStandardMaterial, rot: number[] = [0, 0, 0]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
    mesh.name = name;
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.set(rot[0], rot[1], rot[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.environmentGroup.add(mesh);
    return mesh;
  }

  private addLight(name: string, pos: number[], color: THREE.ColorRepresentation, intensity: number) {
    const light = new THREE.PointLight(color, intensity, 12, 2);
    light.name = name;
    light.position.set(pos[0], pos[1], pos[2]);
    light.castShadow = true;
    this.environmentGroup.add(light);
  }

  private makeMat(color: number, roughness: number, metalness: number) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness });
  }

  private makeTexturedMat(set: TextureSet, color: number, roughness: number, metalness: number, repeatU = 1, repeatV = 1) {
    const mat = this.makeMat(color, roughness, metalness);
    mat.map = this.configureTexture(set.map, repeatU, repeatV, 0, true) || null;
    mat.normalMap = this.configureTexture(set.normalMap, repeatU, repeatV, 0) || null;
    mat.roughnessMap = this.configureTexture(set.roughnessMap, repeatU, repeatV, 0) || null;
    mat.aoMap = this.configureTexture(set.aoMap, repeatU, repeatV, 0) || null;
    mat.metalnessMap = this.configureTexture(set.metalnessMap, repeatU, repeatV, 0) || null;
    mat.needsUpdate = true;
    return mat;
  }

  private ensureStandardMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial {
    const first = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (first instanceof THREE.MeshStandardMaterial) return first;
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75 });
    mesh.material = mat;
    return mat;
  }

  private configureTexture(tex: THREE.Texture | undefined, repeatU: number, repeatV: number, rotation: number, srgb = false) {
    if (!tex) return undefined;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatU, repeatV);
    tex.rotation = rotation;
    tex.center.set(0.5, 0.5);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  private tex(path: string, srgb = false) {
    const cacheKey = `${path}:${srgb ? 'srgb' : 'linear'}`;
    const cached = this.texCloneCache.get(cacheKey);
    if (cached) return cached.clone();
    const tex = this.textureLoader.load(path);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    this.texCloneCache.set(cacheKey, tex);
    return tex.clone();
  }

  private loadSet(base: string, ext: string, hasAo = false, normalExt?: string, hasMetal = false, hasRoughness = true): TextureSet {
    const nExt = normalExt || ext;
    return {
      map: this.tex(`/textures/${base}_color.${ext}`, true),
      normalMap: this.tex(`/textures/${base}_normal.${nExt}`),
      roughnessMap: hasRoughness ? this.tex(`/textures/${base}_roughness.${ext}`) : undefined,
      aoMap: hasAo ? this.tex(`/textures/${base}_ao.${ext}`) : undefined,
      metalnessMap: hasMetal ? this.tex(`/textures/${base}_metalness.${ext}`) : undefined,
    };
  }
}
