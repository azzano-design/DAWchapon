import * as THREE from "three";

import { getToy } from "../toyData.js";

export function makeToyMesh(toyIndex) {
  const toy = getToy(toyIndex);
  const material = new THREE.MeshStandardMaterial({ color: toy.color, roughness: 0.4, metalness: 0.1 });

  let geometry;
  switch (toy.shape) {
    case "icosahedron":
      geometry = new THREE.IcosahedronGeometry(1, 0);
      break;
    case "octahedron":
      geometry = new THREE.OctahedronGeometry(1.1, 0);
      break;
    case "box":
      geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
      break;
    default:
      geometry = new THREE.SphereGeometry(1, 16, 16);
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}
