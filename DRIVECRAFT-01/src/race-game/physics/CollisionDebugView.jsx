/**
 * CollisionDebugView.jsx
 *
 * Ferramenta de depuração: desenha wireframes verdes sobre os meshes
 * classificados como 'ground' e caixas vermelhas sobre os colliders
 * de 'wall'. Ative com uma tecla (ex.: O) só em desenvolvimento —
 * não deve ir para produção.
 */
import { useMemo } from 'react'
import * as THREE from 'three'

export default function CollisionDebugView({ collisionMap, visible }) {
  const wallBoxes = useMemo(() => {
    if (!collisionMap?.wallColliders) return []
    return collisionMap.wallColliders.map((box) => ({
      position: [
        (box.minX + box.maxX) / 2,
        (box.minY + box.maxY) / 2,
        (box.minZ + box.maxZ) / 2,
      ],
      size: [
        Math.max(0.05, box.maxX - box.minX),
        Math.max(0.05, box.maxY - box.minY),
        Math.max(0.05, box.maxZ - box.minZ),
      ],
      name: box.name,
    }))
  }, [collisionMap])

  if (!visible || !collisionMap) return null

  return (
    <group>
      {wallBoxes.map((b, i) => (
        <mesh key={i} position={b.position}>
          <boxGeometry args={b.size} />
          <meshBasicMaterial color="#ff2200" wireframe transparent opacity={0.9} />
        </mesh>
      ))}
      {collisionMap.groundMeshes.map((mesh, i) => (
        <primitive
          key={i}
          object={new THREE.BoxHelper(mesh, new THREE.Color('#00ff66'))}
        />
      ))}
    </group>
  )
}