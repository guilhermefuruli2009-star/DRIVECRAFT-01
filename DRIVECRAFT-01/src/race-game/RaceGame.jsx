/**
 * RaceGame.jsx — v4 com sistema de áudio completo
 */
import { useState, useCallback, useRef, useEffect, Suspense } from 'react'
import RaceScene   from './RaceScene'
import RaceHUD     from './RaceHUD'
import RaceIntro   from './RaceIntro'
import { useGameAudio, MusicPlayer } from './useGameAudio'
import './RaceGame.css'

export const GAME_STATES = {
  INTRO:     'intro',
  COUNTDOWN: 'countdown',
  RACING:    'racing',
  PAUSED:    'paused',
  FINISHED:  'finished',
}

export default function RaceGame({ carConfig, onBack }) {
  const [gameState, setGameState]     = useState(GAME_STATES.INTRO)
  const [countdown, setCountdown]     = useState(3)
  const [lapData, setLapData]         = useState({ current: 0, total: 3, times: [] })
  const [speed, setSpeed]             = useState(0)
  const [bestLap, setBestLap]         = useState(null)
  const [totalTime, setTotalTime]     = useState(0)
  const [cameraAngle, setCameraAngle] = useState('follow')
  const [showMap, setShowMap]         = useState(true)
  const [showMusic, setShowMusic]     = useState(false)
  const [carPos, setCarPos]           = useState({ x: 0, z: 30, angle: 0, progress: 0 })

  const countRef = useRef(null)
  const totalRef = useRef(null)

  // ── Áudio ──────────────────────────────────────────────────────────────────
  const {
    startEngine, stopEngine, updateEngine,
    playLap, playFinish, playCount, playGo,
  } = useGameAudio()

  // Inicia motor quando corrida começa
  useEffect(() => {
    if (gameState === GAME_STATES.RACING) {
      startEngine()
    } else {
      stopEngine()
    }
  }, [gameState, startEngine, stopEngine])

  // Atualiza o som do motor com a velocidade atual
  const handleSpeedChange = useCallback((kmh) => {
    setSpeed(kmh)
    // braking e turbo vêm do physicsRef via RaceScene — por ora aproximamos:
    // braking se velocidade cair rápido, turbo se > 120
    updateEngine(kmh, false, kmh > 110)
  }, [updateEngine])

  // ── Lógica do jogo ─────────────────────────────────────────────────────────
  const startCountdown = useCallback(() => {
    setGameState(GAME_STATES.COUNTDOWN)
    setCountdown(3)
    let c = 3
    playCount()
    countRef.current = setInterval(() => {
      c -= 1
      setCountdown(c)
      if (c > 0) playCount()
      if (c <= 0) {
        clearInterval(countRef.current)
        playGo()
        setGameState(GAME_STATES.RACING)
        totalRef.current = setInterval(() => setTotalTime(t => t + 0.1), 100)
      }
    }, 1000)
  }, [playCount, playGo])

  const togglePause = useCallback(() => {
    setGameState(prev => {
      if (prev === GAME_STATES.RACING) {
        clearInterval(totalRef.current)
        return GAME_STATES.PAUSED
      }
      if (prev === GAME_STATES.PAUSED) {
        totalRef.current = setInterval(() => setTotalTime(t => t + 0.1), 100)
        return GAME_STATES.RACING
      }
      return prev
    })
  }, [])

  const completeLap = useCallback((lapTime) => {
    playLap()
    setLapData(prev => {
      const newTimes   = [...prev.times, lapTime]
      const newCurrent = prev.current + 1
      setBestLap(b => (b === null ? lapTime : Math.min(b, lapTime)))
      if (newCurrent >= prev.total) {
        clearInterval(totalRef.current)
        setTimeout(() => {
          playFinish()
          setGameState(GAME_STATES.FINISHED)
        }, 600)
      }
      return { ...prev, current: newCurrent, times: newTimes }
    })
  }, [playLap, playFinish])

  const restart = useCallback(() => {
    clearInterval(countRef.current)
    clearInterval(totalRef.current)
    stopEngine()
    setGameState(GAME_STATES.INTRO)
    setCountdown(3)
    setLapData({ current: 0, total: 3, times: [] })
    setSpeed(0)
    setBestLap(null)
    setTotalTime(0)
    setCarPos({ x: 0, z: 30, angle: 0, progress: 0 })
  }, [stopEngine])

  const cycleCamera = useCallback(() => {
    const angles = ['follow','cockpit','side','top','cinematic']
    setCameraAngle(prev => angles[(angles.indexOf(prev) + 1) % angles.length])
  }, [])

  useEffect(() => () => {
    clearInterval(countRef.current)
    clearInterval(totalRef.current)
    stopEngine()
  }, [stopEngine])

  useEffect(() => {
    const onKey = e => {
      if ((e.key === 'p' || e.key === 'P' || e.key === 'Escape') &&
          (gameState === GAME_STATES.RACING || gameState === GAME_STATES.PAUSED)) togglePause()
      if (e.key === 'Escape' && gameState === GAME_STATES.INTRO) onBack()
      if (e.key === 'c' || e.key === 'C') cycleCamera()
      if (e.key === 'm' || e.key === 'M') setShowMap(m => !m)
      if (e.key === 'n' || e.key === 'N') setShowMusic(m => !m)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gameState, togglePause, cycleCamera, onBack])

  const isRacing = gameState === GAME_STATES.RACING

  return (
    <div className="race-game">
      <div className="race-canvas-wrap">
        <Suspense fallback={<div className="race-loading">Carregando pista...</div>}>
          <RaceScene
            carConfig={carConfig}
            gameState={gameState}
            cameraAngle={cameraAngle}
            onSpeedChange={handleSpeedChange}
            onCarPosChange={setCarPos}
            onLapComplete={completeLap}
            onCycleCamera={cycleCamera}
            onUpdateAudio={updateEngine}
          />
        </Suspense>
      </div>

      {gameState === GAME_STATES.INTRO && (
        <RaceIntro carConfig={carConfig} onStart={startCountdown} onBack={onBack}/>
      )}

      {gameState === GAME_STATES.COUNTDOWN && (
        <div className="race-countdown">
          <div className="countdown-number" key={countdown}>{countdown || 'GO!'}</div>
        </div>
      )}

      {(isRacing || gameState === GAME_STATES.PAUSED) && (
        <RaceHUD
          speed={speed} lapData={lapData} bestLap={bestLap}
          totalTime={totalTime} cameraAngle={cameraAngle}
          showMap={showMap} carPos={carPos}
          paused={gameState === GAME_STATES.PAUSED}
          onTogglePause={togglePause} onCycleCamera={cycleCamera}
          onToggleMap={() => setShowMap(m => !m)}
          onToggleMusic={() => setShowMusic(m => !m)}
          showMusic={showMusic}
          onRestart={restart} onBack={onBack}
        />
      )}

      {/* Player de música — visível durante corrida e pausa */}
      {(isRacing || gameState === GAME_STATES.PAUSED) && (
        <MusicPlayer visible={showMusic} />
      )}

      {gameState === GAME_STATES.FINISHED && (
        <RaceFinished
          lapData={lapData} bestLap={bestLap} totalTime={totalTime}
          carConfig={carConfig} onRestart={restart} onBack={onBack}
        />
      )}
    </div>
  )
}

// ── Tela de resultado ─────────────────────────────────────────────────────────
function RaceFinished({ lapData, bestLap, totalTime, carConfig, onRestart, onBack }) {
  const fmt = t => {
    const m = Math.floor(t / 60)
    const s = (t % 60).toFixed(2).padStart(5, '0')
    return `${m}:${s}`
  }
  return (
    <div className="race-finished">
      <div className="finished-panel">
        <div className="finished-trophy">🏆</div>
        <h1 className="finished-title">Corrida Finalizada!</h1>
        <div className="finished-car-preview">
          <div className="fcar-dot" style={{ background: carConfig.bodyColor }}/>
          <span>Fiat 500 Custom</span>
        </div>
        <div className="finished-stats">
          <div className="fstat">
            <span className="fstat-label">Tempo Total</span>
            <span className="fstat-val">{fmt(totalTime)}</span>
          </div>
          <div className="fstat">
            <span className="fstat-label">Melhor Volta</span>
            <span className="fstat-val gold">{bestLap ? fmt(bestLap) : '--'}</span>
          </div>
          <div className="fstat">
            <span className="fstat-label">Voltas</span>
            <span className="fstat-val">{lapData.total}</span>
          </div>
        </div>
        <div className="lap-breakdown">
          <div className="lbk-title">Histórico de Voltas</div>
          {lapData.times.map((t, i) => (
            <div key={i} className={`lbk-row${t === bestLap ? ' best' : ''}`}>
              <span>Volta {i + 1}</span>
              <span>{fmt(t)} {t === bestLap ? '⭐ Melhor' : ''}</span>
            </div>
          ))}
        </div>
        <div className="finished-actions">
          <button className="race-btn race-btn-primary" onClick={onRestart}>🔄 Correr Novamente</button>
          <button className="race-btn race-btn-secondary" onClick={onBack}>🔧 Voltar ao Configurador</button>
        </div>
      </div>
    </div>
  )
}
