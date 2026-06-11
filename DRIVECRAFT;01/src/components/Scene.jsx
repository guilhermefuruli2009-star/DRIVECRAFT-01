/**
 * Scene.jsx — v5 com modelPath e modelScale dinâmicos
 * Aceita qualquer GLB carregado pelo App (blob URL ou path fixo)
 */
import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, ContactShadows, Grid } from '@react-three/drei'
import * as THREE from 'three'
import CarModel from './CarModel'

const ENV_PRESETS = {
  studio: {
    bgColor:'#05080f', ambient:0.35,
    key: {pos:[5,10,5],  color:'#ffffff', intensity:2.5},
    fill:{pos:[-5,5,-5], color:'#b0c8ff', intensity:0.7},
    rim: {pos:[0,2,-8],  color:'#ffe8c0', intensity:1.0},
    exposure:1.2, fog:0.004,
  },
  garage: {
    bgColor:'#0a0807', ambient:0.18,
    key: {pos:[2,8,3],   color:'#ffcc88', intensity:1.8},
    fill:{pos:[-3,3,-4], color:'#442200', intensity:0.5},
    rim: {pos:[0,1,-6],  color:'#884400', intensity:0.4},
    exposure:1.0, fog:0.01,
  },
  street: {
    bgColor:'#06090f', ambient:0.5,
    key: {pos:[8,12,6],  color:'#fff5e0', intensity:3.2},
    fill:{pos:[-6,4,-5], color:'#8888ff', intensity:0.9},
    rim: {pos:[0,3,-10], color:'#aabbff', intensity:0.8},
    exposure:1.4, fog:0.006,
  },
  track: {
    bgColor:'#040404', ambient:0.12,
    key: {pos:[6,14,8],  color:'#ffffff', intensity:4.0},
    fill:{pos:[-8,6,-6], color:'#2233ff', intensity:1.2},
    rim: {pos:[0,2,-12], color:'#4455ff', intensity:1.5},
    exposure:1.6, fog:0.012,
  },
}

function SceneLights({ environment }) {
  const p = ENV_PRESETS[environment] || ENV_PRESETS.studio
  const { scene, gl } = useThree()
  useEffect(() => {
    scene.background = new THREE.Color(p.bgColor)
    scene.fog = new THREE.FogExp2(new THREE.Color(p.bgColor), p.fog)
    gl.toneMappingExposure = p.exposure
  }, [environment, p, scene, gl])
  return (
    <>
      <ambientLight intensity={p.ambient} />
      <directionalLight position={p.key.pos} color={p.key.color} intensity={p.key.intensity}
        castShadow shadow-mapSize={[2048,2048]}
        shadow-camera-left={-8} shadow-camera-right={8}
        shadow-camera-top={8}   shadow-camera-bottom={-8}
        shadow-camera-far={30}/>
      <directionalLight position={p.fill.pos} color={p.fill.color} intensity={p.fill.intensity}/>
      <directionalLight position={p.rim.pos}  color={p.rim.color}  intensity={p.rim.intensity}/>
    </>
  )
}

function CameraController({ target, onConsumed, fov, autoRotate }) {
  const { camera } = useThree()
  const controlsRef = useRef()
  useEffect(() => {
    if (!target) return
    camera.position.set(...target)
    camera.updateProjectionMatrix()
    controlsRef.current?.update()
    onConsumed?.()
  }, [target]) // eslint-disable-line
  useEffect(() => {
    camera.fov = fov; camera.updateProjectionMatrix()
  }, [fov, camera])
  return (
    <OrbitControls ref={controlsRef} makeDefault enablePan={false}
      minDistance={1.5} maxDistance={14}
      minPolarAngle={0} maxPolarAngle={Math.PI/2.05}
      enableDamping dampingFactor={0.06}
      autoRotate={autoRotate} autoRotateSpeed={1.2}/>
  )
}

function Headlights({ on, color, intensity }) {
  const tL = useRef(); const tR = useRef()
  if (!on) return null
  return (
    <>
      <object3D ref={tL} position={[ 0.38, 0, 30]}/>
      <object3D ref={tR} position={[-0.38, 0, 30]}/>
      <spotLight position={[0.38, 0.52, 1.9]}   target={tL.current} color={color}
        intensity={intensity*45} angle={0.26} penumbra={0.4} castShadow distance={18}/>
      <spotLight position={[-0.38, 0.52, 1.9]}  target={tR.current} color={color}
        intensity={intensity*45} angle={0.26} penumbra={0.4} castShadow={false} distance={18}/>
      <pointLight position={[0, 0.52, 2.1]}     color={color} intensity={intensity*2.5} distance={3}/>
      <pointLight position={[ 0.45, 0.48, -1.9]} color="#ff1100" intensity={intensity*3} distance={3.5}/>
      <pointLight position={[-0.45, 0.48, -1.9]} color="#ff1100" intensity={intensity*3} distance={3.5}/>
    </>
  )
}

export default function Scene({
  // modelo dinâmico
  modelPath, modelScale,
  // car
  bodyColor, rimColor, caliperColor,
  metalness, roughness, envIntensity, clearCoat,
  glassTint, rimFinish,
  wheelScale, suspension, steerAngle,
  wheelOffsetFront, wheelOffsetRear,
  rotateWheels, wheelRotSpeed,
  // lights
  headlightsOn, lightColor, lightIntensity,
  // scene
  environment, showWireframe, showGrid,
  autoRotate, fov,
  cameraTarget, onCameraTargetConsumed,
  onHoverPart, onClickPart,
}) {
  return (
    <Canvas shadows dpr={[1,2]}
      camera={{ position:[3.5,1.8,5], fov:fov||45, near:0.01, far:200 }}
      gl={{
        antialias:true,
        toneMapping:THREE.ACESFilmicToneMapping,
        toneMappingExposure:1.2,
        outputColorSpace:THREE.SRGBColorSpace,
      }}
      style={{ width:'100%', height:'100%' }}>
      <SceneLights environment={environment}/>
      <CameraController target={cameraTarget} onConsumed={onCameraTargetConsumed}
        fov={fov||45} autoRotate={autoRotate}/>
      <Headlights on={headlightsOn} color={lightColor} intensity={lightIntensity}/>
      <Suspense fallback={null}>
        <group>
          <CarModel
            modelPath={modelPath}
            modelScale={modelScale}
            bodyColor={bodyColor}       rimColor={rimColor}
            caliperColor={caliperColor}
            metalness={metalness}       roughness={roughness}
            envIntensity={envIntensity} clearCoat={clearCoat}
            glassTint={glassTint}       rimFinish={rimFinish}
            wheelScale={wheelScale}     suspension={suspension}
            steerAngle={steerAngle}
            wheelOffsetFront={wheelOffsetFront}
            wheelOffsetRear={wheelOffsetRear}
            rotateWheels={rotateWheels} wheelRotSpeed={wheelRotSpeed}
            headlightsOn={headlightsOn} lightColor={lightColor}
            lightIntensity={lightIntensity}
            showWireframe={showWireframe}
            onHoverPart={onHoverPart}
            onClickPart={onClickPart}
          />
        </group>
        <ContactShadows position={[0,-0.01,0]} opacity={0.7} scale={18} blur={2.5} far={5}/>
      </Suspense>
      {showGrid && (
        <Grid position={[0,0.002,0]} args={[30,30]}
          cellSize={0.5} cellThickness={0.5} cellColor="#222a40"
          sectionSize={2} sectionThickness={1} sectionColor="#1a2540"
          fadeDistance={25} infiniteGrid/>
      )}
    </Canvas>
  )
}
