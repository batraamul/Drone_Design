/**
 * 3D conceptual model viewer (Build 2), built with the vendored three.js (vendor/three).
 *
 * The model is generated from computeGeometry() output: the same numbers that drive
 * the 2D drawings and the geometry review. It is a conceptual shape (flat lifting
 * surfaces, cylinders, rotor discs), not a CAD model. three.js is loaded on demand;
 * when WebGL is unavailable the caller shows the 2D drawings instead.
 *
 * Axes: body x forward, y right, z up  →  three.js X = y, Y = z, Z = −x.
 */
let threePromise = null;

function loadThree() {
  threePromise ??= Promise.all([import('../../vendor/three/three.module.min.js'), import('../../vendor/three/OrbitControls.js')]).then(([THREE, controls]) => ({ THREE, OrbitControls: controls.OrbitControls }));
  return threePromise;
}

export function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

const v3 = (THREE, p) => new THREE.Vector3(p.y, p.z, -p.x);

function readColour(element, name, fallback) {
  const value = getComputedStyle(element).getPropertyValue(name).trim();
  return value || fallback;
}

function buildModel(THREE, geo, colours) {
  const group = new THREE.Group();
  const mat = {
    body: new THREE.MeshStandardMaterial({ color: colours.body, roughness: 0.7, metalness: 0.1 }),
    surface: new THREE.MeshStandardMaterial({ color: colours.surface, roughness: 0.6, metalness: 0.05, side: THREE.DoubleSide }),
    arm: new THREE.MeshStandardMaterial({ color: colours.arm, roughness: 0.6 }),
    motor: new THREE.MeshStandardMaterial({ color: colours.motor, roughness: 0.4, metalness: 0.4 }),
    lift: new THREE.MeshBasicMaterial({ color: colours.rotor, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
    cruise: new THREE.MeshBasicMaterial({ color: colours.cruise, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
  };
  const size = Math.max(geo.extents.x[1] - geo.extents.x[0], geo.extents.y[1] - geo.extents.y[0]);

  const rod = (from, to, radius, material) => {
    const a = v3(THREE, from);
    const b = v3(THREE, to);
    const length = a.distanceTo(b);
    if (length < 1e-9) return null;
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12), material);
    mesh.position.copy(a.clone().add(b).multiplyScalar(0.5));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  };

  const panel = (points) => {
    const g = new THREE.BufferGeometry();
    const [p0, p1, p2, p3] = points.map((p) => v3(THREE, p));
    g.setFromPoints([p0, p1, p2, p0, p2, p3]);
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat.surface);
  };

  const rotor = (r) => {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r.diameter / 2, 48), r.role === 'cruise' ? mat.cruise : mat.lift);
    disc.position.copy(v3(THREE, r));
    if (r.axis === 'z') disc.rotation.x = -Math.PI / 2;
    else disc.rotation.y = Math.PI / 2;
    const hubR = Math.max(0.004, r.diameter * 0.06);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(hubR, hubR, hubR * 1.6, 16), mat.motor);
    hub.position.copy(v3(THREE, r));
    if (r.axis === 'x') hub.rotation.x = Math.PI / 2;
    group.add(disc, hub);
  };

  if (geo.family === 'multirotor') {
    const { diameter, height } = geo.body;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(diameter / 2, diameter / 2, height, 32), mat.body);
    group.add(body);
    const armR = Math.max(0.003, size * 0.012);
    for (const arm of geo.arms) {
      const m = rod(arm.from, arm.to, armR, mat.arm);
      if (m) group.add(m);
    }
    geo.rotors.forEach(rotor);
    // Masts linking coaxial rotors to their arm.
    for (const r of geo.rotors) {
      const m = rod({ x: r.x, y: r.y, z: 0 }, r, armR * 0.6, mat.motor);
      if (m) group.add(m);
    }
  } else {
    const { wing, fuselage, tail } = geo;
    const fr = fuselage.diameter / 2;
    const fus = new THREE.Mesh(new THREE.CapsuleGeometry(fr, Math.max(fuselage.length - 2 * fr, 0.001), 8, 20), mat.body);
    fus.rotation.x = Math.PI / 2;
    fus.position.copy(v3(THREE, { x: -fuselage.length / 2, y: 0, z: 0 }));
    group.add(fus);
    const half = wing.span / 2;
    for (const side of [1, -1]) {
      const tipLE = wing.xRootLE - half * Math.tan(wing.sweepLE);
      const zt = half * Math.tan(wing.dihedral);
      group.add(panel([{ x: wing.xRootLE, y: 0, z: 0 }, { x: tipLE, y: side * half, z: zt }, { x: tipLE - wing.tipChord, y: side * half, z: zt }, { x: wing.xRootLE - wing.rootChord, y: 0, z: 0 }]));
    }
    if (tail.type === 'conventional' || tail.type === 'v') {
      const th = tail.span / 2;
      const dz = tail.type === 'v' ? th * Math.tan(tail.angle) : 0;
      for (const side of [1, -1]) group.add(panel([{ x: tail.xLE, y: 0, z: 0 }, { x: tail.xLE, y: side * th, z: dz }, { x: tail.xLE - tail.chord, y: side * th, z: dz }, { x: tail.xLE - tail.chord, y: 0, z: 0 }]));
      if (tail.type === 'conventional') {
        group.add(panel([{ x: tail.xLEv, y: 0, z: 0 }, { x: tail.xLEv - tail.vChord * 0.35, y: 0, z: tail.vHeight }, { x: tail.xLEv - tail.vChord, y: 0, z: tail.vHeight }, { x: tail.xLEv - tail.vChord, y: 0, z: 0 }]));
      }
      const tailEnd = tail.xLE - tail.chord;
      if (-tailEnd > fuselage.length) {
        const boom = rod({ x: -fuselage.length + fr, y: 0, z: 0 }, { x: tailEnd, y: 0, z: 0 }, Math.max(0.004, fr * 0.3), mat.arm);
        if (boom) group.add(boom);
      }
    }
    const armR = Math.max(0.004, size * 0.008);
    for (const b of geo.booms ?? []) {
      const m = rod(b.from, b.to, armR, mat.arm);
      if (m) group.add(m);
    }
    geo.rotors.forEach(rotor);
  }
  return { group, materials: Object.values(mat) };
}

function disposeGroup(group) {
  group.traverse((object) => object.geometry?.dispose());
}

/**
 * Create a viewer inside `container`.
 * @returns {Promise<{update(geo), setView(name), destroy(), revision: number}>}
 */
export async function createViewer(container) {
  const { THREE, OrbitControls } = await loadThree();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.className = 'view3d__canvas';
  renderer.domElement.setAttribute('role', 'img');
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.001, 1000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.screenSpacePanning = true;

  let model = null;
  let grid = null;
  let radius = 1;
  let centre = new THREE.Vector3();
  let frame = 0;
  const render = () => {
    frame = 0;
    renderer.render(scene, camera);
  };
  const requestRender = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };
  controls.addEventListener('change', requestRender);

  const resize = () => {
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 380;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestRender();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);

  const VIEWS = {
    iso: new THREE.Vector3(1, 0.75, 1.1),
    top: new THREE.Vector3(0, 1, 0.0001),
    front: new THREE.Vector3(0, 0, -1),
    side: new THREE.Vector3(-1, 0, 0),
  };
  let currentView = 'iso';
  const setView = (name = 'iso') => {
    currentView = VIEWS[name] ? name : 'iso';
    const dir = VIEWS[currentView].clone().normalize();
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const distance = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 0.85;
    camera.position.copy(centre.clone().add(dir.multiplyScalar(distance)));
    camera.near = distance / 100;
    camera.far = distance * 100;
    camera.up.set(0, currentView === 'top' ? 0 : 1, currentView === 'top' ? -1 : 0);
    camera.updateProjectionMatrix();
    controls.target.copy(centre);
    controls.update();
    requestRender();
  };

  const api = {
    revision: 0,
    update(geo) {
      const colours = {
        body: readColour(container, '--text-3', '#8695ad'),
        surface: readColour(container, '--accent', '#22d3ee'),
        arm: readColour(container, '--text-2', '#aebbd0'),
        motor: readColour(container, '--text-1', '#e8eef8'),
        rotor: readColour(container, '--info', '#60a5fa'),
        cruise: readColour(container, '--ok', '#34d399'),
      };
      const firstModel = !model;
      if (model) {
        scene.remove(model.group);
        disposeGroup(model.group);
        model.materials.forEach((m) => m.dispose());
      }
      model = buildModel(THREE, geo, colours);
      scene.add(model.group);
      const box = new THREE.Box3().setFromObject(model.group);
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const changedSize = Math.abs(sphere.radius - radius) / radius > 0.25;
      radius = Math.max(sphere.radius, 0.01);
      centre = sphere.center;
      if (grid) {
        scene.remove(grid);
        grid.geometry.dispose();
      }
      const step = 10 ** Math.floor(Math.log10(radius));
      grid = new THREE.GridHelper(Math.ceil((radius * 4) / step) * step, Math.ceil((radius * 4) / step), 0x5b6b85, 0x2a3a57);
      grid.position.y = box.min.y - radius * 0.05;
      scene.add(grid);
      api.revision += 1;
      container.dataset.modelRevision = String(api.revision);
      renderer.domElement.setAttribute('aria-label', `3D conceptual model of the ${geo.layout} layout. Drag to rotate, right-drag or two-finger drag to pan, scroll to zoom.`);
      if (firstModel || changedSize) setView(currentView);
      else requestRender();
    },
    setView,
    destroy() {
      observer.disconnect();
      controls.dispose();
      if (frame) cancelAnimationFrame(frame);
      if (model) disposeGroup(model.group);
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
  resize();
  return api;
}
