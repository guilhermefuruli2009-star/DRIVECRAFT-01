/**
 * MiniMap3D.jsx — Minimapa 3D real, baseado no modelo .glb da pista
 * ─────────────────────────────────────────────────────────────────
 *
 * Substitui o MiniMap.jsx antigo (SVG + array de pontos normalizados).
 * Agora o minimapa é literalmente uma vista aérea (câmara ortográfica)
 * do modelo 3D real da pista, com um marcador 3D a indicar o carro.
 *
 * ESTRATÉGIA DE PERFORMANCE (o ponto mais importante deste componente):
 * ------------------------------------------------------------------
 * O modelo da pista pode ter dezenas ou centenas de meshes.
 * Se renderizássemos essa cena inteira a cada frame dentro de um
 * <Canvas> de 160x160px, estaríamos a pagar o custo de ~400 draw
 * calls extra, 60x por segundo, só para o HUD — e isso VAI competir
 * por GPU/CPU com a cena principal do jogo.
 *
 * Em vez disso:
 *   1. O .glb é carregado UMA ÚNICA VEZ (useGLTF + cache do drei).
 *   2. Fazemos um único "bake": renderizamos a pista, vista de cima,
 *      para uma textura (render target / FBO) — isto acontece só uma
 *      vez, no primeiro frame após o load.
 *   3. A partir daí, o minimapa passa a desenhar apenas 2 objetos por
 *      frame: um plano com essa textura "cozinhada" (estático) + o
 *      marcador do carro (dinâmico). A pista pesada nunca mais é
 *      re-renderizada.
 *
 * Resultado: o custo por frame do minimapa é O(1) e não O(nº de meshes
 * da pista), independentemente de a pista ter 400 ou 40.000 polígonos.
 * Isto garante os 60 FPS estáveis exigidos, sem lag no resto do jogo.
 *
 * ALINHAMENTO DE COORDENADAS:
 * ------------------------------------------------------------------
 * O marcador usa exatamente `carPos.x` e `carPos.z` no mesmo espaço
 * de coordenadas do mundo 3D. Se, no dia-a-dia, a pista principal
 * (RaceScene.jsx) vier a carregar este MESMO .glb como pista real,
 * basta aplicar aqui os MESMOS `modelPosition` / `modelScale` /
 * `modelRotationY` que forem usados lá, para que o ponto do carro
 * caia exatamente em cima da pista neste minimapa.
 */

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrthographicCamera, useFBO, useGLTF } from '@react-three/drei'
import * as THREE from 'three'

// ⚠️ Precisa ser o MESMO arquivo usado em RaceScene.jsx (TRACK_GLB_URL lá).
const TRACK_GLB_URL = '/models/road__highway.glb'

// Pré-carrega o modelo assim que o módulo é importado (evita "pop-in").
useGLTF.preload(TRACK_GLB_URL)

// ═══════════════════════════════════════════════════════════════════
//  Núcleo 3D — só monta depois do modelo estar disponível (Suspense)
// ═══════════════════════════════════════════════════════════════════
function TrackTopDown({
  carPos,
  markerColor,
  modelPosition,
  modelScale,
  modelRotationY,
  bakeResolution,
  padding,
}) {
  const { gl } = useThree()
  const { scene } = useGLTF(TRACK_GLB_URL)

  const camRef = useRef(null)
  const markerRef = useRef(null)
  const bakedRef = useRef(false)
  const [ready, setReady] = useState(false)
  const [planeTexture, setPlaneTexture] = useState(null)

  // Clona a cena UMA vez (evita mutar o objeto em cache do drei, que
  // pode estar a ser usado por outra parte do jogo, ex. a pista real).
  const trackScene = useMemo(() => scene.clone(true), [scene])

  // Aplica a MESMA auto-centragem usada pela pista real (RaceTrackModel em
  // RaceScene.jsx): X/Z centrados na origem, ponto mais baixo em y=0. Isto
  // garante que, por defeito (sem calibração manual), o marcador — que usa
  // carPos.x/z no espaço de coordenadas do jogo — cai exatamente no sítio
  // certo sobre a pista aqui desenhada. `modelPosition/Scale/RotationY`
  // continuam disponíveis como transformação EXTRA por cima, para o caso
  // de a cena principal aplicar alguma transformação adicional ao modelo.
  const { bbox, center, halfSize, groundY, ceilingY } = useMemo(() => {
    const rawBox = new THREE.Box3().setFromObject(trackScene)
    const rawCenter = new THREE.Vector3()
    rawBox.getCenter(rawCenter)

    trackScene.position.set(
      -rawCenter.x + modelPosition[0],
      -rawBox.min.y + modelPosition[1],
      -rawCenter.z + modelPosition[2],
    )
    trackScene.scale.setScalar(modelScale)
    trackScene.rotation.y = modelRotationY
    trackScene.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(trackScene)
    const size = new THREE.Vector3()
    const c = new THREE.Vector3()
    box.getSize(size)
    box.getCenter(c)

    // Minimapa é quadrado: usamos a maior dimensão horizontal (X ou Z)
    const half = (Math.max(size.x, size.z) / 2) * padding

    return {
      bbox: box,
      center: c,
      halfSize: half,
      groundY: box.min.y,
      ceilingY: box.max.y,
    }
  }, [trackScene, modelPosition, modelScale, modelRotationY, padding])

  // FBO onde vamos "cozinhar" a pista uma única vez.
  const fbo = useFBO(bakeResolution, bakeResolution, {
    depthBuffer: true,
    stencilBuffer: false,
  })

  // Cena auxiliar de bake: pista + luz simples (só existe para o bake,
  // nunca é adicionada à cena visível principal do jogo).
  const bakeScene = useMemo(() => {
    const s = new THREE.Scene()
    s.add(trackScene)
    s.add(new THREE.AmbientLight(0xffffff, 1.1))
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(halfSize, halfSize * 3, halfSize)
    s.add(sun)
    return s
  }, [trackScene, halfSize])

  // Altura da câmara: acima do ponto mais alto da pista, com margem.
  const cameraHeight = ceilingY + halfSize * 2 + 50

  useEffect(() => {
    if (bakedRef.current || !camRef.current) return

    const camera = camRef.current
    camera.position.set(center.x, cameraHeight, center.z)
    camera.up.set(0, 0, -1) // evita "roll" arbitrário ao olhar para baixo
    camera.lookAt(center.x, groundY, center.z)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld(true)

    // Bake: renderiza a pista completa UMA vez para a textura do FBO.
    const prevTarget = gl.getRenderTarget()
    gl.setRenderTarget(fbo)
    gl.setClearColor(0x0a0f14, 1)
    gl.clear(true, true, true)
    gl.render(bakeScene, camera)
    gl.setRenderTarget(prevTarget)

    setPlaneTexture(fbo.texture)
    bakedRef.current = true
    setReady(true)
    // Depois do bake, a pista pesada é retirada da árvore (economiza
    // memória e garante que nunca mais é percorrida pelo renderer).
    bakeScene.remove(trackScene)
  }, [camRef.current, center, cameraHeight, groundY, fbo, gl, bakeScene, trackScene])

  // Atualização do marcador — corre no loop de animação (useFrame),
  // mas só mexe em 1 objeto (posição/rotação). Nada de recriar
  // geometria, materiais ou re-render da pista aqui.
  useFrame(() => {
    if (!markerRef.current) return
    markerRef.current.position.x = carPos.x ?? 0
    markerRef.current.position.z = carPos.z ?? 0
    if (typeof carPos.angle === 'number') {
      markerRef.current.rotation.y = carPos.angle
    }
  })

  const markerY = ceilingY + Math.max(2, halfSize * 0.015)
  const markerScale = Math.max(1, halfSize * 0.045)

  return (
    <>
      <OrthographicCamera
        ref={camRef}
        makeDefault
        left={-halfSize}
        right={halfSize}
        top={halfSize}
        bottom={-halfSize}
        near={0.1}
        far={cameraHeight + halfSize * 2 + 100}
      />

      {/* Plano estático com a pista "cozinhada" numa textura */}
      {ready && planeTexture && (
        <mesh position={[center.x, groundY, center.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[halfSize * 2, halfSize * 2]} />
          <meshBasicMaterial map={planeTexture} toneMapped={false} depthWrite={false} />
        </mesh>
      )}

      {/* Marcador do jogador — seta triangular (cone de 3 lados) */}
      <group ref={markerRef} position={[carPos.x ?? 0, markerY, carPos.z ?? 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[markerScale, markerScale * 2.2, 3]} />
          <meshBasicMaterial color={markerColor} toneMapped={false} />
        </mesh>
        {/* Contorno/halo para ficar visível sobre qualquer fundo */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
          <ringGeometry args={[markerScale * 1.4, markerScale * 1.9, 16]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.85} toneMapped={false} />
        </mesh>
      </group>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
//  Wrapper público — Canvas leve + Suspense
// ═══════════════════════════════════════════════════════════════════
export default function MiniMap3D({
  carPos = { x: 0, y: 0, z: 0, angle: 0 },
  size = 160,
  markerColor = 'var(--race-accent, #ff3860)',
  modelPosition = [0, 0, 0],
  modelScale = 1,
  modelRotationY = 0,
  bakeResolution = 512,
  padding = 1.06,
  className = '',
}) {
  return (
    <div
      className={`minimap-3d ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: 8,
        overflow: 'hidden',
        background: '#0a0f14',
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      <Canvas
        dpr={[1, 1]}
        frameloop="always"
        gl={{ antialias: false, alpha: false, powerPreference: 'low-power' }}
        onCreated={({ gl }) => gl.setClearColor('#0a0f14', 1)}
      >
        <Suspense fallback={null}>
          <TrackTopDown
            carPos={carPos}
            markerColor={markerColor}
            modelPosition={modelPosition}
            modelScale={modelScale}
            modelRotationY={modelRotationY}
            bakeResolution={bakeResolution}
            padding={padding}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}
