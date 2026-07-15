/**
 * RaceScene.jsx — v7 PISTA REAL (Road / Highway .glb)
 *
 * NOVIDADES v5:
 *  🗺️ A pista/cenário 3D antigo (procedural, ~800m) foi REMOVIDO por
 *     completo. O carro percorre um modelo 3D real carregado de um
 *     arquivo `.glb` (ver `TRACK_GLB_URL` abaixo).
 *  🧭 O carro segue a elevação real do terreno (raycast vertical contra
 *     a malha da pista) em vez de andar sempre num plano y=0 fixo.
 *  🏁 Sistema de volta sem depender de um spline: usa uma "zona de
 *     partida" (ponto + raio) e odômetro mínimo percorrido — funciona
 *     em qualquer traçado, mesmo sem conhecer a linha central real.
 *  🎥 Câmera "cinemático" deixou de orbitar uma curva predefinida —
 *     agora orbita o próprio carro (funciona em qualquer pista).
 *  💡 Luz solar (sombra) agora acompanha o carro.
 *  🗺️ Mini-mapa cheio (tecla M) reutiliza o MiniMap3D real.
 *
 *  🧱 v6: Física e colisão foram extraídas para ./physics/*.
 *     Ground/wall são classificados automaticamente a partir do GLB
 *     (ver physics/TrackCollisionMap.js). Tecla O alterna a
 *     visualização de debug dos colliders.
 *
 *  🛣️ v7: Pista trocada para `road__highway.glb` — uma estrada/viaduto
 *     elevado (~190m de extensão útil, ~200m de área total incluindo o
 *     terreno ao redor), MUITO menor que o Fuji Speedway (~2km) e, ao
 *     contrário dele, uma pista LINEAR (ponto A → ponto B), não um
 *     circuito fechado em loop. `TRACK_SCALE` foi adicionado para
 *     ampliar o modelo (que sozinho fica com pista bem estreita) e
 *     `START_RADIUS`/`LAP_MIN_DISTANCE` foram reduzidos para caber
 *     nessa escala menor. O sistema de "volta" continua funcionando
 *     nessa pista linear no modo ida-e-volta: sai da zona de largada,
 *     percorre a estrada, faz o retorno, e cruzar a zona de novo conta
 *     como volta (desde que o odômetro tenha passado de
 *     `LAP_MIN_DISTANCE`).
 *
 * ⚠️ CALIBRAÇÃO NECESSÁRIA — leia isto:
 *  Não há metadados no .glb a indicar onde fica exatamente a reta de
 *  largada. `START_X`/`START_Z` (abaixo) apontam para o centro da
 *  bounding box do modelo, o que é um ponto de partida razoável mas
 *  pode não estar exatamente sobre o asfalto — e, sendo essa pista
 *  linear (não um anel), o centro da bounding box pode cair fora da
 *  faixa da estrada. Ative `DEBUG_COORDS` (tecla P) para veres a
 *  posição atual do carro no canto da tela enquanto exploras a pista, e
 *  ajusta `START_X`/`START_Z` para um ponto que caia sobre o asfalto
 *  (idealmente numa das pontas da estrada) depois de testar.
 */

import { useRef, useEffect, useMemo, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Sky, useGLTF } from '@react-three/drei'
import { XR, VRButton, Controllers, Hands, useXR } from '@react-three/xr'
import * as THREE from 'three'
import { GAME_STATES } from './RaceGame'
import MiniMap3D from './MiniMap3D'
import CollisionDebugView from './physics/CollisionDebugView'
import { CarPhysics } from './physics/CarPhysics'
import { buildTrackCollisionMap, logMeshInventory } from './physics/TrackCollisionMap'
import { usePhysicsWorld } from './physics/usePhysicsWorld'
import { useXRDriveControls } from './vr/useXRDriveControls'
import { VRCameraRig, VRComfortVignette } from './vr/VRCameraRig'
import { VRDashboard, VRMenuPanel } from './vr/VRHud'

// ═══════════════════════════════════════════════════════════════════════════════
//  PISTA REAL — modelo .glb (Road / Highway)
// ═══════════════════════════════════════════════════════════════════════════════
const TRACK_GLB_URL = '/models/road__highway.glb'
useGLTF.preload(TRACK_GLB_URL)

// O modelo bruto tem só ~3-4m de largura de pista, o que é apertado demais
// para dirigir confortavelmente. TRACK_SCALE amplia o modelo inteiro (pista +
// terreno) antes de qualquer outro cálculo (centralização, colisão, minimapa).
// Ajusta este valor à vontade — 1 = tamanho original do .glb.
const TRACK_SCALE = 2.2

// Ponto e raio da "zona de largada" — calibra estas constantes depois
// de explorares a pista (ver DEBUG_COORDS acima). Por agora, o modelo
// é recentrado na origem, por isso (0,0) cai no centro da bounding box —
// mas como essa pista é uma estrada LINEAR (não um anel), o centro da
// bounding box pode não estar sobre o asfalto. Usa a tecla P para achar
// um ponto válido (idealmente numa ponta da estrada) e atualiza aqui.
const START_X = 0
const START_Z = 0
const START_RADIUS = 12        // metros — quão perto da zona conta como "cruzou" (pista mais estreita que o Fuji)
const LAP_MIN_DISTANCE = 150   // metros — odômetro mínimo entre voltas (pista bem mais curta que o Fuji, ~190m x TRACK_SCALE)

// Ativa o pequeno painel de coordenadas (tecla P) para calibrar START_X/Z
const DEBUG_COORDS = true

// ═══════════════════════════════════════════════════════════════════════════════
//  TEXTURA DE GRAMADO (piso de segurança fora dos limites do modelo)
// ═══════════════════════════════════════════════════════════════════════════════
function makeGrassTex() {
  const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S
  const ctx = cv.getContext('2d')
  ctx.fillStyle = '#3d8228'; ctx.fillRect(0, 0, S, S)
  for (let i = 0; i < 90000; i++) {
    const g = 35 + Math.random() * 65
    ctx.fillStyle = `rgba(${Math.round(g * .45)},${g + 18},${Math.round(g * .28)},.55)`
    ctx.fillRect(Math.random() * S, Math.random() * S, 1, 1 + Math.random() * 4)
  }
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(120, 120); return tex
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PISTA 3D REAL — carrega o .glb uma única vez e devolve dados ao pai
// ═══════════════════════════════════════════════════════════════════════════════
function RaceTrackModel({ onReady }) {
  const { scene } = useGLTF(TRACK_GLB_URL)
  const grassTex = useMemo(makeGrassTex, [])
  const trackScene = useMemo(() => scene.clone(true), [scene])

  const { groundY, halfExtent, collisionMap } = useMemo(() => {
    // Escala primeiro — o resto (centralização, mapa de colisão, safety
    // net de grama) depende do tamanho FINAL do modelo.
    trackScene.scale.setScalar(TRACK_SCALE)
    trackScene.updateMatrixWorld(true)

    const box = new THREE.Box3().setFromObject(trackScene)
    const size = new THREE.Vector3(); box.getSize(size)
    const center = new THREE.Vector3(); box.getCenter(center)

    trackScene.position.x -= center.x
    trackScene.position.y -= box.min.y
    trackScene.position.z -= center.z
    trackScene.updateMatrixWorld(true)

    trackScene.traverse((n) => {
      if (!n.isMesh) return
      n.receiveShadow = true
      n.castShadow = false
    })

    trackScene.updateMatrixWorld(true)
    trackScene.traverse((n) => { n.matrixAutoUpdate = false })

    // Construído DEPOIS da centralização/updateMatrixWorld — as AABBs
    // do mapa de colisão precisam das matrizes mundiais finais.
    const map = buildTrackCollisionMap(trackScene)

    if (DEBUG_COORDS) {
      console.log(
        `[TrackCollisionMap] chão: ${map.stats.ground} meshes | ` +
        `paredes: ${map.stats.wall} colliders | decoração ignorada: ${map.stats.decor}`
      )
      logMeshInventory(trackScene)
    }

    return {
      groundY: 0,
      halfExtent: Math.max(size.x, size.z) / 2,
      collisionMap: map,
    }
  }, [trackScene])

  useEffect(() => {
    onReady?.({ object: trackScene, groundY, halfExtent, collisionMap })
  }, [trackScene, groundY, halfExtent, collisionMap, onReady])

  return (
    <group>
      <primitive object={trackScene} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY - 0.05, 0]} receiveShadow>
        <planeGeometry args={[halfExtent * 6, halfExtent * 6]} />
        <meshStandardMaterial map={grassTex} color="#4a9a32" roughness={.95} />
      </mesh>
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AMBIENTE DIA — céu, luz, e sombra que ACOMPANHA o carro
// ═══════════════════════════════════════════════════════════════════════════════
function DayEnvironment({ physicsRef }) {
  const { scene, gl } = useThree()
  const sunRef = useRef()
  const sunTgtRef = useRef()

  useEffect(() => {
    scene.background = new THREE.Color('#87CEEB')
    scene.fog = new THREE.Fog('#c8e8f5', 140, 620)
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = 1.0
  }, [scene, gl])

  useEffect(() => {
    if (sunRef.current && sunTgtRef.current) {
      sunRef.current.target = sunTgtRef.current
    }
  }, [])

  useFrame(() => {
    const p = physicsRef.current
    if (!p || !sunRef.current || !sunTgtRef.current) return
    sunTgtRef.current.position.set(p.x, p.y, p.z)
    sunRef.current.position.set(p.x + 45, p.y + 70, p.z - 35)
  })

  return (
    <>
      <Sky sunPosition={[100, 80, -30]} turbidity={4} rayleigh={.8} mieCoefficient={.003} mieDirectionalG={.8} />
      <directionalLight ref={sunRef} color="#fff8e8" intensity={2.2}
        castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-70} shadow-camera-right={70}
        shadow-camera-top={70} shadow-camera-bottom={-70}
        shadow-camera-far={220} shadow-bias={-.001} />
      <object3D ref={sunTgtRef} />
      <directionalLight position={[-20, 20, 30]} color="#c8e0ff" intensity={.6} />
      <hemisphereLight skyColor="#87CEEB" groundColor="#4a9a32" intensity={.5} />
      <ambientLight intensity={.18} color="#e8f0ff" />
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CARRO
// ═══════════════════════════════════════════════════════════════════════════════
function RaceCar({ carConfig, physicsRef }) {
  const groupRef = useRef()
  const hlTgtL = useRef()
  const hlTgtR = useRef()
  const wheelsRef = useRef([])

  let gltfData = null
  try { gltfData = useGLTF('/models/fiat500f.glb') } catch (_) { }

  const clonedScene = useMemo(() => {
    if (!gltfData?.scene) return null
    const clone = gltfData.scene.clone(true)
    clone.traverse(n => {
      if (!n.isMesh) return
      n.castShadow = n.receiveShadow = true
      if (n.material) n.material = n.material.clone()
    })
    return clone
  }, [gltfData])

  useEffect(() => {
    if (!clonedScene) return
    clonedScene.traverse(n => {
      if (!n.isMesh || !n.material) return
      const nm = (n.name + n.material.name).toLowerCase()
      if (nm.includes('1272010001') || nm.includes('body') || nm.includes('paint')) {
        n.material.color.set(carConfig.bodyColor)
        n.material.metalness = carConfig.metalness ?? 0.8
        n.material.roughness = carConfig.roughness ?? 0.15
        n.material.needsUpdate = true
      }
      if (nm.includes('rim1') || nm.includes('aro')) {
        n.material.color.set(carConfig.rimColor); n.material.needsUpdate = true
      }
    })
  }, [clonedScene, carConfig.bodyColor, carConfig.rimColor])

  useFrame((_, delta) => {
    if (!groupRef.current || !physicsRef.current) return
    const p = physicsRef.current

    const sh = p.shake
    groupRef.current.position.set(
      p.x + (Math.random() - .5) * sh,
      p.y,
      p.z + (Math.random() - .5) * sh
    )
    groupRef.current.rotation.y = p.angle

    const rollTarget = -p.steer * (Math.abs(p.speed) / p.maxFwd) * 0.06
    groupRef.current.rotation.z = THREE.MathUtils.lerp(
      groupRef.current.rotation.z, rollTarget, delta * 8
    )

    wheelsRef.current.forEach(w => {
      if (w) w.rotation.x -= delta * p.speed * 0.8
    })
  })

  const hlOn = carConfig.headlightsOn !== false
  const hlColor = carConfig.lightColor || '#ffffff'

  return (
    <group ref={groupRef}>
      {clonedScene ? (
        <primitive object={clonedScene} scale={100} castShadow />
      ) : (
        <group>
          <mesh position={[0, .3, 0]} castShadow>
            <boxGeometry args={[1.7, .58, 3.4]} /><meshStandardMaterial color={carConfig.bodyColor} metalness={carConfig.metalness ?? 0.8} roughness={carConfig.roughness ?? 0.15} />
          </mesh>
          <mesh position={[0, .72, .08]} castShadow>
            <boxGeometry args={[1.5, .42, 1.9]} /><meshStandardMaterial color={carConfig.bodyColor} metalness={.3} roughness={.4} />
          </mesh>
          <mesh position={[0, .2, 1.75]} castShadow>
            <boxGeometry args={[1.6, .28, .18]} /><meshStandardMaterial color="#222" roughness={.7} />
          </mesh>
          <mesh position={[0, .2, -1.75]} castShadow>
            <boxGeometry args={[1.6, .28, .18]} /><meshStandardMaterial color="#222" roughness={.7} />
          </mesh>
          {[[-0.88, 0, 1.15], [0.88, 0, 1.15], [-0.88, 0, -1.15], [0.88, 0, -1.15]].map((wp, i) => (
            <mesh key={i} ref={el => wheelsRef.current[i] = el} position={wp} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[.3, .3, .22, 16]} />
              <meshStandardMaterial color={carConfig.rimColor} metalness={.9} roughness={.1} />
            </mesh>
          ))}
          {[[-0.88, 0, 1.15], [0.88, 0, 1.15], [-0.88, 0, -1.15], [0.88, 0, -1.15]].map((wp, i) => (
            <mesh key={`t${i}`} position={wp} rotation={[0, 0, Math.PI / 2]} castShadow>
              <torusGeometry args={[.3, .1, 8, 16]} /><meshStandardMaterial color="#111" roughness={.9} />
            </mesh>
          ))}
          {[[.58, .38, 1.72], [-.58, .38, 1.72]].map((fp, i) => (
            <mesh key={`hf${i}`} position={fp}>
              <boxGeometry args={[.36, .15, .05]} /><meshStandardMaterial color="#ffffcc" emissive="#ffffcc" emissiveIntensity={hlOn ? 3 : 0} />
            </mesh>
          ))}
          {[[.58, .38, -1.73], [-.58, .38, -1.73]].map((fp, i) => (
            <mesh key={`ht${i}`} position={fp}>
              <boxGeometry args={[.34, .14, .05]} /><meshStandardMaterial color="#ff1100" emissive="#ff1100" emissiveIntensity={hlOn ? 2 : .25} />
            </mesh>
          ))}
          {[[.85, .68, .2], [-.85, .68, .2]].map((mp, i) => (
            <mesh key={`mr${i}`} position={mp}>
              <boxGeometry args={[.06, .1, .22]} /><meshStandardMaterial color="#333" roughness={.4} metalness={.7} />
            </mesh>
          ))}
        </group>
      )}

      <object3D ref={hlTgtL} position={[.4, 0, 25]} />
      <object3D ref={hlTgtR} position={[-.4, 0, 25]} />

      {hlOn && (
        <>
          <spotLight position={[.4, .5, 1.9]} target={hlTgtL.current}
            color={hlColor} intensity={80} angle={.22} penumbra={.35} distance={35} castShadow={false} />
          <spotLight position={[-.4, .5, 1.9]} target={hlTgtR.current}
            color={hlColor} intensity={80} angle={.22} penumbra={.35} distance={35} castShadow={false} />
          <pointLight position={[0, .48, 2.2]} color={hlColor} intensity={2} distance={1.8} />
          <pointLight position={[.42, .44, -1.88]} color="#ff1100" intensity={2} distance={1.5} />
          <pointLight position={[-.42, .44, -1.88]} color="#ff1100" intensity={2} distance={1.5} />
        </>
      )}
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CÂMERA GTA5
// ═══════════════════════════════════════════════════════════════════════════════
function RaceCamera({ physicsRef, cameraAngle }) {
  const { camera } = useThree()
  const { isPresenting } = useXR()
  const sPos = useRef(new THREE.Vector3(0, 6, 36))
  const sLook = useRef(new THREE.Vector3(0, 0, 0))
  const sAhead = useRef(new THREE.Vector3())
  const orbitT = useRef(0)

  useFrame((_, dt) => {
    // em VR quem manda na câmera é o headset (via VRCameraRig, que move o
    // "player") — aqui a gente só cuidaria da câmera de desktop/mobile.
    if (isPresenting) return
    if (!physicsRef.current) return
    const p = physicsRef.current
    const pos = p.getWorldPos()
    const fwd = p.getForward()
    const perp = new THREE.Vector3(-fwd.z, 0, fwd.x)
    let tPos = new THREE.Vector3(), tLook = new THREE.Vector3(pos.x, pos.y + 0.8, pos.z)

    switch (cameraAngle) {
      case 'follow': {
        const ls = p.steer * 1.8
        tPos.set(pos.x - fwd.x * 5.5 + perp.x * ls, pos.y + 1.6, pos.z - fwd.z * 5.5 + perp.z * ls)
        const ahead = new THREE.Vector3(pos.x + fwd.x * 6, pos.y + 0.6, pos.z + fwd.z * 6)
        sAhead.current.lerp(ahead, Math.min(1, dt * 9)); tLook.copy(sAhead.current)
        break
      }
      case 'cockpit':
        tPos.set(pos.x + fwd.x * .3, pos.y + 0.65, pos.z + fwd.z * .3)
        tLook.set(pos.x + fwd.x * 9, pos.y + 0.6, pos.z + fwd.z * 9); break
      case 'side':
        tPos.set(pos.x + perp.x * 11, pos.y + 2.8, pos.z + perp.z * 11); break
      case 'top':
        tPos.set(pos.x, pos.y + 22, pos.z + 4); tLook.set(pos.x, pos.y, pos.z); break
      case 'cinematic': {
        orbitT.current += dt * 0.25
        tPos.set(
          pos.x + Math.sin(orbitT.current) * 12,
          pos.y + 5.5,
          pos.z + Math.cos(orbitT.current) * 12,
        )
        tLook.set(pos.x, pos.y + 0.5, pos.z); break
      }
    }
    sPos.current.lerp(tPos, cameraAngle === 'follow' ? .10 : .07)
    sLook.current.lerp(tLook, cameraAngle === 'cockpit' ? .25 : .12)
    camera.position.copy(sPos.current)
    camera.lookAt(sLook.current)
    camera.fov = cameraAngle === 'cockpit' ? 72 : cameraAngle === 'top' ? 52 : 56
    camera.updateProjectionMatrix()
  })
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTROLES — teclado completo
// ═══════════════════════════════════════════════════════════════════════════════
function GameController({ gameState, physicsRef, trackRef, onSpeedChange, onCarPosChange,
  onLapComplete, onToggleHeadlights, onCycleCamera, onToggleMap, onDebugToggle, onToggleColliders, keysRef }) {
  const keys = keysRef

  useEffect(() => {
    const dn = e => {
      switch (e.code) {
        case 'ArrowUp': case 'KeyW': keys.current.up = true; break
        case 'ArrowDown': case 'KeyS': keys.current.down = true; break
        case 'ArrowLeft': case 'KeyA': keys.current.left = true; break
        case 'ArrowRight': case 'KeyD': keys.current.right = true; break
        case 'ShiftLeft': case 'ShiftRight': keys.current.turbo = true; break
        case 'Space': keys.current.handbrake = true; e.preventDefault(); break
        case 'KeyH': onToggleHeadlights?.(); break
        case 'KeyC': onCycleCamera?.(); break
        case 'KeyM': onToggleMap?.(); break
        case 'KeyP': onDebugToggle?.(); break
        case 'KeyO': onToggleColliders?.(); break
        case 'KeyR': physicsRef.current?.reset(); break
      }
    }
    const up = e => {
      switch (e.code) {
        case 'ArrowUp': case 'KeyW': keys.current.up = false; break
        case 'ArrowDown': case 'KeyS': keys.current.down = false; break
        case 'ArrowLeft': case 'KeyA': keys.current.left = false; break
        case 'ArrowRight': case 'KeyD': keys.current.right = false; break
        case 'ShiftLeft': case 'ShiftRight': keys.current.turbo = false; break
        case 'Space': keys.current.handbrake = false; break
      }
    }
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, []) // eslint-disable-line

  usePhysicsWorld((fixedDt) => {
    const p = physicsRef.current
    const collisionMap = trackRef.current?.collisionMap
    const r = p.step(fixedDt, keys.current, collisionMap)
    onSpeedChange(p.getKmh())
    onCarPosChange({ x: p.x, y: p.y, z: p.z, angle: p.angle, progress: p.progress })
    if (r.lapComplete) onLapComplete(r.lapTime)
  }, gameState === GAME_STATES.RACING)

  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
//  INPUT VR — controles físicos ou mãos do Quest, escrevendo no mesmo keysRef
// ═══════════════════════════════════════════════════════════════════════════════
function VRDriveInput({ keysRef }) {
  useXRDriveControls(keysRef)
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PAINEL DE COORDENADAS (debug — tecla P) para calibrar START_X/START_Z
// ═══════════════════════════════════════════════════════════════════════════════
function DebugCoords({ carPos, visible }) {
  if (!visible) return null
  return (
    <div style={{
      position: 'absolute', top: 8, left: 8, zIndex: 40, pointerEvents: 'none',
      background: 'rgba(0,0,0,.65)', color: '#8fc', fontFamily: 'monospace',
      fontSize: 12, padding: '6px 10px', borderRadius: 6, lineHeight: 1.5,
    }}>
      x: {(carPos.x || 0).toFixed(1)} &nbsp; y: {(carPos.y || 0).toFixed(1)} &nbsp; z: {(carPos.z || 0).toFixed(1)}<br />
      <span style={{ opacity: .7 }}>[P] fechar &nbsp;|&nbsp; [O] colliders</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PAINEL DE CONTROLES (HUD inferior)
// ═══════════════════════════════════════════════════════════════════════════════
function ControlsHint({ turbo, handbrake, kmh }) {
  const gearIdx = Math.min(6, Math.floor(kmh / 20))
  const gearLabel = ['N', '1ª', '2ª', '3ª', '4ª', '5ª', '6ª'][gearIdx]

  return (
    <div style={{
      position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: 6, alignItems: 'center', pointerEvents: 'none',
      fontFamily: 'Rajdhani,sans-serif',
    }}>
      <div style={{
        background: 'rgba(0,0,0,.65)', border: '1px solid rgba(255,255,255,.12)',
        borderRadius: 10, padding: '5px 12px', display: 'flex', gap: 10, alignItems: 'center'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#888', letterSpacing: 1 }}>MARCHA</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#00ccff', lineHeight: 1 }}>{gearLabel}</div>
        </div>
        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,.12)' }} />
        <div style={{ textAlign: 'center', opacity: turbo ? 1 : .4 }}>
          <div style={{ fontSize: 9, color: turbo ? '#ff6600' : '#888', letterSpacing: 1 }}>TURBO</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: turbo ? '#ff8800' : '#555' }}>⚡ SHIFT</div>
        </div>
        <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,.12)' }} />
        <div style={{ textAlign: 'center', opacity: handbrake ? 1 : .4 }}>
          <div style={{ fontSize: 9, color: handbrake ? '#ff2200' : '#888', letterSpacing: 1 }}>F.MÃO</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: handbrake ? '#ff4400' : '#555' }}>🅿 SPACE</div>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TOUCH MELHORADO
// ═══════════════════════════════════════════════════════════════════════════════
function TouchControls({ gameState }) {
  if (gameState !== GAME_STATES.RACING) return null
  const press = (k, v) => window.dispatchEvent(new KeyboardEvent(v ? 'keydown' : 'keyup', { code: k, key: k }))
  const btn = (label, code, extra = {}) => (
    <button className="touch-btn" style={extra.style}
      onPointerDown={() => press(code, true)} onPointerUp={() => press(code, false)}
      onPointerLeave={() => press(code, false)}>{label}</button>
  )
  return (
    <div className="touch-controls" style={{ gap: 6 }}>
      <div className="touch-row">{btn('▲', 'ArrowUp')}</div>
      <div className="touch-row" style={{ gap: 4 }}>
        {btn('◄', 'ArrowLeft')}
        {btn('▼', 'ArrowDown')}
        {btn('►', 'ArrowRight')}
      </div>
      <div className="touch-row" style={{ gap: 4, marginTop: 4 }}>
        {btn('⚡', 'ShiftLeft', { style: { background: 'rgba(255,100,0,.4)', fontSize: 18 } })}
        {btn('🅿', 'Space', { style: { background: 'rgba(255,30,0,.35)', fontSize: 18 } })}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MINI-MAPA EM TELA CHEIA (tecla M) — reaproveita o MiniMap3D real
// ═══════════════════════════════════════════════════════════════════════════════
function FullMiniMap({ carPos, visible, onClose }) {
  if (!visible) return null
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,.75)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50, backdropFilter: 'blur(4px)'
    }} onClick={onClose}>
      <div style={{
        background: '#0a1020', border: '2px solid rgba(0,200,100,.4)',
        borderRadius: 16, padding: 12, boxShadow: '0 0 40px rgba(0,200,100,.2)'
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          color: '#8fc', fontFamily: 'Rajdhani,sans-serif', fontSize: 13,
          letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, textAlign: 'center'
        }}>
          🗺️ ROAD HIGHWAY — <span style={{ color: '#4fc', fontSize: 11 }}>M para fechar</span>
        </div>
        <MiniMap3D carPos={carPos} size={420} bakeResolution={1024} modelScale={TRACK_SCALE} />
        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
          <button onClick={onClose} style={{
            background: 'rgba(0,200,100,.15)', border: '1px solid rgba(0,200,100,.4)',
            color: '#8fc', padding: '4px 18px', borderRadius: 6, cursor: 'pointer',
            fontFamily: 'Rajdhani,sans-serif', fontSize: 12, letterSpacing: 1
          }}>FECHAR [M]</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CENA INTERNA (dentro do Canvas)
// ═══════════════════════════════════════════════════════════════════════════════
function SceneContent({ carConfig, gameState, cameraAngle, physicsRef, trackRef,
  onSpeedChange, onCarPosChange, onLapComplete,
  onToggleHeadlights, onCycleCamera, onToggleMap, onDebugToggle,
  onToggleColliders, showColliders, keysRef,
  startX, startZ, onStartRace, onRestart, onBack, onTogglePause }) {
  return (
    <>
      <DayEnvironment physicsRef={physicsRef} />
      <RaceTrackModel onReady={(data) => { trackRef.current = data }} />
      <RaceCar carConfig={carConfig} physicsRef={physicsRef} />
      <RaceCamera physicsRef={physicsRef} cameraAngle={cameraAngle} />
      <GameController
        gameState={gameState} physicsRef={physicsRef} trackRef={trackRef}
        onSpeedChange={onSpeedChange} onCarPosChange={onCarPosChange}
        onLapComplete={onLapComplete}
        onToggleHeadlights={onToggleHeadlights}
        onCycleCamera={onCycleCamera}
        onToggleMap={onToggleMap}
        onDebugToggle={onDebugToggle}
        onToggleColliders={onToggleColliders}
        keysRef={keysRef}
      />
      <ContactShadows position={[0, .02, 0]} opacity={.35} scale={60} blur={2} far={8} />
      <CollisionDebugView collisionMap={trackRef.current?.collisionMap} visible={showColliders} />

      {/* ── Meta Quest: mãos/controles, rig de câmera e HUD 3D ── */}
      <Controllers rayMaterial={{ color: '#00ccff' }} />
      <Hands />
      <VRDriveInput keysRef={keysRef} />
      <VRCameraRig physicsRef={physicsRef} />
      <VRComfortVignette physicsRef={physicsRef} />
      {gameState === GAME_STATES.RACING && <VRDashboard physicsRef={physicsRef} />}

      {gameState === GAME_STATES.INTRO && (
        <VRMenuPanel
          startX={startX} startZ={startZ}
          title="DRIVECRAFT VR"
          subtitle="Aponte e aperte o gatilho, ou pinça com a mão"
          buttons={[{ label: 'COMEÇAR', color: '#00cc66', onPress: onStartRace }]}
        />
      )}
      {gameState === GAME_STATES.PAUSED && (
        <VRMenuPanel
          startX={startX} startZ={startZ}
          title="PAUSADO"
          buttons={[
            { label: 'CONTINUAR', color: '#00cc66', onPress: onTogglePause },
            { label: 'MENU', color: '#cc4444', onPress: onBack },
          ]}
        />
      )}
      {gameState === GAME_STATES.FINISHED && (
        <VRMenuPanel
          startX={startX} startZ={startZ}
          title="CORRIDA FINALIZADA"
          buttons={[
            { label: 'CORRER DE NOVO', color: '#00cc66', onPress: onRestart },
            { label: 'MENU', color: '#cc4444', onPress: onBack },
          ]}
        />
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function RaceScene({
  carConfig, gameState, cameraAngle,
  onSpeedChange, onCarPosChange, onLapComplete,
  onCycleCamera, onStartRace, onRestart, onBack, onTogglePause,
}) {
  const physicsRef = useRef(new CarPhysics({
    startX: START_X, startZ: START_Z,
    startRadius: START_RADIUS, lapMinDistance: LAP_MIN_DISTANCE,
  }))
  const keysRef = useRef({ up: false, down: false, left: false, right: false, turbo: false, handbrake: false })
  const trackRef = useRef(null) // { object, groundY, halfExtent, collisionMap } — preenchido por RaceTrackModel
  const [mountKey, setMountKey] = useState(0)
  const [showMap, setShowMap] = useState(false)
  const [showDebug, setShowDebug] = useState(DEBUG_COORDS)
  const [showColliders, setShowColliders] = useState(false)
  const [carPos, setCarPos] = useState({ x: START_X, y: 0, z: START_Z, angle: 0, progress: 0 })
  const [turbo, setTurbo] = useState(false)
  const [handbrake, setHandbrake] = useState(false)
  const [kmh, setKmh] = useState(0)
  const prevStateRef = useRef(gameState)

  // Re-mount ao voltar para INTRO
  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = gameState
    if (gameState === GAME_STATES.INTRO && prev !== GAME_STATES.INTRO) {
      physicsRef.current.reset(START_X, START_Z)
      onSpeedChange(0)
      onCarPosChange({ x: START_X, y: 0, z: START_Z, angle: 0, progress: 0 })
      setMountKey(k => k + 1)
    }
  }, [gameState]) // eslint-disable-line

  // Wrapper de onCarPosChange que também atualiza estado local para o mapa
  const handleCarPos = (pos) => {
    setCarPos(pos)
    onCarPosChange(pos)
    if (physicsRef.current) {
      setTurbo(physicsRef.current.turbo)
      setHandbrake(physicsRef.current.handbrake)
      setKmh(physicsRef.current.getKmh())
    }
  }

  return (
    <>
      <Canvas
        key={mountKey}
        shadows
        dpr={[1, 1.5]}
        camera={{ position: [0, 9, 42], fov: 56, near: .1, far: 3000 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace }}
        style={{ width: '100%', height: '100%' }}
      >
        <XR referenceSpace="local-floor">
          <SceneContent
            carConfig={carConfig} gameState={gameState} cameraAngle={cameraAngle}
            physicsRef={physicsRef} trackRef={trackRef}
            onSpeedChange={onSpeedChange}
            onCarPosChange={handleCarPos}
            onLapComplete={onLapComplete}
            onToggleHeadlights={() => { }}
            onCycleCamera={onCycleCamera}
            onToggleMap={() => setShowMap(m => !m)}
            onDebugToggle={() => setShowDebug(d => !d)}
            onToggleColliders={() => setShowColliders(v => !v)}
            showColliders={showColliders}
            keysRef={keysRef}
            startX={START_X} startZ={START_Z}
            onStartRace={onStartRace} onRestart={onRestart} onBack={onBack} onTogglePause={onTogglePause}
          />
        </XR>
      </Canvas>

      {/* Entrar em VR — funciona no navegador do Meta Quest (Quest Browser).
          'hand-tracking' como optional feature liga o reconhecimento de mãos
          automaticamente quando o usuário larga os controles físicos. */}
      <VRButton
        sessionInit={{ optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'] }}
        style={{
          position: 'absolute', bottom: 16, right: 16, zIndex: 30,
          padding: '10px 20px', borderRadius: 8, fontWeight: 700, fontSize: 13,
          fontFamily: 'Rajdhani,sans-serif', letterSpacing: 1, cursor: 'pointer',
          background: 'rgba(0,204,255,.15)', color: '#8fe0ff', border: '1px solid rgba(0,204,255,.5)',
        }}
      />

      {gameState === GAME_STATES.RACING && (
        <ControlsHint turbo={turbo} handbrake={handbrake} kmh={kmh} />
      )}

      <DebugCoords carPos={carPos} visible={showDebug && gameState === GAME_STATES.RACING} />

      <TouchControls gameState={gameState} />

      <FullMiniMap
        carPos={carPos}
        visible={showMap && gameState === GAME_STATES.RACING}
        onClose={() => setShowMap(false)}
      />
    </>
  )
}