"use client";

import { Suspense, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  PerspectiveCamera,
  Stars,
  useTexture,
} from "@react-three/drei";
import {
  BackSide,
  DataTexture,
  DoubleSide,
  LinearFilter,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  SRGBColorSpace,
  type Group,
  type Material,
  type Texture,
} from "three";
import { useSunState, type SunState } from "./sun";
import type { WindRef } from "./useWindController";

// Three.js touches `window` at import time, so this module is only ever
// loaded through next/dynamic with `ssr: false` (see FlagCanvas).

type Vec3 = [number, number, number];
type CompiledShader = Parameters<Material["onBeforeCompile"]>[0];

const FLAG_SEGMENTS_X = 120;
const FLAG_SEGMENTS_Y = 80;

// === Vertex shader chunks for the flag motion ===
// Designed: 2 traveling waves on z, a high-freq trailing whip, and a clean
// polynomial droop on y. Analytical normals are computed by sampling the
// displacement at two neighbour UVs and taking a cross product — this lets
// MeshToonMaterial light the folds without a per-frame computeVertexNormals.

const FLAG_COMMON_DECL = /* glsl */ `
uniform float uTime;
uniform float uFlagAppear;
uniform float uWindStrength;
uniform float uTurbulence;
varying vec2 vFlagUv;

vec3 flagBase(vec2 uvIn) {
  return vec3((uvIn.x - 0.5) * 7.2, (uvIn.y - 0.5) * 4.8, 0.0);
}

vec3 flagDisp(vec2 uvIn) {
  float travel     = uvIn.x;
  float pinnedRamp = smoothstep(0.0, 0.06, travel);

  // Unfurl front isn't a clean vertical line — top releases first, bottom trails,
  // with a small sine wobble so the reveal looks like cloth catching the wind
  // rather than a wipe across a screen.
  float unfurlBias = (1.0 - uvIn.y) * 0.10
                   + sin(uvIn.y * 6.28) * 0.025;
  float edgeDist   = uFlagAppear - travel - unfurlBias;
  float settled    = smoothstep(0.0, 0.22, edgeDist);
  float ramp       = pinnedRamp * settled;

  // The flag always reads as a flag in flight — never droops. A floor on the
  // wind drive guarantees a baseline ripple, then real wind boosts it from there.
  float effStrength = max(uWindStrength, 0.55);
  float effTurb     = max(uTurbulence,   0.18);

  // Primary + cross waves on z. Amplitude grows along travel so the leading
  // edge stays attached and the trailing edge swings the most.
  float w1 = sin(travel *  6.0 - uTime * 1.6 + uvIn.y * 0.8)         * 0.32 * effStrength;
  float w2 = sin(travel * 11.0 - uTime * 1.0 - uvIn.y * 1.6 + 1.7)   * 0.13 * effStrength;

  vec3 d = vec3(0.0);
  d.z += (w1 + w2) * travel * ramp;

  // Trailing-edge whip — only on the last 35%, scaled by turbulence.
  float whipMask = smoothstep(0.65, 1.0, travel);
  float whip     = sin(travel * 28.0 - uTime * 9.0 + uvIn.y * 4.5) * 0.07 * effTurb;
  d.z += whip * whipMask * ramp;

  // === Unfurl entry — only active where the cloth is still being revealed ===
  // bulge is 1 at the leading edge of the unfurl, falls to 0 as cloth settles.
  float bulge = 1.0 - settled;

  // Anticipation flop: the just-revealed strip gives way under gravity briefly,
  // then settles. Strongest right at the front (bulge=1), fades out behind.
  d.y -= bulge * bulge * 0.55 * pinnedRamp;

  // Curl: the freshly-revealed cloth rolls open with a small forward+up arc,
  // smoothing into the settled pose. Vanishes once unfurl is complete.
  float curlPhase = bulge * 3.14159;
  d.z -= sin(curlPhase) * 0.34 * pinnedRamp;
  d.y += sin(curlPhase) * 0.10 * pinnedRamp;

  // Quick whip on a narrow band right at the unfurl front — gives the reveal a flick.
  float frontBand = smoothstep(0.06, 0.0, abs(edgeDist - 0.04));
  d.z += frontBand * sin(uTime * 16.0 + uvIn.y * 5.5) * 0.06 * pinnedRamp;

  // A faint, slower lateral wobble during unfurl so the cloth swings open
  // rather than snapping into its rest pose.
  d.x += bulge * sin(uTime * 4.5 + uvIn.y * 2.2) * 0.08 * pinnedRamp;

  return d;
}
`;

const FLAG_NORMAL_CHUNK = /* glsl */ `
vFlagUv = uv;
float _eps = 0.01;
vec2 _uvX = uv + vec2(_eps, 0.0);
vec2 _uvY = uv + vec2(0.0, _eps);

vec3 _p0 = flagBase(uv)   + flagDisp(uv);
vec3 _pX = flagBase(_uvX) + flagDisp(_uvX);
vec3 _pY = flagBase(_uvY) + flagDisp(_uvY);

vec3 objectNormal = normalize(cross(_pX - _p0, _pY - _p0));
`;

const FLAG_POSITION_CHUNK = /* glsl */ `
vec3 transformed = _p0;
`;

const FLAG_W = 7.2;
const FLAG_H = 4.8;
const FLAG_Y = 0;
const POLE_HEIGHT = 14;
const POLE_TOP = FLAG_Y + FLAG_H / 2 + 0.2; // 0.2 exposed above flag top
const POLE_BASE_Y = POLE_TOP - POLE_HEIGHT; // pole root, below the view
const POLE_X = -FLAG_W / 2; // aligns with flag's pinned left edge

const CAMERA_POSITION: Vec3 = [0.3, 0.2, 5.5];
const CAMERA_FOV = 50;
// Aspect ratio at which CAMERA_POSITION/CAMERA_FOV is tuned. Narrower canvases
// pull the camera back so the flag's horizontal extent stays in frame.
const CAMERA_REF_ASPECT = 1.5;
const POLE_VISIBLE_MARGIN = 0.6; // world units of headroom kept left of the pole

function ResponsiveCamera({
  flagPosition,
  flagScale,
}: {
  flagPosition: Vec3;
  flagScale: number;
}) {
  const { size } = useThree();
  const aspect = size.height > 0 ? size.width / size.height : CAMERA_REF_ASPECT;

  // Pull camera back as the canvas narrows so horizontal coverage stays roughly fixed.
  const z =
    aspect < CAMERA_REF_ASPECT
      ? CAMERA_POSITION[2] * (CAMERA_REF_ASPECT / aspect)
      : CAMERA_POSITION[2];

  // Approximate world position of the pole (ignoring small entity rotations).
  const poleWorldX = flagPosition[0] + POLE_X * flagScale;
  const poleWorldZ = flagPosition[2];

  // Half-horizontal extent of the frustum at the pole's depth.
  const fovV = (CAMERA_FOV * Math.PI) / 180;
  const halfH = (z - poleWorldZ) * Math.tan(fovV / 2) * aspect;

  // Camera x must satisfy: camX - halfH <= poleWorldX - margin
  // So shift left as needed; never shift right of the tuned default.
  const maxX = poleWorldX - POLE_VISIBLE_MARGIN + halfH;
  const camX = Math.min(CAMERA_POSITION[0], maxX);

  return (
    <PerspectiveCamera
      makeDefault
      position={[camX, CAMERA_POSITION[1], z]}
      fov={CAMERA_FOV}
    />
  );
}

function CelestialBody({ sun }: { sun: SunState }) {
  const dist = 14;
  const az = Math.max(-1, Math.min(1, sun.sunPosition[0] / 100));
  // y factor kept low so noon sun sits inside the camera frustum
  const yFactor = 5.5;
  const showSun = sun.elevation > -0.05;
  const showMoon = sun.elevation < 0.05;
  return (
    <>
      {showSun && (
        <mesh position={[az * dist * 0.7, sun.elevation * yFactor, -dist * 0.55]}>
          <sphereGeometry args={[0.85, 28, 28]} />
          <meshBasicMaterial color={sun.sunColor} toneMapped={false} />
        </mesh>
      )}
      {showMoon && (
        <mesh
          position={[-az * dist * 0.7, -sun.elevation * yFactor * 0.9, -dist * 0.55]}
        >
          <sphereGeometry args={[0.62, 28, 28]} />
          <meshBasicMaterial color="#e8ecf0" toneMapped={false} />
        </mesh>
      )}
    </>
  );
}

function CelestialStage({
  sun,
  isDark,
  children,
}: {
  sun: SunState;
  isDark: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {sun.showStars && (
        <Stars radius={50} depth={30} count={3500} factor={5} saturation={0} speed={0.3} />
      )}
      <ambientLight intensity={sun.ambientIntensity} />
      <directionalLight
        position={sun.sunPosition}
        intensity={sun.directIntensity}
        color={sun.sunColor}
      />
      <directionalLight position={[-2, -1, 2]} intensity={0.2} color="#8fa8d8" />
      {/* Front fill — keeps the flag's camera-facing side bright when the sun is overhead. */}
      <directionalLight position={[0.3, 0.6, 5]} intensity={0.85} color="#fff4d8" />
      {/* Night flagpole floodlight — warm uplight that ramps in below horizon
          so the flag stays lit after sunset, like real flagpole lighting. Suppressed
          in dark mode where the warm uplights create an unwanted neon glow effect. */}
      {sun.nightFactor > 0 && !isDark && (
        <>
          <directionalLight
            position={[0, -2, 4]}
            intensity={2.6 * sun.nightFactor}
            color="#ffd9a3"
          />
          <directionalLight
            position={[4, -1.5, 3]}
            intensity={1.6 * sun.nightFactor}
            color="#ffe1b4"
          />
          <directionalLight
            position={[-3, -1, 3]}
            intensity={1.2 * sun.nightFactor}
            color="#ffe6c4"
          />
          <ambientLight intensity={0.7 * sun.nightFactor} color="#fff0d0" />
        </>
      )}
      <CelestialBody sun={sun} />
      {children}
    </>
  );
}

function makeToonGradient(steps: number[]) {
  const data = new Uint8Array(steps);
  const tex = new DataTexture(data, steps.length, 1, RedFormat);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// Passed to useTexture as its onLoad. Module-level so the reference is stable:
// drei re-runs onLoad whenever the callback identity changes, and setting
// needsUpdate on every render would re-upload the texture each time.
function configureFlagTexture(tex: Texture) {
  tex.colorSpace = SRGBColorSpace;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
}

interface SceneProps {
  logoTextureUrl: string;
  flagPosition: Vec3;
  flagRotation: Vec3;
  flagScale: number;
  windRef: WindRef | null;
  poleScale: number;
  ballScale: number;
}

function Scene({
  logoTextureUrl,
  flagPosition,
  flagRotation,
  flagScale,
  windRef,
  poleScale,
  ballScale,
}: SceneProps) {
  const poleGroupRef = useRef<Group>(null);
  const flagPivotRef = useRef<Group>(null);
  const flagGroupRef = useRef<Group>(null);
  const shaderRef = useRef<CompiledShader | null>(null);

  const texture = useTexture(logoTextureUrl, configureFlagTexture);

  const toonGradient = useMemo(() => makeToonGradient([70, 160, 255]), []);
  // Smoother banding for the cloth — 5 stops, all in the bright half so the
  // cloth reads light overall and folds modulate gently rather than stamping shadows.
  const clothGradient = useMemo(
    () => makeToonGradient([195, 215, 230, 242, 252]),
    [],
  );

  const material = useMemo(() => {
    const mat = new MeshToonMaterial({
      map: texture,
      gradientMap: clothGradient,
      side: DoubleSide,
      toneMapped: false,
    });

    // Vertex motion is driven by the GLSL `flagDisp` function declared in
    // FLAG_COMMON_DECL. We replace beginnormal_vertex (to inject analytical
    // normals from the displaced surface) and begin_vertex (to apply the
    // displaced position). The fragment shader only handles the unfurl discard.
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.uniforms.uFlagAppear = { value: 0 };
      shader.uniforms.uWindStrength = { value: 0 };
      shader.uniforms.uTurbulence = { value: 0 };

      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", `#include <common>\n${FLAG_COMMON_DECL}`)
        .replace("#include <beginnormal_vertex>", FLAG_NORMAL_CHUNK)
        .replace("#include <begin_vertex>", FLAG_POSITION_CHUNK);

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           uniform float uFlagAppear;
           varying vec2 vFlagUv;`,
        )
        .replace(
          "void main() {",
          `void main() {
             if (vFlagUv.x > uFlagAppear) discard;`,
        );

      shaderRef.current = shader;
    };

    return mat;
  }, [texture, clothGradient]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;

    // Pole rises: 0 → 0.9s, easeOutCubic
    const poleT = Math.min(Math.max(t / 0.9, 0), 1);
    const poleEase = 1 - Math.pow(1 - poleT, 3);
    if (poleGroupRef.current) {
      poleGroupRef.current.scale.y = Math.max(poleEase, 0.0001);
    }

    // Flag unfurls: 1.0s → 2.4s — starts only after the pole has finished rising at 0.9s
    const flagStart = 1.0;
    const flagDuration = 1.4;
    const flagT = Math.min(Math.max((t - flagStart) / flagDuration, 0), 1);
    const flagEase =
      flagT < 0.5
        ? 2.0 * flagT * flagT
        : 1.0 - Math.pow(-2.0 * flagT + 2.0, 2.2) / 2.0;
    if (flagGroupRef.current) {
      flagGroupRef.current.visible = t >= flagStart;
    }
    const shader = shaderRef.current;
    if (shader) {
      shader.uniforms.uTime.value = t;
      shader.uniforms.uFlagAppear.value = flagEase * 1.28;
      if (windRef) {
        shader.uniforms.uWindStrength.value = windRef.current.strength;
        shader.uniforms.uTurbulence.value = windRef.current.turbulence;
      }
    }

    // Wind sway: rotate the flag around the pole (not the whole entity, so the pole is steady)
    if (flagPivotRef.current && windRef) {
      flagPivotRef.current.rotation.y = (windRef.current.directionDelta * Math.PI) / 180;
    }
  });

  return (
    <group position={flagPosition} rotation={flagRotation} scale={flagScale}>
      {/* Pole + finial — outer group drives rise animation (scale.y only) */}
      <group ref={poleGroupRef} position={[POLE_X, POLE_BASE_Y, 0]} scale={[1, 0.0001, 1]}>
        {/* inner group scales XZ (radius/thickness) of the pole only */}
        <group scale={[poleScale, 1, poleScale]}>
          <mesh position={[0, POLE_HEIGHT / 2, 0]} scale={[1.12, 1.002, 1.12]}>
            <cylinderGeometry args={[0.035, 0.035, POLE_HEIGHT, 24]} />
            <meshBasicMaterial color="#020a14" side={BackSide} toneMapped={false} />
          </mesh>
          <mesh position={[0, POLE_HEIGHT / 2, 0]}>
            <cylinderGeometry args={[0.035, 0.035, POLE_HEIGHT, 24]} />
            <meshToonMaterial color="#1a3a66" gradientMap={toonGradient} />
          </mesh>
        </group>
        {/* finial — sibling of pole-thickness group so it scales uniformly and independently */}
        <group position={[0, POLE_HEIGHT + 0.1, 0]} scale={ballScale}>
          <mesh scale={1.1}>
            <sphereGeometry args={[0.12, 24, 24]} />
            <meshBasicMaterial color="#020a14" side={BackSide} toneMapped={false} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.12, 24, 24]} />
            <meshToonMaterial color="#10c4c0" gradientMap={toonGradient} />
          </mesh>
        </group>
      </group>

      {/* Flag — pivots around the pole so wind sway doesn't drag the pole with it.
          Vertex motion + analytical normals come from the shader. */}
      <group ref={flagPivotRef} position={[POLE_X, FLAG_Y, 0]}>
        <group ref={flagGroupRef} position={[FLAG_W / 2, 0, 0]} visible={false}>
          <mesh material={material}>
            <planeGeometry args={[FLAG_W, FLAG_H, FLAG_SEGMENTS_X, FLAG_SEGMENTS_Y]} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

export interface UclFlagProps {
  logoTextureUrl?: string;
  className?: string;
  style?: CSSProperties;
  interactive?: boolean;
  isDark?: boolean;
  flagPosition?: Vec3;
  flagRotation?: Vec3;
  flagScale?: number;
  windRef?: WindRef | null;
  poleScale?: number;
  ballScale?: number;
}

/** The UCL VolSoc flag on its pole, under a sky lit by the real sun over London. */
export default function UclFlag({
  logoTextureUrl = "/volsoc-flag.svg",
  className,
  style,
  interactive = false,
  isDark = false,
  flagPosition = [0, 0, 0],
  flagRotation = [0.08, 0.48, 0],
  flagScale = 1,
  windRef = null,
  poleScale = 1,
  ballScale = 1,
}: UclFlagProps) {
  const sun = useSunState();

  return (
    <Canvas
      className={className}
      style={{ ...style, background: "transparent" }}
      dpr={[1, 2]}
      gl={{ alpha: true }}
    >
      <ResponsiveCamera flagPosition={flagPosition} flagScale={flagScale} />
      <Suspense fallback={null}>
        <CelestialStage sun={sun} isDark={isDark}>
          <Scene
            logoTextureUrl={logoTextureUrl}
            flagPosition={flagPosition}
            flagRotation={flagRotation}
            flagScale={flagScale}
            windRef={windRef}
            poleScale={poleScale}
            ballScale={ballScale}
          />
        </CelestialStage>
      </Suspense>
      {interactive ? <OrbitControls enablePan={false} /> : null}
    </Canvas>
  );
}
