/**
 * useXRDriveControls.js
 *
 * Traduz input do Meta Quest (controles físicos OU mãos, via hand-tracking)
 * para o mesmo formato `keys.current` que o teclado já preenche em
 * RaceScene.jsx → GameController. Assim o CarPhysics não precisa saber de
 * onde veio o input.
 *
 * CONTROLES FÍSICOS
 *  - Thumbstick direito (eixo X) → direção (analógico)
 *  - Gatilho direito             → acelerar (analógico)
 *  - Gatilho esquerdo             → freio / ré (analógico)
 *  - Grip (aperto lateral)         → freio de mão
 *  - Botão A/X                     → turbo
 *
 * MÃOS (sem controle físico)
 *  - Pinça (polegar+indicador) com a mão DIREITA e arrastar lateral →
 *    "volante virtual": a mão vira o volante, exatamente como girar
 *    um volante de verdade. Segurar a pinça também acelera.
 *  - Pinça com a mão ESQUERDA → freio.
 *  - Fechar as duas mãos ao mesmo tempo (pinça dupla) → turbo.
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useXR } from '@react-three/xr'
import * as THREE from 'three'

const PINCH_DIST = 0.028 // metros — distância polegar↔indicador que conta como "pinçado"
const WHEEL_TRAVEL = 0.32 // metros de deslocamento lateral da mão = giro máximo do volante

export function useXRDriveControls(keysRef) {
  const { controllers, isHandTracking, isPresenting } = useXR()
  const wheelGrab = useRef({ active: false, startX: 0, startSteer: 0 })

  useFrame(() => {
    if (!isPresenting) return
    const k = keysRef.current

    let steer = 0
    let throttle = 0
    let brake = 0
    let turbo = false
    let handbrake = false
    let usedController = false
    let leftPinching = false
    let rightPinching = false

    // ── Controles físicos (thumbstick + gatilhos) ───────────────────────
    for (const c of controllers) {
      const gp = c.inputSource?.gamepad
      if (!gp) continue
      const handedness = c.inputSource.handedness
      usedController = true

      if (handedness === 'right') {
        const x = gp.axes?.[2] ?? gp.axes?.[0] ?? 0
        if (Math.abs(x) > 0.08) steer = THREE.MathUtils.clamp(x, -1, 1)
        throttle = Math.max(throttle, gp.buttons?.[0]?.value || 0)
      }
      if (handedness === 'left') {
        brake = Math.max(brake, gp.buttons?.[0]?.value || 0)
      }
      if (gp.buttons?.[1]?.pressed) handbrake = true
      if (gp.buttons?.[4]?.pressed || gp.buttons?.[5]?.pressed) turbo = true
    }

    // ── Mãos (hand-tracking, sem controle físico) ───────────────────────
    if (isHandTracking && !usedController) {
      for (const c of controllers) {
        const hand = c.hand
        const handedness = c.inputSource?.handedness
        if (!hand?.joints) continue

        const thumb = hand.joints['thumb-tip']
        const index = hand.joints['index-finger-tip']
        if (!thumb || !index) continue

        const pinching = thumb.position.distanceTo(index.position) < PINCH_DIST

        if (handedness === 'right') {
          rightPinching = pinching
          if (pinching) {
            if (!wheelGrab.current.active) {
              wheelGrab.current = { active: true, startX: index.position.x, startSteer: k.analogSteer || 0 }
            }
            const dx = index.position.x - wheelGrab.current.startX
            steer = THREE.MathUtils.clamp(wheelGrab.current.startSteer + dx / WHEEL_TRAVEL, -1, 1)
            throttle = 1
          } else {
            wheelGrab.current.active = false
            steer = k.analogSteer || 0 // mantém o último ângulo do volante ao soltar
          }
        }
        if (handedness === 'left') {
          leftPinching = pinching
          if (pinching) brake = 1
        }
      }
      if (leftPinching && rightPinching) turbo = true
    }

    k.analogSteer = steer
    k.analogThrottle = throttle
    k.analogBrake = brake
    k.turbo = turbo
    k.handbrake = handbrake
    // zera as teclas digitais pra não conflitar com o analógico em VR
    k.up = k.down = k.left = k.right = false
  })
}
