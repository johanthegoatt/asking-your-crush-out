import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_BY_SCENE = {
  waiting: "/assets/models/heart.glb",
  celebrate: "/assets/models/pickup-heart.glb",
};

const sceneElements = Array.from(document.querySelectorAll(".three-scene"));
if (!sceneElements.length) {
  // No 3D scene targets on this page.
}

const supportsWebgl = checkWebglSupport();
if (!supportsWebgl) {
  sceneElements.forEach((element) => {
    const fallback = element.querySelector(".three-fallback");
    if (fallback) {
      fallback.textContent = "3D unavailable on this device.";
    }
  });
}

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const loader = new GLTFLoader();
const modelCache = new Map();

const sceneItems = supportsWebgl ? sceneElements.map(createSceneItem).filter(Boolean) : [];
const itemByElement = new Map(sceneItems.map((item) => [item.element, item]));
let latestTimeSeconds = 0;

const visibilityObserver = "IntersectionObserver" in window
  ? new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const item = itemByElement.get(entry.target);
          if (item) {
            item.visible = entry.isIntersecting;
          }
        });
      },
      { threshold: 0.05 }
    )
  : null;

if (visibilityObserver) {
  sceneItems.forEach((item) => {
    visibilityObserver.observe(item.element);
  });
}

const resizeObserver = "ResizeObserver" in window
  ? new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        const item = itemByElement.get(entry.target);
        if (item) {
          resizeScene(item);
        }
      });
    })
  : null;

if (resizeObserver) {
  sceneItems.forEach((item) => {
    resizeObserver.observe(item.element);
  });
} else {
  window.addEventListener("resize", () => {
    sceneItems.forEach(resizeScene);
  });
}

sceneItems.forEach((item) => {
  resizeScene(item);
  renderScene(item, 0);
});

// The main page swaps data-theme and afterpages set data-vibe; both change --accent.
if (sceneItems.length) {
  new MutationObserver(() => {
    sceneItems.forEach((item) => {
      applyAccent(item);
      if (prefersReducedMotion) {
        renderScene(item, latestTimeSeconds);
      }
    });
  }).observe(document.body, { attributes: true, attributeFilter: ["data-theme", "data-vibe"] });
}

if (!prefersReducedMotion && sceneItems.length) {
  window.requestAnimationFrame(runAnimation);
}

function runAnimation(frameTime) {
  latestTimeSeconds = frameTime * 0.001;
  sceneItems.forEach((item) => {
    if (!item.visible) {
      return;
    }
    renderScene(item, latestTimeSeconds);
  });
  window.requestAnimationFrame(runAnimation);
}

function createSceneItem(element) {
  const type = element.dataset.scene === "celebrate" ? "celebrate" : "waiting";
  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
  } catch {
    return null;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.setAttribute("aria-hidden", "true");
  element.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);
  camera.position.set(0, 0.2, 6.1);

  const ambient = new THREE.AmbientLight(0xffffff, 0.88);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
  keyLight.position.set(2.3, 2.4, 2.4);
  scene.add(keyLight);

  const fillLight = new THREE.PointLight(0xff9bc0, 0.95, 18);
  fillLight.position.set(-2.2, -0.4, 2.8);
  scene.add(fillLight);

  const root = new THREE.Group();
  root.position.y = -0.22;
  scene.add(root);

  const floatGroup = new THREE.Group();
  root.add(floatGroup);

  const fallbackHeart = createFallbackHeart(type === "celebrate" ? 0xff5e88 : 0xff7097);
  floatGroup.add(fallbackHeart);

  const haloRing = new THREE.Mesh(
    new THREE.TorusGeometry(type === "celebrate" ? 2.35 : 2.1, 0.07, 14, 88),
    new THREE.MeshStandardMaterial({
      color: type === "celebrate" ? 0xffbf72 : 0xf4a7be,
      roughness: 0.3,
      metalness: 0.22,
    })
  );
  haloRing.rotation.x = Math.PI * 0.33;
  root.add(haloRing);

  const confetti = createConfetti(type);
  confetti.group.position.y = 0.06;
  root.add(confetti.group);

  const item = {
    element,
    type,
    renderer,
    scene,
    camera,
    root,
    haloRing,
    fillLight,
    confetti,
    state: {
      floatGroup,
      fallbackHeart,
      model: null,
    },
    phase: Math.random() * Math.PI * 2,
    visible: true,
  };

  element.classList.add("is-ready");
  applyAccent(item);
  loadDatasetModel(item);

  return item;
}

async function loadDatasetModel(item) {
  const modelUrl = MODEL_BY_SCENE[item.type];
  try {
    const source = await loadModelSource(modelUrl);
    const model = source.clone(true);
    prepareModelMaterials(model);
    normalizeModel(model, item.type === "celebrate" ? 2.85 : 2.55, -0.95);
    model.rotation.y = Math.PI;
    model.rotation.x = 0.22;

    item.state.floatGroup.remove(item.state.fallbackHeart);
    item.state.fallbackHeart = null;
    item.state.model = model;
    item.state.floatGroup.add(model);
    renderScene(item, latestTimeSeconds);
  } catch {
    const fallback = item.element.querySelector(".three-fallback");
    if (fallback) {
      fallback.textContent = "3D model failed to load.";
    }
  }
}

function loadModelSource(url) {
  if (modelCache.has(url)) {
    return modelCache.get(url);
  }

  const promise = new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        resolve(gltf.scene);
      },
      undefined,
      (error) => {
        reject(error);
      }
    );
  });

  modelCache.set(url, promise);
  return promise;
}

function prepareModelMaterials(model) {
  model.traverse((node) => {
    if (!node.isMesh) {
      return;
    }
    node.castShadow = false;
    node.receiveShadow = false;
    if (!node.material) {
      return;
    }

    const base = node.material;
    const material = Array.isArray(base) ? base.map((entry) => entry.clone()) : base.clone();

    if (Array.isArray(material)) {
      material.forEach(applyMaterialTuning);
    } else {
      applyMaterialTuning(material);
    }

    node.material = material;
  });
}

function applyMaterialTuning(material) {
  if (typeof material.roughness === "number") {
    material.roughness = Math.min(0.55, material.roughness + 0.1);
  }
  if (typeof material.metalness === "number") {
    material.metalness = Math.max(0.08, material.metalness);
  }
}

function normalizeModel(model, targetMaxSize, targetBottomY) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetMaxSize / maxSize;
  model.scale.setScalar(scale);

  const scaledBox = new THREE.Box3().setFromObject(model);
  const center = scaledBox.getCenter(new THREE.Vector3());
  model.position.set(-center.x, -center.y, -center.z);

  const centeredBox = new THREE.Box3().setFromObject(model);
  const bottomDelta = targetBottomY - centeredBox.min.y;
  model.position.y += bottomDelta;
}

function renderScene(item, timeSeconds) {
  const t = timeSeconds + item.phase;

  item.root.rotation.y = t * (item.type === "celebrate" ? 1.15 : 0.98);
  item.root.rotation.z = Math.sin(t * 0.55) * 0.06;
  item.state.floatGroup.position.y = Math.sin(t * 1.55) * 0.11;
  item.state.floatGroup.rotation.x = 0.22 + Math.sin(t * 0.9) * 0.14;

  if (item.state.model) {
    item.state.model.rotation.y = Math.PI + Math.sin(t * 0.7) * 0.16;
  }

  if (item.state.fallbackHeart) {
    item.state.fallbackHeart.rotation.y = t * 1.25;
  }

  item.haloRing.rotation.z = t * (item.type === "celebrate" ? 0.75 : 0.52);
  item.haloRing.rotation.x = Math.PI * 0.33 + Math.sin(t * 0.9) * 0.08;

  animateConfetti(item.confetti, t);
  item.renderer.render(item.scene, item.camera);
}

function readAccent(element) {
  const raw = getComputedStyle(element).getPropertyValue("--accent").trim();
  if (!raw) {
    return null;
  }
  try {
    return new THREE.Color(raw);
  } catch {
    return null;
  }
}

function applyAccent(item) {
  const accent = readAccent(item.element);
  if (!accent) {
    return;
  }
  item.fillLight.color.copy(accent).lerp(new THREE.Color(0xffffff), 0.35);
  if (item.type === "waiting") {
    item.haloRing.material.color.copy(accent).lerp(new THREE.Color(0xffffff), 0.25);
  }
}

function resizeScene(item) {
  const width = Math.max(40, Math.round(item.element.clientWidth));
  const height = Math.max(40, Math.round(item.element.clientHeight));
  item.renderer.setSize(width, height, false);
  item.camera.aspect = width / height;
  item.camera.updateProjectionMatrix();
}

function createFallbackHeart(color) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.25);
  shape.bezierCurveTo(0, 0, -0.5, 0, -0.5, 0.27);
  shape.bezierCurveTo(-0.5, 0.55, -0.2, 0.82, 0, 1);
  shape.bezierCurveTo(0.2, 0.82, 0.5, 0.55, 0.5, 0.27);
  shape.bezierCurveTo(0.5, 0, 0, 0, 0, 0.25);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.26,
    bevelEnabled: true,
    bevelSize: 0.04,
    bevelThickness: 0.05,
    bevelSegments: 4,
    curveSegments: 20,
  });
  geometry.center();

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.35,
      metalness: 0.12,
    })
  );
  mesh.scale.setScalar(1.1);
  mesh.position.y = -0.12;
  return mesh;
}

function createConfetti(type) {
  const group = new THREE.Group();
  const pieces = [];
  const colors = type === "celebrate"
    ? [0xffa95f, 0x63dcff, 0xff6894, 0xc3b3ff, 0xffd878]
    : [0xf8a4bd, 0xf7bdd0, 0xffd6e2];
  const count = type === "celebrate" ? 18 : 10;

  for (let index = 0; index < count; index += 1) {
    const piece = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.27, 0.05),
      new THREE.MeshStandardMaterial({
        color: colors[index % colors.length],
        roughness: 0.36,
        metalness: 0.12,
      })
    );

    const angle = (index / count) * Math.PI * 2;
    const radius = (type === "celebrate" ? 2.5 : 2.2) + (index % 3) * 0.22;
    piece.position.set(
      Math.cos(angle) * radius,
      Math.sin(angle) * radius * 0.44 + 0.24,
      (index % 5) * 0.05
    );

    group.add(piece);
    pieces.push({
      mesh: piece,
      baseX: piece.position.x,
      baseY: piece.position.y,
      baseZ: piece.position.z,
      phase: Math.random() * Math.PI * 2,
      speed: 0.8 + (index % 5) * 0.14,
    });
  }

  return { group, pieces, type };
}

function animateConfetti(confetti, timeSeconds) {
  const amplitude = confetti.type === "celebrate" ? 0.22 : 0.12;
  confetti.pieces.forEach((piece) => {
    piece.mesh.rotation.x = timeSeconds * piece.speed * 1.2;
    piece.mesh.rotation.y = timeSeconds * piece.speed;
    piece.mesh.position.x = piece.baseX + Math.cos(timeSeconds * piece.speed + piece.phase) * 0.09;
    piece.mesh.position.y = piece.baseY + Math.sin(timeSeconds * piece.speed * 1.15 + piece.phase) * amplitude;
    piece.mesh.position.z = piece.baseZ + Math.cos(timeSeconds * piece.speed * 0.9 + piece.phase) * 0.08;
  });
}

function checkWebglSupport() {
  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    return Boolean(context);
  } catch {
    return false;
  }
}
