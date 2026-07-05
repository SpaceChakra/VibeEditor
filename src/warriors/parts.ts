import * as THREE from 'three';

// ============================================================
// PBR TEXTURE LOADER
// Lazy-loads real PBR maps from public/textures/.
// TextureLoader.load() returns immediately with an empty texture
// that fills async — safe to reference in materials before first frame.
// ============================================================
const _loader = typeof document !== 'undefined' ? new THREE.TextureLoader() : null;

function loadSRGB(path: string): THREE.Texture | null {
    if (!_loader) return null;
    const t = _loader.load(path);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    return t;
}

function loadLinear(path: string): THREE.Texture | null {
    if (!_loader) return null;
    const t = _loader.load(path);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    return t;
}

interface PBRMaps { map?: THREE.Texture | null; normalMap?: THREE.Texture | null; roughnessMap?: THREE.Texture | null; metalnessMap?: THREE.Texture | null; aoMap?: THREE.Texture | null; }

let _skinMaps: PBRMaps | null = null;
let _fabricMaps: PBRMaps | null = null;
let _silverMaps: PBRMaps | null = null;
let _chainmailMaps: PBRMaps | null = null;
let _concreteMaps: PBRMaps | null = null;
let _rockMaps: PBRMaps | null = null;
let _woodMaps: PBRMaps | null = null;
let _crocMaps: PBRMaps | null = null;
let _shingleMaps: PBRMaps | null = null;
let _beardMaps:  PBRMaps | null = null;
let _furMaps:    PBRMaps | null = null;
let _marbleMaps:   PBRMaps | null = null;
let _aluminumMaps: PBRMaps | null = null;
let _snakeMaps:      PBRMaps | null = null;
let _planksNailsMaps: PBRMaps | null = null;

function skinMaps(): PBRMaps {
    if (!_skinMaps) _skinMaps = { normalMap: loadLinear('/textures/skin_normal.webp'), roughnessMap: loadLinear('/textures/skin_roughness.webp') };
    return _skinMaps;
}
function fabricMaps(): PBRMaps {
    if (!_fabricMaps) _fabricMaps = {
        map: loadSRGB('/textures/fabric_color.webp'),
        normalMap: loadLinear('/textures/fabric_normal.webp'),
        roughnessMap: loadLinear('/textures/fabric_roughness.webp'),
    };
    return _fabricMaps;
}
function silverMaps(): PBRMaps {
    if (!_silverMaps) {
        const map = loadSRGB('/textures/silver_metal_color.webp');
        if (map) { map.repeat.set(2.0, 2.0); }
        const normalMap = loadLinear('/textures/silver_metal_normal.webp');
        if (normalMap) { normalMap.repeat.set(2.0, 2.0); }
        const roughnessMap = loadLinear('/textures/silver_metal_roughness.webp');
        if (roughnessMap) { roughnessMap.repeat.set(2.0, 2.0); }
        const metalnessMap = loadLinear('/textures/silver_metal_metalness.webp');
        if (metalnessMap) { metalnessMap.repeat.set(2.0, 2.0); }
        const aoMap = loadLinear('/textures/silver_metal_ao.webp');
        if (aoMap) { aoMap.repeat.set(2.0, 2.0); }
        _silverMaps = { map, normalMap, roughnessMap, metalnessMap, aoMap };
    }
    return _silverMaps;
}

function chainmailMaps(): PBRMaps {
    if (!_chainmailMaps) {
        const normalMap = loadLinear('/textures/chainmail_normal.webp');
        if (normalMap) { normalMap.repeat.set(1.0, 1.0); }
        const roughnessMap = loadLinear('/textures/chainmail_roughness.webp');
        if (roughnessMap) { roughnessMap.repeat.set(1.0, 1.0); }
        const metalnessMap = loadLinear('/textures/chainmail_metalness.webp');
        if (metalnessMap) { metalnessMap.repeat.set(1.0, 1.0); }
        const aoMap = loadLinear('/textures/chainmail_ao.webp');
        if (aoMap) { aoMap.repeat.set(1.0, 1.0); }
        _chainmailMaps = { normalMap, roughnessMap, metalnessMap, aoMap };
    }
    return _chainmailMaps;
}

function crocMaps(): PBRMaps {
    if (!_crocMaps) {
        const normalMap = loadLinear('/textures/croc_normal.webp');
        if (normalMap) { normalMap.repeat.set(1.5, 1.5); }
        const roughnessMap = loadLinear('/textures/croc_roughness.webp');
        if (roughnessMap) { roughnessMap.repeat.set(1.5, 1.5); }
        _crocMaps = { normalMap, roughnessMap };
    }
    return _crocMaps;
}
function woodMaps(): PBRMaps {
    if (!_woodMaps) {
        const normalMap = loadLinear('/textures/wood_normal.webp');
        if (normalMap) { normalMap.repeat.set(2, 2); }
        const roughnessMap = loadLinear('/textures/wood_roughness.webp');
        if (roughnessMap) { roughnessMap.repeat.set(2, 2); }
        _woodMaps = { normalMap, roughnessMap };
    }
    return _woodMaps;
}
function concreteMaps(): PBRMaps {
    if (!_concreteMaps) {
        const map = loadSRGB('/textures/concrete_color.webp');
        if (map) { map.repeat.set(2, 2); }
        const normalMap = loadLinear('/textures/concrete_normal.webp');
        if (normalMap) { normalMap.repeat.set(2, 2); }
        const roughnessMap = loadLinear('/textures/concrete_roughness.webp');
        if (roughnessMap) { roughnessMap.repeat.set(2, 2); }
        _concreteMaps = { map, normalMap, roughnessMap };
    }
    return _concreteMaps;
}
function rockMaps(): PBRMaps {
    if (!_rockMaps) {
        const map = loadSRGB('/textures/rock_color.webp');
        if (map) { map.repeat.set(2, 2); }
        const normalMap = loadLinear('/textures/rock_normal.webp');
        if (normalMap) { normalMap.repeat.set(2, 2); }
        const roughnessMap = loadLinear('/textures/rock_roughness.webp');
        if (roughnessMap) { roughnessMap.repeat.set(2, 2); }
        _rockMaps = { map, normalMap, roughnessMap };
    }
    return _rockMaps;
}

// ============================================================
// GRADIENT MAP — the #1 fix for MeshToonMaterial quality
// A 5-stop ramp gives smooth cel-shading instead of binary on/off
// ============================================================
function buildGradientMap(stops: number[] = [0, 80, 140, 200, 255]): THREE.DataTexture {
    const data = new Uint8Array(stops);
    const tex = new THREE.DataTexture(data, stops.length, 1, THREE.RedFormat);
    tex.needsUpdate = true;
    return tex;
}

// Shared gradient maps — create once, reuse everywhere
export const GRADIENT_STANDARD = buildGradientMap([0, 80, 140, 200, 255]);
export const GRADIENT_METAL     = buildGradientMap([0, 60, 120, 190, 255]); // tighter highlights
export const GRADIENT_SKIN      = buildGradientMap([40, 110, 170, 210, 255]); // softer shadows

// ============================================================
// MATERIAL FACTORIES (Upgraded to PBR)
// ============================================================

/** Standard PBR material with fabric normal map for surface detail; color param tints the result */
export function makeToon(color: number, _gradient?: any, repeat = 4.0): THREE.MeshStandardMaterial {
    const { normalMap: rawNormal } = fabricMaps();
    let normalMap = rawNormal || undefined;
    if (normalMap && repeat !== 4.0) {
        normalMap = normalMap.clone();
        normalMap.repeat.set(repeat, repeat);
        normalMap.needsUpdate = true;
    } else if (normalMap) {
        normalMap.repeat.set(4, 4);
    }
    return new THREE.MeshStandardMaterial({
        color,
        normalMap,
        normalScale: new THREE.Vector2(0.5, 0.5),
        roughness: 0.85,
        metalness: 0.05
    });
}


/** Gold material: PBR gold using silver_metal maps for visible surface detail.
 *  repeat controls the UV tiling — smaller = larger grain (default 1.5 for chunky visible detail). */
export function makeGold(color: number, repeat = 1.5): THREE.MeshStandardMaterial {
    const { map, normalMap, roughnessMap, aoMap } = silverMaps();
    const scaleMap = (t: THREE.Texture | null | undefined) => {
        if (!t) return undefined;
        const c = t.clone(); c.repeat.set(repeat, repeat); c.needsUpdate = true; return c;
    };
    return new THREE.MeshStandardMaterial({
        color,
        map: scaleMap(map),
        normalMap: scaleMap(normalMap),
        normalScale: new THREE.Vector2(1.2, 1.2),
        roughnessMap: scaleMap(roughnessMap),
        aoMap: scaleMap(aoMap),
        aoMapIntensity: 0.5,
        roughness: 0.28,
        metalness: 0.82,
        envMapIntensity: 1.2
    });
}

/** Silver-metal PBR material — full map set (color + normal + roughness + metalness + AO). */
export function makeSilverArmor(color: number, repeat = 1.0, normalScale = 1.5, roughness = 0.65, metalness = 0.72, aoIntensity = 1.0): THREE.MeshStandardMaterial {
    const { map, normalMap, roughnessMap, metalnessMap, aoMap } = silverMaps();
    const sc = (t: THREE.Texture | null | undefined) => {
        if (!t) return undefined;
        const c = t.clone(); c.repeat.set(repeat, repeat); c.needsUpdate = true; return c;
    };
    return new THREE.MeshStandardMaterial({
        color,
        map: sc(map),
        normalMap: sc(normalMap),
        normalScale: new THREE.Vector2(normalScale, normalScale),
        roughnessMap: sc(roughnessMap),
        metalnessMap: sc(metalnessMap),
        aoMap: sc(aoMap),
        aoMapIntensity: aoIntensity,
        roughness,
        metalness,
        envMapIntensity: 0.5
    });
}

/** Chainmail (ring mail) material. Set vertRings=true to rotate UV 90° so rings run
 *  vertically instead of horizontally — useful for coifs/aventails on a cylinder. */
export function makeChainmail(color: number = 0x888899, repeat = 1.0, vertRings = false): THREE.MeshStandardMaterial {
    const { normalMap, roughnessMap, metalnessMap, aoMap } = chainmailMaps();
    const scaleMap = (t: THREE.Texture | null | undefined) => {
        if (!t) return undefined;
        const c = t.clone();
        c.repeat.set(repeat, repeat);
        if (vertRings) { c.rotation = Math.PI / 2; c.center.set(0.5, 0.5); }
        c.needsUpdate = true;
        return c;
    };
    return new THREE.MeshStandardMaterial({
        color,
        normalMap: scaleMap(normalMap),
        normalScale: new THREE.Vector2(1.3, 1.3),
        roughnessMap: scaleMap(roughnessMap),
        metalnessMap: scaleMap(metalnessMap),
        aoMap: scaleMap(aoMap),
        aoMapIntensity: 1.1,
        roughness: 0.52,
        metalness: 0.82,
        envMapIntensity: 0.55
    });
}

/** Fabric PBR material — color map + normal + roughness; supply repeatU/repeatV for UV scaling */
export function makeFabric(color: number, repeatU = 4.0, repeatV = 4.0): THREE.MeshStandardMaterial {
    const { map, normalMap, roughnessMap } = fabricMaps();
    const scaleMap = (t: THREE.Texture | null | undefined) => {
        if (!t) return undefined;
        const c = t.clone(); c.repeat.set(repeatU, repeatV); c.needsUpdate = true; return c;
    };
    return new THREE.MeshStandardMaterial({
        color, map: scaleMap(map), normalMap: scaleMap(normalMap), roughnessMap: scaleMap(roughnessMap),
        normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.85, metalness: 0.05
    });
}

/** Concrete skin for Robot — full PBR concrete texture, no tinting */
export function makeConcreteSkin(): THREE.MeshStandardMaterial {
    const { map, normalMap, roughnessMap } = concreteMaps();
    return new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: map || undefined,
        normalMap: normalMap || undefined,
        normalScale: new THREE.Vector2(1.0, 1.0),
        roughnessMap: roughnessMap || undefined,
        roughness: 0.9,
        metalness: 0.0
    });
}

/** Rock skin for Robot — PBR rock texture */
export function makeRockSkin(): THREE.MeshStandardMaterial {
    const { map, normalMap, roughnessMap } = rockMaps();
    return new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: map || undefined,
        normalMap: normalMap || undefined,
        normalScale: new THREE.Vector2(1.0, 1.0),
        roughnessMap: roughnessMap || undefined,
        roughness: 0.95,
        metalness: 0.0
    });
}

/** Crocodile-scale skin — normal/roughness maps give the scaly detail, color drives the hue */
export function makeCrocSkin(color: number): THREE.MeshStandardMaterial {
    const { normalMap, roughnessMap } = crocMaps();
    return new THREE.MeshStandardMaterial({
        color,
        normalMap: normalMap || undefined,
        normalScale: new THREE.Vector2(1.2, 1.2),
        roughnessMap: roughnessMap || undefined,
        roughness: 0.85,
        metalness: 0.0
    });
}

function snakeMaps(): PBRMaps {
    if (!_snakeMaps) {
        const map = loadSRGB('/textures/snake_color.jpg');
        if (map) { map.repeat.set(2.0, 2.0); }
        const normalMap = loadLinear('/textures/snake_normal.png');
        if (normalMap) { normalMap.repeat.set(2.0, 2.0); }
        const roughnessMap = loadLinear('/textures/snake_roughness.jpg');
        if (roughnessMap) { roughnessMap.repeat.set(2.0, 2.0); }
        const aoMap = loadLinear('/textures/snake_ao.jpg');
        if (aoMap) { aoMap.repeat.set(2.0, 2.0); }
        _snakeMaps = { map, normalMap, roughnessMap, aoMap };
    }
    return _snakeMaps;
}

export function makeSnakeSkin(color: number): THREE.MeshStandardMaterial {
    const { map, normalMap, roughnessMap, aoMap } = snakeMaps();
    return new THREE.MeshStandardMaterial({
        color,
        map: map || undefined,
        normalMap: normalMap || undefined,
        normalScale: new THREE.Vector2(1.5, 1.5),
        roughnessMap: roughnessMap || undefined,
        roughness: 0.7,
        aoMap: aoMap || undefined,
        metalness: 0.05
    });
}

function planksNailsMaps(): PBRMaps {
    if (!_planksNailsMaps) {
        const map = loadSRGB('/textures/planks_nails_color.jpg');
        if (map) { map.repeat.set(2.0, 2.0); }
        const normalMap = loadLinear('/textures/planks_nails_normal.png');
        if (normalMap) { normalMap.repeat.set(2.0, 2.0); }
        const roughnessMap = loadLinear('/textures/planks_nails_roughness.jpg');
        if (roughnessMap) { roughnessMap.repeat.set(2.0, 2.0); }
        const aoMap = loadLinear('/textures/planks_nails_ao.jpg');
        if (aoMap) { aoMap.repeat.set(2.0, 2.0); }
        const metalnessMap = loadLinear('/textures/planks_nails_metalness.jpg');
        if (metalnessMap) { metalnessMap.repeat.set(2.0, 2.0); }
        _planksNailsMaps = { map, normalMap, roughnessMap, aoMap, metalnessMap };
    }
    return _planksNailsMaps;
}

export function makePlanksNails(color: number): THREE.MeshStandardMaterial {
    const { map, normalMap, roughnessMap, aoMap, metalnessMap } = planksNailsMaps();
    return new THREE.MeshStandardMaterial({
        color,
        map: map || undefined,
        normalMap: normalMap || undefined,
        normalScale: new THREE.Vector2(1.4, 1.4),
        roughnessMap: roughnessMap || undefined,
        roughness: 0.8,
        aoMap: aoMap || undefined,
        metalnessMap: metalnessMap || undefined,
        metalness: 0.0
    });
}

function shingleMaps(): PBRMaps {
    if (!_shingleMaps) {
        const normalMap = loadLinear('/textures/shingle_normal.webp');
        if (normalMap) { normalMap.repeat.set(0.4, 0.4); }
        const roughnessMap = loadLinear('/textures/shingle_roughness.webp');
        if (roughnessMap) { roughnessMap.repeat.set(0.4, 0.4); }
        const aoMap = loadLinear('/textures/shingle_ao.webp');
        if (aoMap) { aoMap.repeat.set(0.4, 0.4); }
        _shingleMaps = { normalMap, roughnessMap, map: aoMap };
    }
    return _shingleMaps;
}
function beardMaps(): PBRMaps {
    if (!_beardMaps) {
        // No color map — hex color is multiplied by pure white so it renders accurately.
        // The normal map provides all directional strand definition.
        const normalMap = loadLinear('/textures/beard_normal.png');
        const roughnessMap = loadLinear('/textures/beard_roughness.jpg');
        const aoMap = loadLinear('/textures/beard_ao.jpg');
        _beardMaps = { normalMap, roughnessMap, aoMap };
    }
    return _beardMaps;
}

/** Hair/beard material. No color map so the hex tint renders at full accuracy — strand
 *  detail comes from the normal map. repeat=1–2 keeps strands large and readable. */
export function makeBeardMat(color: number, repeat = 1.5): THREE.MeshStandardMaterial {
    const { normalMap, roughnessMap, aoMap } = beardMaps();
    const s = (t: THREE.Texture | null | undefined) => {
        if (!t) return undefined;
        const c = t.clone(); c.repeat.set(repeat, repeat); c.needsUpdate = true; return c;
    };
    return new THREE.MeshStandardMaterial({
        color,
        normalMap: s(normalMap),
        normalScale: new THREE.Vector2(2.4, 2.4),
        roughnessMap: s(roughnessMap),
        aoMap: s(aoMap),
        aoMapIntensity: 1.6,
        roughness: 0.88,
        metalness: 0.0
    });
}

function furMaps(): PBRMaps {
    if (!_furMaps) {
        const normalMap = loadLinear('/textures/fur_normal.png');
        const roughnessMap = loadLinear('/textures/fur_roughness.jpg');
        const aoMap = loadLinear('/textures/fur_ao.jpg');
        _furMaps = { normalMap, roughnessMap, aoMap };
    }
    return _furMaps;
}

/** Clothing fur / animal pelt material. Color tints the base; repeat controls strand scale.
 *  Set vertStrands=true to rotate the UV 90° so strands run vertically (up/down) rather
 *  than horizontally (around the circumference) — best for boot trims, neck collars, etc. */
export function makeFurMat(color: number, repeat = 1.2, vertStrands = false): THREE.MeshStandardMaterial {
    const { normalMap, roughnessMap, aoMap } = furMaps();
    const sc = (t: THREE.Texture | null | undefined) => {
        if (!t) return undefined;
        const c = t.clone();
        c.repeat.set(repeat, repeat);
        if (vertStrands) { c.rotation = Math.PI / 2; c.center.set(0.5, 0.5); }
        c.needsUpdate = true;
        return c;
    };
    return new THREE.MeshStandardMaterial({
        color,
        normalMap: sc(normalMap),
        normalScale: new THREE.Vector2(2.4, 2.4),
        roughnessMap: sc(roughnessMap),
        aoMap: sc(aoMap),
        aoMapIntensity: 1.6,
        roughness: 0.92,
        metalness: 0.0
    });
}

function marbleMaps(): PBRMaps {
    if (!_marbleMaps) {
        const normalMap = loadLinear('/textures/marble_normal.png');
        const roughnessMap = loadLinear('/textures/marble_roughness.jpg');
        const aoMap = loadLinear('/textures/marble_ao.jpg');
        _marbleMaps = { normalMap, roughnessMap, aoMap };
    }
    return _marbleMaps;
}

/** Marble material — hex color tints the stone; veining and depth come from normal/AO maps. */
export function makeMarble(color: number, repeat = 1.5): THREE.MeshStandardMaterial {
    const { normalMap, roughnessMap, aoMap } = marbleMaps();
    const sc = (t: THREE.Texture | null | undefined) => {
        if (!t) return undefined;
        const c = t.clone(); c.repeat.set(repeat, repeat); c.needsUpdate = true; return c;
    };
    return new THREE.MeshStandardMaterial({
        color,
        normalMap: sc(normalMap),
        normalScale: new THREE.Vector2(1.4, 1.4),
        roughnessMap: sc(roughnessMap),
        aoMap: sc(aoMap),
        aoMapIntensity: 1.0,
        roughness: 0.35,
        metalness: 0.08
    });
}

function aluminumMaps(): PBRMaps {
    if (!_aluminumMaps) {
        const normalMap    = loadLinear('/textures/aluminum_normal.png');
        const roughnessMap = loadLinear('/textures/aluminum_roughness.jpg');
        const metalnessMap = loadLinear('/textures/aluminum_metalness.jpg');
        const aoMap        = loadLinear('/textures/aluminum_ao.jpg');
        _aluminumMaps = { normalMap, roughnessMap, metalnessMap, aoMap };
    }
    return _aluminumMaps;
}

/** Aluminum/brushed-metal material — hex tints the base, maps add scratched-metal detail. */
export function makeAluminum(color: number, repeat = 1.5): THREE.MeshStandardMaterial {
    const { normalMap, roughnessMap, metalnessMap, aoMap } = aluminumMaps();
    const sc = (t: THREE.Texture | null | undefined) => {
        if (!t) return undefined;
        const c = t.clone(); c.repeat.set(repeat, repeat); c.needsUpdate = true; return c;
    };
    return new THREE.MeshStandardMaterial({
        color,
        normalMap: sc(normalMap),
        normalScale: new THREE.Vector2(1.2, 1.2),
        roughnessMap: sc(roughnessMap),
        metalnessMap: sc(metalnessMap),
        aoMap: sc(aoMap),
        aoMapIntensity: 0.8,
        roughness: 0.25,
        metalness: 0.9,
        envMapIntensity: 1.0
    });
}

/** Lacquered shingle-plate armor — layered tile normal/roughness give the kozane plate look */
export function makeShingleArmor(color: number): THREE.MeshStandardMaterial {
    const { normalMap, roughnessMap, map: aoMap } = shingleMaps();
    return new THREE.MeshStandardMaterial({
        color,
        normalMap: normalMap || undefined,
        normalScale: new THREE.Vector2(1.4, 1.4),
        roughnessMap: roughnessMap || undefined,
        aoMap: aoMap || undefined,
        aoMapIntensity: 0.6,
        roughness: 0.55,
        metalness: 0.05,
    });
}

/** Wood material for character parts (peg legs, weapon hilts, gun stocks) */
export function makeWood(color: number, roughness = 0.82): THREE.MeshStandardMaterial {
    const { normalMap, roughnessMap } = woodMaps();
    return new THREE.MeshStandardMaterial({
        color,
        normalMap: normalMap || undefined,
        normalScale: new THREE.Vector2(0.9, 0.9),
        roughnessMap: roughnessMap || undefined,
        roughness,
        metalness: 0.0
    });
}

// ============================================================
// STRIPED TEXTURE FOR PIRATE PANTS
// ============================================================
function createStripedTexture(color1: number, color2: number, stripes: number = 8): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const c1 = new THREE.Color(color1);
    const c2 = new THREE.Color(color2);

    const stripeWidth = 256 / stripes;
    for (let i = 0; i < stripes; i++) {
        ctx.fillStyle = i % 2 === 0 ? '#' + c1.getHexString() : '#' + c2.getHexString();
        ctx.fillRect(i * stripeWidth, 0, stripeWidth, 256);
    }

    const imgData = ctx.getImageData(0, 0, 256, 256);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 20;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
        data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

export function makeStriped(color1: number, color2: number, stripes: number = 8): THREE.MeshStandardMaterial {
    const map = createStripedTexture(color1, color2, stripes);
    return new THREE.MeshStandardMaterial({
        map: map,
        roughness: 0.9,
        metalness: 0.1
    });
}

// ============================================================
// TARTAN / PLAID TEXTURE (e.g. a plaid kilt)
// Overlapping translucent bands on both axes create the woven
// cross-hatch, plus thin "overcheck" lines for the classic sett.
// ============================================================
function createTartanTexture(ground: number): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const hex = (c: number) => '#' + new THREE.Color(c).getHexString();
    ctx.fillStyle = hex(ground);
    ctx.fillRect(0, 0, 256, 256);

    // [color, centre, halfWidth] within each 128px repeat.
    const bands: [number, number, number][] = [
        [0x0b5d2e, 40, 17],  // green block
        [0x10204a, 98, 11],  // navy block
    ];
    const thinLines: [number, number][] = [
        [0xe8c84a, 18], // yellow overcheck
        [0xe9e4d6, 72], // white overcheck
        [0x1a1a1a, 120], // black guard line
    ];
    const drawAxis = (horizontal: boolean) => {
        for (let rep = 0; rep < 256; rep += 128) {
            ctx.globalAlpha = 0.5;
            for (const [color, c, hw] of bands) {
                ctx.fillStyle = hex(color);
                if (horizontal) ctx.fillRect(0, rep + c - hw, 256, hw * 2);
                else ctx.fillRect(rep + c - hw, 0, hw * 2, 256);
            }
            ctx.globalAlpha = 0.75;
            for (const [color, c] of thinLines) {
                ctx.fillStyle = hex(color);
                if (horizontal) ctx.fillRect(0, rep + c, 256, 3);
                else ctx.fillRect(rep + c, 0, 3, 256);
            }
        }
        ctx.globalAlpha = 1;
    };
    drawAxis(true);
    drawAxis(false);

    const imgData = ctx.getImageData(0, 0, 256, 256);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 16;
        data[i] = Math.max(0, Math.min(255, data[i] + noise));
        data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
        data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

/** Tartan/plaid material for a kilt. `ground` is the dominant base colour. */
export function makeTartan(ground: number = 0x8a0303, repeat: number = 3): THREE.MeshStandardMaterial {
    const map = createTartanTexture(ground);
    if (map) map.repeat.set(repeat, repeat);
    return new THREE.MeshStandardMaterial({
        color: map ? 0xffffff : ground,
        map: map || null,
        roughness: 0.92,
        metalness: 0.05,
    });
}

/** Skin material: PBR with real skin normal/roughness maps; color param sets the skin tone */
export function makeSkin(color: number, weathered: boolean = false, repeat = 1.5): THREE.MeshStandardMaterial {
    const { normalMap: rawNormal, roughnessMap: rawRoughness } = skinMaps();
    const scaleMap = (t: THREE.Texture | null | undefined) => {
        if (!t) return undefined;
        const c = t.clone();
        c.repeat.set(repeat, repeat);
        c.needsUpdate = true;
        return c;
    };
    return new THREE.MeshStandardMaterial({
        color,
        normalMap: scaleMap(rawNormal),
        normalScale: new THREE.Vector2(weathered ? 1.0 : 0.5, weathered ? 1.0 : 0.5),
        roughnessMap: scaleMap(rawRoughness),
        roughness: weathered ? 0.85 : 0.65,
        metalness: 0.02
    });
}

// ============================================================
// SHARED OUTLINE MATERIAL
// ============================================================
export const outlineMat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });

// ============================================================
// POLYGON OFFSET HELPER
// Used on armor layers to prevent Z-fighting with the base mesh
// Call with layerIndex 1, 2, 3… for successive armor layers
// ============================================================
export function applyArmorOffset(mat: THREE.Material, layerIndex: number): void {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -layerIndex;
    mat.polygonOffsetUnits  = -layerIndex;
}

// ============================================================
// createPart
// Outline scale is intentionally conservative (1.04 vs old 1.08)
// to avoid bloated silhouettes on organic geometry.
// ============================================================
export function createPart(geo: THREE.BufferGeometry, mat: THREE.Material, outlineScale: number = 1.04): THREE.Group {
    const group = new THREE.Group();
    const partMat = mat.clone();
    const main = new THREE.Mesh(geo, partMat);
    main.castShadow = true;
    main.receiveShadow = true;
    group.add(main);
    void outlineScale;
    return group;
}

// ============================================================
// MUSCLE GEOMETRY (Classic symmetric Lathe)
// ============================================================
export function createMuscleGeo(topR: number, midR: number, botR: number, height: number, segments: number = 96): THREE.LatheGeometry {
    const points = [];
    for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        const y = (t - 0.5) * height;
        const bulge = Math.sin(t * Math.PI);
        const r = t < 0.5
            ? botR + (midR - botR) * bulge
            : topR + (midR - topR) * bulge;
        points.push(new THREE.Vector2(r, y));
    }
    return new THREE.LatheGeometry(points, segments);
}

// ============================================================
// ADVANCED ANATOMICAL LEGS
// ============================================================

/** Thigh with defined Quadriceps (front) and Hamstrings (back) */
export function createAnatomicalThighGeo(s: number, segments: number = 96): THREE.LatheGeometry {
    const points = [];
    const h = 0.55 * s;
    const w = 0.86; // slimming factor — heroic, not inflated
    for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        const y = (t - 0.5) * h;
        // Profile that bulges more in the middle for quads/hams
        let r = 0;
        if (t < 0.1) r = (0.16 + t * 0.2) * s * w; // Ankle/Knee join
        else if (t < 0.6) r = (0.18 + Math.sin((t-0.1)*1.2*Math.PI) * 0.08) * s * w; // Muscle belly
        else r = (0.26 - (t-0.6) * 0.2) * s * w; // Taper to hip
        points.push(new THREE.Vector2(r, y));
    }
    const geo = new THREE.LatheGeometry(points, segments);
    // Non-uniform scale to make it deeper in Z (quads/hams) than X
    geo.scale(0.85, 1, 1.15);
    return geo;
}

/** Calf with defined Gastrocnemius and Soleus muscles tapering to Ankle */
export function createAnatomicalCalfGeo(s: number, segments: number = 96): THREE.LatheGeometry {
    const points = [];
    const h = 0.55 * s;
    const w = 0.86; // slimming factor — matches the thigh
    for (let i = 0; i <= 30; i++) {
        const t = i / 30;
        const y = (t - 0.5) * h;
        let r = 0;
        if (t < 0.2) r = (0.12 + t * 0.05) * s * w; // Ankle
        else if (t < 0.8) r = (0.13 + Math.sin((t-0.2)*1.2*Math.PI) * 0.09) * s * w; // Gastrocnemius bulge
        else r = (0.22 - (t-0.8) * 0.2) * s * w; // Knee join
        points.push(new THREE.Vector2(r, y));
    }
    const geo = new THREE.LatheGeometry(points, segments);
    // Scale deeper in Z for calf bulge
    geo.scale(0.9, 1, 1.25);
    return geo;
}

/** Detailed Foot with Heel, Arch, and Toes */
export function createAnatomicalFootGeo(s: number, isLeft: boolean = true): THREE.ExtrudeGeometry {
    // Foot profile from top-down or side view is hard for Lathe.
    // We use ExtrudeGeometry for a distinct anatomical shape.
    const shape = new THREE.Shape();
    const l = 0.45 * s;
    const heelW = 0.08 * s;
    const toeW = 0.08 * s;
    const side = isLeft ? 1 : -1;

    // Medial side with Arch (assume left foot, medial is +X)
    shape.moveTo(0, -l * 0.3); // Heel center
    shape.bezierCurveTo(heelW * side, -l * 0.3, heelW * side, -l * 0.1, heelW * 0.5 * side, 0); // Inner heel to arch
    shape.bezierCurveTo(heelW * 0.2 * side, l * 0.1, toeW * side, l * 0.2, toeW * side, l * 0.6); // Arch to ball of foot
    shape.lineTo(0, l * 0.7); // Toes front
    shape.lineTo(-toeW * side, l * 0.6); // Lateral toes
    shape.bezierCurveTo(-toeW * side, l * 0.2, -heelW * side, l * 0.1, -heelW * side, -l * 0.1); // Lateral side
    shape.lineTo(-heelW * side, -l * 0.3); // Outer heel
    shape.lineTo(0, -l * 0.3);

    const extrudeSettings = {
        depth: 0.15 * s,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 2,
        bevelSize: 0.02 * s,
        bevelThickness: 0.03 * s
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.rotateX(Math.PI / 2); // Lay flat
    geo.translate(0, 0, 0.12 * s); // Offset forward
    
    // Non-uniform scale to add "articulation" - higher at the ankle, lower at toes
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        // Taper height from ankle to toes
        const taper = 1.0 - (v.z / (0.7 * s)) * 0.6;
        v.y *= Math.max(0.4, taper);
        // Arch lift: Medial side mid-foot should be higher
        const isMedial = isLeft ? v.x > 0 : v.x < 0;
        if (isMedial && Math.abs(v.z) < 0.15 * s) {
            v.y += 0.03 * s;
        }
        pos.setXYZ(i, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
}

/** Joint "Sleeve" to bridge gaps in armor/limbs and hide internal seams */
export function createJointSleeveGeo(r: number, h: number, segments: number = 32): THREE.SphereGeometry {
    const geo = new THREE.SphereGeometry(r, segments, 16);
    // Squash into a capsule-like shape that fills the joint
    geo.scale(1, h / (r * 2), 1);
    return geo;
}

// ============================================================
// ANATOMICAL HAND
// Hand-local frame: wrist at origin, fingers extend -Y (down the arm),
// palm faces +Z, thumb on +X for the right hand / -X for the left.
// The weapon hilt runs along hand-local X through WEAPON_GRIP_OFFSET,
// so 'grip' pose fingers wrap around that axis.
// ============================================================

/** Where the weapon hilt crosses the hand, in hand-local units of s.
 *  Shared with BaseWarriorBuilder so fingers and hilt stay in sync. */
export const WEAPON_GRIP_OFFSET = { y: -0.10, z: 0.04 };
// Finger centerline radius around the hilt axis. Hilt boxes are ~0.045s
// half-diagonal, so 0.054 puts finger surfaces hugging the hilt faces.
const GRIP_WRAP_RADIUS = 0.054;

/** Capsule "bone" spanning two points, oriented via quaternion. */
function boneSeg(from: THREE.Vector3, to: THREE.Vector3, r: number, mat: THREE.Material): THREE.Group {
    const dir = to.clone().sub(from);
    const len = Math.max(dir.length() - r * 0.5, 0.001);
    const geo = new THREE.CapsuleGeometry(r, len, 4, 12);
    const part = createPart(geo, mat, 1.06);
    part.position.copy(from).add(to).multiplyScalar(0.5);
    part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return part;
}

/** Hand with palm, knuckles, four curled fingers and opposable thumb.
 *  pose 'fist': tight fist (natural off-hand in combat).
 *  pose 'grip': fingers wrapped around the weapon hilt axis. */
export function createAnatomicalHand(s: number, mat: THREE.Material, isLeft: boolean = false, pose: 'fist' | 'grip' = 'fist'): THREE.Group {
    const group = new THREE.Group();
    const tx = isLeft ? -1 : 1; // thumb side
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x * s, y * s, z * s);

    // 1. Palm: narrow at the wrist (origin), wide at the knuckle line.
    const w = 0.072 * s;     // half-width at knuckles
    const Lp = 0.125 * s;    // palm length, wrist -> knuckles
    const d = 0.05 * s;      // palm thickness
    const palmShape = new THREE.Shape();
    palmShape.moveTo(-w * 0.6, 0);       // wrist edge (narrow)
    palmShape.lineTo(w * 0.6, 0);
    palmShape.lineTo(w, -Lp);            // knuckle edge (wide)
    palmShape.lineTo(-w, -Lp);
    palmShape.lineTo(-w * 0.6, 0);

    const palmGeo = new THREE.ExtrudeGeometry(palmShape, {
        depth: d, bevelEnabled: true, bevelSegments: 2, steps: 1,
        bevelSize: 0.018 * s, bevelThickness: 0.015 * s
    });
    palmGeo.translate(0, 0, -d / 2);
    group.add(createPart(palmGeo, mat));

    // 2. Fingers: index sits on the thumb side, pinky opposite.
    const fingerX = [0.052, 0.018, -0.018, -0.052].map(v => v * tx * s);
    const fingerScale = [0.95, 1.0, 0.92, 0.78]; // index, middle, ring, pinky
    const knuckleY = -(Lp + 0.008 * s);

    for (let i = 0; i < 4; i++) {
        const f = fingerScale[i];
        const K = new THREE.Vector3(fingerX[i], knuckleY, 0.004 * s);

        // Knuckle bulge at the top of the finger
        const knuckle = createPart(new THREE.SphereGeometry(0.0155 * s * f, 12, 12), mat, 1.06);
        knuckle.position.copy(K);
        group.add(knuckle);

        if (pose === 'grip') {
            // Wrap around the hilt axis (hand-local X) through C.
            const C = new THREE.Vector3(fingerX[i], WEAPON_GRIP_OFFSET.y * s, WEAPON_GRIP_OFFSET.z * s);
            const rw = GRIP_WRAP_RADIUS * s;
            // Points on the wrap circle in the Y-Z plane: angle 0 = below hilt, 90 = palm side front
            const onCircle = (deg: number) => {
                const a = deg * Math.PI / 180;
                return new THREE.Vector3(C.x, C.y - Math.cos(a) * rw, C.z + Math.sin(a) * rw);
            };
            const p1 = onCircle(20);   // over the bottom of the hilt
            const p2 = onCircle(90);   // around the front face
            const p3 = onCircle(150);  // over the top
            const p4 = onCircle(172);  // tip curling back until it meets the palm
            group.add(boneSeg(K, p1, 0.0145 * s * f, mat));
            group.add(boneSeg(p1, p2, 0.0135 * s * f, mat));
            group.add(boneSeg(p2, p3, 0.0125 * s * f, mat));
            group.add(boneSeg(p3, p4, 0.0115 * s * f, mat));
        } else {
            // Tight fist: proximal flexes ~80 deg toward the palm, the rest
            // folds back up toward the palm heel (curl spiral).
            const d1 = new THREE.Vector3(0, -0.17, 0.985); // proximal direction
            const d2 = new THREE.Vector3(0, 0.94, 0.342);  // curl-back direction
            const L1 = 0.052 * s * f;
            const L2 = 0.05 * s * f;
            const p1 = K.clone().addScaledVector(d1, L1);
            const p2 = p1.clone().addScaledVector(d2, L2);
            group.add(boneSeg(K, p1, 0.0145 * s * f, mat));
            group.add(boneSeg(p1, p2, 0.0135 * s * f, mat));
        }
    }

    // 3. Thumb: opposes the fingers; wraps the hilt for 'grip',
    //    lies across the curled fingers for 'fist'.
    const cmc = V(tx * 0.062, -0.05, 0.022); // thumb base joint at the palm heel
    if (pose === 'grip') {
        const tMid = V(tx * 0.028, -0.082, 0.064);
        const tTip = V(-tx * 0.012, -0.106, 0.052);
        group.add(boneSeg(cmc, tMid, 0.019 * s, mat));
        group.add(boneSeg(tMid, tTip, 0.0165 * s, mat));
    } else {
        const tMid = V(tx * 0.04, -0.108, 0.056);
        const tTip = V(-tx * 0.016, -0.12, 0.06);
        group.add(boneSeg(cmc, tMid, 0.019 * s, mat));
        group.add(boneSeg(tMid, tTip, 0.0165 * s, mat));
    }

    return group;
}

// ============================================================
// ANATOMICAL HEAD
// Sculpted human skull: a displaced sphere shaped with a flattened
// face plane, tapered jaw, brow ridge, eye sockets, cheekbones and
// chin, plus separate eye/nose/lip/ear/eyebrow features.
// Local frame: origin at skull centre, +Z = face, crown ~ +0.145*s,
// chin ~ -0.15*s. `female` switches to a feminine bone structure.
// ============================================================
export function createAnatomicalHead(s: number, mat: THREE.Material, female: boolean = false): THREE.Group {
    const group = new THREE.Group();

    // Proportions (in units of s; sculpt happens at s=1, scaled at the end)
    const P = female ? {
        W: 0.102, H: 0.142, D: 0.117,            // skull half extents
        jawAmt: 0.46, jawPow: 1.3,               // jaw side taper
        browAmp: 0.005, cheekAmp: 0.010, cheekY: -0.012,
        chinAmp: 0.013, chinR: 0.042, gonialAmp: 0.0,
        eyeR: 0.0215, eyeX: 0.0445, eyeY: 0.004,
        noseBridgeR: 0.0098, noseTipR: 0.0105, alaR: 0.0066, alaX: 0.0105,
        ebrowR: 0.0034, ebrowLen: 0.042, ebrowTilt: 0.26, ebrowY: 0.027,
        lipUpR: 0.0068, lipLoR: 0.0085, lipW: 0.027, mouthY: -0.082,
        earS: 0.88,
    } : {
        W: 0.108, H: 0.145, D: 0.122,
        jawAmt: 0.36, jawPow: 1.4,
        browAmp: 0.009, cheekAmp: 0.008, cheekY: -0.020,
        chinAmp: 0.012, chinR: 0.050, gonialAmp: 0.007,
        eyeR: 0.0205, eyeX: 0.046, eyeY: 0.004,
        noseBridgeR: 0.0125, noseTipR: 0.0135, alaR: 0.0084, alaX: 0.0135,
        ebrowR: 0.0046, ebrowLen: 0.050, ebrowTilt: 0.30, ebrowY: 0.028,
        lipUpR: 0.0056, lipLoR: 0.0070, lipW: 0.031, mouthY: -0.085,
        earS: 1.0,
    };

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const smooth = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
    const gauss = (d: number, sigma: number) => Math.exp(-(d * d) / (2 * sigma * sigma));

    // --- SKULL + FACE (single sculpted mesh) ---
    const skullGeo = new THREE.SphereGeometry(1, 64, 48);
    const pos = skullGeo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const nx = v.x, ny = v.y, nz = v.z;     // unit-sphere direction
        let x = nx * P.W, y = ny * P.H, z = nz * P.D;

        // Jaw taper: lower head narrows toward the chin
        const jt = smooth((-ny - 0.1) / 0.9);
        x *= 1 - P.jawAmt * Math.pow(jt, P.jawPow);

        // Nape taper: back of the lower head pulls in toward the neck
        if (z < 0) z *= 1 - 0.42 * Math.pow(jt, 1.2);

        // Face plane flattening across the brow-to-mouth band
        if (z > 0) z *= 1 - 0.16 * gauss(y + 0.005, 0.075);

        // Mandible sweep: lower front face pushes forward toward the chin
        if (z > 0) z += 0.026 * smooth((-y - 0.06) / 0.08) * clamp01(nz * 1.6);

        // Local sculpt bumps -------------------------------------------------
        // Eye sockets (depressions)
        for (const sx of [-1, 1]) {
            const d = Math.hypot(x - sx * P.eyeX, y - P.eyeY);
            if (nz > 0.25) z -= 0.0095 * smooth(1 - d / 0.035);
        }
        // Brow ridge above the sockets
        if (nz > 0.25) {
            const bandX = smooth(1 - Math.abs(Math.abs(x) - 0.035) / 0.05);
            z += P.browAmp * gauss(y - 0.030, 0.016) * bandX;
        }
        // Cheekbones
        for (const sx of [-1, 1]) {
            const d = Math.hypot(x - sx * 0.063, y - P.cheekY, (z - 0.055) * 0.7);
            const f = smooth(1 - d / 0.052);
            x += sx * P.cheekAmp * 0.8 * f;
            z += P.cheekAmp * 0.55 * f;
        }
        // Chin ball
        {
            const d = Math.hypot(x, y + 0.138, (z - 0.062) * 0.8);
            const f = smooth(1 - d / P.chinR);
            z += P.chinAmp * f;
            y -= 0.006 * f;
        }
        // Gonial angle (squared male jaw corner)
        if (P.gonialAmp > 0) {
            for (const sx of [-1, 1]) {
                const d = Math.hypot(x - sx * 0.072, y + 0.062, (z - 0.012) * 0.8);
                x += sx * P.gonialAmp * smooth(1 - d / 0.04);
            }
        }
        // Slight temple flattening
        x *= 1 - 0.05 * gauss(y - 0.045, 0.05) * smooth((Math.abs(nx) - 0.7) / 0.3);

        pos.setXYZ(i, x, y, z);
    }
    skullGeo.scale(s, s, s);
    skullGeo.computeVertexNormals();
    group.add(createPart(skullGeo, mat));

    // --- NECK CONNECTOR ---
    const baseGeo = new THREE.CylinderGeometry(0.075 * s, 0.094 * s, 0.12 * s, 48);
    baseGeo.translate(0, -0.115 * s, -0.02 * s);
    group.add(createPart(baseGeo, mat));

    // Small helper: capsule strut between two points (plain part, with outline)
    const strut = (from: THREE.Vector3, to: THREE.Vector3, r: number, m: THREE.Material) => {
        const dir = to.clone().sub(from);
        const geo = new THREE.CapsuleGeometry(r, Math.max(dir.length() - r * 0.5, 0.001), 4, 12);
        const part = createPart(geo, m, 1.04);
        part.position.copy(from).add(to).multiplyScalar(0.5);
        part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        return part;
    };
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x * s, y * s, z * s);

    // --- EYES (plain meshes — no outline so they stay white) ---
    const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf2eee2, roughness: 0.35, metalness: 0.0 });
    const irisMat = new THREE.MeshStandardMaterial({ color: female ? 0x35543c : 0x3a2a18, roughness: 0.4, metalness: 0.0 });
    const pupilMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.3, metalness: 0.0 });
    for (const sx of [-1, 1]) {
        // Each eyeball cluster (sclera + iris + lid) goes in its own group so the
        // whole eye can be moved/scaled as a unit (exposed on the head's userData
        // as lEyeball/rEyeball for editor control). Eyebrow stays separate.
        const eyeball = new THREE.Group();
        group.add(eyeball);

        const cx = sx * P.eyeX * s, cy = P.eyeY * s, cz = 0.078 * s;
        const frontZ = cz + P.eyeR * s; // sclera front surface — iris/pupil must sit AHEAD of this

        const eye = new THREE.Mesh(new THREE.SphereGeometry(P.eyeR * s, 24, 18), scleraMat);
        eye.position.set(cx, cy, cz);
        eyeball.add(eye);

        // Iris: a coloured disc sitting just proud of the sclera so it actually shows.
        const irisGeo = new THREE.CylinderGeometry(0.0118 * s, 0.0118 * s, 0.0015 * s, 24);
        irisGeo.rotateX(Math.PI / 2);
        const iris = new THREE.Mesh(irisGeo, irisMat);
        iris.position.set(cx, cy, frontZ + 0.0006 * s);
        eyeball.add(iris);

        // Pupil: black disc centred on the iris, a touch more proud.
        const pupilGeo = new THREE.CylinderGeometry(0.0058 * s, 0.0058 * s, 0.0015 * s, 20);
        pupilGeo.rotateX(Math.PI / 2);
        const pupil = new THREE.Mesh(pupilGeo, pupilMat);
        pupil.position.set(cx, cy, frontZ + 0.0013 * s);
        eyeball.add(pupil);

        // Eyelids: skin-coloured caps framing the eye into an almond (upper + lower).
        const lidMat = (mat as THREE.MeshStandardMaterial).clone();
        const upperLid = new THREE.Mesh(
            new THREE.SphereGeometry(P.eyeR * 1.18 * s, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), lidMat);
        upperLid.position.set(cx, cy + 0.001 * s, cz);
        upperLid.rotation.x = -0.45;
        upperLid.castShadow = false;
        eyeball.add(upperLid);

        const lowerLid = new THREE.Mesh(
            new THREE.SphereGeometry(P.eyeR * 1.18 * s, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.4), lidMat);
        lowerLid.position.set(cx, cy - 0.001 * s, cz);
        lowerLid.rotation.x = Math.PI + 0.5;
        lowerLid.castShadow = false;
        eyeball.add(lowerLid);

        // sx = -1 sits at negative x = the rig's left side. Tag the group so the
        // feature can be re-found in whatever head ends up in the graph (builders
        // that clear+rebuild the head re-add a fresh anatomical head as a child).
        eyeball.userData.eyeSide = sx === -1 ? 'l' : 'r';
        group.userData[sx === -1 ? 'lEyeball' : 'rEyeball'] = eyeball;

        // Eyebrow — scowl: sits right on top of the eye and angles down
        // toward the nose so the fighters glower instead of looking worried
        const ebrowGeo = new THREE.CapsuleGeometry(P.ebrowR * s, P.ebrowLen * s, 4, 10);
        ebrowGeo.rotateZ(Math.PI / 2);
        const ebrowMat = new THREE.MeshStandardMaterial({ color: 0x2a1d12, roughness: 0.9, metalness: 0.0 });
        const ebrow = new THREE.Mesh(ebrowGeo, ebrowMat);
        ebrow.position.set(sx * (P.eyeX - 0.001) * s, P.ebrowY * s, 0.104 * s);
        ebrow.rotation.z = sx * P.ebrowTilt;    // inner end dips toward the nose
        ebrow.rotation.y = -sx * 0.30;          // wraps back toward the temple
        ebrow.userData.browSide = sx === -1 ? 'l' : 'r';
        group.userData[sx === -1 ? 'lEyebrow' : 'rEyebrow'] = ebrow;
        group.add(ebrow);
    }

    // --- NOSE (bridge from glabella to tip + alae) ---
    group.add(strut(V(0, 0.016, 0.098), V(0, -0.032, 0.116), P.noseBridgeR * s, mat));
    const noseTipGeo = new THREE.SphereGeometry(P.noseTipR * s, 16, 16);
    noseTipGeo.scale(1.05, 0.88, 1.0);
    const noseTip = createPart(noseTipGeo, mat, 1.04);
    noseTip.position.copy(V(0, -0.038, 0.118));
    group.add(noseTip);
    for (const sx of [-1, 1]) {
        const alaGeo = new THREE.SphereGeometry(P.alaR * s, 12, 12);
        alaGeo.scale(1, 0.8, 0.9);
        const ala = createPart(alaGeo, mat, 1.04);
        ala.position.copy(V(sx * P.alaX, -0.044, 0.108));
        group.add(ala);
    }

    // --- LIPS (tinted clones of the skin material, no outline) ---
    const lipMat = (mat as THREE.MeshStandardMaterial).clone();
    if (lipMat.color) lipMat.color.multiply(new THREE.Color(0.85, 0.60, 0.56));
    const lipsGroup = new THREE.Group();
    group.add(lipsGroup);
    lipsGroup.userData.isLips = true;
    group.userData.lips = lipsGroup;
    const lip = (r: number, len: number, y: number, z: number) => {
        const geo = new THREE.CapsuleGeometry(r * s, len * s, 4, 12);
        geo.rotateZ(Math.PI / 2);
        const m = new THREE.Mesh(geo, lipMat);
        m.position.set(0, y * s, z * s);
        m.rotation.x = 0.25;
        m.castShadow = false;
        return m;
    };
    lipsGroup.add(lip(P.lipUpR, P.lipW, P.mouthY + 0.006, 0.100));
    lipsGroup.add(lip(P.lipLoR, P.lipW * 0.78, P.mouthY - 0.0075, 0.099));

    // --- EARS ---
    for (const sx of [-1, 1]) {
        const earGeo = new THREE.SphereGeometry(0.033 * P.earS * s, 16, 16);
        earGeo.scale(0.45, 1.0, 0.62);
        const ear = createPart(earGeo, mat, 1.05);
        ear.position.set(sx * 0.106 * s, -0.006 * s, -0.008 * s);
        ear.rotation.y = sx * 0.18;
        ear.rotation.z = -sx * 0.08;
        group.add(ear);
        const lobeGeo = new THREE.SphereGeometry(0.012 * P.earS * s, 10, 10);
        lobeGeo.scale(0.5, 0.7, 0.55);
        const lobe = createPart(lobeGeo, mat, 1.05);
        lobe.position.set(sx * 0.104 * s, -0.034 * s, -0.002 * s);
        group.add(lobe);
    }

    return group;
}

// ============================================================
// ANATOMICAL TORSO
// ============================================================
export function createAnatomicalTorsoGeo(s: number, segments: number = 96, phiStart: number = 0, phiLength: number = Math.PI * 2): THREE.LatheGeometry {
    const points: THREE.Vector2[] = [];
    const h = 0.85 * s;
    for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const y = (t - 0.5) * h;
        let r = 0;
        if (t < 0.2) {
            r = (0.24 + t * 0.1) * s;
        } else if (t < 0.4) {
            r = (0.26 + (t - 0.2) * 0.4) * s;
        } else if (t < 0.85) {
            r = (0.34 + (t - 0.4) * 0.18) * s;
        } else {
            r = (0.421 - (t - 0.85) * 1.5) * s;
        }
        points.push(new THREE.Vector2(r, y));
    }
    const geo = new THREE.LatheGeometry(points, segments, phiStart, phiLength);
    geo.scale(0.95, 1, 0.64);
    return geo;
}

// ============================================================
// SHOULDER GEO
// ============================================================
export function createShoulderGeo(s: number, mat: THREE.Material): THREE.Group {
    const group = new THREE.Group();

    const deltoidMainGeo = new THREE.SphereGeometry(0.145 * s, 64, 64);
    deltoidMainGeo.scale(1, 1.35, 1.05);
    deltoidMainGeo.translate(0, -0.05 * s, 0);
    group.add(createPart(deltoidMainGeo, mat));

    const shoulderCapGeo = new THREE.SphereGeometry(0.115 * s, 64, 64, 0, Math.PI * 2, 0, Math.PI / 2);
    shoulderCapGeo.scale(1.2, 0.6, 1);
    shoulderCapGeo.translate(0, 0.05 * s, 0);
    group.add(createPart(shoulderCapGeo, mat));

    return group;
}

// ============================================================
// BLADE GEOMETRY
// Blades extend +Y from the base (y = 0) with the cutting edge
// along the width axis. 'double' edge = rhombic cross-section
// (sharp on both sides with a central midrib); 'single' edge =
// wedge cross-section, sharp on +X with a flat spine on -X.
// Positive `curve` bows the blade toward its edge. widthAxis 'z'
// rotates the finished blade so width/edge lie along +Z instead.
// ============================================================
export interface BladeOptions {
    edge?: 'double' | 'single';
    tip?: 'point' | 'clip' | 'leaf' | 'none';   // clip = katana-style kissaki (straight spine, edge sweeps up)
    tipLength?: number;                          // fraction of length used by the tip taper
    curve?: number;                              // sideways bow at the tip, world units
    baseTaper?: number;                          // width lost from base to tip start (0..1)
    widthAxis?: 'x' | 'z';
}

export function createBladeGeo(width: number, length: number, thickness: number, opts: BladeOptions = {}): THREE.BufferGeometry {
    const edge = opts.edge ?? 'double';
    const tip = opts.tip ?? 'point';
    const tipLen = opts.tipLength ?? (tip === 'clip' ? 0.12 : 0.18);
    const curve = opts.curve ?? 0;
    const baseTaper = opts.baseTaper ?? (edge === 'double' ? 0.18 : 0.08);
    const w2 = width / 2, t2 = thickness / 2;

    const cs = new THREE.Shape();
    if (edge === 'double') {
        cs.moveTo(-w2, 0); cs.lineTo(0, t2); cs.lineTo(w2, 0); cs.lineTo(0, -t2); cs.lineTo(-w2, 0);
    } else {
        cs.moveTo(-w2, t2); cs.lineTo(w2, 0); cs.lineTo(-w2, -t2); cs.lineTo(-w2, t2);
    }

    const geo = new THREE.ExtrudeGeometry(cs, { depth: length, steps: 24, bevelEnabled: false });

    const smooth = (v: number) => v * v * (3 - 2 * v);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const t = Math.max(0, Math.min(z / length, 1));

        // Tip factor: 1 along the body, falling to ~0 at the very tip
        let k = 1;
        if (tip !== 'none' && t > 1 - tipLen) k = Math.max((1 - t) / tipLen, 0.02);

        let wm: number;
        if (tip === 'leaf') {
            wm = Math.sin(Math.PI * (0.12 + 0.88 * t)); // narrow socket -> belly -> point
        } else {
            wm = 1 - baseTaper * t;
            if (tip === 'point') wm *= smooth(k);
        }

        let nx: number;
        if (edge === 'single' && tip === 'clip' && k < 1) {
            // Taper around the spine: spine stays straight, edge sweeps up to meet it
            nx = wm * (-w2 + (x + w2) * smooth(k));
        } else {
            nx = x * wm;
        }
        nx += curve * t * t;

        const ny = y * (1 - 0.3 * t) * (0.3 + 0.7 * k); // distal thinning
        pos.setXYZ(i, nx, ny, z);
    }

    geo.rotateX(-Math.PI / 2);                       // length now along +Y
    if (opts.widthAxis === 'z') geo.rotateY(-Math.PI / 2); // edge +X -> +Z
    geo.computeVertexNormals();
    return geo;
}

/** Extrude a flat silhouette (axe head, shard) and sharpen it into a
 *  wedge: full thickness near the spine, pinching toward the cutting
 *  edge. `edgeDir` points from spine toward the edge in shape space;
 *  thickness tapers linearly between projections `sharpFrom` and
 *  `sharpTo` along that direction. Result is centered on z. */
export function createSharpExtrude(shape: THREE.Shape, thickness: number, edgeDir: { x: number; y: number }, sharpFrom: number, sharpTo: number, minThickness: number = 0.1): THREE.BufferGeometry {
    const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, steps: 1, bevelEnabled: false });
    geo.translate(0, 0, -thickness / 2);
    const len = Math.hypot(edgeDir.x, edgeDir.y) || 1;
    const ex = edgeDir.x / len, ey = edgeDir.y / len;
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const p = pos.getX(i) * ex + pos.getY(i) * ey;
        const t = Math.max(0, Math.min((p - sharpFrom) / (sharpTo - sharpFrom), 1));
        pos.setZ(i, pos.getZ(i) * (1 - (1 - minThickness) * t));
    }
    geo.computeVertexNormals();
    return geo;
}

// ============================================================
// BEVELED BOX GEOMETRY (For Weapons and Hard Surfaces)
// ============================================================
export function createBeveledBox(width: number, height: number, depth: number): THREE.ExtrudeGeometry {
    const shape = new THREE.Shape();
    const w = width / 2;
    const h = height / 2;
    shape.moveTo(-w, -h);
    shape.lineTo(w, -h);
    shape.lineTo(w, h);
    shape.lineTo(-w, h);
    shape.lineTo(-w, -h);

    const minDim = Math.min(width, height, depth);
    const bevel = minDim * 0.1;
    const d = Math.max(0.001, depth - (bevel * 2));

    const extrudeSettings = {
        depth: d,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: bevel,
        bevelThickness: bevel
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.translate(0, 0, -d / 2);
    return geo;
}

// ============================================================
// Character-editor export helpers
// ------------------------------------------------------------
// These mirror the live transforms the character editor applies, and are emitted
// by its "Generate code" export (see editor.ts generateExport()) so the pasted
// builder code stays one line per adjustment instead of an inline loop. Keeping
// the logic here means the editor's load-time round-trip (which reads back the
// userData markers below) and the generated builders share a single source of
// truth.
// ============================================================

/** Direct children of a part that are themselves rig joints — passed so the
 *  helpers only touch the part's own meshes, never attached limbs. */
type RigJoints = THREE.Object3D[];

/**
 * Apply a vertical (Y-axis) XZ taper to a part's own meshes, matching the
 * editor's taper sliders. `top`/`bot` are the XZ scale factors at the top and
 * bottom of each mesh's local Y extent (1 = unchanged); vertices in between are
 * interpolated. Direct-child nodes in `joints` are skipped.
 *
 * Records the factors on `node.userData.editorTaper{Top,Bot}` so the editor can
 * read them back and reconstruct the slider state on the next round-trip.
 */
export function taperMeshesY(node: THREE.Object3D, top: number, bot: number, joints: RigJoints = []): void {
    node.children.forEach(c => {
        if (joints.includes(c) || !(c instanceof THREE.Mesh)) return;
        c.geometry = c.geometry.clone();
        const pos = c.geometry.attributes.position, arr = pos.array as Float32Array;
        let yMin = Infinity, yMax = -Infinity;
        for (let i = 1; i < arr.length; i += 3) { if (arr[i] < yMin) yMin = arr[i]; if (arr[i] > yMax) yMax = arr[i]; }
        const h = yMax - yMin;
        for (let i = 0; i < arr.length; i += 3) {
            const t = h > 1e-6 ? (arr[i + 1] - yMin) / h : 0.5;
            const sc = bot + t * (top - bot);
            arr[i] *= sc; arr[i + 2] *= sc;
        }
        pos.needsUpdate = true;
        c.geometry.computeVertexNormals();
    });
    node.userData.editorTaperTop = top;
    node.userData.editorTaperBot = bot;
}

/** Position/rotation/scale tweak for {@link adjustPartMeshes}. Only the provided
 *  axes are touched; `pos`/`rot` are additive, `scl` is multiplicative. */
export interface PartMeshAdjust {
    pos?: [number, number, number];
    rot?: [number, number, number];
    scl?: [number, number, number];
}

/**
 * Nudge a part's own meshes without disturbing attached sub-joints — the export
 * counterpart of the editor's "part-only" pos/rot/scale adjustment. Position and
 * rotation are added to each mesh's current transform; scale is multiplied.
 * Direct children in `joints` are skipped.
 */
export function adjustPartMeshes(node: THREE.Object3D, adjust: PartMeshAdjust, joints: RigJoints = []): void {
    const { pos, rot, scl } = adjust;
    node.children.forEach(c => {
        if (joints.includes(c)) return;
        if (pos) c.position.add(new THREE.Vector3(pos[0], pos[1], pos[2]));
        if (rot) c.rotation.set(c.rotation.x + rot[0], c.rotation.y + rot[1], c.rotation.z + rot[2]);
        if (scl) c.scale.set(c.scale.x * scl[0], c.scale.y * scl[1], c.scale.z * scl[2]);
    });
}
