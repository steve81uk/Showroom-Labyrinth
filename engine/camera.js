import * as THREE from 'three';

const CAMERA_MODES = {
  MAP: { pos: [0, 28, 28], look: [0, 0, 0], fov: 55 },
  SCAN: { pos: [0, 12, 18], look: [0, 0, 0], fov: 50 },
  LOCK: { pos: [0, 2, 8], look: [0, 1.2, 0], fov: 40 },
  FPV: { pos: [0, 1.6, 0], look: [0, 1.4, -6], fov: 65 },
  CHASE: { pos: [0, 2.2, 7], look: [0, 1.2, -4], fov: 55 },
  CHASE_FAST: { pos: [0, 1.8, 5], look: [0, 1.2, -8], fov: 70 },
  CHASE_LOW: { pos: [0, 0.8, 4], look: [0, 1.0, -4], fov: 60 },
  CLOSE: { pos: [0, 1.4, 2.2], look: [0, 1.2, 0], fov: 45 },
  TOP_TIGHT: { pos: [0, 6, 2], look: [0, 0, 0], fov: 55 },
  MAP_ORBIT: { pos: [0, 18, 18], look: [0, 0, 0], fov: 60 },
  SCROLL: { pos: [0, 2, 10], look: [0, 1.2, -6], fov: 60 },
  EXT: { pos: [0, 6, 24], look: [0, 2, 0], fov: 50 }
};

export function applyCamera(camera, state, showroom) {
  const mode = CAMERA_MODES[state.cameraMode] || CAMERA_MODES.CHASE;
  const target = new THREE.Vector3(...mode.look);
  const pos = new THREE.Vector3(...mode.pos);
  if (state.cameraMode === 'MAP_ORBIT') {
    const angle = (state.timeMs / 1000) * 0.4;
    pos.set(Math.sin(angle) * 18, 18, Math.cos(angle) * 18);
  }
  camera.position.copy(pos);
  camera.lookAt(target);
  camera.fov = mode.fov;
  camera.updateProjectionMatrix();
}
