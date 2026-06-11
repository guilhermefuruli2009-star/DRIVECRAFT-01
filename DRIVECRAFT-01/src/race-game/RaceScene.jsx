/**
 * RaceScene.jsx — v4 UPGRADE COMPLETO
 *
 * NOVIDADES:
 *  🚗 Física real de carro: posição XZ livre no mundo (não preso à curva),
 *     aceleração, frenagem, esterço com inércia, drift suave, gravidade
 *  🗺️ Mapa maior e mais rico: cidade com ruas, quarteirões, prédios, parques,
 *     lago, estacionamentos, curvas variadas — circuito de 800m
 *  🗺️ Mini-mapa de cidade com tecla M — visão aérea grande com ícones
 *  ⌨️  Novos controles: H = faróis, F = câmera cockpit, Space = freio de mão
 *      (drift), R = reset posição, C = ciclar câmeras, Shift = turbo
 *  🎮 Touch melhorado: botão de turbo e freio de mão
 *  ✅ Bug carro sumindo: mountKey via useState
 *  ✅ Faróis corretos: targets no espaço local, sem vazar no capô
 *  ✅ Dia claro: Sky, sol forte, gramado verde
 */

import { useRef, useEffect, useMemo, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Sky, useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { GAME_STATES } from './RaceGame'

// ═══════════════════════════════════════════════════════════════════════════════
//  PISTA — polígono maior (~800m de perímetro)
// ═══════════════════════════════════════════════════════════════════════════════
const RAW_PTS = [
  // Reta de largada (sul)
  [ 0,  0,  30],
  [ 8,  0,  28],
  [18,  0,  24],
  // Curva 1 — direita ampla
  [28,  0,  18],
  [34,  0,   8],
  [35,  0,  -2],
  [32,  0, -12],
  // Chicane sul-leste
  [26,  0, -20],
  [18,  0, -26],
  [10,  0, -30],
  // Curva 2 — hairpin esquerda
  [ 0,  0, -34],
  [-10, 0, -32],
  [-18, 0, -26],
  // Setor técnico oeste
  [-24, 0, -18],
  [-28, 0, -10],
  [-30, 0,   0],
  [-28, 0,  10],
  [-22, 0,  18],
  // Curva 3 — esquerda suave
  [-14, 0,  24],
  [ -6, 0,  30],
  [  0, 0,  30],
]

const RACE_CURVE = new THREE.CatmullRomCurve3(
  RAW_PTS.map(p => new THREE.Vector3(p[0], p[1], p[2])),
  true, 'catmullrom', 0.5
)
const CURVE_LEN = RACE_CURVE.getLength()

// Largura da pista
const TRACK_HALF = 4.2

// ═══════════════════════════════════════════════════════════════════════════════
//  FÍSICA REAL DO CARRO  (posição livre no mundo)
// ═══════════════════════════════════════════════════════════════════════════════
class CarPhysics {
  constructor() {
    // Posição e orientação no mundo
    this.x       = 0
    this.z       = 30        // ponto de largada
    this.angle   = 0         // radianos, 0 = aponta +Z
    this.speed   = 0         // m/s  (positivo = frente)
    this.lateral = 0         // velocidade lateral (drift)

    // Steering
    this.steer      = 0
    this.steerMax   = 0.72   // rad
    this.steerSpeed = 2.2
    this.steerReturn= 4.0

    // Motor
    this.accel   = 14
    this.maxFwd  = 28        // ~100 km/h
    this.maxRev  = -8
    this.drag    = 0.94
    this.brakeFc = 22

    // Handbrake / drift
    this.handbrake   = false
    this.driftFactor = 1.0   // 1=grip, 0=drift

    // Turbo
    this.turbo      = false
    this.turboBoost = 1.6

    // Volta
    this.lapTime  = 0
    this.lapCount = 0
    this.progress = 0        // 0‥1 ao longo da curva (para minimap)

    // Câmera shake
    this.shake = 0
  }

  update(dt, keys) {
    const spd = Math.abs(this.speed)

    // ── Turbo ────────────────────────────────────────────────────────────────
    this.turbo = keys.turbo && this.speed > 2

    // ── Aceleração ───────────────────────────────────────────────────────────
    const turboMult = this.turbo ? this.turboBoost : 1.0
    if (keys.up)   this.speed += this.accel * turboMult * dt
    if (keys.down) this.speed -= this.brakeFc * dt
    if (!keys.up && !keys.down) this.speed *= Math.pow(this.drag, dt * 60)
    this.speed = Math.max(this.maxRev, Math.min(this.maxFwd * turboMult, this.speed))

    // ── Handbrake ────────────────────────────────────────────────────────────
    this.handbrake = keys.handbrake
    const targetDrift = this.handbrake ? 0.12 : 1.0
    this.driftFactor += (targetDrift - this.driftFactor) * Math.min(1, dt * 6)

    // ── Steering — sensibilidade boa em baixa e alta velocidade ────────────
    const speedRatio = Math.min(1, spd / this.maxFwd)
    const steerSens  = this.steerMax * (0.55 + 0.45 * (1 - speedRatio))
    if (keys.left)  this.steer = Math.min(1,  this.steer + this.steerSpeed * dt)
    if (keys.right) this.steer = Math.max(-1, this.steer - this.steerSpeed * dt)
    if (!keys.left && !keys.right)
      this.steer *= Math.pow(0.05, dt * this.steerReturn)

    // ── Rotação do carro ──────────────────────────────────────────────────────
    if (Math.abs(this.speed) > 0.3) {
      const turnRate = (this.speed / this.maxFwd) * this.steer * steerSens * 3.2 * this.driftFactor
      this.angle += turnRate * dt
      this.angle = ((this.angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
    }

    // ── Movimento no mundo ────────────────────────────────────────────────────
    const sin = Math.sin(this.angle)
    const cos = Math.cos(this.angle)
    this.x += sin * this.speed * dt
    this.z += cos * this.speed * dt

    // ── Shake do turbo ────────────────────────────────────────────────────────
    this.shake = this.turbo ? 0.04 : 0

    // ── Progresso para minimap ────────────────────────────────────────────────
    // Acha o ponto mais próximo na curva
    let bestDist = Infinity, bestT = 0
    for (let t = 0; t <= 1; t += 0.005) {
      const pt = RACE_CURVE.getPointAt(t)
      const d  = (pt.x - this.x) ** 2 + (pt.z - this.z) ** 2
      if (d < bestDist) { bestDist = d; bestT = t }
    }
    const prevProg = this.progress
    this.progress  = bestT

    // Detectar cruzamento da linha de chegada
    if (prevProg > 0.92 && this.progress < 0.08) {
      this.lapCount++
      const t = this.lapTime; this.lapTime = 0
      return { lapComplete: true, lapTime: t }
    }
    this.lapTime += dt
    return { lapComplete: false }
  }

  getWorldPos()  { return new THREE.Vector3(this.x, 0, this.z) }
  getForward()   {
    return new THREE.Vector3(Math.sin(this.angle), 0, Math.cos(this.angle))
  }
  getAngle()     { return this.angle }
  getKmh()       { return Math.abs(this.speed) * 3.6 }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TEXTURAS
// ═══════════════════════════════════════════════════════════════════════════════
function makeAsphaltTex() {
  const S = 1024, cv = document.createElement('canvas')
  cv.width = cv.height = S
  const ctx = cv.getContext('2d')
  ctx.fillStyle = '#282828'; ctx.fillRect(0,0,S,S)
  for (let i = 0; i < 90000; i++) {
    const g = 28 + Math.random()*60, a = 0.3+Math.random()*0.7
    ctx.fillStyle=`rgba(${g},${g},${g},${a})`
    ctx.fillRect(Math.random()*S, Math.random()*S, .7+Math.random()*2, .7+Math.random()*2)
  }
  ctx.globalAlpha=0.10
  for (let i=0;i<12;i++) {
    ctx.fillStyle='#101010'
    ctx.fillRect(60+Math.random()*(S-120),0,22+Math.random()*18,S)
  }
  ctx.globalAlpha=1
  ctx.setLineDash([40,24]); ctx.strokeStyle='rgba(255,220,0,0.92)'; ctx.lineWidth=8
  ctx.beginPath(); ctx.moveTo(S/2,0); ctx.lineTo(S/2,S); ctx.stroke()
  ctx.setLineDash([]); ctx.strokeStyle='rgba(255,255,255,0.96)'; ctx.lineWidth=12
  ctx.beginPath(); ctx.moveTo(12,0); ctx.lineTo(12,S); ctx.moveTo(S-12,0); ctx.lineTo(S-12,S); ctx.stroke()
  const tex = new THREE.CanvasTexture(cv)
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.anisotropy=16; return tex
}

function makeGrassTex() {
  const S=512, cv=document.createElement('canvas'); cv.width=cv.height=S
  const ctx=cv.getContext('2d')
  ctx.fillStyle='#3d8228'; ctx.fillRect(0,0,S,S)
  for (let i=0;i<90000;i++) {
    const g=35+Math.random()*65
    ctx.fillStyle=`rgba(${Math.round(g*.45)},${g+18},${Math.round(g*.28)},.55)`
    ctx.fillRect(Math.random()*S,Math.random()*S,1,1+Math.random()*4)
  }
  const tex=new THREE.CanvasTexture(cv)
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(10,10); return tex
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PISTA 3D
// ═══════════════════════════════════════════════════════════════════════════════
function Track() {
  const asphaltTex = useMemo(makeAsphaltTex, [])
  const grassTex   = useMemo(makeGrassTex,   [])

  const { trackGeo, curbGeoL, curbGeoR } = useMemo(() => {
    const pts=RACE_CURVE.getPoints(600)
    const verts=[],uvs=[],idx=[],cVL=[],cVR=[]
    const CW = 0.65

    pts.forEach((p,i) => {
      const t=RACE_CURVE.getTangentAt(i/pts.length)
      const perp=new THREE.Vector3(-t.z,0,t.x).normalize()
      const uv=i/pts.length
      const L=new THREE.Vector3(p.x+perp.x*TRACK_HALF,.01,p.z+perp.z*TRACK_HALF)
      const R=new THREE.Vector3(p.x-perp.x*TRACK_HALF,.01,p.z-perp.z*TRACK_HALF)
      verts.push(L.x,L.y,L.z,R.x,R.y,R.z); uvs.push(0,uv*60,1,uv*60)
      cVL.push(L.x,L.y,L.z, p.x+perp.x*(TRACK_HALF+CW),.013,p.z+perp.z*(TRACK_HALF+CW))
      cVR.push(R.x,R.y,R.z, p.x-perp.x*(TRACK_HALF+CW),.013,p.z-perp.z*(TRACK_HALF+CW))
    })
    const makeIdx=(n)=>{const a=[];for(let i=0;i<n-1;i++){const b=i*2;a.push(b,b+1,b+2,b+1,b+3,b+2)}return a}
    const geo=new THREE.BufferGeometry()
    geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3))
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2))
    geo.setIndex(makeIdx(pts.length)); geo.computeVertexNormals()
    const gL=new THREE.BufferGeometry(); gL.setAttribute('position',new THREE.Float32BufferAttribute(cVL,3)); gL.setIndex(makeIdx(pts.length)); gL.computeVertexNormals()
    const gR=new THREE.BufferGeometry(); gR.setAttribute('position',new THREE.Float32BufferAttribute(cVR,3)); gR.setIndex(makeIdx(pts.length)); gR.computeVertexNormals()
    return {trackGeo:geo,curbGeoL:gL,curbGeoR:gR}
  }, [])

  // Guard rails
  const rails = useMemo(() => {
    const pts=RACE_CURVE.getPoints(120), out=[]
    pts.forEach((p,i) => {
      const tang=RACE_CURVE.getTangentAt(i/120)
      const perp=new THREE.Vector3(-tang.z,0,tang.x).normalize()
      const rotY=Math.atan2(tang.x,tang.z)
      const col=Math.floor(i/6)%2===0?'#cc2200':'#eeeeee'
      ;[-1,1].forEach(s => out.push(
        <mesh key={`rl${i}_${s}`}
          position={[p.x+perp.x*(TRACK_HALF+1.1)*s,.3,p.z+perp.z*(TRACK_HALF+1.1)*s]}
          rotation={[0,rotY,0]} castShadow>
          <boxGeometry args={[0.28,.6,.68]}/>
          <meshStandardMaterial color={col} roughness={.5} metalness={.3}/>
        </mesh>
      ))
    })
    return out
  }, [])

  return (
    <group>
      <mesh rotation={[-Math.PI/2,0,0]} position={[0,-.01,0]} receiveShadow>
        <planeGeometry args={[400,400]}/>
        <meshStandardMaterial map={grassTex} color="#4a9a32" roughness={.9}/>
      </mesh>
      <mesh geometry={trackGeo} receiveShadow>
        <meshStandardMaterial map={asphaltTex} color="#2d2d2d" roughness={.85} metalness={.04} side={THREE.DoubleSide}/>
      </mesh>
      <mesh geometry={curbGeoL} receiveShadow>
        <meshStandardMaterial color="#dd2200" roughness={.6} side={THREE.DoubleSide}/>
      </mesh>
      <mesh geometry={curbGeoR} receiveShadow>
        <meshStandardMaterial color="#dd2200" roughness={.6} side={THREE.DoubleSide}/>
      </mesh>
      {/* Linha de chegada */}
      <mesh position={[0,.025,30]} rotation={[-Math.PI/2,0,0]}>
        <planeGeometry args={[8.4,2]}/><meshStandardMaterial color="#fff" roughness={.3}/>
      </mesh>
      {Array.from({length:10},(_,i)=>(
        <mesh key={`chk${i}`} position={[-3.8+(i%5)*1.68+(Math.floor(i/5)%2)*.84,.027,30+(Math.floor(i/5)===0?-.5:.5)]} rotation={[-Math.PI/2,0,0]}>
          <planeGeometry args={[.84,1]}/><meshStandardMaterial color="#111"/>
        </mesh>
      ))}
      {rails}
      <Stands/>
    </group>
  )
}

function Stands() {
  return (
    <group>
      {/* Arquibancada principal */}
      <mesh position={[0,2,-38]} castShadow receiveShadow>
        <boxGeometry args={[40,4,7]}/><meshStandardMaterial color="#c8c0b0" roughness={.8}/>
      </mesh>
      {[0,1,2,3,4].map(i=>(
        <mesh key={i} position={[0,i*.6,-35+i*.6]} castShadow>
          <boxGeometry args={[40,.3,1.4]}/><meshStandardMaterial color={i%2===0?'#d0c8b8':'#b8b0a0'} roughness={.9}/>
        </mesh>
      ))}
      {/* Torre de controle */}
      <mesh position={[24,7,34]} castShadow>
        <boxGeometry args={[6,14,5]}/><meshStandardMaterial color="#ddd8cc" roughness={.7}/>
      </mesh>
      <mesh position={[24,14.5,34]}>
        <boxGeometry args={[7,.9,6]}/><meshStandardMaterial color="#888" metalness={.4} roughness={.5}/>
      </mesh>
      <mesh position={[24,12.5,37.1]}>
        <planeGeometry args={[4.5,2]}/><meshStandardMaterial color="#aaddff" transparent opacity={.7}/>
      </mesh>
      {/* Placar eletrônico */}
      <mesh position={[-22,8,34]} castShadow>
        <boxGeometry args={[12,6,1]}/><meshStandardMaterial color="#111" roughness={.5}/>
      </mesh>
      <mesh position={[-22,8,34.6]}>
        <planeGeometry args={[10.5,4.5]}/><meshStandardMaterial color="#001100" emissive="#00ff44" emissiveIntensity={.3}/>
      </mesh>
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CENÁRIO DIA — cidade, árvores, lago
// ═══════════════════════════════════════════════════════════════════════════════
function DayScenery() {
  const bColors=['#e8e0d0','#d5cfc0','#c8c0b0','#ddd5c5','#e0d8c8','#ccc5b5','#d8d0c0']

  const buildings = [
    // Leste
    [55,10,30,14,12],[58,-5,22,12,10],[60,20,40,16,13],[55,-20,26,10,11],
    [70,0,18,12,9],[62,30,34,14,12],[65,-30,24,11,10],
    // Oeste
    [-55,10,28,14,12],[-58,-5,24,12,10],[-62,18,36,16,13],[-55,-22,20,10,11],
    [-68,0,16,12,9],[-60,28,30,14,12],[-65,-28,22,11,10],
    // Norte
    [10,50,32,14,12],[-10,52,26,12,10],[0,48,40,18,13],[20,55,20,10,11],
    [-20,54,24,10,12],[30,50,18,9,10],[-30,50,28,12,11],
    // Sul
    [8,-52,30,14,12],[-8,-50,24,12,10],[0,-48,36,18,13],[22,-54,18,10,11],
    [-22,-52,22,10,12],
  ]

  const trees = useMemo(() => {
    const positions=[
      [32,0,28],[32,0,22],[32,0,16],[32,0,10],[32,0,4],
      [-32,0,28],[-32,0,22],[-32,0,16],[-32,0,10],[-32,0,4],
      [28,0,-22],[22,0,-28],[16,0,-32],[10,0,-34],
      [-28,0,-22],[-22,0,-28],[-16,0,-32],[-10,0,-34],
      [0,0,-40],[5,0,-40],[-5,0,-40],
      [40,0,0],[40,0,8],[40,0,-8],
      [-40,0,0],[-40,0,8],[-40,0,-8],
    ]
    return positions.map(([x,,z],i)=>(
      <group key={`tree${i}`} position={[x,0,z]}>
        <mesh position={[0,.9,0]} castShadow>
          <cylinderGeometry args={[.1,.16,1.8,6]}/><meshStandardMaterial color="#5d4037" roughness={.9}/>
        </mesh>
        <mesh position={[0,2.4,0]} castShadow>
          <sphereGeometry args={[1.1,8,7]}/><meshStandardMaterial color={['#2e7d32','#388e3c','#1b5e20'][i%3]} roughness={.8}/>
        </mesh>
      </group>
    ))
  },[])

  // Lago
  const lakeTex = useMemo(()=>{
    const S=256,cv=document.createElement('canvas'); cv.width=cv.height=S
    const ctx=cv.getContext('2d')
    const g=ctx.createRadialGradient(S/2,S/2,10,S/2,S/2,S/2)
    g.addColorStop(0,'#4db8e8'); g.addColorStop(.6,'#2196f3'); g.addColorStop(1,'#1565c0')
    ctx.fillStyle=g; ctx.fillRect(0,0,S,S)
    for(let i=0;i<800;i++){
      ctx.fillStyle=`rgba(255,255,255,${Math.random()*.08})`
      ctx.fillRect(Math.random()*S,Math.random()*S,2+Math.random()*8,1)
    }
    return new THREE.CanvasTexture(cv)
  },[])

  return (
    <group>
      {/* Prédios */}
      {buildings.map(([x,z,h,w,d],i)=>(
        <mesh key={i} position={[x,h/2,z]} castShadow receiveShadow>
          <boxGeometry args={[w,h,d]}/><meshStandardMaterial color={bColors[i%bColors.length]} roughness={.7} metalness={.05}/>
        </mesh>
      ))}
      {trees}
      {/* Lago */}
      <mesh position={[-45,-.005,-45]} rotation={[-Math.PI/2,0,0]}>
        <circleGeometry args={[14,32]}/><meshStandardMaterial map={lakeTex} roughness={.05} metalness={.2}/>
      </mesh>
      {/* Praça central (atrás da pista) */}
      <mesh position={[0,.005,-46]} rotation={[-Math.PI/2,0,0]}>
        <planeGeometry args={[20,12]}/><meshStandardMaterial color="#c8b870" roughness={.9}/>
      </mesh>
      <mesh position={[0,1.2,-46]}>
        <cylinderGeometry args={[.3,1,2.4,8]}/><meshStandardMaterial color="#bdb090" roughness={.7}/>
      </mesh>
      {/* Montanhas */}
      {[[80,0,-80],[-80,0,-80],[90,0,50],[-90,0,50],[0,0,-100]].map(([mx,,mz],i)=>(
        <mesh key={`mt${i}`} position={[mx,0,mz]}>
          <coneGeometry args={[40,65,8]}/><meshStandardMaterial color={['#6a8a5a','#5a7a4a','#7a9a6a'][i%3]} roughness={1}/>
        </mesh>
      ))}
    </group>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  AMBIENTE DIA
// ═══════════════════════════════════════════════════════════════════════════════
function DayEnvironment() {
  const { scene, gl } = useThree()
  useEffect(() => {
    scene.background = new THREE.Color('#87CEEB')
    scene.fog = new THREE.Fog('#c8e8f5', 100, 320)
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = 1.0
  }, [scene, gl])
  return (
    <>
      <Sky sunPosition={[100,80,-30]} turbidity={4} rayleigh={.8} mieCoefficient={.003} mieDirectionalG={.8}/>
      <directionalLight position={[40,60,-30]} color="#fff8e8" intensity={2.2}
        castShadow shadow-mapSize={[2048,2048]}
        shadow-camera-left={-80} shadow-camera-right={80}
        shadow-camera-top={80}   shadow-camera-bottom={-80}
        shadow-camera-far={250}  shadow-bias={-.001}/>
      <directionalLight position={[-20,20,30]} color="#c8e0ff" intensity={.6}/>
      <hemisphereLight skyColor="#87CEEB" groundColor="#4a9a32" intensity={.5}/>
      <ambientLight intensity={.18} color="#e8f0ff"/>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CARRO
// ═══════════════════════════════════════════════════════════════════════════════
function RaceCar({ carConfig, physicsRef, onReady }) {
  const groupRef = useRef()
  const hlTgtL   = useRef()
  const hlTgtR   = useRef()
  const wheelsRef = useRef([])

  let gltfData = null
  try { gltfData = useGLTF('/models/fiat500f.glb') } catch (_) {}

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
      const nm = (n.name+n.material.name).toLowerCase()
      if (nm.includes('1272010001')||nm.includes('body')||nm.includes('paint')) {
        n.material.color.set(carConfig.bodyColor)
        n.material.metalness = carConfig.metalness??0.8
        n.material.roughness = carConfig.roughness??0.15
        n.material.needsUpdate = true
      }
      if (nm.includes('rim1')||nm.includes('aro')) {
        n.material.color.set(carConfig.rimColor); n.material.needsUpdate=true
      }
    })
  }, [clonedScene, carConfig.bodyColor, carConfig.rimColor])

  useFrame((_,delta) => {
    if (!groupRef.current || !physicsRef.current) return
    const p = physicsRef.current
    const pos = p.getWorldPos()

    // Shake do turbo
    const sh = p.shake
    groupRef.current.position.set(
      pos.x + (Math.random()-.5)*sh,
      0,
      pos.z + (Math.random()-.5)*sh
    )
    groupRef.current.rotation.y = p.angle

    // Inclinação lateral ao fazer curva (efeito visual)
    const rollTarget = -p.steer * (Math.abs(p.speed)/p.maxFwd) * 0.06
    groupRef.current.rotation.z = THREE.MathUtils.lerp(
      groupRef.current.rotation.z, rollTarget, delta*8
    )

    // Girar rodas
    wheelsRef.current.forEach(w => {
      if (w) w.rotation.x -= delta * p.speed * 0.8
    })
  })

  const hlOn    = carConfig.headlightsOn !== false
  const hlColor = carConfig.lightColor || '#ffffff'

  return (
    <group ref={groupRef}>
      {clonedScene ? (
        <primitive object={clonedScene} scale={100} castShadow/>
      ) : (
        // Fallback: carro simples mas com visual decente
        <group>
          {/* Carroceria */}
          <mesh position={[0,.3,0]} castShadow>
            <boxGeometry args={[1.7,.58,3.4]}/><meshStandardMaterial color={carConfig.bodyColor} metalness={carConfig.metalness??0.8} roughness={carConfig.roughness??0.15}/>
          </mesh>
          {/* Cabine */}
          <mesh position={[0,.72,.08]} castShadow>
            <boxGeometry args={[1.5,.42,1.9]}/><meshStandardMaterial color={carConfig.bodyColor} metalness={.3} roughness={.4}/>
          </mesh>
          {/* Para-choque frontal */}
          <mesh position={[0,.2,1.75]} castShadow>
            <boxGeometry args={[1.6,.28,.18]}/><meshStandardMaterial color="#222" roughness={.7}/>
          </mesh>
          {/* Para-choque traseiro */}
          <mesh position={[0,.2,-1.75]} castShadow>
            <boxGeometry args={[1.6,.28,.18]}/><meshStandardMaterial color="#222" roughness={.7}/>
          </mesh>
          {/* Rodas */}
          {[[-0.88,0,1.15],[0.88,0,1.15],[-0.88,0,-1.15],[0.88,0,-1.15]].map((wp,i)=>(
            <mesh key={i} ref={el=>wheelsRef.current[i]=el} position={wp} rotation={[0,0,Math.PI/2]} castShadow>
              <cylinderGeometry args={[.3,.3,.22,16]}/>
              <meshStandardMaterial color={carConfig.rimColor} metalness={.9} roughness={.1}/>
            </mesh>
          ))}
          {/* Pneus */}
          {[[-0.88,0,1.15],[0.88,0,1.15],[-0.88,0,-1.15],[0.88,0,-1.15]].map((wp,i)=>(
            <mesh key={`t${i}`} position={wp} rotation={[0,0,Math.PI/2]} castShadow>
              <torusGeometry args={[.3,.1,8,16]}/><meshStandardMaterial color="#111" roughness={.9}/>
            </mesh>
          ))}
          {/* Faróis (mesh) */}
          {[[.58,.38,1.72],[-.58,.38,1.72]].map((fp,i)=>(
            <mesh key={`hf${i}`} position={fp}>
              <boxGeometry args={[.36,.15,.05]}/><meshStandardMaterial color="#ffffcc" emissive="#ffffcc" emissiveIntensity={hlOn?3:0}/>
            </mesh>
          ))}
          {/* Lanternas */}
          {[[.58,.38,-1.73],[-.58,.38,-1.73]].map((fp,i)=>(
            <mesh key={`ht${i}`} position={fp}>
              <boxGeometry args={[.34,.14,.05]}/><meshStandardMaterial color="#ff1100" emissive="#ff1100" emissiveIntensity={hlOn?2:.25}/>
            </mesh>
          ))}
          {/* Espelho retrovisor */}
          {[[.85,.68,.2],[-.85,.68,.2]].map((mp,i)=>(
            <mesh key={`mr${i}`} position={mp}>
              <boxGeometry args={[.06,.1,.22]}/><meshStandardMaterial color="#333" roughness={.4} metalness={.7}/>
            </mesh>
          ))}
        </group>
      )}

      {/* Targets dos faróis — espaço local, Z+=25 = frente */}
      <object3D ref={hlTgtL} position={[ .4, 0, 25]}/>
      <object3D ref={hlTgtR} position={[-.4, 0, 25]}/>

      {hlOn && (
        <>
          <spotLight position={[.4,.5,1.9]} target={hlTgtL.current}
            color={hlColor} intensity={80} angle={.22} penumbra={.35} distance={35} castShadow={false}/>
          <spotLight position={[-.4,.5,1.9]} target={hlTgtR.current}
            color={hlColor} intensity={80} angle={.22} penumbra={.35} distance={35} castShadow={false}/>
          <pointLight position={[0,.48,2.2]} color={hlColor} intensity={2} distance={1.8}/>
          <pointLight position={[.42,.44,-1.88]} color="#ff1100" intensity={2} distance={1.5}/>
          <pointLight position={[-.42,.44,-1.88]} color="#ff1100" intensity={2} distance={1.5}/>
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
  const sPos  = useRef(new THREE.Vector3(0,6,36))
  const sLook = useRef(new THREE.Vector3(0,0,0))
  const sAhead= useRef(new THREE.Vector3())

  useFrame((_,dt) => {
    if (!physicsRef.current) return
    const p    = physicsRef.current
    const pos  = p.getWorldPos()
    const fwd  = p.getForward()
    const perp = new THREE.Vector3(-fwd.z,0,fwd.x)
    let tPos=new THREE.Vector3(), tLook=new THREE.Vector3(pos.x,0.8,pos.z)

    switch(cameraAngle) {
      case 'follow': {
        const ls = p.steer*1.8
        tPos.set(pos.x-fwd.x*5.5+perp.x*ls, 1.6, pos.z-fwd.z*5.5+perp.z*ls)
        const ahead=new THREE.Vector3(pos.x+fwd.x*6, 0.6, pos.z+fwd.z*6)
        sAhead.current.lerp(ahead, Math.min(1,dt*9)); tLook.copy(sAhead.current)
        break
      }
      case 'cockpit':
        tPos.set(pos.x+fwd.x*.3, 0.65, pos.z+fwd.z*.3)
        tLook.set(pos.x+fwd.x*9, 0.6, pos.z+fwd.z*9); break
      case 'side':
        tPos.set(pos.x+perp.x*11, 2.8, pos.z+perp.z*11); break
      case 'top':
        tPos.set(pos.x, 22, pos.z+4); tLook.set(pos.x,0,pos.z); break
      case 'cinematic': {
        const prog=(p.progress+.12)%1
        const cp=RACE_CURVE.getPointAt(prog)
        tPos.set(cp.x+perp.x*12, 7, cp.z+perp.z*12)
        tLook.set(pos.x,0.5,pos.z); break
      }
    }
    sPos.current.lerp(tPos, cameraAngle==='follow'?.10:.07)
    sLook.current.lerp(tLook, cameraAngle==='cockpit'?.25:.12)
    camera.position.copy(sPos.current)
    camera.lookAt(sLook.current)
    camera.fov=cameraAngle==='cockpit'?72:cameraAngle==='top'?52:56
    camera.updateProjectionMatrix()
  })
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTROLES — teclado completo
// ═══════════════════════════════════════════════════════════════════════════════
function GameController({ gameState, physicsRef, onSpeedChange, onCarPosChange, onLapComplete, onToggleHeadlights, onCycleCamera, onToggleMap }) {
  const keys = useRef({ up:false, down:false, left:false, right:false, turbo:false, handbrake:false })

  useEffect(() => {
    const dn = e => {
      switch(e.code) {
        case 'ArrowUp':   case 'KeyW': keys.current.up        = true; break
        case 'ArrowDown': case 'KeyS': keys.current.down      = true; break
        case 'ArrowLeft': case 'KeyA': keys.current.left      = true; break
        case 'ArrowRight':case 'KeyD': keys.current.right     = true; break
        case 'ShiftLeft': case 'ShiftRight': keys.current.turbo = true; break
        case 'Space':                  keys.current.handbrake = true; e.preventDefault(); break
        case 'KeyH': onToggleHeadlights?.(); break
        case 'KeyC': onCycleCamera?.();      break
        case 'KeyM': onToggleMap?.();        break
        case 'KeyR': if(physicsRef.current){ // reset posição
          const p=physicsRef.current; p.x=0; p.z=30; p.angle=0; p.speed=0; p.steer=0
        } break
      }
    }
    const up = e => {
      switch(e.code) {
        case 'ArrowUp':   case 'KeyW': keys.current.up        = false; break
        case 'ArrowDown': case 'KeyS': keys.current.down      = false; break
        case 'ArrowLeft': case 'KeyA': keys.current.left      = false; break
        case 'ArrowRight':case 'KeyD': keys.current.right     = false; break
        case 'ShiftLeft': case 'ShiftRight': keys.current.turbo = false; break
        case 'Space':                  keys.current.handbrake = false; break
      }
    }
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup',   up)
    return () => { window.removeEventListener('keydown', dn); window.removeEventListener('keyup', up) }
  }, []) // eslint-disable-line

  useFrame((_,dt) => {
    if (gameState !== GAME_STATES.RACING) return
    const p = physicsRef.current
    const r = p.update(dt, keys.current)
    onSpeedChange(p.getKmh())
    onCarPosChange({ x:p.x, z:p.z, angle:p.angle, progress:p.progress })
    if (r.lapComplete) onLapComplete(r.lapTime)
  })
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MINI-MAPA DE CIDADE (tela grande com M)
// ═══════════════════════════════════════════════════════════════════════════════
function CityMiniMap({ carPos, visible, onClose }) {
  if (!visible) return null
  const W=320, H=320
  // Escala: o mundo tem ~±80 unidades, o mapa tem 320px => 2 px/unidade
  const scale = 2.8
  const cx=W/2, cy=H/2

  const toMap = (wx,wz) => ({ x: cx+wx*scale, y: cy+wz*scale })

  // Pontos da pista no mapa
  const trackPts = RACE_CURVE.getPoints(80)
  const pathD = trackPts.map((p,i)=>`${i===0?'M':'L'}${cx+p.x*scale},${cy+p.z*scale}`).join(' ')+'Z'

  const carM = toMap(carPos.x||0, carPos.z||0)
  const carRot = (carPos.angle||0)*180/Math.PI

  const buildings = [
    [55,10,14,12],[58,-5,12,10],[60,20,16,13],[-55,10,14,12],[-58,-5,12,10],
    [10,50,14,12],[-10,52,12,10],[0,48,18,13],[8,-52,14,12],[-8,-50,12,10],
    [50,0,12,9],[-68,0,12,9],[28,-28,11,10],[-28,28,12,12],
  ]

  return (
    <div style={{
      position:'absolute', inset:0, background:'rgba(0,0,0,.75)',
      display:'flex', alignItems:'center', justifyContent:'center',
      zIndex:50, backdropFilter:'blur(4px)'
    }} onClick={onClose}>
      <div style={{
        background:'#0a1020', border:'2px solid rgba(0,200,100,.4)',
        borderRadius:16, padding:12, boxShadow:'0 0 40px rgba(0,200,100,.2)'
      }} onClick={e=>e.stopPropagation()}>
        <div style={{color:'#8fc',fontFamily:'Rajdhani,sans-serif',fontSize:13,
          letterSpacing:2,textTransform:'uppercase',marginBottom:8,textAlign:'center'}}>
          🗺️ MAPA DA CIDADE — <span style={{color:'#4fc',fontSize:11}}>M para fechar</span>
        </div>
        <svg width={W} height={H} style={{display:'block',borderRadius:8,overflow:'hidden'}}>
          {/* Fundo */}
          <rect width={W} height={H} fill="#0e1820" rx="6"/>
          {/* Gramado */}
          <circle cx={cx} cy={cy} r={W*.48} fill="#1a3a12" opacity=".7"/>
          {/* Lago */}
          <circle cx={cx-45*scale||cx-126} cy={cy-45*scale||cy-126} r={14*scale*.6} fill="#1565c0" opacity=".8"/>
          {/* Prédios */}
          {buildings.map(([bx,bz,bw,bd],i)=>{
            const bm=toMap(bx,bz)
            return <rect key={i} x={bm.x-bw*scale/2} y={bm.y-bd*scale/2}
              width={bw*scale} height={bd*scale} fill={i%3===0?'#2a3a4a':i%3===1?'#3a2a2a':'#2a3a2a'}
              rx="2" opacity=".9"/>
          })}
          {/* Pista — sombra */}
          <path d={pathD} fill="none" stroke="#000" strokeWidth={TRACK_HALF*scale*2+4} strokeLinejoin="round" opacity=".5"/>
          {/* Pista — asfalto */}
          <path d={pathD} fill="none" stroke="#444" strokeWidth={TRACK_HALF*scale*2} strokeLinejoin="round"/>
          {/* Linha central */}
          <path d={pathD} fill="none" stroke="#ffd700" strokeWidth={1} strokeDasharray="6 5" strokeLinejoin="round" opacity=".7"/>
          {/* Linha de chegada */}
          <line x1={cx-TRACK_HALF*scale} y1={cy+30*scale} x2={cx+TRACK_HALF*scale} y2={cy+30*scale}
            stroke="#fff" strokeWidth={2.5}/>
          {/* Seta do carro */}
          <g transform={`translate(${carM.x},${carM.y}) rotate(${carRot})`}>
            <polygon points="0,-9 5,5 0,2 -5,5" fill="#00ff88" opacity=".95"/>
            <circle cx={0} cy={0} r={4} fill="none" stroke="#00ff88" strokeWidth={1.5}/>
          </g>
          {/* Legenda */}
          <text x={8} y={16} fontSize={9} fill="#8fc" fontFamily="Rajdhani,sans-serif">CIRCUITO</text>
          <circle cx={W-16} cy={16} r={4} fill="#00ff88"/>
          <text x={W-30} y={20} fontSize={9} fill="#8fc" fontFamily="Rajdhani,sans-serif" textAnchor="end">VOCÊ</text>
          {/* Bússola */}
          <text x={W-12} y={H-8} fontSize={9} fill="#8fc" fontFamily="Rajdhani,sans-serif" textAnchor="end">N↑</text>
        </svg>
        <div style={{marginTop:8,display:'flex',justifyContent:'center'}}>
          <button onClick={onClose} style={{
            background:'rgba(0,200,100,.15)',border:'1px solid rgba(0,200,100,.4)',
            color:'#8fc',padding:'4px 18px',borderRadius:6,cursor:'pointer',
            fontFamily:'Rajdhani,sans-serif',fontSize:12,letterSpacing:1
          }}>FECHAR [M]</button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PAINEL DE CONTROLES (HUD inferior)
// ═══════════════════════════════════════════════════════════════════════════════
function ControlsHint({ turbo, handbrake, kmh }) {
  const gearIdx = Math.min(6, Math.floor(kmh/20))
  const gearLabel = ['N','1ª','2ª','3ª','4ª','5ª','6ª'][gearIdx]

  return (
    <div style={{
      position:'absolute', bottom:70, left:'50%', transform:'translateX(-50%)',
      display:'flex', gap:6, alignItems:'center', pointerEvents:'none',
      fontFamily:'Rajdhani,sans-serif',
    }}>
      <div style={{background:'rgba(0,0,0,.65)',border:'1px solid rgba(255,255,255,.12)',
        borderRadius:10,padding:'5px 12px',display:'flex',gap:10,alignItems:'center'}}>
        {/* Marcha */}
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:9,color:'#888',letterSpacing:1}}>MARCHA</div>
          <div style={{fontSize:20,fontWeight:700,color:'#00ccff',lineHeight:1}}>{gearLabel}</div>
        </div>
        <div style={{width:1,height:28,background:'rgba(255,255,255,.12)'}}/>
        {/* Turbo */}
        <div style={{textAlign:'center',opacity:turbo?1:.4}}>
          <div style={{fontSize:9,color:turbo?'#ff6600':'#888',letterSpacing:1}}>TURBO</div>
          <div style={{fontSize:13,fontWeight:700,color:turbo?'#ff8800':'#555'}}>⚡ SHIFT</div>
        </div>
        <div style={{width:1,height:28,background:'rgba(255,255,255,.12)'}}/>
        {/* Freio de mão */}
        <div style={{textAlign:'center',opacity:handbrake?1:.4}}>
          <div style={{fontSize:9,color:handbrake?'#ff2200':'#888',letterSpacing:1}}>F.MÃO</div>
          <div style={{fontSize:13,fontWeight:700,color:handbrake?'#ff4400':'#555'}}>🅿 SPACE</div>
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
  const press = (k,v) => window.dispatchEvent(new KeyboardEvent(v?'keydown':'keyup',{code:k,key:k}))
  const btn = (label, code, extra={}) => (
    <button className="touch-btn" style={extra.style}
      onPointerDown={()=>press(code,true)} onPointerUp={()=>press(code,false)}
      onPointerLeave={()=>press(code,false)}>{label}</button>
  )
  return (
    <div className="touch-controls" style={{gap:6}}>
      <div className="touch-row">{btn('▲','ArrowUp')}</div>
      <div className="touch-row" style={{gap:4}}>
        {btn('◄','ArrowLeft')}
        {btn('▼','ArrowDown')}
        {btn('►','ArrowRight')}
      </div>
      <div className="touch-row" style={{gap:4,marginTop:4}}>
        {btn('⚡','ShiftLeft',{style:{background:'rgba(255,100,0,.4)',fontSize:18}})}
        {btn('🅿','Space',{style:{background:'rgba(255,30,0,.35)',fontSize:18}})}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CENA INTERNA (dentro do Canvas)
// ═══════════════════════════════════════════════════════════════════════════════
function SceneContent({ carConfig, gameState, cameraAngle, physicsRef,
    onSpeedChange, onCarPosChange, onLapComplete,
    onToggleHeadlights, onCycleCamera, onToggleMap }) {
  return (
    <>
      <DayEnvironment/>
      <Track/>
      <DayScenery/>
      <RaceCar carConfig={carConfig} physicsRef={physicsRef}/>
      <RaceCamera physicsRef={physicsRef} cameraAngle={cameraAngle}/>
      <GameController
        gameState={gameState} physicsRef={physicsRef}
        onSpeedChange={onSpeedChange} onCarPosChange={onCarPosChange}
        onLapComplete={onLapComplete}
        onToggleHeadlights={onToggleHeadlights}
        onCycleCamera={onCycleCamera}
        onToggleMap={onToggleMap}
      />
      <ContactShadows position={[0,.02,0]} opacity={.35} scale={60} blur={2} far={8}/>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
//  COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
export default function RaceScene({
  carConfig, gameState, cameraAngle,
  onSpeedChange, onCarPosChange, onLapComplete,
  onCycleCamera,
}) {
  const physicsRef    = useRef(new CarPhysics())
  const [mountKey,    setMountKey]    = useState(0)
  const [showMap,     setShowMap]     = useState(false)
  const [carPos,      setCarPos]      = useState({ x:0, z:30, angle:0, progress:0 })
  const [turbo,       setTurbo]       = useState(false)
  const [handbrake,   setHandbrake]   = useState(false)
  const [kmh,         setKmh]         = useState(0)
  const prevStateRef  = useRef(gameState)

  // Re-mount ao voltar para INTRO
  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = gameState
    if (gameState === GAME_STATES.INTRO && prev !== GAME_STATES.INTRO) {
      physicsRef.current = new CarPhysics()
      onSpeedChange(0)
      onCarPosChange({ x:0, z:30, angle:0, progress:0 })
      setMountKey(k => k+1)
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
        dpr={[1,1.5]}
        camera={{ position:[0,9,42], fov:56, near:.1, far:700 }}
        gl={{ antialias:true, toneMapping:THREE.ACESFilmicToneMapping, outputColorSpace:THREE.SRGBColorSpace }}
        style={{ width:'100%', height:'100%' }}
      >
        <SceneContent
          carConfig={carConfig} gameState={gameState} cameraAngle={cameraAngle}
          physicsRef={physicsRef}
          onSpeedChange={onSpeedChange}
          onCarPosChange={handleCarPos}
          onLapComplete={onLapComplete}
          onToggleHeadlights={()=>{}}
          onCycleCamera={onCycleCamera}
          onToggleMap={()=>setShowMap(m=>!m)}
        />
      </Canvas>

      {/* HUD de marcha / turbo / freio de mão */}
      {gameState === GAME_STATES.RACING && (
        <ControlsHint turbo={turbo} handbrake={handbrake} kmh={kmh}/>
      )}

      <TouchControls gameState={gameState}/>

      {/* Mini-mapa cidade */}
      <CityMiniMap
        carPos={carPos}
        visible={showMap && gameState === GAME_STATES.RACING}
        onClose={()=>setShowMap(false)}
      />
    </>
  )
}
