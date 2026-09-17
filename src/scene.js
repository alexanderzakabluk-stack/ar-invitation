import * as THREE from "three";

const COPPER = 0xc9793f;
const PEARL_COUNT = 420;
const SPARK_COUNT = 300;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Normalised progress of `t` inside the [from, to] window. */
function span(t, from, to) {
  return clamp01((t - from) / (to - from));
}

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const easeOutBack = (x) => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

/**
 * A tiny equirectangular environment painted into a canvas: a dark room with
 * two warm highlights. Cheaper than loading an HDRI and it gives the copper
 * and the pearls something to reflect.
 */
function makeEnvironment(renderer) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");

  const base = ctx.createLinearGradient(0, 0, 0, 256);
  base.addColorStop(0, "#241a13");
  base.addColorStop(0.55, "#0d0a08");
  base.addColorStop(1, "#050404");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 256);

  const blob = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };

  blob(150, 70, 110, "rgba(255, 216, 170, 0.95)");
  blob(370, 96, 80, "rgba(201, 121, 63, 0.7)");
  blob(60, 190, 120, "rgba(70, 50, 38, 0.6)");

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromEquirectangular(texture).texture;
  pmrem.dispose();
  texture.dispose();
  return envMap;
}

/** The invitation card itself, drawn to a canvas and used as a texture. */
function makeCardTexture() {
  const w = 620;
  const h = 876;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0a0908";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(201, 121, 63, 0.75)";
  ctx.lineWidth = 2;
  ctx.strokeRect(22, 22, w - 44, h - 44);

  // Canvas letterSpacing is not universally supported, so track manually.
  const tracked = (text, x, y, spacing) => {
    const chars = [...text];
    const widths = chars.map((c) => ctx.measureText(c).width);
    const total = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
    let cursor = x - total / 2;
    chars.forEach((c, i) => {
      ctx.fillText(c, cursor, y);
      cursor += widths[i] + spacing;
    });
  };

  const rule = (y, width = 90) => {
    ctx.strokeStyle = "rgba(201, 121, 63, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(w / 2 - width / 2, y);
    ctx.lineTo(w / 2 + width / 2, y);
    ctx.stroke();
  };

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#c9793f";
  ctx.font = "400 20px Jost, sans-serif";
  tracked("YOU ARE INVITED", w / 2, 120, 7);

  rule(162);

  ctx.fillStyle = "#f2c79c";
  ctx.font = "400 96px 'Playfair Display', Georgia, serif";
  tracked("CAVIAR", w / 2, 250, 10);

  ctx.fillStyle = "rgba(239, 233, 226, 0.88)";
  ctx.font = "300 21px Jost, sans-serif";
  tracked("AN EVENING OF CAVIAR,", w / 2, 352, 4);
  tracked("CHAMPAGNE AND", w / 2, 390, 4);
  tracked("EXCEPTIONAL COMPANY.", w / 2, 428, 4);

  rule(490);

  ctx.fillStyle = "#c9793f";
  ctx.font = "400 24px Jost, sans-serif";
  tracked("11 DECEMBER 2026  ·  18:00", w / 2, 552, 5);

  ctx.fillStyle = "rgba(239, 233, 226, 0.8)";
  ctx.font = "300 20px Jost, sans-serif";
  tracked("RINGÖN VINKÄLLARE", w / 2, 606, 5);
  tracked("RINGÖN  ·  GÖTEBORG", w / 2, 644, 5);

  ctx.fillStyle = "rgba(239, 233, 226, 0.5)";
  ctx.font = "300 17px Jost, sans-serif";
  tracked("DRESS CODE  ·  COCKTAIL ATTIRE", w / 2, 706, 4);

  rule(762, 60);

  ctx.fillStyle = "#c9793f";
  ctx.font = "400 34px 'Playfair Display', Georgia, serif";
  tracked("07 / 20", w / 2, 812, 6);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Soft radial dot used for sparkles and bubbles. */
function makeSpriteTexture() {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255, 235, 205, 1)");
  g.addColorStop(0.35, "rgba(226, 165, 107, 0.6)");
  g.addColorStop(1, "rgba(226, 165, 107, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/* ------------------------------------------------------------------ */
/* champagne flute                                                     */
/* ------------------------------------------------------------------ */

function makeFlute(envMap) {
  const group = new THREE.Group();

  // Lathe profile of a flute, in metres. Total height ~0.19 m.
  const profile = [
    [0.000, 0.000], [0.032, 0.000], [0.033, 0.004], [0.020, 0.010],
    [0.008, 0.020], [0.005, 0.055], [0.005, 0.070], [0.010, 0.082],
    [0.019, 0.098], [0.024, 0.120], [0.026, 0.150], [0.027, 0.182],
    [0.0265, 0.182], [0.0255, 0.150], [0.023, 0.120], [0.018, 0.098],
    [0.009, 0.082], [0.004, 0.070], [0.004, 0.055], [0.007, 0.020],
    [0.019, 0.008], [0.030, 0.003], [0.000, 0.003],
  ].map(([x, y]) => new THREE.Vector2(x, y));

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xf7f3ee,
    roughness: 0.02,
    metalness: 0,
    transparent: true,
    opacity: 0.13,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMap,
    envMapIntensity: 2.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const glass = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), glassMat);
  group.add(glass);

  // Champagne: a tapered column sitting inside the bowl.
  const liquidProfile = [
    [0.0, 0.086], [0.011, 0.086], [0.0185, 0.100], [0.0235, 0.122],
    [0.0255, 0.152], [0.0, 0.152],
  ].map(([x, y]) => new THREE.Vector2(x, y));

  const liquid = new THREE.Mesh(
    new THREE.LatheGeometry(liquidProfile, 40),
    new THREE.MeshPhysicalMaterial({
      color: 0xdca35c,
      roughness: 0.08,
      transparent: true,
      opacity: 0.62,
      emissive: 0x1d0f04,
      envMap,
      envMapIntensity: 2.2,
    })
  );
  group.add(liquid);

  return group;
}

/** Soft contact shadow — the single cheapest trick for grounding AR objects. */
function makeContactShadow() {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.45, "rgba(0,0,0,0.28)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.42, 0.42),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
      opacity: 0,
    })
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.001;
  mesh.renderOrder = -1;
  return mesh;
}

/* ------------------------------------------------------------------ */
/* the experience                                                      */
/* ------------------------------------------------------------------ */

/**
 * Builds the invitation scene. The returned `root` is placed by the caller
 * (WebXR hit-test or the gyro fallback); `play()` restarts the timeline.
 */
export function createExperience(renderer) {
  const envMap = makeEnvironment(renderer);
  const sprite = makeSpriteTexture();

  const root = new THREE.Group();
  root.visible = false;

  const spin = new THREE.Group(); // everything that slowly rotates
  root.add(spin);

  const shadow = makeContactShadow();
  spin.add(shadow);

  /* --- tin ------------------------------------------------------- */

  const TIN_R = 0.052;
  const TIN_H = 0.028;

  const copperMat = new THREE.MeshStandardMaterial({
    color: COPPER,
    metalness: 1,
    roughness: 0.28,
    envMap,
    envMapIntensity: 1.5,
  });

  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x2b2420,
    metalness: 0.95,
    roughness: 0.34,
    envMap,
    envMapIntensity: 1.6,
  });

  const tin = new THREE.Group();
  spin.add(tin);

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(TIN_R, TIN_R * 0.97, TIN_H, 64, 1, true),
    darkMetalMat
  );
  body.position.y = TIN_H / 2;
  tin.add(body);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(TIN_R, 0.0022, 12, 64), copperMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = TIN_H;
  tin.add(rim);

  const base = new THREE.Mesh(new THREE.CircleGeometry(TIN_R * 0.97, 64), darkMetalMat);
  base.rotation.x = -Math.PI / 2;
  tin.add(base);

  const inner = new THREE.Mesh(
    new THREE.CircleGeometry(TIN_R * 0.95, 64),
    new THREE.MeshStandardMaterial({ color: 0x080706, roughness: 0.9, metalness: 0 })
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = TIN_H * 0.55;
  tin.add(inner);

  /* --- lid ------------------------------------------------------- */

  const lid = new THREE.Group();
  spin.add(lid);

  const lidTop = new THREE.Mesh(new THREE.CircleGeometry(TIN_R * 1.03, 64), copperMat);
  lidTop.rotation.x = -Math.PI / 2;
  lid.add(lidTop);

  const lidSkirt = new THREE.Mesh(
    new THREE.CylinderGeometry(TIN_R * 1.03, TIN_R * 1.03, 0.008, 64, 1, true),
    copperMat
  );
  lidSkirt.position.y = -0.004;
  lid.add(lidSkirt);
  lid.position.y = TIN_H;

  /* --- pearls ---------------------------------------------------- */

  const pearlMat = new THREE.MeshPhysicalMaterial({
    color: 0x1a1410,
    roughness: 0.11,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMap,
    envMapIntensity: 3,
  });

  const pearls = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 12, 10),
    pearlMat,
    PEARL_COUNT
  );
  pearls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  spin.add(pearls);

  // Mound of pearls: sample a disc, push the centre up into a dome.
  const pearlData = [];
  for (let i = 0; i < PEARL_COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const rN = Math.sqrt(Math.random());
    const r = rN * TIN_R * 0.88;
    const dome = Math.cos(rN * Math.PI * 0.5) * 0.018;
    pearlData.push({
      position: new THREE.Vector3(
        Math.cos(a) * r,
        TIN_H * 0.55 + 0.005 + dome + (Math.random() - 0.5) * 0.004,
        Math.sin(a) * r
      ),
      scale: 0.0042 + Math.random() * 0.0018,
      delay: rN * 0.9 + Math.random() * 0.35,
      rotation: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
    });
  }

  /* --- flutes ---------------------------------------------------- */

  const flutes = [makeFlute(envMap), makeFlute(envMap)];
  flutes[0].position.set(-0.148, 0, -0.045);
  flutes[1].position.set(0.152, 0, 0.042);
  flutes[0].rotation.y = 0.4;
  flutes[1].rotation.y = -0.7;
  flutes.forEach((f) => spin.add(f));

  // Bubbles rising inside each bowl.
  const bubbleSets = flutes.map((flute) => {
    const count = 26;
    const positions = new Float32Array(count * 3);
    const seeds = [];
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.016;
      seeds.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, t: Math.random(), speed: 0.35 + Math.random() * 0.5 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: sprite,
        size: 0.0055,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    flute.add(points);
    return { points, seeds, positions };
  });

  /* --- sparkles -------------------------------------------------- */

  const sparkPositions = new Float32Array(SPARK_COUNT * 3);
  const sparkSeeds = [];
  for (let i = 0; i < SPARK_COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    sparkSeeds.push({
      angle: a,
      radius: 0.03 + Math.random() * 0.22,
      height: 0.05 + Math.random() * 0.45,
      speed: 0.12 + Math.random() * 0.4,
      swirl: (Math.random() - 0.5) * 1.2,
      delay: Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
    });
  }
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({
      map: sprite,
      size: 0.009,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  root.add(sparks);

  /* --- card ------------------------------------------------------ */

  const cardMat = new THREE.MeshBasicMaterial({
    map: makeCardTexture(),
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.24), cardMat);
  card.position.set(0, 0.28, -0.02);
  root.add(card); // outside `spin`: the card should always face the viewer

  /* --- lights ---------------------------------------------------- */

  root.add(new THREE.HemisphereLight(0xffd9b0, 0x0a0806, 1.1));

  const key = new THREE.DirectionalLight(0xffe2be, 2.3);
  key.position.set(0.3, 0.6, 0.35);
  root.add(key);

  const rimLight = new THREE.PointLight(0xc9793f, 1.6, 1.2, 2);
  rimLight.position.set(-0.25, 0.22, -0.28);
  root.add(rimLight);

  /* --- timeline -------------------------------------------------- */

  const dummy = new THREE.Object3D();
  let time = 0;
  let running = false;
  let onComplete = null;
  let completed = false;

  const TL = {
    sparksIn: [0.0, 0.7],
    tinIn: [0.25, 1.5],
    lidOff: [1.5, 2.6],
    pearlsIn: [2.2, 4.1],
    flutesIn: [3.2, 4.7],
    cardIn: [4.5, 6.1],
    done: 6.2,
  };

  function reset() {
    time = 0;
    completed = false;
    root.visible = false;
    spin.rotation.y = 0;
  }

  function update(delta, camera) {
    if (!running) return;
    time += delta;
    const t = time;

    root.visible = true;

    /* sparkles: burst up, then settle into a slow ambient drift */
    const sparkIn = span(t, TL.sparksIn[0], TL.sparksIn[1]);
    sparks.material.opacity = sparkIn * (t > TL.done ? 0.45 : 0.95);
    for (let i = 0; i < SPARK_COUNT; i++) {
      const s = sparkSeeds[i];
      const local = Math.max(0, t - s.delay);
      const rise = 1 - Math.exp(-local * s.speed * 2.2);
      const angle = s.angle + local * s.swirl * 0.5;
      const radius = s.radius * (0.25 + rise * 0.9);
      const y = s.height * rise + Math.sin(local * 1.4 + s.phase) * 0.012;
      sparkPositions[i * 3] = Math.cos(angle) * radius;
      sparkPositions[i * 3 + 1] = y;
      sparkPositions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    sparks.geometry.attributes.position.needsUpdate = true;

    /* tin */
    const tinIn = easeOutBack(span(t, TL.tinIn[0], TL.tinIn[1]));
    tin.scale.setScalar(Math.max(0.0001, tinIn));
    tin.position.y = (1 - easeOutCubic(span(t, TL.tinIn[0], TL.tinIn[1]))) * -0.05;
    shadow.material.opacity = easeOutCubic(span(t, TL.tinIn[0], TL.tinIn[1])) * 0.9;

    /* lid lifts, tilts and dissolves */
    const lidT = span(t, TL.lidOff[0], TL.lidOff[1]);
    const lidE = easeInOut(lidT);
    lid.visible = lidT < 1;
    lid.scale.setScalar(Math.max(0.0001, tinIn));
    lid.position.y = TIN_H * tinIn + lidE * 0.16;
    lid.position.x = lidE * 0.07;
    lid.rotation.z = -lidE * 0.9;
    lid.rotation.x = lidE * 0.35;
    copperMat.opacity = 1;
    if (lidT > 0.55) {
      lidTop.material = lidSkirt.material = copperMat;
      lid.scale.setScalar(Math.max(0.0001, tinIn * (1 - (lidT - 0.55) / 0.45)));
    }

    /* pearls pop in from the centre outwards */
    const pearlWindow = TL.pearlsIn[1] - TL.pearlsIn[0];
    for (let i = 0; i < PEARL_COUNT; i++) {
      const p = pearlData[i];
      const local = clamp01((t - TL.pearlsIn[0] - p.delay) / (pearlWindow * 0.35));
      const s = easeOutBack(local) * p.scale;
      dummy.position.copy(p.position);
      dummy.position.y += (1 - local) * 0.02;
      dummy.rotation.copy(p.rotation);
      dummy.scale.setScalar(Math.max(0.00001, s));
      dummy.updateMatrix();
      pearls.setMatrixAt(i, dummy.matrix);
    }
    pearls.instanceMatrix.needsUpdate = true;

    /* flutes rise */
    const fluteT = span(t, TL.flutesIn[0], TL.flutesIn[1]);
    const fluteE = easeOutCubic(fluteT);
    flutes.forEach((f, i) => {
      f.visible = fluteT > 0;
      f.scale.setScalar(Math.max(0.0001, easeOutBack(clamp01(fluteT * 1.15 - i * 0.12))));
      f.position.y = (1 - fluteE) * -0.06;
    });

    bubbleSets.forEach(({ points, seeds, positions }) => {
      points.material.opacity = fluteE * 0.9;
      for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i];
        s.t += delta * s.speed;
        if (s.t > 1) s.t -= 1;
        positions[i * 3] = s.x;
        positions[i * 3 + 1] = 0.088 + s.t * 0.062;
        positions[i * 3 + 2] = s.z;
      }
      points.geometry.attributes.position.needsUpdate = true;
    });

    /* card rises and always faces the viewer */
    const cardT = span(t, TL.cardIn[0], TL.cardIn[1]);
    const cardE = easeOutCubic(cardT);
    cardMat.opacity = cardE;
    card.visible = cardT > 0;
    card.position.y = 0.21 + cardE * 0.07 + Math.sin(t * 0.7) * 0.004;
    if (camera) {
      card.quaternion.copy(camera.quaternion);
    }

    /* slow ambient rotation once the reveal is done */
    if (t > TL.tinIn[1]) {
      spin.rotation.y += delta * 0.16 * Math.min(1, (t - TL.tinIn[1]) / 1.5);
    }

    rimLight.intensity = 1.2 + Math.sin(t * 1.1) * 0.35;

    if (!completed && t >= TL.done) {
      completed = true;
      onComplete?.();
    }
  }

  return {
    root,
    update,
    play(callback) {
      onComplete = callback;
      reset();
      running = true;
    },
    stop() {
      running = false;
      reset();
    },
    get duration() {
      return TL.done;
    },
  };
}
