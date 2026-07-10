import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { compose, composeGalaxyField, type GalaxySignalChannel, type RoleField, type RoleId } from "./compositions";
import { compositionRadius, fitCamera } from "./camera-fit";
import type { DependencyGranularity, StyleId, TargetId, VariantId } from "./cosmos-data";
import { cloneGalaxyParameters, defaultGalaxyParameters, type GalaxyParameters, type PointStyleParameters } from "./galaxy-parameters";

interface Callbacks {
  readonly ready: () => void;
  readonly fallback: (message: string) => void;
  readonly pauseChanged: (paused: boolean) => void;
  readonly hoverChanged: (hover: { readonly label: string; readonly x: number; readonly y: number } | null) => void;
}

interface CameraPose {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly minDistance: number;
}

const poses: Record<StyleId, Record<VariantId, CameraPose>> = {
  galaxy: {
    a: { position: [0, 24, 48], target: [0, 0, 0], rotation: [-0.16, 0, 0.08], minDistance: 16 },
    b: { position: [0, 18, 48], target: [0, 0, 0], rotation: [-0.08, 0, 0], minDistance: 16 },
    c: { position: [0, 15, 46], target: [0, 0, 0], rotation: [0.02, 0, -0.05], minDistance: 14 },
  },
  city: {
    a: { position: [42, 28, 46], target: [0, -1.2, 0], rotation: [0, 0, 0], minDistance: 18 },
    b: { position: [44, 28, 50], target: [0, -1.2, 0], rotation: [0, 0, 0], minDistance: 18 },
    c: { position: [44, 30, 48], target: [0, -1.5, 0], rotation: [0, 0, 0], minDistance: 18 },
  },
};

const pointsVertexShader = `
  attribute float aSize;
  attribute float aLuminosity;
  attribute float aShape;
  varying vec3 vColor;
  varying float vLuminosity;
  varying float vShape;
  varying float vCoreScale;
  uniform float uPixelRatio;
  uniform float uPerspectiveScale;
  uniform float uPerspectiveMin;
  uniform float uPerspectiveMax;
  uniform float uPointMinPixelSize;
  uniform float uMaxPixelSize;
  uniform float uHaloBaseSize;
  uniform float uHaloScale;

  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    float perspectiveLow = min(uPerspectiveMin, uPerspectiveMax);
    float perspectiveHigh = max(uPerspectiveMin, uPerspectiveMax);
    float pointLow = min(uPointMinPixelSize, uMaxPixelSize);
    float pointHigh = max(uPointMinPixelSize, uMaxPixelSize);
    float perspective = clamp(uPerspectiveScale / max(2.0, -viewPosition.z), perspectiveLow, perspectiveHigh);
    float haloSize = uHaloBaseSize + aLuminosity * uHaloScale;
    float spriteSize = max(aSize, haloSize);
    gl_PointSize = clamp(spriteSize * uPixelRatio * perspective, pointLow, pointHigh);
    gl_Position = projectionMatrix * viewPosition;
    vColor = color;
    vLuminosity = aLuminosity;
    vShape = aShape;
    vCoreScale = spriteSize / max(aSize, 0.1);
  }
`;

const pointsFragmentShader = `
  varying vec3 vColor;
  varying float vLuminosity;
  varying float vShape;
  varying float vCoreScale;
  uniform float uHaloInner;
  uniform float uHaloOuter;
  uniform float uHaloBaseAlpha;
  uniform float uHaloAlphaScale;
  uniform float uEdgeAlpha;
  uniform float uLightBase;
  uniform float uLightScale;
  uniform float uCoreBoost;
  uniform float uAlphaDiscard;

  void main() {
    vec2 point = gl_PointCoord * 2.0 - 1.0;
    vec2 glyphPoint = point * vCoreScale;
    float circle = length(glyphPoint);
    float diamond = abs(glyphPoint.x) + abs(glyphPoint.y);
    float haloCircle = length(point);
    float core;
    float edge;

    if (vShape < 0.5) {
      core = 1.0 - smoothstep(0.12, 0.55, diamond);
      edge = 1.0 - smoothstep(0.76, 1.02, diamond);
    } else if (vShape < 1.5) {
      float outer = 1.0 - smoothstep(0.72, 1.0, circle);
      float inner = smoothstep(0.18, 0.48, circle);
      core = outer * inner;
      edge = 1.0 - smoothstep(0.55, 1.0, circle);
    } else {
      core = 1.0 - smoothstep(0.08, 0.5, circle);
      edge = 1.0 - smoothstep(0.66, 1.0, circle);
    }

    float haloInner = min(uHaloInner, uHaloOuter);
    float haloOuter = max(uHaloInner, uHaloOuter);
    float halo = (1.0 - smoothstep(haloInner, haloOuter, haloCircle)) * (uHaloBaseAlpha + vLuminosity * uHaloAlphaScale);
    float alpha = max(max(core, edge * uEdgeAlpha), halo);
    if (alpha < uAlphaDiscard) discard;
    vec3 light = vColor * (uLightBase + vLuminosity * uLightScale) + core * vColor * uCoreBoost;
    gl_FragColor = vec4(light, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function pointUniforms(style: PointStyleParameters, pixelRatio: number): Record<string, THREE.IUniform<number>> {
  return {
    uPixelRatio: { value: pixelRatio },
    uPerspectiveScale: { value: style.perspectiveScale },
    uPerspectiveMin: { value: style.perspectiveMin },
    uPerspectiveMax: { value: style.perspectiveMax },
    uPointMinPixelSize: { value: style.pointMinPixelSize },
    uMaxPixelSize: { value: style.maxPixelSize },
    uHaloBaseSize: { value: style.haloBaseSize },
    uHaloScale: { value: style.haloScale },
    uHaloInner: { value: style.haloInner },
    uHaloOuter: { value: style.haloOuter },
    uHaloBaseAlpha: { value: style.haloBaseAlpha },
    uHaloAlphaScale: { value: style.haloAlphaScale },
    uEdgeAlpha: { value: style.edgeAlpha },
    uLightBase: { value: style.lightBase },
    uLightScale: { value: style.lightScale },
    uCoreBoost: { value: style.coreBoost },
    uAlphaDiscard: { value: style.alphaDiscard },
  };
}

function updatePointStyle(material: THREE.ShaderMaterial, style: PointStyleParameters): void {
  const values = pointUniforms(style, material.uniforms.uPixelRatio?.value ?? 1);
  for (const [name, uniform] of Object.entries(values)) {
    if (material.uniforms[name]) material.uniforms[name]!.value = uniform.value;
  }
}

function pointCloud(field: RoleField, name: string, pixelRatio: number): THREE.Points {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(field.positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(field.colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(field.sizes, 1));
  geometry.setAttribute("aLuminosity", new THREE.BufferAttribute(field.luminosities, 1));
  geometry.setAttribute("aShape", new THREE.BufferAttribute(field.shapes, 1));
  geometry.computeBoundingSphere();

  const pointStyle = field.pointStyle ?? defaultGalaxyParameters.core;
  const material = new THREE.ShaderMaterial({
    vertexShader: pointsVertexShader,
    fragmentShader: pointsFragmentShader,
    uniforms: pointUniforms(pointStyle, pixelRatio),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.visible = field.visible ?? true;
  points.userData.labels = field.labels;
  points.userData.role = field.role;
  points.name = name;
  return points;
}

function updatePointCloud(points: THREE.Points, field: RoleField, attributeNames?: readonly string[]): void {
  const geometry = points.geometry;
  const selected = attributeNames ? new Set(attributeNames) : null;
  const attributes: ReadonlyArray<readonly [string, Float32Array, number]> = [
    ["position", field.positions, 3],
    ["color", field.colors, 3],
    ["aSize", field.sizes, 1],
    ["aLuminosity", field.luminosities, 1],
    ["aShape", field.shapes, 1],
  ];
  for (const [name, values, itemSize] of attributes) {
    if (selected && !selected.has(name)) continue;
    const attribute = geometry.getAttribute(name) as THREE.BufferAttribute | undefined;
    if (attribute && attribute.array.length === values.length) {
      (attribute.array as Float32Array).set(values);
      attribute.needsUpdate = true;
    } else {
      geometry.setAttribute(name, new THREE.BufferAttribute(values, itemSize));
    }
  }
  if (!selected || selected.has("position")) geometry.computeBoundingSphere();
  points.visible = field.visible ?? true;
  points.userData.labels = field.labels;
  if (points.material instanceof THREE.ShaderMaterial && field.pointStyle) updatePointStyle(points.material, field.pointStyle);
}

function cityBlocks(field: RoleField, name: string): THREE.InstancedMesh {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const roleColor = new THREE.Color().setRGB(field.colors[0] ?? 1, field.colors[1] ?? 1, field.colors[2] ?? 1);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    emissive: roleColor,
    emissiveIntensity: field.role === "tests" ? 0.62 : field.role === "core" ? 0.28 : field.role === "dependencies" ? 0.22 : field.role === "road_markings" ? 0.55 : field.role === "roads" ? 0.3 : 0.08,
    roughness: field.role === "dependencies" ? 0.94 : field.role === "foundations" || field.role === "roads" ? 0.86 : field.role === "road_markings" ? 0.72 : 0.64,
    metalness: field.role === "core" ? 0.14 : 0.04,
    toneMapped: false,
    transparent: field.role === "tests",
    opacity: field.role === "tests" ? 0.72 : 1,
    depthWrite: field.role !== "tests",
    side: field.role === "tests" ? THREE.DoubleSide : THREE.FrontSide,
  });
  const count = field.sizes.length;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    transform.position.set(field.positions[offset]!, field.positions[offset + 1]!, field.positions[offset + 2]!);
    transform.scale.set(field.scales?.[offset] ?? 1, field.scales?.[offset + 1] ?? 1, field.scales?.[offset + 2] ?? 1);
    transform.rotation.set(0, field.rotations?.[index] ?? 0, 0);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    color.setRGB(field.colors[offset]!, field.colors[offset + 1]!, field.colors[offset + 2]!);
    mesh.setColorAt(index, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = name;
  return mesh;
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((object) => {
    const drawable = object as THREE.Points | THREE.LineSegments;
    if (drawable.geometry instanceof THREE.BufferGeometry) drawable.geometry.dispose();
    if (!("material" in drawable)) return;
    const materials = Array.isArray(drawable.material) ? drawable.material : [drawable.material];
    for (const material of materials) if (material instanceof THREE.Material) material.dispose();
  });
}

export class CosmosScene {
  readonly renderer: THREE.WebGLRenderer;

  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: Callbacks;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 180);
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  private root: THREE.Group | null = null;
  private target: TargetId;
  private style: StyleId;
  private variant: VariantId;
  private dependencyGranularity: DependencyGranularity;
  private galaxyParameters: GalaxyParameters;
  private paused = false;
  private visible = !document.hidden;
  private frame: number | null = null;
  private lastTime = 0;
  private hasRendered = false;
  private hovering = false;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickPoint = new THREE.Vector3();
  private pickables: THREE.Points[] = [];
  private readonly pointFields = new Map<RoleId, THREE.Points>();

  constructor(
    canvas: HTMLCanvasElement,
    target: TargetId,
    style: StyleId,
    variant: VariantId,
    callbacks: Callbacks,
    galaxyParameters: GalaxyParameters = defaultGalaxyParameters,
    dependencyGranularity: DependencyGranularity = "packages",
  ) {
    this.canvas = canvas;
    this.target = target;
    this.style = style;
    this.variant = variant;
    this.dependencyGranularity = dependencyGranularity;
    this.galaxyParameters = cloneGalaxyParameters(galaxyParameters);
    this.callbacks = callbacks;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.setClearColor(new THREE.Color().setRGB(0.006, 0.006, 0.008, THREE.SRGBColorSpace));
    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x130e18, 1.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(18, 32, 24);
    this.scene.add(keyLight);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.46;
    this.controls.zoomSpeed = 0.62;
    this.controls.touches.ONE = THREE.TOUCH.ROTATE;
    this.controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
    this.controls.addEventListener("start", this.pauseFromInteraction);
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.attach();
    this.resize();
    this.setView(target, style, variant, dependencyGranularity);
    this.start();
  }

  setView(target: TargetId, style: StyleId, variant: VariantId, dependencyGranularity: DependencyGranularity = this.dependencyGranularity): void {
    if (this.root) {
      this.scene.remove(this.root);
      disposeTree(this.root);
    }
    this.callbacks.hoverChanged(null);
    this.hovering = false;
    this.pickables = [];
    this.pointFields.clear();
    this.target = target;
    this.style = style;
    this.variant = variant;
    this.dependencyGranularity = dependencyGranularity;
    const composition = compose(target, style, variant, this.galaxyParameters, dependencyGranularity);
    const root = new THREE.Group();
    root.name = `${target}-${style}-${variant}-${dependencyGranularity}`;
    root.userData.boundsRadius = compositionRadius(composition);
    const ratio = this.renderer.getPixelRatio();
    for (const field of [...(composition.decorations ?? []), ...composition.fields]) {
      const object = field.primitive === "boxes"
        ? cityBlocks(field, `${field.sizes.length}-${field.role}-blocks`)
        : pointCloud(field, `${field.sizes.length}-${field.role}-stars`, ratio);
      root.add(object);
      if (object instanceof THREE.Points && field.labels?.some(Boolean)) this.pickables.push(object);
      if (object instanceof THREE.Points && (field.role === "core" || field.role === "tests" || field.role === "dependencies")) this.pointFields.set(field.role, object);
    }
    this.root = root;
    this.scene.add(root);
    this.reset();
  }

  setGalaxyParameters(parameters: GalaxyParameters, role?: RoleId, changedKey?: string): void {
    this.galaxyParameters = cloneGalaxyParameters(parameters);
    if (this.style !== "galaxy" || !this.root) return;
    this.callbacks.hoverChanged(null);
    this.hovering = false;
    const roles: readonly RoleId[] = role ? [role] : ["core", "tests", "dependencies"];
    let boundsChanged = false;
    for (const changedRole of roles) {
      const points = this.pointFields.get(changedRole);
      if (!points) continue;
      let declarationChannel: GalaxySignalChannel | undefined;
      if (changedRole === "dependencies" && this.dependencyGranularity === "declarations" && changedKey) {
        if (changedKey.startsWith("declarationSize")) declarationChannel = "size";
        else if (changedKey.startsWith("declarationOrbit")) declarationChannel = "orbit";
        else if (changedKey.startsWith("declarationEmphasis")) declarationChannel = "emphasis";
      }
      const attributes = declarationChannel === "size"
        ? ["aSize"]
        : declarationChannel === "orbit"
          ? ["position"]
          : declarationChannel === "emphasis"
            ? ["color", "aLuminosity"]
            : undefined;
      updatePointCloud(
        points,
        composeGalaxyField(this.target, this.variant, changedRole, this.galaxyParameters, this.dependencyGranularity, declarationChannel),
        attributes,
      );
      if (!attributes || attributes.includes("position")) boundsChanged = true;
    }
    if (!boundsChanged) return;
    let radius = 1;
    for (const points of this.pointFields.values()) {
      if (!points.visible) continue;
      const sphere = points.geometry.boundingSphere;
      if (sphere) radius = Math.max(radius, sphere.center.length() + sphere.radius);
    }
    this.root.userData.boundsRadius = radius;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.callbacks.pauseChanged(paused);
  }

  isPaused(): boolean {
    return this.paused;
  }

  reset(): void {
    const pose = poses[this.style][this.variant];
    const portrait = window.matchMedia("(max-width: 700px) and (orientation: portrait)").matches;
    const fov = portrait ? 60 : 42;
    const radius = typeof this.root?.userData.boundsRadius === "number" ? this.root.userData.boundsRadius : 1;
    const fit = fitCamera(radius, fov, this.camera.aspect);
    const direction = new THREE.Vector3(...pose.position).sub(new THREE.Vector3(...pose.target)).normalize();
    this.camera.position.set(...pose.target).addScaledVector(direction, fit.distance);
    this.controls.target.set(...pose.target);
    this.controls.minDistance = pose.minDistance;
    this.controls.maxDistance = fit.maxDistance;
    this.camera.fov = fov;
    this.camera.far = fit.far;
    this.camera.updateProjectionMatrix();
    this.root?.rotation.set(...pose.rotation);
    this.controls.update();
  }

  destroy(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.resizeObserver.disconnect();
    this.detach();
    this.controls.removeEventListener("start", this.pauseFromInteraction);
    this.callbacks.hoverChanged(null);
    this.controls.dispose();
    if (this.root) disposeTree(this.root);
    this.renderer.dispose();
  }

  private pauseFromInteraction = (): void => {
    this.callbacks.hoverChanged(null);
    this.hovering = false;
    if (!this.paused) this.setPaused(true);
  };

  private pointerMoved = (event: PointerEvent): void => {
    if (this.style !== "galaxy" || event.pointerType === "touch" || event.buttons !== 0) {
      this.callbacks.hoverChanged(null);
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
      -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1,
    );
    this.raycaster.params.Points = { threshold: 1.2 };
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.pickables.filter((points) => points.visible), false);
    let closest: { label: string; distance: number } | null = null;
    for (const intersection of intersections) {
      if (intersection.index === undefined) continue;
      const labels = intersection.object.userData.labels as readonly string[] | undefined;
      const label = labels?.[intersection.index];
      const points = intersection.object as THREE.Points;
      const positions = points.geometry.getAttribute("position");
      this.pickPoint.fromBufferAttribute(positions, intersection.index).applyMatrix4(points.matrixWorld).project(this.camera);
      const distance = Math.hypot(
        (this.pickPoint.x - this.pointer.x) * rect.width * 0.5,
        (this.pickPoint.y - this.pointer.y) * rect.height * 0.5,
      );
      if (distance > 16) continue;
      if (label && (!closest || distance < closest.distance)) closest = { label, distance };
    }
    this.hovering = closest !== null;
    this.callbacks.hoverChanged(closest ? { label: closest.label, x: event.clientX, y: event.clientY } : null);
  };

  private pointerLeft = (): void => {
    this.hovering = false;
    this.callbacks.hoverChanged(null);
  };

  private resize = (): void => {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const mobile = window.matchMedia("(max-width: 700px)").matches;
    const ratio = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 1.75);
    this.renderer.setPixelRatio(ratio);
    const previousAspect = this.camera.aspect;
    this.renderer.setSize(Math.max(1, parent.clientWidth), Math.max(1, parent.clientHeight), false);
    this.camera.aspect = Math.max(1, parent.clientWidth) / Math.max(1, parent.clientHeight);
    this.camera.updateProjectionMatrix();
    this.root?.traverse((object) => {
      if (!(object instanceof THREE.Points) || !(object.material instanceof THREE.ShaderMaterial)) return;
      const pixelRatio = object.material.uniforms.uPixelRatio;
      if (pixelRatio) pixelRatio.value = ratio;
    });
    if (this.root && Math.abs(previousAspect - this.camera.aspect) > 0.12) this.reset();
  };

  private visibilityChanged = (): void => {
    this.visible = !document.hidden;
    if (this.visible) this.start();
    else if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  };

  private contextLost = (event: Event): void => {
    event.preventDefault();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.callbacks.fallback("WebGL was interrupted. Reload this local page to restore the sculpture.");
  };

  private attach(): void {
    document.addEventListener("visibilitychange", this.visibilityChanged);
    this.canvas.addEventListener("webglcontextlost", this.contextLost);
    this.canvas.addEventListener("pointermove", this.pointerMoved);
    this.canvas.addEventListener("pointerleave", this.pointerLeft);
  }

  private detach(): void {
    document.removeEventListener("visibilitychange", this.visibilityChanged);
    this.canvas.removeEventListener("webglcontextlost", this.contextLost);
    this.canvas.removeEventListener("pointermove", this.pointerMoved);
    this.canvas.removeEventListener("pointerleave", this.pointerLeft);
  }

  private start(): void {
    if (!this.visible || this.frame !== null) return;
    const draw = (time: number): void => {
      this.frame = null;
      if (!this.visible) return;
      const delta = Math.min(0.05, this.lastTime === 0 ? 0 : (time - this.lastTime) / 1000);
      this.lastTime = time;
      if (this.root && !this.paused && !this.hovering && !this.reducedMotion.matches) {
        this.root.rotation.y += delta * (this.style === "city" ? 0.022 : 0.035);
        if (this.style === "galaxy") this.root.rotation.z += delta * 0.0025;
      }
      this.controls.update(delta);
      this.renderer.render(this.scene, this.camera);
      if (!this.hasRendered) {
        this.hasRendered = true;
        this.callbacks.ready();
      }
      this.frame = requestAnimationFrame(draw);
    };
    this.frame = requestAnimationFrame(draw);
  }
}
