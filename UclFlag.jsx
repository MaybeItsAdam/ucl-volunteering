import React, { useMemo, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, useTexture } from "@react-three/drei"
import { DataTexture, RGBAFormat, UnsignedByteType } from "three"

const vertexShader = `
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;

    float pinned = smoothstep(-1.5, -1.45, pos.x);
    float travel = (pos.x + 1.5) / 3.0;
    float wave = sin((travel * 10.0) - (uTime * 2.2)) * 0.18;
    float ripple = sin((travel * 24.0) - (uTime * 3.4)) * 0.05;

    pos.z += (wave + ripple) * pinned;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`

const fragmentShader = `
  uniform float uTime;
  uniform bool uUseMap;
  uniform sampler2D uMap;
  uniform vec3 uBaseColor;
  varying vec2 vUv;

  void main() {
    vec3 color = uBaseColor;

    if (uUseMap) {
      vec4 tex = texture2D(uMap, vUv);
      color = tex.rgb;
    } else {
      float shimmer = sin((vUv.x * 24.0) + (uTime * 1.3)) * 0.035;
      color = uBaseColor + shimmer;
    }

    gl_FragColor = vec4(color, 1.0);
  }
`

function BaseFlagMaterial({ uniforms }) {
  const materialRef = useRef(null)

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  return (
    <shaderMaterial
      ref={materialRef}
      vertexShader={vertexShader}
      fragmentShader={fragmentShader}
      uniforms={uniforms}
      side={2}
    />
  )
}

function TexturedFlag({ logoTextureUrl }) {
  const texture = useTexture(logoTextureUrl)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uUseMap: { value: true },
      uMap: { value: texture },
      uBaseColor: { value: [0.41, 0.17, 0.57] }
    }),
    [texture]
  )

  return (
    <mesh>
      <planeGeometry args={[3, 2, 32, 32]} />
      <BaseFlagMaterial uniforms={uniforms} />
    </mesh>
  )
}

function ShimmerFlag() {
  const fallbackMap = useMemo(() => {
    const map = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat, UnsignedByteType)
    map.needsUpdate = true
    return map
  }, [])

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uUseMap: { value: false },
      uMap: { value: fallbackMap },
      uBaseColor: { value: [0.41, 0.17, 0.57] }
    }),
    [fallbackMap]
  )

  return (
    <mesh>
      <planeGeometry args={[3, 2, 32, 32]} />
      <BaseFlagMaterial uniforms={uniforms} />
    </mesh>
  )
}

export default function UclFlag({ logoTextureUrl }) {
  return (
    <Canvas camera={{ position: [0.2, 0.1, 4], fov: 45 }}>
      <ambientLight intensity={0.45} />
      <directionalLight position={[3, 2, 4]} intensity={1.2} />
      <directionalLight position={[-3, -1, -2]} intensity={0.2} />
      <group position={[0.2, 0, 0]}>
        <mesh position={[-1.55, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 2.4, 24]} />
          <meshStandardMaterial color="#002147" metalness={0.2} roughness={0.4} />
        </mesh>
        {logoTextureUrl ? <TexturedFlag logoTextureUrl={logoTextureUrl} /> : <ShimmerFlag />}
      </group>
      <OrbitControls enablePan={false} />
    </Canvas>
  )
}
