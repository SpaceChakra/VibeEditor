import * as THREE from 'three';
import { createPart } from './parts';

export function addHairMass(
    parent: THREE.Group,
    s: number,
    material: THREE.Material,
    radius: number,
    scale: [number, number, number],
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
): THREE.Group {
    const mass = createPart(new THREE.SphereGeometry(radius * s, 24, 14), material, 1.01);
    mass.scale.set(scale[0], scale[1], scale[2]);
    mass.position.set(position[0] * s, position[1] * s, position[2] * s);
    mass.rotation.set(rotation[0], rotation[1], rotation[2]);
    parent.add(mass);
    return mass;
}

export function addHairStrut(
    parent: THREE.Group,
    s: number,
    material: THREE.Material,
    from: [number, number, number],
    to: [number, number, number],
    radius: number,
): THREE.Group {
    const start = new THREE.Vector3(from[0] * s, from[1] * s, from[2] * s);
    const end = new THREE.Vector3(to[0] * s, to[1] * s, to[2] * s);
    const dir = end.clone().sub(start);
    const geo = new THREE.CapsuleGeometry(radius * s, Math.max(dir.length() - radius * 2 * s, 0.001), 4, 12);
    const strand = createPart(geo, material, 1.01);
    strand.position.copy(start).add(end).multiplyScalar(0.5);
    strand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    parent.add(strand);
    return strand;
}

export function addCurvedHair(
    parent: THREE.Group,
    s: number,
    material: THREE.Material,
    points: [number, number, number][],
    radius: number,
): THREE.Group {
    const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x * s, y * s, z * s)));
    const strand = createPart(new THREE.TubeGeometry(curve, 18, radius * s, 7, false), material, 1.01);
    parent.add(strand);
    return strand;
}
