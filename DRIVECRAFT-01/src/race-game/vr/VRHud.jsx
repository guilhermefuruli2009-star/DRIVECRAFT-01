/**
 * VRHud.jsx
 *
 * Dentro do headset, o HUD em HTML (RaceHUD.jsx) simplesmente não
 * aparece — o Canvas em modo XR é desenhado direto na tela do
 * dispositivo, por fora do DOM. Por isso, em VR, o placar de
 * velocidade/marcha/volta e os botões de menu precisam existir como
 * objetos 3D DENTRO da cena.
 *
 *  - <VRDashboard>  → mostrador preso no painel do carro (velocidade,
 *    marcha, volta atual). Segue o carro a cada frame.
 *  - <VRMenuPanel>  → botão 3D "apertável": com controle, aponta e
 *    aperta o gatilho; com as mãos, encosta o indicador/faz a pinça
 *    em cima do botão.
 */
import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import { Interactive } from '@react-three/xr'
import * as THREE from 'three'

// ── Mostrador no painel do carro ─────────────────────────────────────────
export function VRDashboard({ physicsRef }) {
  const groupRef = useRef()
  const [readout, setReadout] = useState({ kmh: 0, gear: 'N', lap: 0, total: 3 })
  const tick = useRef(0)

  useFrame((_, dt) => {
    if (!groupRef.current || !physicsRef.current) return
    const p = physicsRef.current
    groupRef.current.position.set(p.x, p.y, p.z)
    groupRef.current.rotation.set(0, p.angle, 0)

    // atualiza o texto uns 10x/s só — troika reconstrói geometria a cada
    // mudança, não precisa fazer isso todo frame
    tick.current += dt
    if (tick.current > 0.1) {
      tick.current = 0
      const kmh = Math.round(p.getKmh())
      const gearIdx = Math.min(6, Math.floor(kmh / 20))
      const gear = ['N', '1ª', '2ª', '3ª', '4ª', '5ª', '6ª'][gearIdx]
      setReadout(r => (r.kmh === kmh && r.gear === gear ? r : { ...r, kmh, gear }))
    }
  })

  return (
    <group ref={groupRef}>
      {/* posicionado tipo um painel no capô/console, dentro do campo de visão do motorista */}
      <group position={[0, 0.75, 0.55]}>
        <Text fontSize={0.09} color="#00ccff" anchorX="center" anchorY="middle" position={[0, 0.06, 0]}>
          {readout.kmh} km/h
        </Text>
        <Text fontSize={0.06} color="#ffffff" anchorX="center" anchorY="middle" position={[0, -0.05, 0]}>
          Marcha {readout.gear}
        </Text>
      </group>
    </group>
  )
}

// ── Botão 3D apertável (funciona com raio do controle e com pinça da mão) ─
function PressButton({ label, sub, position, color = '#00ccff', onPress }) {
  const [hover, setHover] = useState(false)
  const [pressed, setPressed] = useState(false)

  return (
    <Interactive
      onHover={() => setHover(true)}
      onBlur={() => setHover(false)}
      onSelectStart={() => setPressed(true)}
      onSelectEnd={() => setPressed(false)}
      onSelect={onPress}
    >
      <group position={position}>
        <mesh scale={pressed ? 0.94 : 1}>
          <boxGeometry args={[0.5, 0.16, 0.04]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={hover ? 0.9 : 0.35}
            metalness={0.3}
            roughness={0.4}
          />
        </mesh>
        <Text fontSize={0.05} color="#0a1020" anchorX="center" anchorY="middle" position={[0, sub ? 0.02 : 0, 0.03]}>
          {label}
        </Text>
        {sub && (
          <Text fontSize={0.028} color="#0a1020" anchorX="center" anchorY="middle" position={[0, -0.035, 0.03]}>
            {sub}
          </Text>
        )}
      </group>
    </Interactive>
  )
}

// ── Painel de menu (intro / pausa / fim de corrida) ──────────────────────
// Fica plantado 2m à frente do ponto de largada, de frente pro carro —
// simples e suficiente já que o carro está parado nesses estados.
export function VRMenuPanel({ startX, startZ, title, subtitle, buttons }) {
  return (
    <group position={[startX, 1.35, startZ + 2.2]} rotation={[0, Math.PI, 0]}>
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[1.3, 0.9]} />
        <meshStandardMaterial color="#0a1020" transparent opacity={0.75} />
      </mesh>
      <Text fontSize={0.09} color="#8fc" anchorX="center" anchorY="middle" position={[0, 0.32, 0]}>
        {title}
      </Text>
      {subtitle && (
        <Text fontSize={0.045} color="#ccc" anchorX="center" anchorY="middle" position={[0, 0.2, 0]} maxWidth={1.1}>
          {subtitle}
        </Text>
      )}
      {buttons.map((b, i) => (
        <PressButton
          key={b.label}
          label={b.label}
          sub={b.sub}
          color={b.color}
          position={[0, 0.02 - i * 0.24, 0.02]}
          onPress={b.onPress}
        />
      ))}
    </group>
  )
}
