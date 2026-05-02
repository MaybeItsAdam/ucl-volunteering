import React, { Suspense, useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import {
  OrbitControls,
  PerspectiveCamera,
  Stars,
  useTexture
} from "@react-three/drei"
import {
  BackSide,
  DataTexture,
  DoubleSide,
  LinearFilter,
  MeshBasicMaterial,
  NearestFilter,
  RedFormat,
  SRGBColorSpace
} from "three"
import { getEffectiveDate, useTimeOverride } from "./timeOverride"

const VERTEX_CHUNK = `
  vFlagUv = uv;

  float travel = uv.x;
  float pinned = smoothstep(0.0, 0.06, travel);

  // distance behind the unfurl leading edge
  float edgeDist = uFlagAppear - uv.x;
  float settle = smoothstep(0.0, 0.22, edgeDist);
  float bulge = 1.0 - settle;

  // wave amplitude scales with wind strength
  float w1 = sin(travel * 7.0 - uFlagTime * 2.4) * 0.22 * uWindStrength;
  float w2 = sin(travel * 14.0 + transformed.y * 1.3 - uFlagTime * 3.1) * 0.09 * uWindStrength;
  float w3 = sin(transformed.y * 2.6 + uFlagTime * 1.5) * 0.05 * uWindStrength;

  float amp = pinned * travel * settle;
  transformed.z += (w1 + w2 + w3) * amp;
  // flag droops when calm, extends flat when windy
  transformed.y -= travel * travel * 0.07 * max(0.0, 1.0 - uWindStrength) * pinned * settle;

  // leading edge curls — the fabric rolls open rather than popping flat
  float curlPhase = bulge * 3.14159;
  transformed.z -= sin(curlPhase) * 0.28 * pinned;
  transformed.y += sin(curlPhase) * 0.08 * pinned;
  transformed.x -= bulge * bulge * 0.05 * pinned;

  // quick whip motion along the freshly-revealed strip
  float whipBand = smoothstep(0.05, 0.0, abs(edgeDist - 0.05));
  transformed.z += whipBand * sin(uFlagTime * 18.0) * 0.05 * pinned;
`

const CAMERA_POSITION = [0.3, 0.2, 5.5]
const CAMERA_FOV = 50
const FLAG_W = 7.2
const FLAG_H = 4.8
const FLAG_Y = 0
const POLE_HEIGHT = 6.5
const POLE_TOP = FLAG_Y + FLAG_H / 2 + 0.2   // 0.2 exposed above flag top
const POLE_BASE_Y = POLE_TOP - POLE_HEIGHT    // pole root, below the view
const POLE_X = -FLAG_W / 2                   // aligns with flag's pinned left edge

function lerp(a, b, t) {
  return a + (b - a) * t
}
function lerpColor(c1, c2, t) {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t))
  ]
}
function rgb([r, g, b]) {
  return `rgb(${r}, ${g}, ${b})`
}

const SKY_NIGHT_TOP = [8, 12, 30]
const SKY_NIGHT_BOT = [26, 40, 78]
const SKY_DUSK_TOP = [42, 30, 96]
const SKY_DUSK_BOT = [236, 132, 92]
const SKY_DAY_TOP = [60, 126, 214]
const SKY_DAY_BOT = [168, 208, 240]

export function skyColors(elevation) {
  let top, bot
  if (elevation >= 0.35) {
    top = SKY_DAY_TOP
    bot = SKY_DAY_BOT
  } else if (elevation >= 0) {
    const t = elevation / 0.35
    top = lerpColor(SKY_DUSK_TOP, SKY_DAY_TOP, t)
    bot = lerpColor(SKY_DUSK_BOT, SKY_DAY_BOT, t)
  } else if (elevation >= -0.25) {
    const t = (elevation + 0.25) / 0.25
    top = lerpColor(SKY_NIGHT_TOP, SKY_DUSK_TOP, t)
    bot = lerpColor(SKY_NIGHT_BOT, SKY_DUSK_BOT, t)
  } else {
    top = SKY_NIGHT_TOP
    bot = SKY_NIGHT_BOT
  }
  return { top: rgb(top), bot: rgb(bot) }
}

function computeSunState(date) {
  const hour = date.getHours() + date.getMinutes() / 60
  const t = (hour / 24) * Math.PI * 2
  const elevation = -Math.cos(t)
  const azimuth = Math.sin(t)
  const distance = 100
  const sunPosition = [azimuth * distance, elevation * distance, 30]

  const daylight = Math.max(0, elevation)
  const belowHorizon = elevation < 0
  const isGolden = !belowHorizon && elevation < 0.25

  let sunColor = "#fff4d6"
  if (belowHorizon) sunColor = "#5873a8"
  else if (isGolden) sunColor = "#ffb070"

  const ambientIntensity = 0.38 + 0.4 * daylight
  const directIntensity = belowHorizon ? 0.25 : 0.4 + daylight * 0.9

  return {
    elevation,
    sunPosition,
    sunColor,
    ambientIntensity,
    directIntensity,
    showStars: elevation < 0.05
  }
}

export function useSunState() {
  const override = useTimeOverride()
  const [, setTick] = useState(0)
  useEffect(() => {
    if (override != null) return undefined
    const id = setInterval(() => setTick((x) => x + 1), 60_000)
    return () => clearInterval(id)
  }, [override])
  return computeSunState(getEffectiveDate())
}

function CelestialBody({ sun }) {
  const dist = 14
  const az = Math.max(-1, Math.min(1, sun.sunPosition[0] / 100))
  // y factor kept low so noon sun sits inside the camera frustum
  const yFactor = 5.5
  const showSun = sun.elevation > -0.05
  const showMoon = sun.elevation < 0.05
  return (
    <>
      {showSun && (
        <mesh position={[az * dist * 0.7, sun.elevation * yFactor, -dist * 0.55]}>
          <sphereGeometry args={[0.85, 28, 28]} />
          <meshBasicMaterial color={sun.sunColor} toneMapped={false} />
        </mesh>
      )}
      {showMoon && (
        <mesh position={[-az * dist * 0.7, -sun.elevation * yFactor * 0.9, -dist * 0.55]}>
          <sphereGeometry args={[0.62, 28, 28]} />
          <meshBasicMaterial color="#e8ecf0" toneMapped={false} />
        </mesh>
      )}
    </>
  )
}

function CelestialStage({ sun, children }) {
  return (
    <>
      {sun.showStars && (
        <Stars radius={60} depth={30} count={1400} factor={2.5} fade speed={0.4} />
      )}
      <ambientLight intensity={sun.ambientIntensity} />
      <directionalLight
        position={sun.sunPosition}
        intensity={sun.directIntensity}
        color={sun.sunColor}
      />
      <directionalLight position={[-2, -1, 2]} intensity={0.2} color="#8fa8d8" />
      <CelestialBody sun={sun} />
      {children}
    </>
  )
}


function makeToonGradient(steps) {
  const data = new Uint8Array(steps)
  const tex = new DataTexture(data, steps.length, 1, RedFormat)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

function Scene({ logoTextureUrl, flagPosition, flagRotation, flagScale, windStrength, poleScale }) {
  const poleGroupRef = useRef(null)
  const flagGroupRef = useRef(null)
  const shaderRef = useRef(null)

  const texture = useTexture(logoTextureUrl)

  useMemo(() => {
    texture.colorSpace = SRGBColorSpace
    texture.minFilter = LinearFilter
    texture.magFilter = LinearFilter
    texture.anisotropy = 8
    texture.needsUpdate = true
  }, [texture])

  const toonGradient = useMemo(() => makeToonGradient([70, 160, 255]), [])

  const material = useMemo(() => {
    const mat = new MeshBasicMaterial({
      map: texture,
      side: DoubleSide,
      toneMapped: false
    })

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFlagTime = { value: 0 }
      shader.uniforms.uFlagAppear = { value: 0 }
      shader.uniforms.uWindStrength = { value: 1 }

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           uniform float uFlagTime;
           uniform float uFlagAppear;
           uniform float uWindStrength;
           varying vec2 vFlagUv;`
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           ${VERTEX_CHUNK}`
        )

      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
           uniform float uFlagAppear;
           varying vec2 vFlagUv;`
        )
        .replace(
          "void main() {",
          `void main() {
             if (vFlagUv.x > uFlagAppear) discard;`
        )

      shaderRef.current = shader
    }

    return mat
  }, [texture])

  useFrame((state) => {
    const t = state.clock.elapsedTime

    // Pole rises: 0 → 0.9s, easeOutCubic
    const poleT = Math.min(Math.max(t / 0.9, 0), 1)
    const poleEase = 1 - Math.pow(1 - poleT, 3)
    if (poleGroupRef.current) {
      poleGroupRef.current.scale.y = Math.max(poleEase, 0.0001)
    }

    // Flag unfurls: 0.2s → 1.6s
    const flagStart = 0.2
    const flagDuration = 1.4
    const flagT = Math.min(Math.max((t - flagStart) / flagDuration, 0), 1)
    const flagEase =
      flagT < 0.5
        ? 2.0 * flagT * flagT
        : 1.0 - Math.pow(-2.0 * flagT + 2.0, 2.2) / 2.0
    if (flagGroupRef.current) {
      flagGroupRef.current.visible = t >= flagStart
    }
    if (shaderRef.current) {
      shaderRef.current.uniforms.uFlagTime.value = t
      shaderRef.current.uniforms.uFlagAppear.value = flagEase * 1.28
      shaderRef.current.uniforms.uWindStrength.value = windStrength
    }
  })

  return (
    <group position={flagPosition} rotation={flagRotation} scale={flagScale}>
      {/* Pole + finial — outer group drives rise animation (scale.y only) */}
      <group
        ref={poleGroupRef}
        position={[POLE_X, POLE_BASE_Y, 0]}
        scale={[1, 0.0001, 1]}
      >
        {/* inner group scales XZ (radius/thickness) without interfering with animation */}
        <group scale={[poleScale, 1, poleScale]}>
          <mesh position={[0, POLE_HEIGHT / 2, 0]} scale={[1.12, 1.002, 1.12]}>
            <cylinderGeometry args={[0.035, 0.035, POLE_HEIGHT, 24]} />
            <meshBasicMaterial color="#020a14" side={BackSide} toneMapped={false} />
          </mesh>
          <mesh position={[0, POLE_HEIGHT / 2, 0]}>
            <cylinderGeometry args={[0.035, 0.035, POLE_HEIGHT, 24]} />
            <meshToonMaterial color="#1a3a66" gradientMap={toonGradient} />
          </mesh>
          <mesh position={[0, POLE_HEIGHT + 0.1, 0]} scale={poleScale * 1.1}>
            <sphereGeometry args={[0.12, 24, 24]} />
            <meshBasicMaterial color="#020a14" side={BackSide} toneMapped={false} />
          </mesh>
          <mesh position={[0, POLE_HEIGHT + 0.1, 0]} scale={poleScale}>
            <sphereGeometry args={[0.12, 24, 24]} />
            <meshToonMaterial color="#10c4c0" gradientMap={toonGradient} />
          </mesh>
        </group>
      </group>

      {/* Flag — pinned to pole's right edge */}
      <group ref={flagGroupRef} position={[0, FLAG_Y, 0]} visible={false}>
        <mesh material={material}>
          <planeGeometry args={[FLAG_W, FLAG_H, 192, 128]} />
        </mesh>
      </group>
    </group>
  )
}

export default function UclFlag({
  logoTextureUrl = "/volsoc-flag.svg",
  className,
  style,
  interactive = false,
  flagPosition = [0, 0, 0],
  flagRotation = [0.08, 0.48, 0],
  flagScale = 1,
  windStrength = 1,
  poleScale = 1,
}) {
  const sun = useSunState()

  return (
    <Canvas
      className={className}
      style={{ ...style, background: "transparent" }}
      dpr={[1, 2]}
      gl={{ alpha: true }}
    >
      <PerspectiveCamera makeDefault position={CAMERA_POSITION} fov={CAMERA_FOV} />
      <Suspense fallback={null}>
        <CelestialStage sun={sun}>
          <Scene
            logoTextureUrl={logoTextureUrl}
            flagPosition={flagPosition}
            flagRotation={flagRotation}
            flagScale={flagScale}
            windStrength={windStrength}
            poleScale={poleScale}
          />
        </CelestialStage>
      </Suspense>
      {interactive ? <OrbitControls enablePan={false} /> : null}
    </Canvas>
  )
}
