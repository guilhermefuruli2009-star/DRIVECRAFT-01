/**
 * CarModel.jsx — v7 Universal com perfis específicos por carro
 *
 * Estratégia:
 *  1. PERFIS FIXOS: mapeamento exato por nome do arquivo GLB
 *     (inspecionado uma vez, nunca falha)
 *  2. SCANNER GENÉRICO: para GLBs desconhecidos, tenta por keywords
 *  3. RODAS: sem detecção por nome de nó (não existe nesses GLBs)
 *     As rodas são gerenciadas pelo próprio GLB — não tentamos mexer
 *  4. BOUNDING BOX: calculada com geometria local, sem mover scene
 */
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef, useCallback, useState } from 'react'
import * as THREE from 'three'

// ══════════════════════════════════════════════════════════════════════════════
//  PERFIS ESPECÍFICOS — mapeamento exato por arquivo GLB
//  key = substring do path do arquivo (case-insensitive)
// ══════════════════════════════════════════════════════════════════════════════
const CAR_PROFILES = [
  {
    match: 'fiat500',
    scale: 100,
    BODY:   ['fiatMI_1272010001_002'],
    RIM:    ['fiatMI_Rim1'],
    BRAKE:  ['fiatMI_Change_Brake1'],
    GLASS:  ['fiatMI_Glass1'],
    GLASS_L:['fiatMI_Glass_Light1'],
    TYRE:   ['fiatMI_Classic_Tyre1'],
    LIGHT:  ['fiatMI_Light1'],
    TAIL:   ['fiatred_glass','fiatorange_glass'],
    MIRROR: ['fiatMI_Mirror_002'],
    EXHAUST:['fiatMI_Exhaust1'],
    CABIN:  ['fiatMI_Cabin1','fiatMI_Engine1','fiatMI_ChangeB_Decals_Roof_Cloth1','fiatMI_Grid_A1'],
  },
  {
    match: 'gol',
    scale: 1,
    BODY:   ['Paint'],
    GLASS:  ['glass'],
    TYRE:   ['Starlet_tire'],
    LIGHT:  ['Gol_headlight','Gol_cornerlight'],
    TAIL:   ['Taillight_pic'],
    CABIN:  ['material','Material.001','Black','plastic','Plastic','Lettering',
             'metal','ezo_plate'],
  },
  {
    match: 'bmw_x3',
    scale: 1,
    BODY:   ['X3MI_1347060001_015'],
    GLASS:  ['X3MI_Glass_021','X3MI_Glass_023'],
    GLASS_L:['X3MI_Glass_Light_008'],
    TYRE:   ['X3MI_ChangeA_Tyre_002'],
    RIM:    ['X3MI_ChangeA_Rim_002','Black_Rim'],
    BRAKE:  ['X3MI_Change_Brake_002'],
    LIGHT:  ['X3MI_Light_007','Light'],
    EXHAUST:['X3MI_Exhaust_020'],
    MIRROR: ['X3MI_Mirror_008'],
    CABIN:  ['X3MI_Cabin_A_008','X3MI_Cabin_Leather_A_007','Costuras',
             'X3MI_Cabin_008','X3MI_Cabin_Plastic_A_007','X3MI_Cabin_Grid_B_006',
             'X3MI_Cabin_Carbon_A_014','X3MI_Cabin_Suede_A_002','X3MI_Cabin_Grid_A_002',
             'X3MI_Dashboard_002','X3MI_Engine_Suede_A_002','X3MI_Engine_A_003',
             'X3MI_Engine_003','X3MI_Engine_Plastic_A_003','X3MI_Engine_Grid_A_003',
             'X3MI_Suspension_004','X3MI_Logo_007'],
  },
  {
    match: 'bmw_z8',
    scale: 1,
    BODY:   ['Skin_Base'],
    GLASS:  ['Glass_Clear','EXT_Window','INT_Windows'],
    TYRE:   ['Tyre'],
    RIM:    ['rim_chrome'],
    BRAKE:  ['Brake_Disk','Brake_Disk_0'],
    LIGHT:  ['EXT_Lights','EXT_Lights_Transparent'],
    MIRROR: ['Mirrors'],
    CABIN:  ['INT_Chrome','INT_Leather2','INT_Leather1','INT_Carpet',
             'INT_HiPolished_Paint','INT_Cockpit','spec_steer',
             'INT_Plastic_Black','solid','cockpit_alpha','spec_alpha',
             'spec_interior','wiper','Details','EXT_Matte_Colors',
             'Plastic','material','chrome'],
  },
  {
    match: 'kadett',
    scale: 1,
    BODY:   ['Carro_Pintura'],
    GLASS:  ['VIDROS','Carro_Vidros','Carro_Vidros_Vermelhos','Carro_Vidro_Laranja'],
    TYRE:   ['Profiel02','M_0129_WhiteSmoke'],
    RIM:    [],
    BRAKE:  ['FREIO'],
    LIGHT:  ['FAROL','Carro_Metal_Farol'],
    TAIL:   ['LANTERNA','Carro_Metal_Vermelho','Carro_Metal_Laranja','PISCA'],
    MIRROR: ['Carro_Espelhos'],
    CABIN:  ['Carro_Plastico','material','material_23',
             'Placa_Parafusos','Placa_Branco','Placa_Azul','Placa_Mercosul',
             'Placa_Bandeira','Placa_QRCode'],
    CHROME: ['Carro_Cromado'],
  },
]

// Fallback genérico por keywords (para GLBs desconhecidos)
const GENERIC_KW = {
  BODY:   ['body','paint','carrocer','lataria','exterior','car_body'],
  GLASS:  ['glass','vidro','windshield','window','parabrisa'],
  GLASS_L:['glass_light','glasslight','light_glass','headlamp_glass'],
  TYRE:   ['tyre','tire','pneu','rubber'],
  RIM:    ['rim','aro','felge','jante','alloy','hubcap'],
  BRAKE:  ['brake','caliper','freio','bremse'],
  LIGHT:  ['headlight','farol','headlamp','front_light','luz_dianteira'],
  EXHAUST:['exhaust','escapamento','muffler'],
  MIRROR: ['mirror','espelho','retrovisor'],
  TAIL:   ['taillight','tail_light','red_glass','lanterna','rearlight'],
  CHROME: ['chrome','cromo','trim','grille'],
}
const GENERIC_CABIN_KW = [
  'seat','assento','banco','carpet','tapete','headliner','forro',
  'dashboard','dash','painel','steering','volante','interior',
  'cockpit','cabin','inside','engine','motor',
]

function getProfile(path) {
  const p = (path || '').toLowerCase()
  return CAR_PROFILES.find(cp => p.includes(cp.match)) || null
}

function buildMatTypeMapFromProfile(profile, materialNames) {
  const map = {}
  const types = ['BODY','RIM','BRAKE','GLASS','GLASS_L','TYRE',
                 'LIGHT','TAIL','MIRROR','EXHAUST','CABIN','CHROME']
  types.forEach(tipo => {
    const list = profile[tipo] || []
    list.forEach(matName => { map[matName] = tipo })
  })
  return map
}

function buildMatTypeMapGeneric(materialNames) {
  const map = {}
  materialNames.forEach(name => {
    const n = name.toLowerCase()
    // Cabin/interior first (exclusion list)
    if (GENERIC_CABIN_KW.some(kw => n.includes(kw))) { map[name] = 'CABIN'; return }
    for (const [tipo, kws] of Object.entries(GENERIC_KW)) {
      if (kws.some(kw => n.includes(kw))) { map[name] = tipo; return }
    }
  })
  return map
}

// ══════════════════════════════════════════════════════════════════════════════
//  COMPONENTE
// ══════════════════════════════════════════════════════════════════════════════
export default function CarModel({
  modelPath, modelScale,
  bodyColor, rimColor, caliperColor,
  metalness, roughness, envIntensity, clearCoat,
  glassTint, rimFinish,
  wheelScale, suspension, steerAngle,
  wheelOffsetFront, wheelOffsetRear,
  rotateWheels, wheelRotSpeed,
  headlightsOn, lightColor, lightIntensity,
  showWireframe,
  onHoverPart, onClickPart,
}) {
  const path    = modelPath || '/models/fiat500f.glb'
  const profile = getProfile(path)
  // Scale: perfil > prop > 1
  const scale   = modelScale ?? (profile?.scale ?? 1)

  const { scene, materials } = useGLTF(path)

  // Offset calculado UMA VEZ por modelo (bounding box local, sem mover scene)
  const [offset, setOffset] = useState([0, 0, 0])
  const clonedMats  = useRef({})
  const matTypeMap  = useRef({})

  // ── Clone de material ──────────────────────────────────────────────────────
  const getMat = useCallback((name) => {
    if (!clonedMats.current[name] && materials[name]) {
      clonedMats.current[name] = materials[name].clone()
    }
    return clonedMats.current[name]
  }, [materials])

  // ── Setup por modelo ───────────────────────────────────────────────────────
  useEffect(() => {
    clonedMats.current = {}

    // Monta o mapa material → tipo
    const matNames = Object.keys(materials)
    if (profile) {
      matTypeMap.current = buildMatTypeMapFromProfile(profile, matNames)
    } else {
      matTypeMap.current = buildMatTypeMapGeneric(matNames)
    }

    // Clona materiais e configura sombras
    scene.traverse(child => {
      if (!child.isMesh) return
      child.castShadow = child.receiveShadow = true
      if (child.material?.name && materials[child.material.name]) {
        const clone = getMat(child.material.name)
        if (clone) child.material = clone
      }
    })

    // ── Centraliza sem mover scene ────────────────────────────────────────
    // Reset para medir limpo
    scene.position.set(0, 0, 0)
    scene.updateMatrixWorld(true)
    const box    = new THREE.Box3().setFromObject(scene)
    const center = new THREE.Vector3()
    box.getCenter(center)
    // Offset aplicado no <group> pai — scene nunca é movido
    setOffset([-center.x, -box.min.y, -center.z])

  }, [scene, materials, getMat, profile])

  // ── Aplicadores de material ────────────────────────────────────────────────
  const applyToType = useCallback((tipo, fn) => {
    scene.traverse(child => {
      if (!child.isMesh || !child.material) return
      const name = child.material.name
      if (matTypeMap.current[name] === tipo) fn(child.material)
    })
  }, [scene])

  useEffect(() => {
    applyToType('BODY', m => {
      m.color.set(bodyColor)
      m.metalness=metalness; m.roughness=roughness
      m.envMapIntensity=envIntensity; m.needsUpdate=true
    })
  }, [bodyColor, metalness, roughness, envIntensity, applyToType])

  useEffect(() => {
    applyToType('RIM', m => {
      m.color.set(rimColor)
      const rf = rimFinish==='chrome'?{me:1.0,ro:0.05}
               : rimFinish==='plastic'?{me:0.0,ro:0.5}:{me:0.8,ro:0.3}
      m.metalness=rf.me; m.roughness=rf.ro; m.needsUpdate=true
    })
  }, [rimColor, rimFinish, applyToType])

  useEffect(() => {
    applyToType('BRAKE', m => {
      m.color.set(caliperColor); m.metalness=0.4; m.roughness=0.5; m.needsUpdate=true
    })
  }, [caliperColor, applyToType])

  useEffect(() => {
    ;['GLASS','GLASS_L'].forEach(t => applyToType(t, m => {
      m.transparent=true; m.opacity=Math.max(0.05,1-glassTint); m.needsUpdate=true
    }))
  }, [glassTint, applyToType])

  useEffect(() => {
    applyToType('LIGHT', m => {
      m.emissive=new THREE.Color(headlightsOn?lightColor:'#000000')
      m.emissiveIntensity=headlightsOn?lightIntensity*0.8:0; m.needsUpdate=true
    })
    applyToType('TAIL', m => {
      m.emissive=new THREE.Color(headlightsOn?'#ff2200':'#330000')
      m.emissiveIntensity=headlightsOn?0.6:0.1; m.needsUpdate=true
    })
  }, [headlightsOn, lightColor, lightIntensity, applyToType])

  useEffect(() => {
    scene.traverse(child => {
      if (!child.isMesh || !child.material) return
      const mats = Array.isArray(child.material)?child.material:[child.material]
      mats.forEach(m => { m.wireframe=showWireframe })
    })
  }, [showWireframe, scene])

  // ── Hover / Click ──────────────────────────────────────────────────────────
  const LABEL = {
    BODY:'Lataria', RIM:'Aro', BRAKE:'Pinça de Freio', GLASS:'Vidro',
    GLASS_L:'Vidro do Farol', TYRE:'Pneu', LIGHT:'Farol', TAIL:'Lanterna',
    MIRROR:'Espelho', EXHAUST:'Escapamento', CABIN:'Interior', CHROME:'Cromado',
  }
  const getLabel = useCallback(matName =>
    LABEL[matTypeMap.current[matName]] || null, [])

  const handleMove  = useCallback(e => {
    e.stopPropagation()
    onHoverPart?.(getLabel(e.object?.material?.name||''))
  }, [onHoverPart, getLabel])
  const handleOut   = useCallback(() => onHoverPart?.(null), [onHoverPart])
  const handleClick = useCallback(e => {
    e.stopPropagation()
    const n = e.object?.material?.name||''
    const l = getLabel(n)
    if (l) onClickPart?.(l, n)
  }, [onClickPart, getLabel])

  // ── useFrame: animação rodas do Fiat500 (único com nós nomeados) ──────────
  // Para os outros carros: wheelScale e suspension NÃO existem como nós separados
  // então não tentamos mexer — o GLB já tem a geometria completa
  useFrame((_,delta) => {
    if (!profile || profile.match !== 'fiat500') return
    // Fiat500 tem nós de roda específicos — animação original mantida via scene.traverse
    scene.traverse(child => {
      const nn = (child.name||'').toLowerCase()
      const isWheel = nn.includes('ani_wheel') || nn.includes('ani_disc')
      if (!isWheel) return
      if (rotateWheels) child.rotation.x -= delta * 3 * (wheelRotSpeed||1)
    })
  })

  return (
    <group position={offset} scale={scale}>
      <primitive
        object={scene}
        onPointerMove={handleMove}
        onPointerOut={handleOut}
        onClick={handleClick}
      />
    </group>
  )
}
