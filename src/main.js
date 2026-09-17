import * as THREE from "three";
import { createExperience } from "./scene.js";
import { startImageTracking } from "./ar-image.js";
import * as ui from "./ui.js";
import {
  isIOS,
  isInAppBrowser,
  hasCameraApi,
  isSecure,
  requestMotionPermission,
  ensureCamera,
} from "./env.js";

const TARGET_SRC = "./assets/targets.mind";

/** How long to look for the card before offering the table instead. */
const SCAN_PATIENCE_MS = 15000;

const canvas = document.getElementById("gl");
const video = document.getElementById("camera-feed");
const mindarContainer = document.getElementById("mindar");

const chime = ui.createChime();
const clock = new THREE.Clock();

let session = null; // the running AR path, whichever it is
let experience = null;
let placed = false;
let scanTimer = null;

/* ------------------------------------------------------------------ */
/* shared                                                              */
/* ------------------------------------------------------------------ */

function makeRenderer() {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  return renderer;
}

function startReveal() {
  if (placed) return;
  placed = true;
  clearTimeout(scanTimer);
  ui.show("scene");
  chime.play(0.1);
  chime.play(2.4, [660, 990]);
  experience.play(() => {
    ui.setChip(true);
    chime.play(0, [523, 784, 1046]);
  });
}

/* ------------------------------------------------------------------ */
/* primary path — the card is the anchor                               */
/* ------------------------------------------------------------------ */

async function startCardTracking() {
  ui.text("prepare-text", "Asking for the camera…");
  ui.show("prepare");
  await ensureCamera();

  ui.text("prepare-text", "Looking for the card…");
  session = await startImageTracking({
    container: mindarContainer,
    targetSrc: TARGET_SRC,
    buildExperience: (renderer) => {
      experience = createExperience(renderer);
      return experience;
    },
    onFound: startReveal,
  });

  mindarContainer.classList.add("is-live");
  ui.text("place-text", "Point at the invitation card");
  ui.show("scan");

  // Guests looking at a screenshot of the card, or who left the card at home,
  // should not be stuck staring at a viewfinder.
  scanTimer = setTimeout(() => {
    if (!placed) document.querySelector('[data-action="no-card"]').hidden = false;
  }, SCAN_PATIENCE_MS);
}

/* ------------------------------------------------------------------ */
/* fallback path — no card, place it on a table                        */
/* ------------------------------------------------------------------ */

const gyro = { enabled: false, alpha: 0, beta: 0, gamma: 0, screen: 0 };
const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

let fallbackCamera = null;

function applyGyro() {
  if (!gyro.enabled || !fallbackCamera) return;
  euler.set(
    THREE.MathUtils.degToRad(gyro.beta),
    THREE.MathUtils.degToRad(gyro.alpha),
    -THREE.MathUtils.degToRad(gyro.gamma),
    "YXZ"
  );
  fallbackCamera.quaternion.setFromEuler(euler);
  fallbackCamera.quaternion.multiply(q1);
  fallbackCamera.quaternion.multiply(
    q0.setFromAxisAngle(zee, -THREE.MathUtils.degToRad(gyro.screen))
  );
}

function onOrientation(event) {
  if (event.alpha === null) return;
  gyro.alpha = event.alpha;
  gyro.beta = event.beta;
  gyro.gamma = event.gamma;
  gyro.screen = screen.orientation?.angle ?? window.orientation ?? 0;
  gyro.enabled = true;
}

async function startTablePlacement() {
  await session?.stop();
  session = null;
  mindarContainer.classList.remove("is-live");

  ui.text("prepare-text", "Switching to table mode…");
  ui.show("prepare");

  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  video.classList.add("is-live");
  canvas.classList.add("is-live");

  const renderer = makeRenderer();
  const scene = new THREE.Scene();
  fallbackCamera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 40);
  experience = createExperience(renderer);
  scene.add(experience.root);

  if (await requestMotionPermission()) {
    window.addEventListener("deviceorientation", onOrientation, true);
  }

  renderer.setAnimationLoop(() => {
    applyGyro();
    experience.update(Math.min(clock.getDelta(), 0.05), fallbackCamera);
    renderer.render(scene, fallbackCamera);
  });

  session = {
    experience,
    async stop() {
      renderer.setAnimationLoop(null);
      stream.getTracks().forEach((t) => t.stop());
      video.classList.remove("is-live");
      canvas.classList.remove("is-live");
    },
  };

  document.querySelector('[data-action="place"]').hidden = false;
  document.querySelector('[data-action="no-card"]').hidden = true;
  ui.text("place-text", "Aim at a table, then tap to place");
  ui.show("scan");
}

function placeOnTable() {
  if (placed || !fallbackCamera) return;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(fallbackCamera.quaternion);
  forward.y = 0;
  if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
  forward.normalize();

  experience.root.position
    .copy(fallbackCamera.position)
    .addScaledVector(forward, 0.62)
    .setY(fallbackCamera.position.y - 0.3);
  experience.root.rotation.y = Math.atan2(forward.x, forward.z);

  startReveal();
}

/* ------------------------------------------------------------------ */
/* preview — no camera, for desktop iteration on the 3D                */
/* ------------------------------------------------------------------ */

function startPreview() {
  const renderer = makeRenderer();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0908);
  const cam = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 40);
  experience = createExperience(renderer);
  scene.add(experience.root);
  canvas.classList.add("is-live");
  canvas.style.pointerEvents = "auto";

  let drag = null;
  let orbit = 0;
  canvas.addEventListener("pointerdown", (e) => (drag = e.clientX));
  canvas.addEventListener("pointerup", () => (drag = null));
  canvas.addEventListener("pointermove", (e) => {
    if (drag === null) return;
    orbit += (e.clientX - drag) * 0.006;
    drag = e.clientX;
  });

  startReveal();

  renderer.setAnimationLoop(() => {
    cam.position.set(Math.sin(orbit) * 0.8, 0.28, Math.cos(orbit) * 0.8);
    cam.lookAt(0, 0.16, 0);
    experience.update(Math.min(clock.getDelta(), 0.05), cam);
    renderer.render(scene, cam);
  });
}

/* ------------------------------------------------------------------ */
/* flow                                                                */
/* ------------------------------------------------------------------ */

async function begin() {
  chime.unlock();

  if (new URLSearchParams(location.search).has("preview")) return startPreview();

  if (isInAppBrowser) {
    return ui.fail(
      "This link is open inside an app browser, which blocks the camera. Tap the ⋯ menu and choose “Open in browser”."
    );
  }
  if (!isSecure) return ui.fail("The camera needs a secure (https) connection.");
  if (!hasCameraApi) return ui.fail("This browser cannot open the camera.");

  try {
    await startCardTracking();
  } catch (error) {
    console.error(error);
    const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
    ui.fail(
      denied
        ? "Camera access was declined. Allow it in the browser settings, or open the invitation without AR."
        : "The AR experience could not start on this device."
    );
  }
}

async function teardown() {
  clearTimeout(scanTimer);
  await session?.stop();
  session = null;
  experience?.stop();
  placed = false;
  ui.setChip(false);
  mindarContainer.classList.remove("is-live");
}

ui.on("start", begin);
ui.on("place", placeOnTable);
ui.on("no-card", () => startTablePlacement().catch(console.error));
ui.on("retry", () => ui.show("cover"));
ui.on("skip", async () => {
  await teardown();
  ui.show("details");
});
ui.on("finish", async () => {
  await teardown();
  ui.show("details");
});
ui.on("replay", async () => {
  await teardown();
  ui.show("cover");
});
ui.on("calendar", (event) => {
  event.preventDefault();
  const link = document.createElement("a");
  link.href = ui.calendarUrl();
  link.download = "an-evening-of-caviar.ics";
  link.click();
});

document.querySelector('[data-screen="scan"]').addEventListener("click", placeOnTable);

window.addEventListener("resize", () => {
  if (fallbackCamera) {
    fallbackCamera.aspect = window.innerWidth / window.innerHeight;
    fallbackCamera.updateProjectionMatrix();
  }
});

if (isIOS) ui.text("cover-hint", "Works in Safari and Chrome · camera required");
