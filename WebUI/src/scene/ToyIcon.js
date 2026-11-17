import * as THREE from "three";

import { makeToyMesh } from "./toyMesh.js";

// A tiny self-contained Three.js viewport that renders just one toy mesh,
// slowly rotating — used so the reveal card shows the *actual* 3D toy
// (same geometry/color as the one that opens out of the capsule) instead
// of a flat stand-in icon.
export class ToyIcon {
  constructor(container) {
    this.container = container;
    this.mesh = null;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 10);
    this.camera.position.set(0, 0.3, 3.2);
    this.camera.lookAt(0, 0, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

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

  show(toyIndex) {
    this.clear();
    this.mesh = makeToyMesh(toyIndex);
    this.mesh.scale.setScalar(0.85);
    this.scene.add(this.mesh);
  }

  clear() {
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

    if (this.mesh) {
      this.mesh.rotation.y += dt * 0.8;
      this.mesh.rotation.x = Math.sin(nowMs * 0.0006) * 0.15;
    }

    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
    this.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
