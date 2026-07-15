/**
 * useGameAudio.js — Sistema de áudio completo do jogo
 *
 * v6 — motor e turbo agora reagem a "segurar tecla":
 *   • updateEngine(kmh, braking, turbo, accelerating) ganhou o 4º parâmetro
 *     `accelerating` (true enquanto a tecla de acelerar estiver pressionada).
 *     Quando accelerating=false, o volume do motor cai suavemente (fade),
 *     mesmo que o carro ainda esteja em movimento por inércia.
 *   • O turbo deixou de ser um som "de tiro único" (one-shot) e virou um
 *     LOOP contínuo: entra rápido quando turbo=true e some com fade suave
 *     quando turbo=false — inclusive se você importar um arquivo pra ele.
 *   • Continua com IMPORTAÇÃO DE ARQUIVOS LOCAIS (.wav/.mp3/.ogg/.m4a) pra
 *     motor, freio, turbo, lap, finish, countdown, go — sem recarregar o jogo.
 *   • Se nenhum arquivo for importado pra uma chave, cai automaticamente no
 *     som sintético original (Web Audio API / osciladores) — nada quebra.
 */

import { useRef, useEffect, useCallback, useState } from 'react'

// Chaves de áudio que podem ser substituídas por um arquivo importado
export const AUDIO_KEYS = ['engine', 'brake', 'turbo', 'lap', 'finish', 'countdown', 'go']

// ─────────────────────────────────────────────────────────────────────────────
//  DECODIFICAÇÃO DE ARQUIVO IMPORTADO
//  Aceita File (de <input type="file">) ou Blob. Funciona com qualquer
//  formato que o navegador saiba decodificar: mp3, wav, ogg, m4a, aac...
// ─────────────────────────────────────────────────────────────────────────────
async function decodeAudioFile(file) {
  if (!file) throw new Error('Nenhum arquivo fornecido')
  const validTypes = /\.(mp3|wav|ogg|m4a|aac|webm)$/i
  if (file.name && !validTypes.test(file.name)) {
    console.warn(`Extensão incomum (${file.name}) — tentando decodificar mesmo assim.`)
  }
  const arrayBuffer = await file.arrayBuffer()
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    return audioBuffer
  } finally {
    ctx.close()
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ENGINE AUDIO — sintético (osciladores) OU arquivo importado (AudioBuffer)
//  + LOOP DE TURBO (sintético ou arquivo importado), com fade in/out
// ─────────────────────────────────────────────────────────────────────────────
function createEngineAudio() {
  let ctx = null, masterGain = null
  let baseOsc = null, harmOsc = null, noiseNode = null
  let baseGain = null, harmGain = null, noiseGain = null
  let customSource = null, customGain = null
  let customBuffer = null   // AudioBuffer importado pelo dev, pro motor

  // — Turbo: loop contínuo (sintético ou importado) —
  let turboOsc = null, turboFilter = null, turboGain = null
  let turboCustomSource = null, turboCustomGain = null
  let turboCustomBuffer = null // AudioBuffer importado pelo dev, pro turbo

  let running = false

  function startSynthNodes() {
    baseOsc = ctx.createOscillator()
    baseOsc.type = 'sawtooth'
    baseOsc.frequency.value = 60
    baseGain = ctx.createGain()
    baseGain.gain.value = 0.55
    baseOsc.connect(baseGain)
    baseGain.connect(masterGain)
    baseOsc.start()

    harmOsc = ctx.createOscillator()
    harmOsc.type = 'square'
    harmOsc.frequency.value = 120
    harmGain = ctx.createGain()
    harmGain.gain.value = 0.25
    const waveShaper = ctx.createWaveShaper()
    const curve = new Float32Array(256)
    for (let i = 0; i < 256; i++) {
      const x = (i * 2) / 256 - 1
      curve[i] = (Math.PI + 280) * x / (Math.PI + 280 * Math.abs(x))
    }
    waveShaper.curve = curve
    harmOsc.connect(waveShaper)
    waveShaper.connect(harmGain)
    harmGain.connect(masterGain)
    harmOsc.start()

    const bufLen = ctx.sampleRate * 2
    const noiseBuffer = ctx.createBuffer(1, bufLen, ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1
    noiseNode = ctx.createBufferSource()
    noiseNode.buffer = noiseBuffer
    noiseNode.loop = true
    const biquad = ctx.createBiquadFilter()
    biquad.type = 'lowpass'
    biquad.frequency.value = 800
    noiseGain = ctx.createGain()
    noiseGain.gain.value = 0
    noiseNode.connect(biquad)
    biquad.connect(noiseGain)
    noiseGain.connect(masterGain)
    noiseNode.start()
  }

  function stopSynthNodes() {
    try { baseOsc?.stop(); harmOsc?.stop(); noiseNode?.stop() } catch (_) {}
    baseOsc = harmOsc = noiseNode = null
  }

  function startCustomNode() {
    customSource = ctx.createBufferSource()
    customSource.buffer = customBuffer
    customSource.loop = true
    customGain = ctx.createGain()
    customGain.gain.value = 0.6
    customSource.connect(customGain)
    customGain.connect(masterGain)
    customSource.start()
  }

  function stopCustomNode() {
    try { customSource?.stop() } catch (_) {}
    customSource = null; customGain = null
  }

  // — Turbo: nodes sempre rodando com ganho 0, só "abrem" quando turbo=true —
  function startTurboSynthNodes() {
    turboOsc = ctx.createOscillator()
    turboOsc.type = 'sawtooth'
    turboOsc.frequency.value = 320
    turboFilter = ctx.createBiquadFilter()
    turboFilter.type = 'bandpass'
    turboFilter.frequency.value = 950
    turboFilter.Q.value = 1.1
    turboGain = ctx.createGain()
    turboGain.gain.value = 0
    turboOsc.connect(turboFilter)
    turboFilter.connect(turboGain)
    turboGain.connect(ctx.destination)
    turboOsc.start()
  }

  function stopTurboSynthNodes() {
    try { turboOsc?.stop() } catch (_) {}
    turboOsc = null; turboFilter = null; turboGain = null
  }

  function startTurboCustomNode() {
    turboCustomSource = ctx.createBufferSource()
    turboCustomSource.buffer = turboCustomBuffer
    turboCustomSource.loop = true
    turboCustomGain = ctx.createGain()
    turboCustomGain.gain.value = 0
    turboCustomSource.connect(turboCustomGain)
    turboCustomGain.connect(ctx.destination)
    turboCustomSource.start()
  }

  function stopTurboCustomNode() {
    try { turboCustomSource?.stop() } catch (_) {}
    turboCustomSource = null; turboCustomGain = null
  }

  function start() {
    if (running) return
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      masterGain = ctx.createGain()
      masterGain.gain.value = 0.0
      masterGain.connect(ctx.destination)

      if (customBuffer) startCustomNode()
      else startSynthNodes()

      if (turboCustomBuffer) startTurboCustomNode()
      else startTurboSynthNodes()

      running = true
    } catch (e) {
      console.warn('AudioContext não disponível:', e)
    }
  }

  function stop() {
    if (!running || !ctx) return
    stopSynthNodes()
    stopCustomNode()
    stopTurboSynthNodes()
    stopTurboCustomNode()
    try { ctx.close() } catch (_) {}
    running = false; ctx = null; masterGain = null
  }

  /**
   * Troca o som do motor por um arquivo importado (ou remove, se buffer=null)
   * a qualquer momento — inclusive com o motor já rodando.
   */
  function setCustomBuffer(buffer) {
    customBuffer = buffer
    if (!running) return
    if (buffer) {
      stopSynthNodes()
      stopCustomNode()
      startCustomNode()
    } else {
      stopCustomNode()
      startSynthNodes()
    }
  }

  /**
   * Troca o som do turbo por um arquivo importado (ou remove, se buffer=null).
   * O loop de turbo continua funcionando com fade in/out normalmente.
   */
  function setTurboCustomBuffer(buffer) {
    turboCustomBuffer = buffer
    if (!running) return
    if (buffer) {
      stopTurboSynthNodes()
      stopTurboCustomNode()
      startTurboCustomNode()
    } else {
      stopTurboCustomNode()
      startTurboSynthNodes()
    }
  }

  /**
   * update(kmh, braking, turbo, accelerating)
   *  - accelerating: true enquanto a tecla de acelerar estiver pressionada.
   *    Quando false, o motor faz fade-out suave (não corta seco), mesmo que
   *    o carro ainda esteja andando por inércia.
   *  - turbo: true enquanto a tecla de turbo estiver pressionada. O som de
   *    turbo é um loop contínuo com fade-in rápido / fade-out suave.
   */
  function update(kmh, braking, turbo, accelerating = true) {
    if (!running || !ctx) return
    const t = ctx.currentTime
    const smooth = 0.06

    const rpmRatio = Math.min(1, kmh / 120)
    const turboMult = turbo ? 1.35 : 1.0
    const volBase = braking ? 0.25 : (0.18 + rpmRatio * 0.55)

    // ── Turbo: loop com fade rápido ao entrar, suave ("diminuindo") ao sair ──
    const turboTarget = turbo ? 0.35 : 0
    const turboSmooth = turbo ? 0.05 : 0.35
    if (turboCustomBuffer && turboCustomGain) {
      turboCustomGain.gain.setTargetAtTime(turboTarget, t, turboSmooth)
      if (turbo) turboCustomSource.playbackRate.setTargetAtTime(0.9 + rpmRatio * 0.6, t, 0.08)
    } else if (turboGain) {
      turboGain.gain.setTargetAtTime(turboTarget, t, turboSmooth)
      if (turbo) turboOsc.frequency.setTargetAtTime(320 + rpmRatio * 520, t, 0.08)
    }

    // ── Motor: se soltou o acelerador, faz fade-out suave e para por aí ──
    if (!accelerating) {
      masterGain.gain.setTargetAtTime(0.0001, t, 0.4)
      // ainda assim mantemos o pitch acompanhando a desaceleração por inércia
    }

    if (customBuffer && customSource) {
      // Pitch shift via playbackRate (0.75x parado → 1.9x em rotação alta)
      const rate = (0.75 + rpmRatio * 1.15) * turboMult
      customSource.playbackRate.setTargetAtTime(rate, t, smooth)
      if (accelerating) {
        customGain.gain.setTargetAtTime(volBase * (turbo ? 1.2 : 1.0), t, smooth)
        masterGain.gain.setTargetAtTime(1, t, smooth) // masterGain fixo, ganho fica no customGain
      }
      return
    }

    // Caminho sintético original
    const rpm = 800 + rpmRatio * 5200
    const freqBase = rpm / 60
    baseOsc.frequency.setTargetAtTime(freqBase * turboMult, t, smooth)
    harmOsc.frequency.setTargetAtTime(freqBase * 2 * turboMult, t, smooth)
    if (accelerating) {
      masterGain.gain.setTargetAtTime(volBase * (turbo ? 1.2 : 1.0), t, smooth)
    }
    noiseGain.gain.setTargetAtTime(rpmRatio * 0.18, t, smooth)
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume()
  }

  return { start, stop, update, resume, setCustomBuffer, setTurboCustomBuffer }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SOUNDS SFX — sintéticos por padrão, ou um AudioBuffer importado
//  (usado apenas para freio / lap / finish / countdown / go — sons "de tiro
//   único" que tocam inteiros. O turbo agora vive dentro do createEngineAudio.)
// ─────────────────────────────────────────────────────────────────────────────
function playSfx(type, customBuffer) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()

    // Se o dev importou um arquivo pra essa chave, toca ele direto
    if (customBuffer) {
      const src = ctx.createBufferSource()
      src.buffer = customBuffer
      const g = ctx.createGain()
      g.gain.value = 0.7
      src.connect(g); g.connect(ctx.destination)
      src.start()
      src.onended = () => ctx.close()
      // segurança: fecha mesmo se onended não disparar (loop=false por padrão então dispara)
      setTimeout(() => { try { ctx.close() } catch (_) {} }, (customBuffer.duration + 0.3) * 1000)
      return
    }

    const g = ctx.createGain()
    g.connect(ctx.destination)

    if (type === 'brake') {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * (1 - i/d.length)
      const src = ctx.createBufferSource(); src.buffer = buf
      const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=4000; bp.Q.value=2
      g.gain.setValueAtTime(0.4, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55)
      src.connect(bp); bp.connect(g); src.start()
      setTimeout(() => ctx.close(), 700)
    }

    if (type === 'lap') {
      ;[0, 0.15, 0.3].forEach((delay, i) => {
        const osc = ctx.createOscillator()
        const og  = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.value = [880, 1046, 1318][i]
        og.gain.setValueAtTime(0.3, ctx.currentTime + delay)
        og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2)
        osc.connect(og); og.connect(ctx.destination)
        osc.start(ctx.currentTime + delay)
        osc.stop(ctx.currentTime + delay + 0.22)
      })
      setTimeout(() => ctx.close(), 700)
    }

    if (type === 'finish') {
      const notes = [523,659,784,1046,784,1046]
      const times  = [0,.12,.24,.36,.52,.64]
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const og  = ctx.createGain()
        osc.type='triangle'; osc.frequency.value=freq
        og.gain.setValueAtTime(0.4, ctx.currentTime+times[i])
        og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+times[i]+0.18)
        osc.connect(og); og.connect(ctx.destination)
        osc.start(ctx.currentTime+times[i]); osc.stop(ctx.currentTime+times[i]+0.2)
      })
      setTimeout(() => ctx.close(), 1200)
    }

    if (type === 'countdown') {
      const osc = ctx.createOscillator(); const og = ctx.createGain()
      osc.type='sine'; osc.frequency.value=440
      og.gain.setValueAtTime(0.5, ctx.currentTime)
      og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.18)
      osc.connect(og); og.connect(ctx.destination)
      osc.start(); osc.stop(ctx.currentTime+0.2)
      setTimeout(() => ctx.close(), 300)
    }

    if (type === 'go') {
      const osc = ctx.createOscillator(); const og = ctx.createGain()
      osc.type='sawtooth'; osc.frequency.value=880
      og.gain.setValueAtTime(0.6, ctx.currentTime)
      og.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.35)
      osc.connect(og); og.connect(ctx.destination)
      osc.start(); osc.stop(ctx.currentTime+0.4)
      setTimeout(() => ctx.close(), 500)
    }

  } catch(e) { console.warn('SFX error:', e) }
}

// ─────────────────────────────────────────────────────────────────────────────
//  HOOK PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────
export function useGameAudio() {
  const engineRef    = useRef(null)
  const prevBraking  = useRef(false)
  const musicRef     = useRef(null)
  const buffersRef   = useRef({})           // { engine: AudioBuffer, brake: AudioBuffer, ... }
  const [loadedKeys, setLoadedKeys] = useState([])

  const startEngine = useCallback(() => {
    if (!engineRef.current) engineRef.current = createEngineAudio()
    engineRef.current.start()
    engineRef.current.resume()
    // se já existiam arquivos importados antes de startar, aplica agora
    if (buffersRef.current.engine) engineRef.current.setCustomBuffer(buffersRef.current.engine)
    if (buffersRef.current.turbo) engineRef.current.setTurboCustomBuffer(buffersRef.current.turbo)
  }, [])

  const stopEngine = useCallback(() => {
    engineRef.current?.stop()
    engineRef.current = null
  }, [])

  /**
   * updateEngine(kmh, braking, turbo, accelerating)
   *  - accelerating: passe `true` enquanto a tecla de acelerar estiver
   *    pressionada e `false` assim que soltar. O motor faz fade-out sozinho.
   *  - turbo: passe `true`/`false` conforme a tecla de turbo é segurada.
   *    O som de turbo entra e sai em loop, sem precisar disparar manualmente.
   */
  const updateEngine = useCallback((kmh, braking, turbo, accelerating = true) => {
    if (!engineRef.current) return
    engineRef.current.resume()
    engineRef.current.update(kmh, braking, turbo, accelerating)

    if (braking && !prevBraking.current && kmh > 30) playSfx('brake', buffersRef.current.brake)
    prevBraking.current = braking
  }, [])

  const playLap    = useCallback(() => playSfx('lap',       buffersRef.current.lap),       [])
  const playFinish = useCallback(() => playSfx('finish',    buffersRef.current.finish),    [])
  const playCount  = useCallback(() => playSfx('countdown', buffersRef.current.countdown), [])
  const playGo     = useCallback(() => playSfx('go',        buffersRef.current.go),        [])

  /**
   * Importa um arquivo .wav/.mp3/.ogg/.m4a pra uma das chaves de AUDIO_KEYS,
   * a qualquer momento (menu, tela de teste, durante a corrida...).
   */
  const importAudio = useCallback(async (key, file) => {
    if (!AUDIO_KEYS.includes(key)) {
      console.warn(`Chave de áudio inválida: "${key}". Use uma de: ${AUDIO_KEYS.join(', ')}`)
      return
    }
    const buffer = await decodeAudioFile(file)
    buffersRef.current[key] = buffer

    // Se for o motor ou o turbo e já estiverem rodando, troca em tempo real
    if (key === 'engine' && engineRef.current) {
      engineRef.current.setCustomBuffer(buffer)
    }
    if (key === 'turbo' && engineRef.current) {
      engineRef.current.setTurboCustomBuffer(buffer)
    }

    setLoadedKeys(Object.keys(buffersRef.current))
  }, [])

  /** Remove um áudio importado e volta pro som sintético original */
  const removeAudio = useCallback((key) => {
    delete buffersRef.current[key]
    if (key === 'engine' && engineRef.current) {
      engineRef.current.setCustomBuffer(null)
    }
    if (key === 'turbo' && engineRef.current) {
      engineRef.current.setTurboCustomBuffer(null)
    }
    setLoadedKeys(Object.keys(buffersRef.current))
  }, [])

  useEffect(() => () => {
    stopEngine()
    if (musicRef.current) { musicRef.current.pause(); musicRef.current = null }
  }, [stopEngine])

  return {
    startEngine, stopEngine, updateEngine,
    playLap, playFinish, playCount, playGo,
    importAudio, removeAudio, loadedKeys,
    musicRef,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  PAINEL DE IMPORTAÇÃO — arquivo por arquivo, pra cada som do jogo
// ─────────────────────────────────────────────────────────────────────────────
const SOUND_LABELS = {
  engine:    { icon: '🏎️', label: 'Motor (loop)' },
  brake:     { icon: '🛞', label: 'Freio / Derrapagem' },
  turbo:     { icon: '💨', label: 'Turbo (loop)' },
  lap:       { icon: '🔔', label: 'Volta completa' },
  finish:    { icon: '🏁', label: 'Chegada' },
  countdown: { icon: '⏱️', label: 'Contagem regressiva' },
  go:        { icon: '🚦', label: 'Largada (GO)' },
}

export function AudioImportPanel({ visible, importAudio, removeAudio, loadedKeys = [] }) {
  const [errors, setErrors] = useState({})

  const handleFile = (key) => async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite reimportar o mesmo arquivo depois
    if (!file) return
    try {
      setErrors(prev => ({ ...prev, [key]: null }))
      await importAudio(key, file)
    } catch (err) {
      setErrors(prev => ({ ...prev, [key]: 'Não consegui decodificar esse arquivo.' }))
      console.warn(err)
    }
  }

  if (!visible) return null

  return (
    <div style={{
      position:'absolute', bottom:70, left:16,
      background:'rgba(5,8,16,.95)', border:'1px solid rgba(255,255,255,.1)',
      borderRadius:14, padding:14, width:280, zIndex:20,
      fontFamily:'Inter,sans-serif', boxShadow:'0 8px 32px rgba(0,0,0,.5)',
      maxHeight:'70vh', overflowY:'auto',
    }}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <span style={{fontSize:16}}>📥</span>
        <span style={{fontSize:12,fontWeight:600,color:'#e8eaf6',letterSpacing:.5}}>
          IMPORTAR SONS (.wav / .mp3)
        </span>
      </div>

      {AUDIO_KEYS.map(key => {
        const meta = SOUND_LABELS[key]
        const isLoaded = loadedKeys.includes(key)
        return (
          <div key={key} style={{
            display:'flex', alignItems:'center', gap:8, marginBottom:8,
            background:'rgba(255,255,255,.05)', borderRadius:8, padding:'6px 8px',
          }}>
            <span style={{fontSize:14}}>{meta.icon}</span>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:11, color:'#e8eaf6', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                {meta.label}
              </div>
              <div style={{fontSize:9, color: isLoaded ? '#00ff88' : 'rgba(200,210,230,.4)'}}>
                {isLoaded ? '● arquivo importado' : '○ som padrão do jogo'}
              </div>
              {errors[key] && (
                <div style={{fontSize:9, color:'#ff5252', marginTop:2}}>{errors[key]}</div>
              )}
            </div>

            <label style={{
              background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.15)',
              borderRadius:6, padding:'4px 8px', fontSize:10, color:'#e8eaf6',
              cursor:'pointer', whiteSpace:'nowrap',
            }}>
              Trocar
              <input
                type="file"
                accept=".mp3,.wav,.ogg,.m4a,audio/*"
                onChange={handleFile(key)}
                style={{ display:'none' }}
              />
            </label>

            {isLoaded && (
              <button
                onClick={() => removeAudio(key)}
                title="Voltar ao som padrão"
                style={{
                  background:'transparent', border:'none', color:'rgba(255,255,255,.5)',
                  fontSize:13, cursor:'pointer', padding:'0 2px',
                }}
              >✕</button>
            )}
          </div>
        )
      })}

      <div style={{marginTop:6, fontSize:9, color:'rgba(200,210,230,.3)', lineHeight:1.5}}>
        💡 Motor e turbo trocam em tempo real, mesmo durante a corrida. Os demais sons valem a partir da próxima vez que forem disparados.
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENTE PLAYER DE MÚSICA — agora com import de arquivo local também
// ─────────────────────────────────────────────────────────────────────────────
export function MusicPlayer({ visible }) {
  const [url,     setUrl]     = useState('')
  const [input,   setInput]   = useState('')
  const [playing, setPlaying] = useState(false)
  const [volume,  setVolume]  = useState(0.5)
  const [error,   setError]   = useState('')
  const [title,   setTitle]   = useState('')
  const audioRef = useRef(null)
  const localUrlRef = useRef(null) // pra revogar o object URL antigo

  const presets = [
    { label: '🏎️ F1 Rocks',    url: 'https://streams.radiomast.io/f1-rock' },
    { label: '🎸 Rock FM BR',   url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/ROCK989_SC' },
    { label: '⚡ Eletrônica',   url: 'https://stream.zeno.fm/0r0xa792kwzuv' },
    { label: '🎵 Lo-fi Hip Hop',url: 'https://stream.zeno.fm/f3wvbbqmdg8uv' },
  ]

  const loadUrl = useCallback((rawUrl, displayTitle) => {
    setError('')
    const finalUrl = rawUrl.trim()
    if (!finalUrl) return

    if (finalUrl.includes('youtube.com') || finalUrl.includes('youtu.be')) {
      setError('❌ YouTube bloqueia acesso direto. Cole um link de MP3 ou rádio online.')
      return
    }

    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    const audio = new Audio()
    audio.crossOrigin = 'anonymous'
    audio.volume = volume
    audio.loop   = true
    audio.src    = finalUrl

    audio.oncanplay = () => {
      audio.play().then(() => {
        setPlaying(true)
        setTitle(displayTitle || finalUrl.split('/').pop().split('?')[0] || 'Streaming...')
        setError('')
      }).catch(() => setError('❌ Não foi possível reproduzir. Verifique o link.'))
    }
    audio.onerror = () => setError('❌ URL inválida, formato não suportado ou sem permissão CORS.')
    audioRef.current = audio
    audio.load()
  }, [volume])

  // Importa um arquivo de música local (.mp3/.wav/.ogg/.m4a)
  const handleLocalFile = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current)
    const objectUrl = URL.createObjectURL(file)
    localUrlRef.current = objectUrl
    setInput('')
    setUrl(objectUrl)
    loadUrl(objectUrl, file.name)
  }

  const togglePlay = () => {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { audioRef.current.play().then(() => setPlaying(true)).catch(() => {}) }
  }

  const changeVolume = (v) => {
    setVolume(v)
    if (audioRef.current) audioRef.current.volume = v
  }

  useEffect(() => () => {
    audioRef.current?.pause()
    if (localUrlRef.current) URL.revokeObjectURL(localUrlRef.current)
  }, [])

  if (!visible) return null

  return (
    <div style={{
      position:'absolute', bottom:70, right:16,
      background:'rgba(5,8,16,.95)', border:'1px solid rgba(255,255,255,.1)',
      borderRadius:14, padding:14, width:270, zIndex:20,
      fontFamily:'Inter,sans-serif', boxShadow:'0 8px 32px rgba(0,0,0,.5)',
    }}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <span style={{fontSize:16}}>🎵</span>
        <span style={{fontSize:12,fontWeight:600,color:'#e8eaf6',letterSpacing:.5}}>MÚSICA</span>
        {playing && (
          <span style={{marginLeft:'auto',fontSize:10,color:'#00ff88',animation:'pulse 1s infinite'}}>
            ● AO VIVO
          </span>
        )}
      </div>

      {/* Importar arquivo local */}
      <div style={{marginBottom:10}}>
        <div style={{fontSize:10,color:'rgba(200,210,230,.5)',marginBottom:4,letterSpacing:.5}}>
          ARQUIVO LOCAL
        </div>
        <label style={{
          display:'block', textAlign:'center', background:'rgba(255,255,255,.07)',
          border:'1px dashed rgba(255,255,255,.2)', borderRadius:7, padding:'8px',
          color:'#e8eaf6', fontSize:11, cursor:'pointer',
        }}>
          📂 Escolher .mp3 / .wav / .ogg
          <input type="file" accept=".mp3,.wav,.ogg,.m4a,audio/*" onChange={handleLocalFile} style={{ display:'none' }} />
        </label>
      </div>

      {/* Input de URL */}
      <div style={{marginBottom:8}}>
        <div style={{fontSize:10,color:'rgba(200,210,230,.5)',marginBottom:4,letterSpacing:.5}}>
          OU LINK DE MP3 / RÁDIO ONLINE
        </div>
        <div style={{display:'flex',gap:6}}>
          <input
            value={input}
            onChange={e=>setInput(e.target.value)}
            onKeyDown={e=>{if(e.key==='Enter'){setUrl(input);loadUrl(input)}}}
            placeholder="https://... .mp3 ou stream"
            style={{
              flex:1, background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.12)',
              borderRadius:7, padding:'6px 10px', color:'#e8eaf6', fontSize:11, outline:'none',
            }}
          />
          <button onClick={()=>{setUrl(input);loadUrl(input)}} style={{
            background:'#e53935',border:'none',borderRadius:7,padding:'6px 10px',
            color:'#fff',fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',
          }}>▶ IR</button>
        </div>
      </div>

      {error && (
        <div style={{fontSize:10,color:'#ff5252',marginBottom:8,lineHeight:1.5,
          background:'rgba(255,82,82,.1)',borderRadius:6,padding:'4px 8px'}}>
          {error}
        </div>
      )}

      <div style={{marginBottom:10}}>
        <div style={{fontSize:10,color:'rgba(200,210,230,.5)',marginBottom:5,letterSpacing:.5}}>
          RÁDIOS RÁPIDAS
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
          {presets.map(p=>(
            <button key={p.label} onClick={()=>{setInput(p.url);setUrl(p.url);loadUrl(p.url)}} style={{
              background:'rgba(255,255,255,.07)', border:'1px solid rgba(255,255,255,.12)',
              borderRadius:20, padding:'3px 9px', color:'rgba(200,210,230,.8)',
              fontSize:10, cursor:'pointer', transition:'all .15s',
            }}
            onMouseEnter={e=>e.target.style.background='rgba(229,57,53,.3)'}
            onMouseLeave={e=>e.target.style.background='rgba(255,255,255,.07)'}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {audioRef.current && (
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <button onClick={togglePlay} style={{
            width:34,height:34,borderRadius:'50%',background:playing?'#e53935':'rgba(255,255,255,.15)',
            border:'none',color:'#fff',fontSize:14,cursor:'pointer',display:'flex',
            alignItems:'center',justifyContent:'center',flexShrink:0,
          }}>{playing?'⏸':'▶'}</button>
          <div style={{flex:1}}>
            <div style={{fontSize:10,color:'rgba(200,210,230,.6)',marginBottom:3,
              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
              {title || 'Carregando...'}
            </div>
            <input type="range" min={0} max={1} step={0.01} value={volume}
              onChange={e=>changeVolume(Number(e.target.value))}
              style={{width:'100%',height:3,accentColor:'#e53935',cursor:'pointer'}}/>
          </div>
          <span style={{fontSize:9,color:'rgba(200,210,230,.4)',minWidth:28,textAlign:'right'}}>
            {Math.round(volume*100)}%
          </span>
        </div>
      )}

      <div style={{marginTop:10,fontSize:9,color:'rgba(200,210,230,.3)',lineHeight:1.5}}>
        💡 YouTube não funciona (bloqueio). Use arquivo local ou link .mp3 direto.
      </div>
    </div>
  )
}
