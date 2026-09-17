import { Group } from "three";
import { MindARThree } from "mindar-image-three";

/**
 * Image tracking: the printed card is the anchor, so the scene appears on the
 * card itself rather than wherever the guest happens to tap.
 *
 * MindAR runs everywhere including iOS, because it does its own tracking on a
 * plain `getUserMedia` feed instead of relying on WebXR.
 */

/** The printed card is A6, so its width in the real world is 105 mm. */
const CARD_WIDTH_M = 0.105;

/**
 * MindAR anchor space puts the target image in the XY plane, one unit wide,
 * with +Z out of the card. The scene is modelled in metres with +Y up, so it
 * needs both a scale and a quarter turn to stand up off the card.
 */
function fitToCard(root) {
  const holder = new Group();
  holder.add(root);
  holder.rotation.x = Math.PI / 2;
  holder.scale.setScalar(1 / CARD_WIDTH_M);
  return holder;
}

export async function startImageTracking({ container, targetSrc, buildExperience, onFound, onLost }) {
  const mindar = new MindARThree({
    container,
    imageTargetSrc: targetSrc,
    // We draw our own coaching UI, so MindAR's overlays stay off.
    uiLoading: "no",
    uiScanning: "no",
    uiError: "no",
    // Heavier smoothing than the default: the scene is a slow, still reveal,
    // and jitter on a static object reads worse than a little lag.
    filterMinCF: 0.0001,
    filterBeta: 0.001,
    missTolerance: 10,
    warmupTolerance: 3,
  });

  const { renderer, scene, camera } = mindar;
  const experience = buildExperience(renderer);

  const anchor = mindar.addAnchor(0);
  anchor.group.add(fitToCard(experience.root));

  let seen = false;
  anchor.onTargetFound = () => {
    if (!seen) {
      seen = true;
      onFound?.();
    }
  };
  anchor.onTargetLost = () => onLost?.();

  await mindar.start();

  let last = performance.now();
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;
    experience.update(delta, camera);
    renderer.render(scene, camera);
  });

  return {
    experience,
    async stop() {
      renderer.setAnimationLoop(null);
      try {
        await mindar.stop();
      } catch {
        /* already torn down */
      }
    },
  };
}
