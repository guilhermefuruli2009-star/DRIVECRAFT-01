/**
 * VRCameraRig.jsx
 *
 * Em VR não dá pra empurrar a câmera na mão feito RaceCamera faz no modo
 * desktop (isso é o WebXR quem controla, a partir do headset). O que dá
 * pra fazer é mover o "player" (grupo raiz de onde o headset é filho) —
 * grudando ele na posição/rotação do carro a cada frame, na altura dos
 * olhos sentado no banco. O resultado é uma câmera de "cockpit" real:
 * o jogador olha pra qualquer lado com a cabeça, mas o referencial
 * (o carro) se move e vira junto.
 *
 * Sem suavização de POSIÇÃO/ROTAÇÃO — em VR, atraso entre o movimento
 * do carro e o que os olhos veem é a maior causa de enjoo.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import * as THREE from 'three'

const EYE_HEIGHT = 0.62 // altura dos olhos em relação ao chão do carro, sentado

export function VRCameraRig({ physicsRef }) {
  const { player, isPresenting } = useXR()

  useFrame(() => {
    if (!isPresenting || !physicsRef.current || !player) return
    const p = physicsRef.current
    player.position.set(p.x, p.y + EYE_HEIGHT, p.z)
    player.rotation.set(0, p.angle, 0)
  })

  return null
}

// ═══════════════════════════════════════════════════════════════════════
//  VINHETA DE CONFORTO — escurece a periferia em curvas/freadas fortes
// ═══════════════════════════════════════════════════════════════════════
function makeVignetteTex() {
  const S = 512
  const cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.32, S / 2, S / 2, S * 0.5)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(0,0,0,1)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, S, S)
  return new THREE.CanvasTexture(cv)
}

export function VRComfortVignette({ physicsRef }) {
  const { isPresenting } = useXR()
  const meshRef = useRef()
  const matRef = useRef()
  const tex = useRef(null)
  if (!tex.current) tex.current = makeVignetteTex()
  const smoothed = useRef(0)
  const lastSpeed = useRef(0)
  const fwd = useRef(new THREE.Vector3())
  const camQuat = useRef(new THREE.Quaternion())
  const camPos = useRef(new THREE.Vector3())

  useFrame((state, dt) => {
    if (!isPresenting || !physicsRef.current || !matRef.current || !meshRef.current) return
    const p = physicsRef.current

    // gruda a vinheta 0.5m à frente da câmera real (headset), sempre no campo de visão
    state.camera.getWorldPosition(camPos.current)
    state.camera.getWorldQuaternion(camQuat.current)
    fwd.current.set(0, 0, -1).applyQuaternion(camQuat.current)
    meshRef.current.position.copy(camPos.current).addScaledVector(fwd.current, 0.5)
    meshRef.current.quaternion.copy(camQuat.current)

    // proxy de força-G: curva fechada em alta velocidade + freada brusca
    const speedDelta = (p.speed - lastSpeed.current) / Math.max(dt, 0.001)
    lastSpeed.current = p.speed
    const lateralG = Math.abs(p.steer) * (Math.abs(p.speed) / p.maxFwd)
    const brakingG = Math.min(1, Math.max(0, -speedDelta / 20))
    const target = Math.min(1, Math.max(lateralG, brakingG)) * 0.5
    smoothed.current += (target - smoothed.current) * Math.min(1, dt * 4)
    matRef.current.opacity = smoothed.current
  })

  if (!isPresenting) return null

  return (
    <mesh ref={meshRef} renderOrder={999}>
      <planeGeometry args={[1.3, 1.3]} />
      <meshBasicMaterial
        ref={matRef}
        map={tex.current}
        transparent
        opacity={0}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
