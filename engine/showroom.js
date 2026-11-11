import * as THREE from 'three';

export function buildShowroom(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1d2b33, roughness: 0.7 });
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x22323c, roughness: 0.85 });
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0xf2c14e });
  const threadMat = new THREE.MeshBasicMaterial({ color: 0xe7b866 });

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), floorMat);
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  for (let i = 0; i < 8; i++) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 12), wallMat);
    wall.position.set(-8 + i * 2.5, 2, -i * 6);
    group.add(wall);
  }

  const arrow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 3), arrowMat);
  arrow.rotation.x = -Math.PI / 2;
  arrow.position.set(0, 0.02, -3);
  group.add(arrow);

  const thread = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.05, 0),
    new THREE.Vector3(1, 0.05, -4),
    new THREE.Vector3(-1, 0.05, -8),
    new THREE.Vector3(0, 0.05, -12)
  ])), 8, 0.03, 8, false), threadMat);
  group.add(thread);

  const wolfgang = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 1.0, 4, 8), new THREE.MeshStandardMaterial({ color: 0xd8d8d8 }));
  wolfgang.position.set(0, 1.0, 0);
  group.add(wolfgang);

  const mino = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 1.8), new THREE.MeshStandardMaterial({ color: 0xb9a23a }));
  mino.position.set(0, 0.6, -18);
  group.add(mino);

  return { group, wolfgang, mino, update(timeMs, state) {
    wolfgang.position.z = -state.timeMs / 1000 * 1.2;
    mino.position.z = -18 - state.timeMs / 1000 * 0.4;
  } };
}
