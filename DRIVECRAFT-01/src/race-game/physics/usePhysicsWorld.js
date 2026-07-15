/**
 * src/physics/usePhysicsWorld.js
 *
 * Loop de física em passo fixo (accumulator pattern), desacoplado do
 * framerate de render. O Three.js/R3F continua desenhando a 30/60/144fps
 * conforme o dispositivo, mas a simulação sempre avança em incrementos
 * de FIXED_DT — resultado determinístico e independente de variações
 * de frame time (troca de aba, engasgo do GC, etc.).
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'

const FIXED_DT = 1 / 60
const MAX_STEPS_PER_FRAME = 5 // evita "spiral of death" após um engasgo grande

export function usePhysicsWorld(stepFn, isActive) {
  const accumulator = useRef(0)

  useFrame((_, delta) => {
    if (!isActive) return
    accumulator.current += Math.min(delta, 0.1)

    let steps = 0
    while (accumulator.current >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      stepFn(FIXED_DT)
      accumulator.current -= FIXED_DT
      steps++
    }
  })
}