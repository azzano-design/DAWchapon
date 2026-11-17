// Vendored from plugin/WebUI/src/scene/toyMesh.js (see ToyIcon.js above for why),
// with one deliberate difference: the real plugin/WebUI/src/scene/toyMesh.js
// hardcodes KESHI_MODEL_URL as "/models/keshi.glb" — resolved against
// whatever the *web server's own root* is, not this file's location. That
// convention only happens to be correct there because Vite always serves
// its public/ dir at the site root in both dev and prod, and because the
// real plugin's own resourceProvider also treats itself as rooted at "/".
// Neither assumption holds once this file is just a plain static module in
// someone else's site, so this copy resolves the model path relative to
// its own file location instead — correct no matter what the surrounding
// page's server root turns out to be.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { getToy, VARIANTS } from "../toyData.js";

const KESHI_MODEL_URL = new URL("../../models/keshi.glb", import.meta.url).href;

// Fixed finish colors for the rare pulls — the toy itself actually turns
// this color (unlike the backlight pulse, which stays tinted to the toy's
// own original color regardless of variant; see GachaponMachine). Kept on
// the light side deliberately: at metalness 1 (see makeMetallicMaterial)
// this color IS the specular reflectance, with no diffuse term to fall
// back on, so a darker value here reads as a much darker toy under the
// scene's dim lighting rather than just a duller tint.
const SILVER_COLOR = 0xe8ebf2;
const GOLD_COLOR = 0xf5d479;

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

// A polished metal finish for Silver/Gold pulls — high metalness and low
// roughness (with the environment map doing most of the work to actually
// sell it) rather than the matte rubber/vinyl look of a normal pull.
function makeMetallicMaterial(color) {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.18,
    metalness: 1,
    clearcoat: 0.5,
    clearcoatRoughness: 0.12,
  });
}

// Every toy shares the one keshi geometry (same model for all of them, for
// now) — only the material differs: normal pulls tint it per-toy with the
// same color the old placeholder shapes used, while Silver/Gold pulls
// override that with a shiny metallic finish in a fixed silver/gold color
// instead (see SILVER_COLOR/GOLD_COLOR above).
export function makeToyMesh(toyIndex, variant = VARIANTS.ORIGINAL) {
  if (!keshiGeometry) {
    throw new Error("makeToyMesh() called before preloadKeshiModel() resolved");
  }

  let material;
  if (variant === VARIANTS.GOLD) {
    material = makeMetallicMaterial(GOLD_COLOR);
  } else if (variant === VARIANTS.SILVER) {
    material = makeMetallicMaterial(SILVER_COLOR);
  } else {
    material = makeRubberMaterial(getToy(toyIndex).color);
  }

  const mesh = new THREE.Mesh(keshiGeometry, material);
  mesh.castShadow = true;
  return mesh;
}
