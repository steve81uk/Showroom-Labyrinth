import * as THREE from 'three';
import { buildShowroom } from './showroom.js';
import { evaluateShotState } from './timeline.js';
import { applyCamera } from './camera.js';
import { updateHUD } from './hud.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1118);
scene.fog = new THREE.Fog(0x0b1118, 18, 90);

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 250);

const showroom = buildShowroom(scene);
const clock = new THREE.Clock();
let timeMs = 0;
let playing = false;
let lastFrame = -1;

const timelineUrl = new URL('../shots/showroom_labyrinth_shots.json', import.meta.url);
const timeline = await fetch(timelineUrl).then(r => r.json());

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function renderFrame(frame) {
  const fps = 30;
  timeMs = (frame / fps) * 1000;
  const state = evaluateShotState(timeMs, timeline);
  applyCamera(camera, state, showroom);
  updateHUD(document.getElementById('hud'), state);
  showroom.update(timeMs, state);
  renderer.render(scene, camera);
  document.getElementById('clock').textContent = `${Math.floor(timeMs / 60000)}:${String(Math.floor((timeMs % 60000) / 1000)).padStart(2, '0')}.${String(Math.floor(timeMs % 1000)).padStart(3, '0')}`;
  lastFrame = frame;
  return frame;
}

function animate() {
  requestAnimationFrame(animate);
  if (playing) {
    timeMs += clock.getDelta() * 1000;
    if (timeMs > 210070) timeMs = 0;
    const frame = Math.floor((timeMs / 1000) * 30);
    renderFrame(frame);
  }
}

window.renderFrame = renderFrame;
window.engineReady = true;
window.addEventListener('keydown', e => {
  if (e.code === 'Space') {
    playing = !playing;
    clock.getDelta();
  }
});

animate();
