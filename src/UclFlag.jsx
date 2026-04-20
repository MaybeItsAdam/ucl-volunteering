import React, { Suspense, useMemo, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, useTexture } from "@react-three/drei"
import {
  BackSide,
  DataTexture,
  DoubleSide,
  MathUtils,
  LinearFilter,
  MeshBasicMaterial,
  NearestFilter,
  RedFormat,
  SRGBColorSpace
} from "three"

const VERTEX_CHUNK = `
  vFlagUv = uv;

  float travel = (transformed.x + 1.5) / 3.0;
  float pinned = smoothstep(0.0, 0.06, travel);

  // distance behind the unfurl leading edge
  float edgeDist = uFlagAppear - uv.x;
  float settle = smoothstep(0.0, 0.22, edgeDist);
  float bulge = 1.0 - settle;

  // wave amplitude builds up as the fabric settles into place
  float w1 = sin(travel * 7.0 - uFlagTime * 2.4) * 0.22;
  float w2 = sin(travel * 14.0 + transformed.y * 1.3 - uFlagTime * 3.1) * 0.09;
  float w3 = sin(transformed.y * 2.6 + uFlagTime * 1.5) * 0.05;

  float amp = pinned * travel * settle;
  transformed.z += (w1 + w2 + w3) * amp;
  transformed.y -= travel * travel * 0.07 * pinned * settle;

  // leading edge curls — the fabric rolls open rather than popping flat
  float curlPhase = bulge * 3.14159;
  transformed.z -= sin(curlPhase) * 0.28 * pinned;
  transformed.y += sin(curlPhase) * 0.08 * pinned;
  transformed.x -= bulge * bulge * 0.05 * pinned;

  // quick whip motion along the freshly-revealed strip
  float whipBand = smoothstep(0.05, 0.0, abs(edgeDist - 0.05));
  transformed.z += whipBand * sin(uFlagTime * 18.0) * 0.05 * pinned;
`

const CAMERA_CONFIG = { position: [0.2, 0.1, 4], fov: 45 }
const POLE_HEIGHT = 4.6

function makeToonGradient(steps) {
  const data = new Uint8Array(steps)
  const tex = new DataTexture(data, steps.length, 1, RedFormat)
  tex.minFilter = NearestFilter
  tex.magFilter = NearestFilter
  tex.generateMipmaps = false
  tex.needsUpdate = true
  return tex
}

function Scene({ logoTextureUrl }) {
  const holeGroupRef = useRef(null)
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

      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          `#include <common>
           uniform float uFlagTime;
           uniform float uFlagAppear;
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

    // Hole opens: 0 → 0.5s, easeOutCubic
    const holeT = Math.min(Math.max(t / 0.5, 0), 1)
    const holeEase = 1 - Math.pow(1 - holeT, 3)
    if (holeGroupRef.current) {
      holeGroupRef.current.scale.x = Math.max(holeEase, 0.0001)
      holeGroupRef.current.scale.y = Math.max(holeEase * 0.32, 0.0001)
    }

    // Pole pushes up out of the hole: 0.5s → 1.4s, easeOutCubic
    const poleStart = 0.5
    const poleT = Math.min(Math.max((t - poleStart) / 0.9, 0), 1)
    const poleEase = 1 - Math.pow(1 - poleT, 3)
    if (poleGroupRef.current) {
      poleGroupRef.current.visible = t >= poleStart
      poleGroupRef.current.scale.y = Math.max(poleEase, 0.0001)
    }

    // Flag unfurls: 1.5s → 2.9s — slower for a more deliberate roll-out
    const flagStart = 1.5
    const flagDuration = 1.4
    const flagT = Math.min(Math.max((t - flagStart) / flagDuration, 0), 1)
    // ease that starts slow, speeds up mid-roll, then eases out at the tip
    const flagEase =
      flagT < 0.5
        ? 2.0 * flagT * flagT
        : 1.0 - Math.pow(-2.0 * flagT + 2.0, 2.2) / 2.0
    if (flagGroupRef.current) {
      flagGroupRef.current.visible = t >= flagStart
    }
    if (shaderRef.current) {
      shaderRef.current.uniforms.uFlagTime.value = t
      // overshoot past 1 so the tip clears the 0.22-wide curl zone and settles flat
      shaderRef.current.uniforms.uFlagAppear.value = flagEase * 1.28
    }
  })

  return (
    <group position={[0.2, 0, 0]}>
      {/* Hole in the ground — grows open, then the pole emerges from it */}
      <group
        ref={holeGroupRef}
        position={[-1.55, -1.25, 0.05]}
        scale={[0.0001, 0.0001, 1]}
      >
        <mesh position={[0, 0, 0.01]} renderOrder={1}>
          <circleGeometry args={[0.16, 48]} />
          <meshBasicMaterial color="#020a14" toneMapped={false} />
        </mesh>
        <mesh>
          <ringGeometry args={[0.16, 0.19, 48]} />
          <meshBasicMaterial color="#061c33" toneMapped={false} />
        </mesh>
      </group>

      {/* Pole + finial — cel-shaded, emerges from the hole */}
      <group
        ref={poleGroupRef}
        position={[-1.55, -1.25, 0]}
        scale={[1, 0.0001, 1]}
        visible={false}
      >
        <mesh position={[0, POLE_HEIGHT / 2, 0]} scale={[1.12, 1.002, 1.12]}>
          <cylinderGeometry args={[0.04, 0.04, POLE_HEIGHT, 24]} />
          <meshBasicMaterial color="#020a14" side={BackSide} toneMapped={false} />
        </mesh>
        <mesh position={[0, POLE_HEIGHT / 2, 0]}>
          <cylinderGeometry args={[0.04, 0.04, POLE_HEIGHT, 24]} />
          <meshToonMaterial color="#1a3a66" gradientMap={toonGradient} />
        </mesh>

        <mesh position={[0, POLE_HEIGHT + 0.15, 0]} scale={1.1}>
          <sphereGeometry args={[0.09, 20, 20]} />
          <meshBasicMaterial color="#020a14" side={BackSide} toneMapped={false} />
        </mesh>
        <mesh position={[0, POLE_HEIGHT + 0.15, 0]}>
          <sphereGeometry args={[0.09, 20, 20]} />
          <meshToonMaterial color="#10c4c0" gradientMap={toonGradient} />
        </mesh>
      </group>

      {/* Flag — stays at full size; shader discards beyond uFlagAppear */}
      <group ref={flagGroupRef} position={[0, MathUtils.clamp(POLE_HEIGHT - 1.8, 0.25, 3), 0]} visible={false}>
        <mesh material={material}>
          <planeGeometry args={[3, 2, 96, 48]} />
        </mesh>
      </group>
    </group>
  )
}

export default function UclFlag({
  logoTextureUrl = "/volsoc-flag.svg",
  className,
  style,
  interactive = false
}) {
  return (
    <Canvas camera={CAMERA_CONFIG} className={className} style={style} dpr={[1, 2]}>
      <ambientLight intensity={0.65} />
      <directionalLight position={[3, 3, 4]} intensity={1.1} />
      <directionalLight position={[-2, -1, 2]} intensity={0.3} />
      <Suspense fallback={null}>
        <Scene logoTextureUrl={logoTextureUrl} />
      </Suspense>
      {interactive ? <OrbitControls enablePan={false} /> : null}
    </Canvas>
  )
}
