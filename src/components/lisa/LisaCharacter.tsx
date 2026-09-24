"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";

import { withBase } from "@/lib/base-path";
import { isInAppBrowser } from "@/lib/in-app-browser";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

export type CharacterClip = "idle" | "talk" | "wave";

const MODEL_BASE = "/assets/ava/character/ava.glb";
const MODEL_VERSION_URL = "/assets/ava/character/version.json";
/** Negative pitches the camera so the portrait sits lower on screen. */
const VIEW_LIFT = -0.12;
const FRAME_REV = 56;
const STAGE = 0xb8cc88;
const STAGE_DEEP = 0x8fa06a;

function makeStageBackdrop(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, "#d2e4a8");
    grad.addColorStop(0.42, "#b8cc88");
    grad.addColorStop(1, "#8fa06a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 8, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

/** How far the user's Look target slides in front of the face. */
const LOOK_RANGE_X = 0.48;
const LOOK_RANGE_Y = 0.30;

const STILL_EPS = 0.0008;
const STILL_FRAMES_TO_FREEZE = 16;

type LookJoint = {
  bone: THREE.Object3D;
  bindQuat: THREE.Quaternion;
  weight: number;
  maxYaw: number;
  maxPitch: number;
  /** 1 = full yaw, 0 = no left/right (neck-only turn). */
  yawScale: number;
};

function isMobileOrTabletDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iPadDesktop =
    navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1;
  if (/iPad|iPhone|iPod|Android/i.test(ua) || iPadDesktop) return true;
  return window.matchMedia("(hover: none) and (pointer: coarse)").matches;
}

function needsIosMotionPermission(): boolean {
  if (typeof window === "undefined") return false;
  const DOE = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
  return typeof DOE.requestPermission === "function";
}

function findBone(root: THREE.Object3D, names: string[]): THREE.Object3D | null {
  for (const name of names) {
    const obj = root.getObjectByName(name);
    if (obj) return obj;
  }
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (found) return;
    if (names.includes(o.name)) found = o;
  });
  return found;
}

/**
 * Neck/head look tracking:
 * - Desktop: follows the mouse
 * - Mobile / tablet: follows the user via device orientation sensors
 *   (tilt / move the device — character looks toward you)
 */
export function LisaCharacter({
  clip = "idle",
  className = "c-lisa_stage",
}: {
  clip?: CharacterClip;
  className?: string;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const clipRef = useRef<CharacterClip>(clip);
  const enableMotionRef = useRef<(() => void) | null>(null);
  const [showMotionPrompt, setShowMotionPrompt] = useState(false);
  /** Bumped when Blender saves → version.json changes (autosync). */
  const [modelRev, setModelRev] = useState(() => `force-${Date.now()}`);

  useEffect(() => {
    clipRef.current = clip;
  }, [clip]);

  // Poll Blender autosync version so the GLB reloads without a hard refresh.
  useEffect(() => {
    let cancelled = false;
    let last = "";
    const tick = async () => {
      try {
        const res = await fetch(withBase(`${MODEL_VERSION_URL}?t=${Date.now()}`), {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { v?: string | number };
        const next = String(data.v ?? "");
        if (!next || next === last || cancelled) return;
        const prev = last;
        last = next;
        // Always apply the first real stamp; then only on change.
        if (!prev || prev !== next) setModelRev(next);
      } catch {
        /* ignore — file may not exist yet */
      }
    };
    void tick();
    const id = window.setInterval(tick, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // In-app browsers never mount this component (see shouldAvoidWebGL).
    // Keep a lite flag only as a safety net if detection misses.
    const lite = isInAppBrowser();

    try {
      if (!lite) RectAreaLightUniformsLib.init();
    } catch {
      /* ignore */
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !lite,
        alpha: false,
        powerPreference: lite ? "default" : "high-performance",
        stencil: false,
        depth: true,
        failIfMajorPerformanceCaveat: false,
      });
    } catch (err) {
      console.error("WebGL unavailable", err);
      return;
    }
    renderer.setClearColor(STAGE, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = lite ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = lite ? 0.92 : 0.98;
    renderer.shadowMap.enabled = !lite;
    if (!lite) {
      // Soft shadows; only rebuild maps when the neck actually moves
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
    }
    renderer.domElement.style.touchAction = "none";
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const backdropTex = makeStageBackdrop();
    scene.background = backdropTex;
    scene.fog = new THREE.Fog(STAGE_DEEP, lite ? 8 : 7.2, lite ? 16 : 15);

    let pmrem: THREE.PMREMGenerator | null = null;
    if (!lite) {
      try {
        pmrem = new THREE.PMREMGenerator(renderer);
        const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = env;
        scene.environmentIntensity = 0.28;
      } catch {
        /* env map optional */
      }
    }

    const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 40);
    camera.position.set(0, 1.25, 2.6);
    camera.lookAt(0, 1.1, 0);

    // Softly lit room — brighter than dim, still not blown out.
    scene.add(new THREE.AmbientLight(0xc8c2b8, lite ? 0.18 : 0.035));
    scene.add(new THREE.HemisphereLight(0xfff0e0, 0x3a454e, lite ? 0.26 : 0.16));

    let key: THREE.RectAreaLight | THREE.DirectionalLight;
    let fill: THREE.RectAreaLight | THREE.DirectionalLight;
    let keySun: THREE.DirectionalLight;
    let softSun: THREE.DirectionalLight | null = null;
    let rim: THREE.SpotLight | null = null;
    let kick: THREE.SpotLight | null = null;
    let bounce: THREE.RectAreaLight | null = null;
    let eyeCatch: THREE.PointLight | null = null;
    let warm: THREE.PointLight | null = null;
    let cool: THREE.PointLight | null = null;
    let cheek: THREE.SpotLight | null = null;

    if (lite) {
      key = new THREE.DirectionalLight(0xffd2a8, 1.35);
      key.position.set(1.85, 2.45, 1.15);
      scene.add(key);

      fill = new THREE.DirectionalLight(0x8aa6c8, 0.2);
      fill.position.set(-1.9, 1.05, 1.35);
      scene.add(fill);

      keySun = new THREE.DirectionalLight(0xffc48a, 0.4);
      keySun.position.set(2.1, 2.9, 0.85);
      keySun.castShadow = false;
      scene.add(keySun);
      keySun.target.position.set(0, 1.2, 0);
      scene.add(keySun.target);
    } else {
      key = new THREE.RectAreaLight(0xffd4a8, 4.0, 1.8, 2.4);
      key.position.set(1.85, 2.45, 1.25);
      key.lookAt(0, 1.15, 0);
      scene.add(key);

      keySun = new THREE.DirectionalLight(0xffc089, 1.65);
      keySun.position.set(2.4, 3.4, 1.35);
      keySun.castShadow = true;
      keySun.shadow.mapSize.set(2048, 2048);
      keySun.shadow.camera.near = 0.4;
      keySun.shadow.camera.far = 14;
      keySun.shadow.camera.left = -1.6;
      keySun.shadow.camera.right = 1.6;
      keySun.shadow.camera.top = 1.8;
      keySun.shadow.camera.bottom = -1.4;
      keySun.shadow.bias = -0.00018;
      keySun.shadow.normalBias = 0.028;
      keySun.shadow.radius = 2.8;
      scene.add(keySun);
      keySun.target.position.set(0, 1.15, 0);
      scene.add(keySun.target);

      softSun = new THREE.DirectionalLight(0xffe0c0, 0.38);
      softSun.position.set(1.1, 4.2, 2.2);
      softSun.castShadow = false;
      scene.add(softSun);
      softSun.target.position.set(0, 0.9, 0);
      scene.add(softSun.target);

      fill = new THREE.RectAreaLight(0x8aa8c4, 0.95, 2.8, 3.4);
      fill.position.set(-2.25, 1.15, 1.55);
      fill.lookAt(0, 1.05, 0);
      scene.add(fill);

      rim = new THREE.SpotLight(0xb0d0ff, 3.2, 18, 0.42, 0.42, 1);
      rim.position.set(-1.45, 3.05, -2.45);
      rim.target.position.set(0, 1.28, 0);
      rim.castShadow = false;
      scene.add(rim);
      scene.add(rim.target);

      kick = new THREE.SpotLight(0xff9a62, 1.7, 12, 0.34, 0.48, 1.15);
      kick.position.set(2.25, 1.95, -1.55);
      kick.target.position.set(0, 1.18, 0);
      scene.add(kick);
      scene.add(kick.target);

      bounce = new THREE.RectAreaLight(0xffe6c4, 0.35, 2.8, 1.1);
      bounce.position.set(0.1, 0.08, 1.15);
      bounce.lookAt(0, 1.2, 0);
      scene.add(bounce);

      eyeCatch = new THREE.PointLight(0xfff4e0, 0.48, 2.6, 2);
      eyeCatch.position.set(0.35, 1.58, 1.6);
      scene.add(eyeCatch);

      warm = new THREE.PointLight(0xffb070, 0.18, 4.5, 2);
      warm.position.set(1.4, 1.6, 1.1);
      scene.add(warm);

      cool = new THREE.PointLight(0x7ea6d4, 0.12, 4.8, 2);
      cool.position.set(-1.5, 1.3, 0.9);
      scene.add(cool);

      cheek = new THREE.SpotLight(0xffd6b0, 0.7, 7, 0.3, 0.68, 1.3);
      cheek.position.set(0.9, 2.1, 1.6);
      cheek.target.position.set(0.12, 1.22, 0);
      scene.add(cheek);
      scene.add(cheek.target);
    }

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(lite ? 7 : 14, 64),
      new THREE.MeshStandardMaterial({
        color: STAGE,
        roughness: 0.88,
        metalness: 0,
        envMapIntensity: 0.16,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = !lite;
    scene.add(ground);

    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(lite ? 16 : 24, lite ? 10 : 16),
      new THREE.MeshStandardMaterial({
        color: STAGE_DEEP,
        roughness: 0.94,
        metalness: 0,
        envMapIntensity: 0.16,
      })
    );
    wall.position.set(0, 4.2, lite ? -4.2 : -5.4);
    wall.receiveShadow = !lite;
    scene.add(wall);

    const keyHome = key.position.clone();
    const fillHome = fill.position.clone();
    const warmHome = warm?.position.clone() ?? new THREE.Vector3();
    const coolHome = cool?.position.clone() ?? new THREE.Vector3();
    const cheekHome = cheek?.position.clone() ?? new THREE.Vector3();
    const rimHome = rim?.position.clone() ?? new THREE.Vector3();
    const kickHome = kick?.position.clone() ?? new THREE.Vector3();
    const keySunHome = keySun.position.clone();
    const softSunHome = softSun?.position.clone() ?? new THREE.Vector3();
    const lightAim = new THREE.Vector3(0, 1.2, 0);
    const tmpAim = new THREE.Vector3();

    const applyLiveLights = (t: number) => {
      if (lite) return; // static lights on Safari — huge CPU/GPU save
      if (!(key instanceof THREE.RectAreaLight)) return;
      if (!(fill instanceof THREE.RectAreaLight)) return;
      if (!rim || !kick || !bounce || !eyeCatch || !warm || !cool || !cheek) return;

      const breath = 0.5 + 0.5 * Math.sin(t * 0.22);
      const mx = lookNdcSmooth.x;
      const my = lookNdcSmooth.y;

      key.intensity = 3.8 + breath * 0.12;
      keySun.intensity = 1.55 + breath * 0.05;
      if (softSun) softSun.intensity = 0.35;
      fill.intensity = 0.9 + Math.max(0, -mx) * 0.08;
      rim.intensity = 3.0 + breath * 0.12 + Math.max(0, -mx) * 0.15;
      kick.intensity = 1.6 + Math.max(0, mx) * 0.12;
      bounce.intensity = 0.32;
      eyeCatch.intensity = 0.45 + breath * 0.04;
      warm.intensity = 0.16;
      cool.intensity = 0.1;
      cheek.intensity = 0.65 + breath * 0.04;

      key.position.set(keyHome.x + mx * 0.08, keyHome.y + my * 0.04, keyHome.z);
      keySun.position.set(keySunHome.x + mx * 0.1, keySunHome.y, keySunHome.z);
      if (softSun) {
        softSun.position.set(softSunHome.x + mx * 0.05, softSunHome.y, softSunHome.z);
      }
      fill.position.set(fillHome.x, fillHome.y, fillHome.z);
      rim.position.set(rimHome.x - mx * 0.06, rimHome.y, rimHome.z);
      kick.position.set(kickHome.x + mx * 0.06, kickHome.y, kickHome.z);
      warm.position.copy(warmHome);
      cool.position.copy(coolHome);
      cheek.position.set(cheekHome.x + mx * 0.12, cheekHome.y + my * 0.05, cheekHome.z);
      eyeCatch.position.set(0.32 + mx * 0.08, 1.58 + my * 0.03, 1.55);

      tmpAim.copy(lightAim);
      tmpAim.x += mx * 0.1;
      tmpAim.y += my * 0.05;
      key.lookAt(tmpAim);
      fill.lookAt(tmpAim);
      cheek.target.position.copy(tmpAim);
      cheek.target.updateMatrixWorld();
      rim.target.position.copy(tmpAim);
      rim.target.updateMatrixWorld();
      kick.target.position.copy(tmpAim);
      kick.target.updateMatrixWorld();
      keySun.target.position.copy(tmpAim);
      keySun.target.updateMatrixWorld();
      if (softSun) {
        softSun.target.position.set(tmpAim.x, Math.max(0.2, tmpAim.y - 0.35), tmpAim.z);
        softSun.target.updateMatrixWorld();
      }

      renderer.toneMappingExposure = 0.96 + breath * 0.015;
      scene.environmentIntensity = 0.26;
    };

    const root = new THREE.Group();
    root.rotation.x = THREE.MathUtils.degToRad(5);
    scene.add(root);

    const clock = new THREE.Clock();
    let raf = 0;
    let disposed = false;
    let ticking = false;
    let inView = true;
    let tick: (now?: number) => void = () => undefined;

    const kickRenderLoop = () => {
      if (disposed || ticking) return;
      ticking = true;
      raf = requestAnimationFrame((t) => tick(t));
    };

    /** -1..1 look target (mouse NDC on desktop, sensor-derived on mobile) */
    const lookNdc = new THREE.Vector2(0, 0);
    const lookNdcSmooth = new THREE.Vector2(0, 0);
    const prevLook = new THREE.Vector2(0, 0);
    let lookMoved = false;
    let gazeSettled = true;
    let stillFrames = 0;

    const headWorld = new THREE.Vector3();
    const box = new THREE.Box3();
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();

    let joints: LookJoint[] = [];
    let skeleton: THREE.Skeleton | null = null;
    let framed = false;
    let mixer: THREE.AnimationMixer | null = null;
    let lookBone: THREE.Object3D | null = null;
    let headBone: THREE.Object3D | null = null;
    let lockedBones: { bone: THREE.Object3D; bindQuat: THREE.Quaternion }[] = [];
    const lookBindPos = new THREE.Vector3();
    const qYaw = new THREE.Quaternion();
    const qPitch = new THREE.Quaternion();
    const qOffset = new THREE.Quaternion();
    const axisY = new THREE.Vector3(0, 1, 0);
    const axisX = new THREE.Vector3(1, 0, 0);

    let targetYaw = 0;
    let targetPitch = 0;
    let smoothYaw = 0;
    let smoothPitch = 0;

    let framePortraitFn: (() => void) | null = null;

    const isTouchDevice = isMobileOrTabletDevice();
    // Sensors are unreliable in LinkedIn / in-app browsers — touch-drag still works.
    const useDeviceSensors = isTouchDevice && !lite;
    let orientBase: { beta: number; gamma: number } | null = null;
    let orientListening = false;

    // Touch-drag look — works on every iPhone even if motion is denied
    let dragActive = false;
    let dragOriginX = 0;
    let dragOriginY = 0;
    let dragBaseX = 0;
    let dragBaseY = 0;

    const resize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1 : 1.75));
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      framePortraitFn?.();
    };
    resize();

    const pushLook = (x: number, y: number) => {
      lookNdc.x = THREE.MathUtils.clamp(x, -1, 1);
      lookNdc.y = THREE.MathUtils.clamp(y, -1, 1);
      lookMoved = true;
      gazeSettled = false;
      stillFrames = 0;
      kickRenderLoop();
    };
    const onMouseMove = (e: PointerEvent) => {
      if (useDeviceSensors) return;
      if (e.pointerType === "touch") return;
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      pushLook((e.clientX / w) * 2 - 1, -((e.clientY / h) * 2 - 1));
    };

    const onDeviceOrient = (e: DeviceOrientationEvent) => {
      if (!useDeviceSensors || disposed) return;
      const beta = e.beta;
      const gamma = e.gamma;
      if (
        beta == null ||
        gamma == null ||
        Number.isNaN(beta) ||
        Number.isNaN(gamma)
      ) {
        return;
      }

      if (!orientBase) orientBase = { beta, gamma };

      const dGamma = gamma - orientBase.gamma;
      const dBeta = beta - orientBase.beta;
      const x = THREE.MathUtils.clamp(dGamma / 22, -1, 1);
      const y = THREE.MathUtils.clamp(-dBeta / 30, -1, 1);
      pushLook(x, y);
    };

    const startOrientationListening = () => {
      if (orientListening || disposed) return;
      orientListening = true;
      orientBase = null;
      window.addEventListener("deviceorientation", onDeviceOrient, true);
      setShowMotionPrompt(false);
    };

    // MUST call requestPermission directly from the button click (iOS Safari)
    enableMotionRef.current = () => {
      const DOE = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (typeof DOE.requestPermission === "function") {
        void DOE.requestPermission()
          .then((res) => {
            if (res === "granted") startOrientationListening();
            else setShowMotionPrompt(false);
          })
          .catch(() => setShowMotionPrompt(false));
        return;
      }
      startOrientationListening();
    };

    const onDragDown = (e: PointerEvent) => {
      if (!useDeviceSensors) return;
      if (e.target !== renderer.domElement) return;
      dragActive = true;
      dragOriginX = e.clientX;
      dragOriginY = e.clientY;
      dragBaseX = lookNdc.x;
      dragBaseY = lookNdc.y;
      try {
        renderer.domElement.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    const onDragMove = (e: PointerEvent) => {
      if (!dragActive) return;
      const w = Math.max(window.innerWidth, 1);
      const h = Math.max(window.innerHeight, 1);
      const dx = ((e.clientX - dragOriginX) / w) * 2.4;
      const dy = ((e.clientY - dragOriginY) / h) * 2.4;
      pushLook(dragBaseX + dx, dragBaseY - dy);
    };

    const onDragUp = (e: PointerEvent) => {
      if (!dragActive) return;
      dragActive = false;
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    if (isTouchDevice) {
      renderer.domElement.addEventListener("pointerdown", onDragDown);
      renderer.domElement.addEventListener("pointermove", onDragMove);
      renderer.domElement.addEventListener("pointerup", onDragUp);
      renderer.domElement.addEventListener("pointercancel", onDragUp);

      if (useDeviceSensors) {
        if (needsIosMotionPermission()) {
          setShowMotionPrompt(true);
        } else {
          startOrientationListening();
        }
      }
    } else {
      window.addEventListener("pointermove", onMouseMove);
    }

    window.addEventListener("resize", resize);
    const ro = new ResizeObserver(() => resize());
    ro.observe(mount);

    const applyGaze = (dt: number) => {
      if (!joints.length && !headBone) return;

        if (lookMoved) {
        // Match dooogs look range — softer upward pitch so the chin doesn't smoosh
        targetYaw = lookNdcSmooth.x * 0.72;
        const up = lookNdcSmooth.y > 0;
        targetPitch = lookNdcSmooth.y * (up ? 0.16 : 0.28);
      }

      for (const locked of lockedBones) {
        locked.bone.quaternion.copy(locked.bindQuat);
        locked.bone.updateMatrix();
      }

      const damp = lookMoved ? 11 : 13;
      const k = 1 - Math.exp(-dt * damp);
      smoothYaw += (targetYaw - smoothYaw) * k;
      smoothPitch += (targetPitch - smoothPitch) * k;

      for (const joint of joints) {
        const { bone, bindQuat, weight, maxYaw, maxPitch, yawScale } = joint;
        const yaw = THREE.MathUtils.clamp(
          smoothYaw * weight * yawScale,
          -maxYaw,
          maxYaw
        );
        const pitchRaw = smoothPitch * weight;
        // Less pitch looking up (positive) — protects under-chin from smooshing
        const pitch = THREE.MathUtils.clamp(
          pitchRaw,
          -maxPitch * 1.35,
          maxPitch
        );

        qYaw.setFromAxisAngle(axisY, yaw);
        qPitch.setFromAxisAngle(axisX, -pitch);
        qOffset.copy(qYaw).multiply(qPitch);
        bone.quaternion.copy(bindQuat).multiply(qOffset);
        bone.updateMatrix();
        bone.updateMatrixWorld(true);
      }

      if (lookBone) {
        lookBone.position.set(
          lookBindPos.x + lookNdcSmooth.x * LOOK_RANGE_X,
          lookBindPos.y + lookNdcSmooth.y * LOOK_RANGE_Y,
          lookBindPos.z
        );
        lookBone.updateMatrix();
        lookBone.updateMatrixWorld(true);
      }

      if (skeleton) {
        const rootBone = skeleton.bones[0];
        if (rootBone?.parent) rootBone.parent.updateMatrixWorld(true);
        else skeleton.bones.forEach((b) => b.updateMatrixWorld(true));
        skeleton.update();
      }

      const angErr =
        Math.abs(smoothYaw - targetYaw) + Math.abs(smoothPitch - targetPitch);
      if (!lookMoved && angErr < 0.002) gazeSettled = true;
    };

    const draco = new DRACOLoader();
    draco.setDecoderPath(withBase("/draco/"));
    draco.preload();
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);

    loader.load(
      withBase(`${MODEL_BASE}?v=${encodeURIComponent(modelRev)}`),
      (gltf) => {
        if (disposed) return;
        const model = gltf.scene;

        model.traverse((obj) => {
          const mesh = obj as THREE.SkinnedMesh;
          if (!(mesh as THREE.Mesh).isMesh) return;
          mesh.frustumCulled = false;
          mesh.castShadow = !lite;
          mesh.receiveShadow = !lite;
          if (mesh.isSkinnedMesh && mesh.skeleton) skeleton = mesh.skeleton;
          const mats = Array.isArray(mesh.material)
            ? mesh.material
            : [mesh.material];
          const upgraded: THREE.Material[] = [];
          for (const mat of mats) {
            const std = mat as THREE.MeshStandardMaterial;
            const phys = new THREE.MeshPhysicalMaterial();
            phys.name = std.name;
            phys.map = std.map;
            phys.normalMap = std.normalMap;
            phys.normalScale.copy(std.normalScale || new THREE.Vector2(1, 1));
            phys.roughnessMap = std.roughnessMap;
            phys.metalnessMap = std.metalnessMap;
            phys.aoMap = std.aoMap;
            phys.emissiveMap = std.emissiveMap;
            phys.color.copy(std.color);
            phys.emissive.copy(std.emissive);
            phys.roughness = std.roughnessMap ? 1 : Math.min(std.roughness || 1, 0.62);
            phys.metalness = std.metalnessMap ? std.metalness : Math.min(std.metalness || 0, 0.08);
            phys.envMapIntensity = 0.4;
            phys.clearcoat = 0.12;
            phys.clearcoatRoughness = 0.48;
            phys.sheen = 0.18;
            phys.sheenRoughness = 0.55;
            phys.sheenColor.setHex(0xffe0c4);
            phys.side = THREE.DoubleSide;
            if (std.transparent) {
              phys.transparent = true;
              phys.opacity = std.opacity;
            }
            if (std.alphaTest > 0) {
              phys.alphaTest = std.alphaTest;
            }
            const maps = [
              phys.map,
              phys.normalMap,
              phys.roughnessMap,
              phys.metalnessMap,
              phys.aoMap,
            ];
            for (const tex of maps) {
              if (!tex) continue;
              tex.anisotropy = lite ? 4 : 16;
              tex.generateMipmaps = true;
              tex.minFilter = THREE.LinearMipmapLinearFilter;
              tex.magFilter = THREE.LinearFilter;
            }
            if (phys.map) phys.map.colorSpace = THREE.SRGBColorSpace;
            phys.needsUpdate = true;
            std.dispose();
            upgraded.push(phys);
          }
          mesh.material = upgraded.length === 1 ? upgraded[0] : upgraded;
        });

        root.add(model);
        root.updateMatrixWorld(true);

        box.setFromObject(model);
        ground.position.y = box.min.y + 0.01;
        wall.position.y = ground.position.y + 4.2;

        const chest = findBone(model, ["chest", "Body"]);
        const rootBone = findBone(model, ["root"]);
        const n1 = findBone(model, ["neck_01", "Neck_01", "neck"]);
        const n2 = findBone(model, ["neck_02", "Neck_02"]);
        headBone = findBone(model, ["head", "Head"]);
        lookBone = findBone(model, ["Look"]);
        // Lock torso + head local — bend only neck_01/neck_02; head follows as rigid child.
        lockedBones = [rootBone, chest, headBone]
          .filter((bone): bone is THREE.Object3D => Boolean(bone))
          .map((bone) => {
            bone.updateWorldMatrix(true, false);
            return { bone, bindQuat: bone.quaternion.clone() };
          });

        if (gltf.animations?.length) {
          mixer = new THREE.AnimationMixer(model);
          const idle =
            gltf.animations.find((c) => /idle|breath/i.test(c.name)) ??
            gltf.animations[0];
          const action = mixer.clipAction(idle);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.play();
        }

        const make = (
          bone: THREE.Object3D | null,
          weight: number,
          maxYaw: number,
          maxPitch: number,
          yawScale = 1
        ): LookJoint | null => {
          if (!bone) return null;
          bone.updateWorldMatrix(true, false);
          return {
            bone,
            bindQuat: bone.quaternion.clone(),
            weight,
            maxYaw,
            maxPitch,
            yawScale,
          };
        };

        if (lookBone) lookBindPos.copy(lookBone.position);

        // Bendable neck only — head stays locally locked so the face can't tear.
        joints = [
          make(n1, 0.55, 0.28, 0.10, 1),
          make(n2, 0.70, 0.35, 0.12, 1),
        ].filter(Boolean) as LookJoint[];

        // Fallback if neck_02 missing from older GLB
        if (!n2 && n1) {
          joints = [make(n1, 0.85, 0.45, 0.14, 1)].filter(Boolean) as LookJoint[];
        }
        if (!joints.length && headBone) {
          joints = [make(headBone, 0.7, 0.4, 0.12, 1)].filter(Boolean) as LookJoint[];
        }

        if (!joints.length) {
          box.setFromObject(model);
          box.getSize(size);
          box.getCenter(center);
          const pivot = new THREE.Group();
          pivot.name = "LookPivot";
          pivot.position.set(center.x, box.min.y + size.y * 0.72, center.z);
          root.add(pivot);
          pivot.attach(model);
          joints = [make(pivot, 1, 0.42, 0.26, 1)].filter(Boolean) as LookJoint[];
        }

        const framePortrait = () => {
          try {
            root.updateMatrixWorld(true);
            box.setFromObject(model);
            box.getSize(size);
            box.getCenter(center);

            if (headBone) {
              headBone.getWorldPosition(headWorld);
            } else {
              headWorld.set(center.x, box.min.y + size.y * 0.78, center.z);
            }
            const dist = Math.max(2.15, size.y * 1.2);
            const mobile = (mount.clientWidth || window.innerWidth) < 1024;
            const screenShiftX = mobile ? 0.14 : 0.5;
            camera.fov = mobile ? 38 : 34;
            camera.updateProjectionMatrix();
            camera.position.set(
              headWorld.x,
              headWorld.y - (mobile ? 0.2 : 0.22),
              headWorld.z + dist * (mobile ? 1.32 : 1.22)
            );
            camera.lookAt(
              headWorld.x - screenShiftX,
              headWorld.y - (mobile ? 0.38 : 0.36),
              headWorld.z
            );
            camera.rotateX(-VIEW_LIFT);
            lightAim.set(headWorld.x, headWorld.y, headWorld.z);
            key.lookAt(lightAim);
            fill.lookAt(lightAim);
            if (cheek) cheek.target.position.copy(lightAim);
            keySun.target.position.copy(lightAim);
            keySun.target.updateMatrixWorld();
            if (softSun) {
              softSun.target.position.set(lightAim.x, ground.position.y + 0.4, lightAim.z);
              softSun.target.updateMatrixWorld();
            }
            framed = true;
            renderer.render(scene, camera);
          } catch (err) {
            console.warn("framePortrait", err);
            framed = true;
          }
        };
        framePortraitFn = framePortrait;
        framePortrait();
        requestAnimationFrame(() => {
          framePortrait();
          requestAnimationFrame(framePortrait);
        });
      },
      undefined,
      (err) => console.error("Failed to load character", err)
    );

    let lastFrame = 0;
    // Cap at ~45fps when moving; idle settles to near-zero GPU when settled
    const minFrameMs = lite ? 1000 / 28 : 1000 / 45;

    const onContextLost = (e: Event) => {
      e.preventDefault();
      disposed = true;
      cancelAnimationFrame(raf);
      ticking = false;
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost, false);

    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              inView = entries.some((e) => e.isIntersecting && e.intersectionRatio > 0.05);
              if (inView) kickRenderLoop();
            },
            { threshold: [0, 0.05, 0.2] }
          )
        : null;
    if (io) io.observe(mount);

    const onVisibility = () => {
      if (document.visibilityState === "visible") kickRenderLoop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    tick = (now = performance.now()) => {
      if (disposed) {
        ticking = false;
        return;
      }

      const pageHidden = document.hidden || !inView;
      if (pageHidden) {
        ticking = false;
        return;
      }

      // Keep the loop alive while settling; pause when fully idle (no clip playing)
      const settledIdle = gazeSettled && !lookMoved;
      if (settledIdle && framed && !mixer) {
        ticking = false;
        try {
          renderer.render(scene, camera);
        } catch {
          disposed = true;
        }
        return;
      }

      raf = requestAnimationFrame((t) => tick(t));

      // Idle animation (if any): drop to ~12fps. Active look: ~45fps.
      const budget = settledIdle && mixer ? 1000 / 12 : minFrameMs;
      if (budget && now - lastFrame < budget) return;
      lastFrame = now;

      const dt = Math.min(clock.getDelta(), 0.05);
      const movedDist = lookNdc.distanceTo(prevLook);
      if (movedDist > STILL_EPS) {
        lookMoved = true;
        gazeSettled = false;
      }
      prevLook.copy(lookNdc);

      // Sensors: slightly softer follow so gyro noise doesn't jitter the neck
      const followRate = useDeviceSensors ? 9 : 14;
      lookNdcSmooth.lerp(lookNdc, 1 - Math.exp(-dt * followRate));
      const followErr = lookNdcSmooth.distanceTo(lookNdc);
      if (followErr < STILL_EPS && movedDist < STILL_EPS) {
        lookMoved = false;
        stillFrames += 1;
      } else {
        stillFrames = 0;
      }

      if (mixer) {
        mixer.update(dt);
        if (skeleton) {
          const rootBone = skeleton.bones[0];
          if (rootBone?.parent) rootBone.parent.updateMatrixWorld(true);
          else skeleton.bones.forEach((b) => b.updateMatrixWorld(true));
          skeleton.update();
        }
      }

      if (!gazeSettled || lookMoved) applyGaze(dt);
      if (!lookMoved && stillFrames >= STILL_FRAMES_TO_FREEZE) {
        gazeSettled = true;
      }

      // Light breath only while looking — freeze when idle to skip GPU work
      if (!gazeSettled || lookMoved) {
        applyLiveLights(clock.elapsedTime);
        if (!lite) renderer.shadowMap.needsUpdate = true;
      }

      try {
        renderer.render(scene, camera);
      } catch {
        disposed = true;
        cancelAnimationFrame(raf);
        ticking = false;
      }
    };
    kickRenderLoop();

    return () => {
      disposed = true;
      ticking = false;
      cancelAnimationFrame(raf);
      enableMotionRef.current = null;
      window.removeEventListener("pointermove", onMouseMove);
      window.removeEventListener("deviceorientation", onDeviceOrient, true);
      document.removeEventListener("visibilitychange", onVisibility);
      io?.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onDragDown);
      renderer.domElement.removeEventListener("pointermove", onDragMove);
      renderer.domElement.removeEventListener("pointerup", onDragUp);
      renderer.domElement.removeEventListener("pointercancel", onDragUp);
      renderer.domElement.removeEventListener("webglcontextlost", onContextLost);
      window.removeEventListener("resize", resize);
      ro.disconnect();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
      try {
        draco.dispose();
        renderer.dispose();
        pmrem?.dispose();
        backdropTex.dispose();
        ground.geometry.dispose();
        (ground.material as THREE.Material).dispose();
        wall.geometry.dispose();
        (wall.material as THREE.Material).dispose();
      } catch {
        /* ignore */
      }
    };
  }, [FRAME_REV, modelRev]);

  return (
    <>
      <div ref={mountRef} className={className} aria-hidden="true" />
      {showMotionPrompt && typeof document !== "undefined"
        ? createPortal(
            <button
              type="button"
              className="c-lisa_motion-enable"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                enableMotionRef.current?.();
              }}
              onTouchEnd={(e) => {
                // iOS: ensure the gesture registers even if click is flaky
                e.preventDefault();
                e.stopPropagation();
                enableMotionRef.current?.();
              }}
            >
              Allow motion look
            </button>,
            document.body
          )
        : null}
    </>
  );
}
