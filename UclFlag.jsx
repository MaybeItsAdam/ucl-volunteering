import React, { useMemo, useRef } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls, useTexture } from "@react-three/drei"

const PLACEHOLDER_TEXTURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnPZXQAAAAASUVORK5CYII="

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

function Flag({ logoTextureUrl }) {
  const materialRef = useRef(null)
  const texture = useTexture(logoTextureUrl || PLACEHOLDER_TEXTURE)

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uUseMap: { value: Boolean(logoTextureUrl) },
      uMap: { value: texture },
      uBaseColor: { value: [0.41, 0.17, 0.57] }
    }),
    [logoTextureUrl, texture]
  )

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
    }
  })

  return (
    <mesh>
      <planeGeometry args={[3, 2, 32, 32]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={2}
      />
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
        <Flag logoTextureUrl={logoTextureUrl} />
      </group>
      <OrbitControls enablePan={false} />
    </Canvas>
  )
}
