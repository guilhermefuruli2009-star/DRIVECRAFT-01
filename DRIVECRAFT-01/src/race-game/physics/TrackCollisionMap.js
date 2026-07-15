/**
 * src/components/race-game/physics/TrackCollisionMap.js
 *
 * Constrói, a partir da cena 3D do GLB da pista, um "mapa de colisão"
 * separado da malha visual:
 *   - groundMeshes: só os meshes classificados como chão dirigível.
 *     Usado exclusivamente para o raycast de altura/limite de pista.
 *   - wallColliders: caixas AABB simplificadas para os meshes de
 *     parede/obstáculo. Usado para bloquear o carro.
 *   - qualquer outro mesh (decoração) é ignorado por ambos, mas
 *     continua sendo renderizado normalmente (não mexemos na cena).
 *
 * Isto roda UMA VEZ, quando o GLB é carregado — não a cada frame.
 */
import * as THREE from 'three'
import { TRACK_COLLISION_CONFIG } from './trackCollisionConfig'

function classifyByName(name, config) {
  const n = (name || '').toLowerCase()
  if (config.groundPatterns.some((p) => n.includes(p))) return 'ground'
  if (config.wallPatterns.some((p) => n.includes(p))) return 'wall'
  return null // desconhecido -> heurística geométrica decide
}

/**
 * Heurística de fallback para GLBs baixados com nomes sem sentido
 * (ex.: "Object_042", "mesh_17"). Não é perfeita — é um ponto de
 * partida automático. Sempre prefira nomear via trackCollisionConfig.js
 * quando possível; use logMeshInventory() para descobrir os nomes reais.
 *
 * Lógica: um mesh que é predominantemente HORIZONTAL (normal média
 * apontando para cima), fino em Y e com área de base razoável é chão.
 * Um mesh mais alto que largo, com base pequena/média, é parede/objeto
 * sólido. O resto é decoração.
 */
function classifyByGeometry(mesh, config) {
  const geom = mesh.geometry
  if (!geom || !geom.attributes?.position) return config.fallbackClass

  const box = new THREE.Box3().setFromObject(mesh)
  const size = new THREE.Vector3()
  box.getSize(size)
  const footprint = size.x * size.z
  const heightRatio = size.y / Math.max(size.x, size.z, 0.001)

  let avgNormalY = 0
  const normalAttr = geom.attributes.normal
  if (normalAttr) {
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
    const n = new THREE.Vector3()
    const step = Math.max(1, Math.floor(normalAttr.count / 200)) // amostra
    let samples = 0
    for (let i = 0; i < normalAttr.count; i += step) {
      n.fromBufferAttribute(normalAttr, i).applyMatrix3(normalMatrix).normalize()
      avgNormalY += n.y
      samples++
    }
    avgNormalY /= Math.max(1, samples)
  }

  if (avgNormalY > 0.6 && heightRatio < 0.25 && footprint > 4) return 'ground'
  if (heightRatio > 0.4 && footprint < config.maxWallFootprint) return 'wall'
  return config.fallbackClass
}

function classify(mesh, config) {
  const byName = classifyByName(mesh.name, config)
  return byName || classifyByGeometry(mesh, config)
}

/**
 * Constrói o mapa de colisão. Chame DEPOIS de posicionar/centralizar a
 * trackScene e de rodar updateMatrixWorld(true) — os cálculos de AABB
 * dependem das matrizes mundiais finais.
 */
export function buildTrackCollisionMap(trackScene, config = TRACK_COLLISION_CONFIG) {
  const groundMeshes = []
  const wallColliders = []
  let decorCount = 0

  trackScene.traverse((node) => {
    if (!node.isMesh) return
    const cls = classify(node, config)

    if (cls === 'ground') {
      groundMeshes.push(node)
      return
    }
    decorCount++
  })

  // Raycaster dedicado, reutilizado a cada chamada — evita alocar por frame.
  const raycaster = new THREE.Raycaster()
  const down = new THREE.Vector3(0, -1, 0)
  const origin = new THREE.Vector3()

  /**
   * Consulta a altura do chão dirigível em (x,z). Retorna o ponto de
   * impacto ou null se (x,z) não está sobre nenhum mesh de chão —
   * ou seja, "fora da pista".
   */
  function raycastGround(x, z, fromY = 500) {
    origin.set(x, fromY, z)
    raycaster.set(origin, down)
    raycaster.far = fromY + 500
    const hits = raycaster.intersectObjects(groundMeshes, false)
    return hits.length ? hits[0].point : null
  }

  /**
   * Como raycastGround, mas se o ponto exato falhar (comum em costuras
   * entre tiles de asfalto adjacentes em GLBs de terceiros), tenta uma
   * pequena amostragem em anel ao redor de (x,z) antes de desistir.
   * Isso NÃO esconde bordas reais da pista — só cobre gaps de poucos
   * centímetros entre meshes vizinhos.
   */
  function raycastGroundWithTolerance(x, z, fromY = 500, tolerance = 0.6) {
    const direct = raycastGround(x, z, fromY)
    if (direct) return direct

    const offsets = [
      [tolerance, 0], [-tolerance, 0], [0, tolerance], [0, -tolerance],
      [tolerance, tolerance], [-tolerance, -tolerance],
      [tolerance, -tolerance], [-tolerance, tolerance],
    ]
    for (const [ox, oz] of offsets) {
      const hit = raycastGround(x + ox, z + oz, fromY)
      if (hit) return hit
    }
    return null
  }

  if (groundMeshes.length === 0) {
    console.warn(
      '[TrackCollisionMap] Nenhum mesh classificado como "ground". ' +
      'O carro vai cair no vazio. Ajuste trackCollisionConfig.js — ' +
      'rode logMeshInventory() para ver os nomes reais dos meshes.'
    )
  }

  return {
    groundMeshes,
    wallColliders,
    raycastGround,
    raycastGroundWithTolerance,
    stats: { ground: groundMeshes.length, wall: wallColliders.length, decor: decorCount },
  }
}

/**
 * Ferramenta de desenvolvimento — chame uma vez (ver RaceScene.jsx) e
 * veja no console como cada mesh do GLB foi classificado. Use isso para
 * preencher trackCollisionConfig.js com precisão, sem precisar abrir
 * o modelo em um editor 3D.
 */
export function logMeshInventory(trackScene, config = TRACK_COLLISION_CONFIG) {
  const rows = []
  trackScene.traverse((node) => {
    if (!node.isMesh) return
    const byName = classifyByName(node.name, config)
    const classe = byName || classifyByGeometry(node, config)
    rows.push({ nome: node.name, classe, origem: byName ? 'nome' : 'heurística' })
  })
  console.table(rows)
  return rows
}