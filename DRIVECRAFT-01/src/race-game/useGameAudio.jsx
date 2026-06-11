/**
 * useGameAudio.js — Sistema de áudio completo do jogo
 *
 * Sons do motor: Web Audio API sintética (osciladores) — funciona offline
 * Música: <audio> HTML com qualquer URL pública de MP3/OGG/stream
 *
 * YouTube direto NÃO funciona (CORS + ToS).
 * Funciona com:
 *   • Links diretos de .mp3/.ogg/.wav/.m4a
 *   • SoundCloud (links embed/stream)
 *   • Radio online (ex: https://streams.radiomast.io/...)
 *   • Qualquer servidor que permita CORS
 */

import { useRef, useEffect, useCallback, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────────
//  ENGINE AUDIO — sintético via Web Audio API
//  Cria 3 osciladores em camadas simulando motor de carro:
//    1. Base grave (frequência fundamental)
//    2. Harmônico médio (2x)
//    3. Ruído de escape/fricção
// ─────────────────────────────────────────────────────────────────────────────
function createEngineAudio() {
  let ctx = null, baseOsc = null, harmOsc = null, noiseNode = null
  let baseGain = null, harmGain = null, noiseGain = null, masterGain = null
  let running = false

  function start() {
    if (running) return
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      masterGain = ctx.createGain()
      masterGain.gain.value = 0.0
      masterGain.connect(ctx.destination)

      // Oscilador base — grave (motor em idle ~60Hz, sobe com velocidade)
      baseOsc = ctx.createOscillator()
      baseOsc.type = 'sawtooth'
      baseOsc.frequency.value = 60
      baseGain = ctx.createGain()
      baseGain.gain.value = 0.55
      baseOsc.connect(baseGain)
      baseGain.connect(masterGain)
      baseOsc.start()

      // Harmônico — médio (dobro da freq + distorção)
      harmOsc = ctx.createOscillator()
      harmOsc.type = 'square'
      harmOsc.frequency.value = 120
      harmGain = ctx.createGain()
      harmGain.gain.value = 0.25
      // Leve distorção via WaveShaper
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

      // Ruído branco — simula fricção/escape
      const bufLen = ctx.sampleRate * 2
      const noiseBuffer = ctx.createBuffer(1, bufLen, ctx.sampleRate)
      const data = noiseBuffer.getChannelData(0)
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1
      noiseNode = ctx.createBufferSource()
      noiseNode.buffer = noiseBuffer
      noiseNode.loop = true
      // Filtro passa-baixa no ruído para soar como escapamento
      const biquad = ctx.createBiquadFilter()
      biquad.type = 'lowpass'
      biquad.frequency.value = 800
      noiseGain = ctx.createGain()
      noiseGain.gain.value = 0
      noiseNode.connect(biquad)
      biquad.connect(noiseGain)
      noiseGain.connect(masterGain)
      noiseNode.start()

      running = true
    } catch (e) {
      console.warn('AudioContext não disponível:', e)
    }
  }

  function stop() {
    if (!running || !ctx) return
    try {
      baseOsc?.stop(); harmOsc?.stop(); noiseNode?.stop()
      ctx.close()
    } catch (_) {}
    running = false; ctx = null
  }

  /**
   * update(kmh, braking, turbo)
   *  kmh     : velocidade em km/h (0–180)
   *  braking : boolean — freio pressionado
   *  turbo   : boolean — turbo ativo
   */
  function update(kmh, braking, turbo) {
    if (!running || !ctx) return
    const t = ctx.currentTime
    const smooth = 0.06  // segundos de rampa suave

    // RPM simulado: 800rpm idle, sobe com velocidade
    const rpmRatio = Math.min(1, kmh / 120)
    const rpm = 800 + rpmRatio * 5200
    const freqBase = rpm / 60  // Hz = RPM/60 (1 ciclo por revolução)

    // Se tiver turbo, adiciona sobretom
    const turboMult = turbo ? 1.35 : 1.0

    baseOsc.frequency.setTargetAtTime(freqBase * turboMult, t, smooth)
    harmOsc.frequency.setTargetAtTime(freqBase * 2 * turboMult, t, smooth)

    // Volume master: cresce com velocidade, reduz em frenagem brusca
    const volBase = braking ? 0.25 : (0.18 + rpmRatio * 0.55)
    masterGain.gain.setTargetAtTime(volBase * (turbo ? 1.2 : 1.0), t, smooth)

    // Ruído de escape sobe em alta rotação
    noiseGain.gain.setTargetAtTime(rpmRatio * 0.18, t, smooth)
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume()
  }

  return { start, stop, update, resume }
}

// ─────────────────────────────────────────────────────────────────────────────
//  SOUNDS SFX — efeitos pontuais (freio, turbo, meta)
//  Gerados sinteticamente — sem arquivos externos
// ─────────────────────────────────────────────────────────────────────────────
function playSfx(type) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const g   = ctx.createGain()
    g.connect(ctx.destination)

    if (type === 'brake') {
      // Chiado de pneu — ruído passa-banda
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate)
      const d   = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = (Math.random()*2-1) * (1 - i/d.length)
      const src = ctx.createBufferSource(); src.buffer = buf
      const bp  = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=4000; bp.Q.value=2
      g.gain.setValueAtTime(0.4, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.55)
      src.connect(bp); bp.connect(g); src.start()
      setTimeout(() => ctx.close(), 700)
    }

    if (type === 'turbo') {
      // Whoosh de turbo — freq subindo
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(200, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.3)
      g.gain.setValueAtTime(0.18, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      osc.connect(g); osc.start(); osc.stop(ctx.currentTime + 0.4)
      setTimeout(() => ctx.close(), 500)
    }

    if (type === 'lap') {
      // Beep de volta completada
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
      // Fanfarra de chegada
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
  const engineRef   = useRef(null)
  const prevBraking = useRef(false)
  const prevTurbo   = useRef(false)
  const musicRef    = useRef(null)

  // Inicia o motor de áudio (precisa de interação do usuário)
  const startEngine = useCallback(() => {
    if (!engineRef.current) engineRef.current = createEngineAudio()
    engineRef.current.start()
    engineRef.current.resume()
  }, [])

  const stopEngine = useCallback(() => {
    engineRef.current?.stop()
    engineRef.current = null
  }, [])

  // Atualiza sons do motor a cada frame
  const updateEngine = useCallback((kmh, braking, turbo) => {
    if (!engineRef.current) return
    engineRef.current.resume()
    engineRef.current.update(kmh, braking, turbo)

    // SFX pontual de freio (só quando COMEÇA a freiar)
    if (braking && !prevBraking.current && kmh > 30) playSfx('brake')
    prevBraking.current = braking

    // SFX de turbo (só quando ATIVA)
    if (turbo && !prevTurbo.current) playSfx('turbo')
    prevTurbo.current = turbo
  }, [])

  const playLap    = useCallback(() => playSfx('lap'),       [])
  const playFinish = useCallback(() => playSfx('finish'),    [])
  const playCount  = useCallback(() => playSfx('countdown'), [])
  const playGo     = useCallback(() => playSfx('go'),        [])

  // Cleanup ao desmontar
  useEffect(() => () => {
    stopEngine()
    if (musicRef.current) { musicRef.current.pause(); musicRef.current = null }
  }, [stopEngine])

  return { startEngine, stopEngine, updateEngine, playLap, playFinish, playCount, playGo, musicRef }
}

// ─────────────────────────────────────────────────────────────────────────────
//  COMPONENTE PLAYER DE MÚSICA
// ─────────────────────────────────────────────────────────────────────────────
export function MusicPlayer({ visible }) {
  const [url,     setUrl]     = useState('')
  const [input,   setInput]   = useState('')
  const [playing, setPlaying] = useState(false)
  const [volume,  setVolume]  = useState(0.5)
  const [error,   setError]   = useState('')
  const [title,   setTitle]   = useState('')
  const audioRef = useRef(null)

  // Sugestões de rádios/streams grátis
  const presets = [
    { label: '🏎️ F1 Rocks',    url: 'https://streams.radiomast.io/f1-rock' },
    { label: '🎸 Rock FM BR',   url: 'https://playerservices.streamtheworld.com/api/livestream-redirect/ROCK989_SC' },
    { label: '⚡ Eletrônica',   url: 'https://stream.zeno.fm/0r0xa792kwzuv' },
    { label: '🎵 Lo-fi Hip Hop',url: 'https://stream.zeno.fm/f3wvbbqmdg8uv' },
  ]

  const loadUrl = useCallback((rawUrl) => {
    setError('')
    const finalUrl = rawUrl.trim()
    if (!finalUrl) return

    // Rejeita YouTube
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
        setTitle(finalUrl.split('/').pop().split('?')[0] || 'Streaming...')
        setError('')
      }).catch(() => setError('❌ Não foi possível reproduzir. Verifique o link.'))
    }
    audio.onerror = () => setError('❌ URL inválida ou sem permissão CORS. Tente um link .mp3 direto.')
    audioRef.current = audio
    audio.load()
  }, [volume])

  const togglePlay = () => {
    if (!audioRef.current) return
    if (playing) { audioRef.current.pause(); setPlaying(false) }
    else { audioRef.current.play().then(() => setPlaying(true)).catch(() => {}) }
  }

  const changeVolume = (v) => {
    setVolume(v)
    if (audioRef.current) audioRef.current.volume = v
  }

  useEffect(() => () => { audioRef.current?.pause() }, [])

  if (!visible) return null

  return (
    <div style={{
      position:'absolute', bottom:70, right:16,
      background:'rgba(5,8,16,.95)', border:'1px solid rgba(255,255,255,.1)',
      borderRadius:14, padding:14, width:270, zIndex:20,
      fontFamily:'Inter,sans-serif', boxShadow:'0 8px 32px rgba(0,0,0,.5)',
    }}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
        <span style={{fontSize:16}}>🎵</span>
        <span style={{fontSize:12,fontWeight:600,color:'#e8eaf6',letterSpacing:.5}}>MÚSICA</span>
        {playing && (
          <span style={{marginLeft:'auto',fontSize:10,color:'#00ff88',animation:'pulse 1s infinite'}}>
            ● AO VIVO
          </span>
        )}
      </div>

      {/* Input de URL */}
      <div style={{marginBottom:8}}>
        <div style={{fontSize:10,color:'rgba(200,210,230,.5)',marginBottom:4,letterSpacing:.5}}>
          LINK DE MP3 OU RÁDIO ONLINE
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

      {/* Erro */}
      {error && (
        <div style={{fontSize:10,color:'#ff5252',marginBottom:8,lineHeight:1.5,
          background:'rgba(255,82,82,.1)',borderRadius:6,padding:'4px 8px'}}>
          {error}
        </div>
      )}

      {/* Presets de rádio */}
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

      {/* Controles */}
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
        💡 YouTube não funciona (bloqueio). Use links .mp3 diretos ou rádios online.
      </div>
    </div>
  )
}
