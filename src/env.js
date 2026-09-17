/**
 * Capability detection.
 *
 * The one thing worth remembering: Chrome on iOS is not Chrome. Apple requires
 * every iOS browser to use WebKit, so Chrome/Firefox/Edge on an iPhone have the
 * exact same engine — and the same lack of WebXR — as Safari. Therefore iOS
 * always takes the camera-passthrough path, never the WebXR one.
 */

const ua = navigator.userAgent;

export const isIOS =
  /iPad|iPhone|iPod/.test(ua) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isAndroid = /Android/.test(ua);

/**
 * In-app browsers (Instagram, Facebook, Messenger, LinkedIn, TikTok, Snapchat)
 * frequently deny getUserMedia outright. Detect them so we can tell the guest
 * to open the link in a real browser instead of showing a blank camera.
 */
export const isInAppBrowser = /FBAN|FBAV|Instagram|Line\/|LinkedInApp|Snapchat|Twitter|TikTok|MicroMessenger/.test(ua);

export const hasCameraApi = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

export const isSecure = window.isSecureContext;

/** True only where real WebXR AR with hit-testing is available. */
export async function supportsWebXR() {
  if (isIOS) return false;
  if (!navigator.xr?.isSessionSupported) return false;
  try {
    return await navigator.xr.isSessionSupported("immersive-ar");
  } catch {
    return false;
  }
}

/** iOS 13+ gates the gyroscope behind an explicit user-gesture permission. */
export const needsMotionPermission =
  typeof DeviceOrientationEvent !== "undefined" &&
  typeof DeviceOrientationEvent.requestPermission === "function";

export async function requestMotionPermission() {
  if (!needsMotionPermission) return true;
  try {
    return (await DeviceOrientationEvent.requestPermission()) === "granted";
  } catch {
    return false;
  }
}

/**
 * Ask for the camera before handing control to MindAR.
 *
 * MindAR rejects with `undefined` when getUserMedia fails, which leaves no way
 * to tell "the guest tapped Don't Allow" apart from a genuine failure. Asking
 * first means the guest gets an accurate message, and it puts the permission
 * prompt at a moment we choose rather than mid-initialisation.
 */
export async function ensureCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" } },
    audio: false,
  });
  // MindAR opens its own stream; this one has done its job.
  stream.getTracks().forEach((track) => track.stop());
}
