import * as React from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {
  createBlueprintPlateTexture,
  createBookCoverTexture,
  createDeskMatTexture,
  createExamPaperTexture,
  createMicroGrainDataTexture,
  createPageEdgesTexture,
  createRubricCardTexture,
} from './textures';
import { buildStudioAssemblies, type StudioSceneAssemblies } from './models';
import {
  BOARD_META,
  STUDIO_PARTS,
  type BoardPreset,
  type CameraPreset,
  type SetFocusMode,
  type StudioPartId,
} from './types';

export interface StudioHeroCanvasProps {
  board: BoardPreset;
  setFocus: SetFocusMode;
  cameraPreset: CameraPreset;
  cameraTriggerNonce: number;
  exploded: boolean;
  isDark: boolean;
  inspectedPart: StudioPartId | null;
  onInspectPart: (part: StudioPartId | null) => void;
}

interface ProbeResult {
  supported: boolean;
  isSoftwareGl: boolean;
}

function probeWebGL2(): ProbeResult {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (!gl) {
      return { supported: false, isSoftwareGl: false };
    }
    let rendererStr = '';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      rendererStr = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
    } else {
      rendererStr = String(gl.getParameter(gl.RENDERER) || '');
    }
    const isSoftwareGl =
      /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render/i.test(rendererStr);

    const loseExt = gl.getExtension('WEBGL_lose_context');
    loseExt?.loseContext();
    return { supported: true, isSoftwareGl };
  } catch {
    return { supported: false, isSoftwareGl: false };
  }
}

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  hero: { pos: [4.35, 3.65, 5.15], target: [0.05, 0.45, 0.05] },
  exploded: { pos: [4.85, 3.45, 5.4], target: [0.0, 0.95, 0.0] },
  sets: { pos: [2.75, 2.75, 3.85], target: [1.15, 0.28, 0.25] },
  overhead: { pos: [0.05, 6.25, 1.35], target: [0.0, 0.35, 0.05] },
};

function disposeMaterial(material: THREE.Material) {
  const mat = material as unknown as Record<string, unknown>;
  const mapKeys = ['map', 'roughnessMap', 'metalnessMap', 'normalMap', 'aoMap', 'emissiveMap'];
  for (const key of mapKeys) {
    const tex = mat[key];
    if (tex && tex instanceof THREE.Texture) {
      tex.dispose();
    }
  }
  material.dispose();
}

export function StudioHeroCanvas({
  board,
  setFocus,
  cameraPreset,
  cameraTriggerNonce,
  exploded,
  isDark,
  inspectedPart,
  onInspectPart,
}: StudioHeroCanvasProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mountRef = React.useRef<HTMLDivElement | null>(null);
  const [webglProbe] = React.useState<ProbeResult>(() =>
    typeof document !== 'undefined' ? probeWebGL2() : { supported: false, isSoftwareGl: false }
  );
  const [rendererFailed, setRendererFailed] = React.useState(false);
  const [contextLost, setContextLost] = React.useState(false);
  const fallbackActive = !webglProbe.supported || rendererFailed;

  // Mutable sync refs read by the Three.js loop without re-creating the WebGL context
  const stateRef = React.useRef({
    board,
    setFocus,
    exploded,
    isDark,
    inspectedPart,
  });
  const onInspectRef = React.useRef(onInspectPart);

  React.useEffect(() => {
    stateRef.current = { board, setFocus, exploded, isDark, inspectedPart };
    onInspectRef.current = onInspectPart;
  }, [board, setFocus, exploded, isDark, inspectedPart, onInspectPart]);

  const sceneRuntimeRef = React.useRef<{
    applyBoardTextures: (nextBoard: BoardPreset, nextDark: boolean) => void;
    applyThemeColors: (nextDark: boolean) => void;
    triggerCameraPreset: (preset: CameraPreset) => void;
    requestRender: () => void;
  } | null>(null);

  React.useEffect(() => {
    const containerEl = containerRef.current;
    const mountEl = mountRef.current;
    if (!containerEl || !mountEl || !webglProbe.supported) return;

    const isSoftwareGl = webglProbe.isSoftwareGl;
    const initialDark = stateRef.current.isDark;
    const initialBoard = stateRef.current.board;

    let disposed = false;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: false,
        powerPreference: isSoftwareGl ? 'low-power' : 'high-performance',
      });
    } catch {
      queueMicrotask(() => setRendererFailed(true));
      return;
    }

    const width = Math.max(containerEl.clientWidth || 720, 320);
    const height = Math.max(containerEl.clientHeight || 520, 320);

    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = !isSoftwareGl;
    if (!isSoftwareGl) {
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    const canvasEl = renderer.domElement;
    canvasEl.style.display = 'block';
    canvasEl.style.width = '100%';
    canvasEl.style.height = '100%';
    canvasEl.style.outline = 'none';
    canvasEl.setAttribute('aria-label', 'Interactive 3D EduPulse Examination Studio');
    mountEl.appendChild(canvasEl);

    const maxAnisotropy = isSoftwareGl
      ? 1
      : Math.min(renderer.capabilities.getMaxAnisotropy(), 8);

    // Scene + Studio Background & Atmospheric Fog
    let pmremGenerator: THREE.PMREMGenerator;
    let envRT: THREE.WebGLRenderTarget;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let controls: OrbitControls;
    let hemiLight: THREE.HemisphereLight;
    let clothNoiseTex: THREE.DataTexture;
    let pageEdgesTex: THREE.CanvasTexture;
    let deskMatTex: THREE.CanvasTexture;
    let primaryBookTex: THREE.CanvasTexture;
    let companionBookTex: THREE.CanvasTexture;
    let blueprintPlateTex: THREE.CanvasTexture;
    let paperTexA: THREE.CanvasTexture;
    let paperTexB: THREE.CanvasTexture;
    let paperTexC: THREE.CanvasTexture;
    let rubricCardTex: THREE.CanvasTexture;
    let assemblies: StudioSceneAssemblies;

    try {
      scene = new THREE.Scene();
      const bgHex = initialDark ? 0x0d111a : 0xf4f2ed;
      scene.background = new THREE.Color(bgHex);
      scene.fog = new THREE.FogExp2(bgHex, 0.042);

      // PMREM RoomEnvironment for crisp dielectric & metallic reflections
      pmremGenerator = new THREE.PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();
      const roomEnvScene = new RoomEnvironment();
      envRT = pmremGenerator.fromScene(roomEnvScene, 0.04);
      scene.environment = envRT.texture;
      roomEnvScene.dispose();

      // Camera
      camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 60);
      camera.position.set(...CAMERA_PRESETS.hero.pos);

      // OrbitControls
      controls = new OrbitControls(camera, canvasEl);
      controls.target.set(...CAMERA_PRESETS.hero.target);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.06;
      controls.enablePan = false;
      controls.minDistance = 2.8;
      controls.maxDistance = 10.5;
      controls.minPolarAngle = 0.22;
      controls.maxPolarAngle = Math.PI / 2.08;
      controls.update();

      // Three-point studio lighting + GPU RectAreaLight softboxes
      hemiLight = new THREE.HemisphereLight(
        initialDark ? 0xc7d2fe : 0xe0e7ff,
        initialDark ? 0x1e293b : 0xd6d3d1,
        initialDark ? 0.85 : 0.92
      );
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.65);
      keyLight.position.set(4.5, 6.8, 4.2);
      if (!isSoftwareGl) {
        keyLight.castShadow = true;
        keyLight.shadow.mapSize.set(1024, 1024);
        keyLight.shadow.camera.near = 1.0;
        keyLight.shadow.camera.far = 18;
        keyLight.shadow.camera.left = -4.8;
        keyLight.shadow.camera.right = 4.8;
        keyLight.shadow.camera.top = 4.8;
        keyLight.shadow.camera.bottom = -4.8;
        keyLight.shadow.bias = -0.0005;
        keyLight.shadow.normalBias = 0.02;
        keyLight.shadow.radius = 3;
      }
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0x818cf8, 1.15);
      rimLight.position.set(-4.8, 3.8, -4.4);
      scene.add(rimLight);

      if (!isSoftwareGl) {
        RectAreaLightUniformsLib.init();
        const overheadSoftbox = new THREE.RectAreaLight(0xffffff, 2.6, 4.5, 2.4);
        overheadSoftbox.position.set(0, 4.8, 0.5);
        overheadSoftbox.lookAt(0, 0.2, 0);
        scene.add(overheadSoftbox);

        const coolSideSoftbox = new THREE.RectAreaLight(0xc7d2fe, 1.8, 3.2, 2.0);
        coolSideSoftbox.position.set(-4.2, 2.2, 1.5);
        coolSideSoftbox.lookAt(0, 0.5, 0);
        scene.add(coolSideSoftbox);
      }

      // Build procedural textures & composite hero assemblies
      clothNoiseTex = createMicroGrainDataTexture(128);
      pageEdgesTex = createPageEdgesTexture(maxAnisotropy);
      deskMatTex = createDeskMatTexture(initialDark, maxAnisotropy);
      primaryBookTex = createBookCoverTexture(initialBoard, 'primary', maxAnisotropy);
      companionBookTex = createBookCoverTexture(initialBoard, 'companion', maxAnisotropy);
      blueprintPlateTex = createBlueprintPlateTexture(initialBoard, initialDark, maxAnisotropy);
      paperTexA = createExamPaperTexture('A', initialBoard, maxAnisotropy);
      paperTexB = createExamPaperTexture('B', initialBoard, maxAnisotropy);
      paperTexC = createExamPaperTexture('C', initialBoard, maxAnisotropy);
      rubricCardTex = createRubricCardTexture(initialDark, maxAnisotropy);

      assemblies = buildStudioAssemblies({
        isDark: initialDark,
        isSoftwareGl,
        deskMatTex,
        clothNoiseTex,
        primaryBookTex,
        companionBookTex,
        pageEdgesTex,
        blueprintPlateTex,
        paperTexA,
        paperTexB,
        paperTexC,
        rubricCardTex,
      });
      scene.add(assemblies.root);

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }
    } catch {
      if (canvasEl.parentNode === mountEl) {
        mountEl.removeChild(canvasEl);
      }
      renderer.dispose();
      queueMicrotask(() => setRendererFailed(true));
      return;
    }

    // Animation & camera targets (zero per-frame allocations)
    const camGoalPos = new THREE.Vector3(...CAMERA_PRESETS.hero.pos);
    const camGoalTarget = new THREE.Vector3(...CAMERA_PRESETS.hero.target);
    let camAnimating = false;
    let explodeFactor = stateRef.current.exploded ? 1 : 0;
    let setFactorA = 0;
    let setFactorB = 0;
    let setFactorC = 0;

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let pointerDownPos = { x: 0, y: 0 };
    let hoveredPart: StudioPartId | null = null;
    let lastHoverCheck = 0;

    // Coalesced render / Software-WebGL fence pacing state
    let rafId: number | null = null;
    let syncTimerId: number | null = null;
    let renderPending = false;
    let syncInFlight = false;
    let clockTime = 0;
    let lastFrameTs = performance.now();

    const applyAnimationFrame = (dt: number) => {
      const s = stateRef.current;
      clockTime += dt;
      const lambda = isSoftwareGl ? 24 : 7.5;

      const targetExplode = s.exploded ? 1 : 0;
      explodeFactor = THREE.MathUtils.damp(explodeFactor, targetExplode, lambda, dt);

      const targetA = s.setFocus === 'A' ? 1 : 0;
      const targetB = s.setFocus === 'B' ? 1 : 0;
      const targetC = s.setFocus === 'C' ? 1 : 0;
      setFactorA = THREE.MathUtils.damp(setFactorA, targetA, lambda, dt);
      setFactorB = THREE.MathUtils.damp(setFactorB, targetB, lambda, dt);
      setFactorC = THREE.MathUtils.damp(setFactorC, targetC, lambda, dt);

      // Gentle ambient hover for blueprint prism on GPU, crisp offset in exploded view
      const idleFloat = isSoftwareGl ? 0 : Math.sin(clockTime * 1.45) * 0.035;
      assemblies.blueprintGroup.position.y = 1.22 + explodeFactor * 0.62 + idleFloat;
      assemblies.blueprintGroup.position.z = -0.35 - explodeFactor * 0.14;
      assemblies.blueprintGroup.rotation.x = THREE.MathUtils.damp(
        assemblies.blueprintGroup.rotation.x,
        s.exploded ? -0.14 : -0.24,
        lambda,
        dt
      );

      // Textbook slight lift when exploded or inspected
      const bookInspectLift = s.inspectedPart === 'textbook' ? 0.12 : 0;
      assemblies.textbookGroup.position.y = 0.055 + explodeFactor * 0.28 + bookInspectLift;

      // Seal & Rubric subtle inspect lift
      assemblies.sealGroup.position.y =
        0.055 + explodeFactor * 0.2 + (s.inspectedPart === 'seal' ? 0.1 : 0);
      assemblies.rubricGroup.position.y =
        0.055 + explodeFactor * 0.34 + (s.inspectedPart === 'rubric' ? 0.1 : 0);

      // Fanned A4 Exam Sheets A / B / C
      const fanSpread = s.setFocus === 'all' ? 0.18 : 0.24;
      const setsInspectLift = s.inspectedPart === 'sets' ? 0.08 : 0;
      assemblies.paperSetsGroup.position.y = 0.08 + explodeFactor * 0.32 + setsInspectLift;

      assemblies.sheetA.position.set(
        -0.04 - setFactorA * 0.18 - explodeFactor * 0.05,
        0.095 + setFactorA * 0.24 + explodeFactor * 0.3,
        0.05 + setFactorA * 0.14
      );
      assemblies.sheetA.rotation.y = 0.08 + setFactorA * 0.12;

      assemblies.sheetB.position.set(
        0.08 + setFactorB * 0.26,
        0.05 + setFactorB * 0.26 + explodeFactor * 0.16,
        0.0 + setFactorB * 0.18
      );
      assemblies.sheetB.rotation.y = -0.08 + (s.setFocus === 'B' ? 0.02 : -fanSpread * 0.2);

      assemblies.sheetC.position.set(
        0.18 + setFactorC * 0.32 + explodeFactor * 0.06,
        0.01 + setFactorC * 0.28,
        -0.05 + setFactorC * 0.18
      );
      assemblies.sheetC.rotation.y = -0.22 + (s.setFocus === 'C' ? 0.04 : -fanSpread * 0.25);

      if (camAnimating) {
        if (isSoftwareGl) {
          camera.position.copy(camGoalPos);
          controls.target.copy(camGoalTarget);
          camAnimating = false;
        } else {
          camera.position.x = THREE.MathUtils.damp(camera.position.x, camGoalPos.x, 5.5, dt);
          camera.position.y = THREE.MathUtils.damp(camera.position.y, camGoalPos.y, 5.5, dt);
          camera.position.z = THREE.MathUtils.damp(camera.position.z, camGoalPos.z, 5.5, dt);
          controls.target.x = THREE.MathUtils.damp(controls.target.x, camGoalTarget.x, 5.5, dt);
          controls.target.y = THREE.MathUtils.damp(controls.target.y, camGoalTarget.y, 5.5, dt);
          controls.target.z = THREE.MathUtils.damp(controls.target.z, camGoalTarget.z, 5.5, dt);
          if (
            camera.position.distanceToSquared(camGoalPos) < 0.0004 &&
            controls.target.distanceToSquared(camGoalTarget) < 0.0004
          ) {
            camAnimating = false;
          }
        }
      }

      controls.update();

      const stillSettling =
        camAnimating ||
        Math.abs(explodeFactor - targetExplode) > 0.002 ||
        Math.abs(setFactorA - targetA) > 0.002 ||
        Math.abs(setFactorB - targetB) > 0.002 ||
        Math.abs(setFactorC - targetC) > 0.002;

      return stillSettling;
    };

    const drawWithFence = (gl: WebGL2RenderingContext | null) => {
      renderer.render(scene, camera);

      if (isSoftwareGl && gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        if (sync) {
          gl.flush();
          syncInFlight = true;
          const pollSync = () => {
            if (disposed) {
              gl.deleteSync(sync);
              syncInFlight = false;
              return;
            }
            const status = gl.clientWaitSync(sync, 0, 0);
            if (status === gl.WAIT_FAILED || status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) {
              gl.deleteSync(sync);
              syncInFlight = false;
              if (renderPending) {
                renderPending = false;
                scheduleSoftwareRender();
              }
            } else {
              syncTimerId = window.setTimeout(pollSync, 4);
            }
          };
          syncTimerId = window.setTimeout(pollSync, 0);
        }
      }
    };

    const glContext = renderer.getContext() as WebGL2RenderingContext | null;

    const scheduleSoftwareRender = () => {
      if (disposed) return;
      if (syncInFlight) {
        renderPending = true;
        return;
      }
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame((now) => {
        rafId = null;
        if (disposed) return;
        const dt = Math.min((now - lastFrameTs) / 1000, 0.05) || 0.016;
        lastFrameTs = now;
        const stillSettling = applyAnimationFrame(dt);
        drawWithFence(glContext);
        if (stillSettling) {
          scheduleSoftwareRender();
        }
      });
    };

    const requestRender = () => {
      if (disposed) return;
      if (isSoftwareGl) {
        scheduleSoftwareRender();
      }
    };

    // Real-time GPU loop (hardware GPU) OR initial coalesced render (software GL)
    const tickGpu = (now: number) => {
      if (disposed) return;
      const dt = Math.min((now - lastFrameTs) / 1000, 0.05) || 0.016;
      lastFrameTs = now;
      applyAnimationFrame(dt);
      renderer.render(scene, camera);
      rafId = window.requestAnimationFrame(tickGpu);
    };

    if (isSoftwareGl) {
      applyAnimationFrame(0.016);
      drawWithFence(glContext);
    } else {
      rafId = window.requestAnimationFrame(tickGpu);
    }

    // Cancel automatic camera glide if the user grabs OrbitControls
    const onControlStart = () => {
      camAnimating = false;
    };
    const onControlChange = () => {
      requestRender();
    };
    controls.addEventListener('start', onControlStart);
    controls.addEventListener('change', onControlChange);

    // Raycast hover + click selection
    const resolvePartFromEvent = (clientX: number, clientY: number): StudioPartId | null => {
      const rect = canvasEl.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(assemblies.interactables, true);
      const firstHit = hits[0];
      if (!firstHit) return null;
      const partId = firstHit.object.userData?.partId as StudioPartId | undefined;
      return partId ?? null;
    };

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dx = e.clientX - pointerDownPos.x;
      const dy = e.clientY - pointerDownPos.y;
      if (dx * dx + dy * dy > 36) return;
      const hitPart = resolvePartFromEvent(e.clientX, e.clientY);
      if (hitPart) {
        onInspectRef.current(stateRef.current.inspectedPart === hitPart ? null : hitPart);
      } else if (stateRef.current.inspectedPart !== null) {
        onInspectRef.current(null);
      }
      requestRender();
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 60) return;
      lastHoverCheck = now;
      const hit = resolvePartFromEvent(e.clientX, e.clientY);
      if (hit !== hoveredPart) {
        hoveredPart = hit;
        canvasEl.style.cursor = hit ? 'pointer' : 'grab';
      }
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
      requestRender();
    };

    canvasEl.style.cursor = 'grab';
    canvasEl.addEventListener('pointerdown', onPointerDown);
    canvasEl.addEventListener('pointerup', onPointerUp);
    canvasEl.addEventListener('pointermove', onPointerMove);
    canvasEl.addEventListener('webglcontextlost', onContextLost);
    canvasEl.addEventListener('webglcontextrestored', onContextRestored);

    // ResizeObserver for crisp container fitting
    const ro = new ResizeObserver((entries) => {
      if (disposed) return;
      for (const entry of entries) {
        const w = Math.max(Math.floor(entry.contentRect.width), 280);
        const h = Math.max(Math.floor(entry.contentRect.height), 280);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        requestRender();
      }
    });
    ro.observe(containerEl);

    // Runtime texture & theme updaters
    sceneRuntimeRef.current = {
      applyBoardTextures: (nextBoard, nextDark) => {
        const nextBook = createBookCoverTexture(nextBoard, 'primary', maxAnisotropy);
        const nextPlate = createBlueprintPlateTexture(nextBoard, nextDark, maxAnisotropy);
        const nextA = createExamPaperTexture('A', nextBoard, maxAnisotropy);
        const nextB = createExamPaperTexture('B', nextBoard, maxAnisotropy);
        const nextC = createExamPaperTexture('C', nextBoard, maxAnisotropy);

        primaryBookTex.dispose();
        blueprintPlateTex.dispose();
        paperTexA.dispose();
        paperTexB.dispose();
        paperTexC.dispose();

        primaryBookTex = nextBook;
        blueprintPlateTex = nextPlate;
        paperTexA = nextA;
        paperTexB = nextB;
        paperTexC = nextC;

        assemblies.primaryCoverMat.map = nextBook;
        assemblies.primaryCoverMat.needsUpdate = true;
        assemblies.blueprintPlateMat.map = nextPlate;
        assemblies.blueprintPlateMat.needsUpdate = true;
        assemblies.sheetAMat.map = nextA;
        assemblies.sheetAMat.needsUpdate = true;
        assemblies.sheetBMat.map = nextB;
        assemblies.sheetBMat.needsUpdate = true;
        assemblies.sheetCMat.map = nextC;
        assemblies.sheetCMat.needsUpdate = true;

        requestRender();
      },
      applyThemeColors: (nextDark) => {
        const nextBg = nextDark ? 0x0d111a : 0xf4f2ed;
        scene.background = new THREE.Color(nextBg);
        scene.fog = new THREE.FogExp2(nextBg, 0.042);

        hemiLight.color.setHex(nextDark ? 0xc7d2fe : 0xe0e7ff);
        hemiLight.groundColor.setHex(nextDark ? 0x1e293b : 0xd6d3d1);
        hemiLight.intensity = nextDark ? 0.9 : 1.05;

        const nextMatTex = createDeskMatTexture(nextDark, maxAnisotropy);
        const nextRubricTex = createRubricCardTexture(nextDark, maxAnisotropy);
        const nextPlateTex = createBlueprintPlateTexture(
          stateRef.current.board,
          nextDark,
          maxAnisotropy
        );

        deskMatTex.dispose();
        rubricCardTex.dispose();
        blueprintPlateTex.dispose();

        deskMatTex = nextMatTex;
        rubricCardTex = nextRubricTex;
        blueprintPlateTex = nextPlateTex;

        const matMat = assemblies.deskMatMesh.material as THREE.MeshStandardMaterial;
        matMat.map = nextMatTex;
        matMat.needsUpdate = true;

        assemblies.rubricCardMat.map = nextRubricTex;
        assemblies.rubricCardMat.needsUpdate = true;

        assemblies.blueprintPlateMat.map = nextPlateTex;
        assemblies.blueprintPlateMat.emissiveIntensity = nextDark ? 0.14 : 0.04;
        assemblies.blueprintPlateMat.needsUpdate = true;

        assemblies.blueprintGlassMat.color.setHex(nextDark ? 0xc7d2fe : 0xeef2ff);
        requestRender();
      },
      triggerCameraPreset: (preset) => {
        const cfg = CAMERA_PRESETS[preset];
        camGoalPos.set(...cfg.pos);
        camGoalTarget.set(...cfg.target);
        camAnimating = true;
        requestRender();
      },
      requestRender,
    };

    return () => {
      disposed = true;
      sceneRuntimeRef.current = null;
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (syncTimerId !== null) window.clearTimeout(syncTimerId);
      ro.disconnect();
      controls.removeEventListener('start', onControlStart);
      controls.removeEventListener('change', onControlChange);
      controls.dispose();

      canvasEl.removeEventListener('pointerdown', onPointerDown);
      canvasEl.removeEventListener('pointerup', onPointerUp);
      canvasEl.removeEventListener('pointermove', onPointerMove);
      canvasEl.removeEventListener('webglcontextlost', onContextLost);
      canvasEl.removeEventListener('webglcontextrestored', onContextRestored);

      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach(disposeMaterial);
          } else {
            disposeMaterial(obj.material);
          }
        }
      });

      clothNoiseTex.dispose();
      pageEdgesTex.dispose();
      deskMatTex.dispose();
      primaryBookTex.dispose();
      companionBookTex.dispose();
      blueprintPlateTex.dispose();
      paperTexA.dispose();
      paperTexB.dispose();
      paperTexC.dispose();
      rubricCardTex.dispose();
      envRT.dispose();
      pmremGenerator.dispose();
      renderer.dispose();

      if (canvasEl.parentNode === mountEl) {
        mountEl.removeChild(canvasEl);
      }
    };
  }, [webglProbe.supported, webglProbe.isSoftwareGl]);

  // Propagate React control updates to the live Three runtime
  const mountedBoardRef = React.useRef(board);
  React.useEffect(() => {
    if (mountedBoardRef.current !== board) {
      mountedBoardRef.current = board;
      sceneRuntimeRef.current?.applyBoardTextures(board, stateRef.current.isDark);
    }
  }, [board]);

  const mountedDarkRef = React.useRef(isDark);
  React.useEffect(() => {
    if (mountedDarkRef.current !== isDark) {
      mountedDarkRef.current = isDark;
      sceneRuntimeRef.current?.applyThemeColors(isDark);
    }
  }, [isDark]);

  React.useEffect(() => {
    if (cameraTriggerNonce > 0) {
      sceneRuntimeRef.current?.triggerCameraPreset(cameraPreset);
    }
  }, [cameraPreset, cameraTriggerNonce]);

  React.useEffect(() => {
    sceneRuntimeRef.current?.requestRender();
  }, [exploded, setFocus, inspectedPart]);

  if (fallbackActive || contextLost) {
    const meta = BOARD_META[board];
    return (
      <div
        data-testid="studio-3d-fallback"
        className="relative flex h-full w-full flex-col justify-between overflow-hidden bg-[var(--bg-subtle)] p-6 sm:p-8"
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-4">
          <div>
            <div className="text-xs font-mono font-semibold text-[var(--brand-700)] dark:text-[var(--brand-500)]">
              {meta.boardTitle}
            </div>
            <div className="mt-1 text-base font-bold text-[var(--text-primary)]">
              {meta.paperHeader}
            </div>
            <div className="mt-0.5 text-xs text-[var(--text-secondary)]">{meta.paperSub}</div>
          </div>
          <div className="rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1 font-mono text-xs font-semibold text-[var(--text-primary)]">
            {setFocus === 'all' ? 'SETS A · B · C' : `SET ${setFocus}`}
          </div>
        </div>

        <div className="my-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['textbook', 'blueprint', 'sets'] as StudioPartId[]).map((partId) => {
            const info = STUDIO_PARTS[partId];
            return (
              <button
                key={partId}
                type="button"
                onClick={() => onInspectPart(inspectedPart === partId ? null : partId)}
                className={`rounded-lg border p-3.5 text-left transition-colors cursor-pointer ${
                  inspectedPart === partId
                    ? 'border-[var(--brand-600)] bg-[var(--brand-50)]/60'
                    : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="text-xs font-semibold text-[var(--text-primary)]">{info.title}</div>
                <div className="mt-1 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  {info.detail}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border-hairline)] pt-3 text-[11px] font-mono text-[var(--text-muted)]">
          <span>{exploded ? 'EXPLODED ARCHITECTURE' : 'STUDIO DESK VIEW'}</span>
          <span>LOCAL INDEXEDDB · 80 MARKS VERIFIED</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative h-full w-full select-none">
      {/* Isolated WebGL mount node: React never renders children inside mountRef */}
      <div ref={mountRef} className="h-full w-full" />
    </div>
  );
}
