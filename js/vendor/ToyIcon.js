// Vendored verbatim from WebUI/src/scene/ToyIcon.js so the landing page's
// toy icons render with the real model/materials without depending on
// files outside this folder. Re-copy from there if it changes.
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

import { makeToyMesh, preloadToyModels } from "./toyMesh.js";
import { VARIANTS } from "../toyData.js";

// A tiny self-contained Three.js viewport that renders just one toy mesh,
// slowly rotating — used so the reveal card shows the *actual* 3D toy
// (same geometry/color as the one that opens out of the capsule) instead
// of a flat stand-in icon.
export class ToyIcon {
  constructor(container, { spin = true } = {}) {
    this.container = container;
    this.spin = spin;
    this.mesh = null;
    this._disposed = false;
    // Bumped on every show()/clear() call, so a show() whose model load
    // was still pending when a later show() or clear() superseded it can
    // tell, once that load finally resolves, that it's no longer current
    // and should skip adding its mesh.
    this._showRequestId = 0;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10);
    this.camera.position.set(0, 0.3, 3.2);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    // Without this, Silver/Gold's metalness-1 finish (see toyMesh.js's
    // makeMetallicMaterial) has nothing to reflect and renders almost
    // black under just the two lights below — same RoomEnvironment the
    // main machine scene uses (see GachaponMachine._initScene), but at a
    // much higher intensity since there's no three-point studio setup
    // here to carry the brightness instead, just this one key light.
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.6;
    pmremGenerator.dispose();

    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(2, 3, 3);
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(key, ambient);

    this._onResize = () => this._handleResize();
    window.addEventListener("resize", this._onResize);
    this._handleResize();

    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  show(toyIndex, variant = VARIANTS.ORIGINAL) {
    this.clear();

    // This toy's model may still be loading — wait for it instead of
    // assuming it's ready. A later show() or clear() bumps
    // _showRequestId, so if that's happened by the time this resolves,
    // this call is stale and should do nothing.
    const requestId = ++this._showRequestId;
    preloadToyModels().then(() => {
      if (this._disposed || requestId !== this._showRequestId) return;

      this.mesh = makeToyMesh(toyIndex, variant);
      this.mesh.scale.setScalar(0.85);
      // Matches the slight turn spin would have settled into, so a
      // non-spinning icon doesn't just look like a flat front-on cutout.
      if (!this.spin) {
        this.mesh.rotation.y = Math.PI * 0.15;
        this.mesh.rotation.x = -0.05;
      }
      this.scene.add(this.mesh);
    });
  }

  clear() {
    this._showRequestId += 1;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }
  }

  _handleResize() {
    const size = Math.max(this.container.clientWidth, 1);
    this.camera.aspect = 1;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(size, size);
  }

  _animate(nowMs) {
    requestAnimationFrame(this._animate);
    const dt = this._lastFrameMs ? Math.min((nowMs - this._lastFrameMs) / 1000, 0.05) : 0;
    this._lastFrameMs = nowMs;

    if (this.mesh && this.spin) {
      this.mesh.rotation.y += dt * 0.8;
      this.mesh.rotation.x = Math.sin(nowMs * 0.0006) * 0.15;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this._disposed = true;
    window.removeEventListener("resize", this._onResize);
    this.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
