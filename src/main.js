import * as THREE from "three";
import { createExperience } from "./scene.js";
import * as ui from "./ui.js";
import {
  isIOS,
  isInAppBrowser,
  hasCameraApi,
  isSecure,
  supportsWebXR,
  requestMotionPermission,
} from "./env.js";

/* ------------------------------------------------------------------ */
/* renderer                                                            */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById("gl");
const video = document.getElementById("camera-feed");

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

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.01, 40);

const experience = createExperience(renderer);
scene.add(experience.root);

/* Reticle used in the WebXR path to show where the tin will land. */
const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.055, 0.062, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xc9793f, transparent: true, opacity: 0.9 })
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

const chime = ui.createChime();
const clock = new THREE.Clock();

let mode = null; // "webxr" | "passthrough"
let placed = false;
let stream = null;

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ------------------------------------------------------------------ */
/* gyro camera (passthrough path)                                      */
/* ------------------------------------------------------------------ */

const gyro = {
  enabled: false,
  alpha: 0,
  beta: 0,
  gamma: 0,
  screen: 0,
};

const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° about X

function applyGyro() {
  if (!gyro.enabled) return;
  const alpha = THREE.MathUtils.degToRad(gyro.alpha);
  const beta = THREE.MathUtils.degToRad(gyro.beta);
  const gamma = THREE.MathUtils.degToRad(gyro.gamma);
  const orient = THREE.MathUtils.degToRad(gyro.screen);

  euler.set(beta, alpha, -gamma, "YXZ");
  camera.quaternion.setFromEuler(euler);
  camera.quaternion.multiply(q1);
  camera.quaternion.multiply(q0.setFromAxisAngle(zee, -orient));
}

function onOrientation(event) {
  if (event.alpha === null) return;
  gyro.alpha = event.alpha;
  gyro.beta = event.beta;
  gyro.gamma = event.gamma;
  gyro.screen = screen.orientation?.angle ?? window.orientation ?? 0;
  gyro.enabled = true;
}

/* ------------------------------------------------------------------ */
/* placement                                                           */
/* ------------------------------------------------------------------ */

function placeInFront() {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  forward.y = 0;
  if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
  forward.normalize();

  experience.root.position
    .copy(camera.position)
    .addScaledVector(forward, 0.62)
    .setY(camera.position.y - 0.3);

  experience.root.rotation.y = Math.atan2(forward.x, forward.z);
}

function startReveal() {
  placed = true;
  reticle.visible = false;
  ui.show("scene");
  chime.play(0.1);
  chime.play(2.4, [660, 990]);
  experience.play(() => {
    ui.setChip(true);
    chime.play(0, [523, 784, 1046]);
  });
}

/* ------------------------------------------------------------------ */
/* WebXR path (Android / Chrome)                                       */
/* ------------------------------------------------------------------ */

let hitTestSource = null;
let xrSession = null;

async function startWebXR() {
  ui.text("prepare-text", "Starting AR…");
  ui.show("prepare");

  xrSession = await navigator.xr.requestSession("immersive-ar", {
    requiredFeatures: ["hit-test", "local"],
    optionalFeatures: ["dom-overlay", "light-estimation"],
    domOverlay: { root: document.body },
  });

  mode = "webxr";
  renderer.xr.enabled = true;
  await renderer.xr.setSession(xrSession);
  canvas.classList.add("is-live");

  const viewerSpace = await xrSession.requestReferenceSpace("viewer");
  hitTestSource = await xrSession.requestHitTestSource({ space: viewerSpace });

  ui.text("place-text", "Move the phone slowly, then tap the surface");
  ui.show("place");

  xrSession.addEventListener("select", () => {
    if (!placed && reticle.visible) {
      experience.root.position.setFromMatrixPosition(reticle.matrix);
      experience.root.rotation.y = 0;
      startReveal();
    }
  });

  xrSession.addEventListener("end", () => {
    hitTestSource = null;
    xrSession = null;
    canvas.classList.remove("is-live");
    ui.setChip(false);
    ui.show("details");
  });

  renderer.setAnimationLoop(renderXR);
}

function renderXR(_, frame) {
  const delta = Math.min(clock.getDelta(), 0.05);

  if (frame && hitTestSource && !placed) {
    const refSpace = renderer.xr.getReferenceSpace();
    const hits = frame.getHitTestResults(hitTestSource);
    if (hits.length) {
      const pose = hits[0].getPose(refSpace);
      reticle.visible = true;
      reticle.matrix.fromArray(pose.transform.matrix);
    } else {
      reticle.visible = false;
    }
  }

  experience.update(delta, renderer.xr.getCamera());
  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ */
/* Passthrough path (iOS, and anything without WebXR)                  */
/* ------------------------------------------------------------------ */

async function startPassthrough() {
  ui.text("prepare-text", "Asking for the camera…");
  ui.show("prepare");

  stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });

  video.srcObject = stream;
  await video.play();
  video.classList.add("is-live");
  canvas.classList.add("is-live");

  mode = "passthrough";

  const motionOk = await requestMotionPermission();
  if (motionOk) {
    window.addEventListener("deviceorientation", onOrientation, true);
  }

  ui.text(
    "place-text",
    motionOk
      ? "Put the card on a table, aim at it, then tap"
      : "Aim at a table, then tap to place"
  );
  ui.show("place");

  renderer.setAnimationLoop(renderPassthrough);
}

function renderPassthrough() {
  const delta = Math.min(clock.getDelta(), 0.05);
  applyGyro();
  experience.update(delta, camera);
  renderer.render(scene, camera);
}

/* ------------------------------------------------------------------ */
/* Preview path (?preview) — no camera, for desktop iteration on the 3D */
/* ------------------------------------------------------------------ */

function startPreview() {
  mode = "preview";
  canvas.classList.add("is-live");
  camera.position.set(0, 0.28, 0.8);
  camera.lookAt(0, 0.16, 0);
  experience.root.position.set(0, 0, 0);
  scene.background = new THREE.Color(0x0a0908);

  let drag = null;
  let orbit = 0;
  canvas.style.pointerEvents = "auto";
  canvas.addEventListener("pointerdown", (e) => (drag = e.clientX));
  canvas.addEventListener("pointerup", () => (drag = null));
  canvas.addEventListener("pointermove", (e) => {
    if (drag === null) return;
    orbit += (e.clientX - drag) * 0.006;
    drag = e.clientX;
  });

  startReveal();

  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.05);
    const r = 0.8;
    camera.position.set(Math.sin(orbit) * r, 0.28, Math.cos(orbit) * r);
    camera.lookAt(0, 0.16, 0);
    experience.update(delta, camera);
    renderer.render(scene, camera);
  });
}

/* ------------------------------------------------------------------ */
/* flow                                                                */
/* ------------------------------------------------------------------ */

async function begin() {
  chime.unlock();

  if (new URLSearchParams(location.search).has("preview")) {
    startPreview();
    return;
  }

  if (isInAppBrowser) {
    ui.fail(
      "This link is open inside an app browser, which blocks the camera. Tap the ⋯ menu and choose “Open in browser”."
    );
    return;
  }

  if (!isSecure) {
    ui.fail("The camera needs a secure (https) connection.");
    return;
  }

  try {
    if (await supportsWebXR()) {
      await startWebXR();
    } else if (hasCameraApi) {
      await startPassthrough();
    } else {
      ui.fail("This browser cannot open the camera.");
    }
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

function tryPlace() {
  if (placed || mode !== "passthrough") return;
  placeInFront();
  startReveal();
}

function teardown() {
  renderer.setAnimationLoop(null);
  experience.stop();
  placed = false;
  ui.setChip(false);
  video.classList.remove("is-live");
  canvas.classList.remove("is-live");
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  if (xrSession) xrSession.end().catch(() => {});
}

ui.on("start", begin);
ui.on("place", tryPlace);
ui.on("retry", () => {
  ui.show("cover");
});
ui.on("skip", () => {
  teardown();
  ui.show("details");
});
ui.on("finish", () => {
  teardown();
  ui.show("details");
});
ui.on("replay", () => {
  ui.show("cover");
});
ui.on("calendar", (event) => {
  event.preventDefault();
  const link = document.createElement("a");
  link.href = ui.calendarUrl();
  link.download = "an-evening-of-caviar.ics";
  link.click();
});

/* In the passthrough path, tapping anywhere on the coaching screen places the
   scene — the button is there for people who do not try tapping the view. */
document.querySelector('[data-screen="place"]').addEventListener("click", tryPlace);

if (isIOS) {
  ui.text("cover-hint", "Best on iPhone in Safari or Chrome · camera required");
}

/* Keep something on screen while the fonts that the card texture uses load. */
if (document.fonts?.ready) {
  document.fonts.ready.catch(() => {});
}
