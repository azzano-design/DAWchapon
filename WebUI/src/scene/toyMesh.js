import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { getToy } from "../toyData.js";

const KESHI_MODEL_URL = "/models/keshi.glb";

let keshiGeometry = null;
let keshiLoadPromise = null;

// The old placeholder shapes (icosahedron/sphere radius 1, etc.) were all
// roughly 2 units across — callers' own scale factors (the sidebar's 0.22,
// ToyIcon's 0.85) were tuned against that. Normalizing the model to this
// same height keeps it reading at about the same size through those same
// factors, rather than suddenly halving when the model's native units
// turn out to be different from the shapes it's replacing.
const NORMALIZED_HEIGHT = 2;

// Loads the one shared keshi.glb mesh and normalizes it in place (centered
// on its own origin, scaled to NORMALIZED_HEIGHT tall) so every toy can
// place and scale it the same way the old placeholder shapes were placed
// and scaled. Call this once, early, and await it before anything calls
// makeToyMesh() — that stays synchronous and assumes the geometry is
// already here, since it's invoked from places (mid-animation, a tiny icon
// viewport) that can't themselves await a load.
export function preloadKeshiModel() {
  if (!keshiLoadPromise) {
    keshiLoadPromise = new GLTFLoader()
      .loadAsync(KESHI_MODEL_URL)
      .then((gltf) => {
        let geometry = null;
        gltf.scene.traverse((child) => {
          if (child.isMesh && !geometry) geometry = child.geometry;
        });
        if (!geometry) throw new Error(`${KESHI_MODEL_URL} contains no mesh`);

        const box = new THREE.Box3().setFromBufferAttribute(geometry.attributes.position);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        geometry.translate(-center.x, -center.y, -center.z);
        const scale = NORMALIZED_HEIGHT / size.y;
        geometry.scale(scale, scale, scale);

        keshiGeometry = geometry;
      })
      .catch((error) => {
        // Reset so a later call (e.g. the next time a toy needs showing)
        // gets to retry instead of being stuck on this one rejection
        // forever — every caller here only reacts to success (.then()),
        // so without this, a failed load would otherwise just silently
        // mean no toy ever appears again, with no obvious cause in the UI.
        keshiLoadPromise = null;
        console.error(`Failed to load toy model from ${KESHI_MODEL_URL}:`, error);
        throw error;
      });
  }
  return keshiLoadPromise;
}

// A soft, semi-matte rubber/vinyl finish — classic for a keshi toy — rather
// than the glossy clearcoat plastic used on the machine itself. Low
// metalness and fairly high roughness for the mostly-matte base, with a
// soft (rough, not mirror-sharp) clearcoat layer standing in for rubber's
// subtle sheen.
function makeRubberMaterial(color) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.65,
    metalness: 0,
    clearcoat: 0.25,
    clearcoatRoughness: 0.45,
  });
}

// Every toy shares the one keshi geometry (same model for all of them, for
// now) — only the material differs, tinted per-toy with the same color the
// old placeholder shapes used.
export function makeToyMesh(toyIndex) {
  if (!keshiGeometry) {
    throw new Error("makeToyMesh() called before preloadKeshiModel() resolved");
  }

  const toy = getToy(toyIndex);
  const mesh = new THREE.Mesh(keshiGeometry, makeRubberMaterial(toy.color));
  mesh.castShadow = true;
  return mesh;
}
