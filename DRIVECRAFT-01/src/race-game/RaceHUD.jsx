/**
 * RaceHUD.jsx — v4 com novos controles
 */
import MiniMap from './MiniMap'

const CAMERA_LABELS = {
  follow:    '📷 3ª Pessoa',
  cockpit:   '🎮 Cockpit',
  side:      '➡ Lateral',
  top:       '🔼 Topo',
  cinematic: '🎬 Cinemático',
}

function formatTime(t) {
  const m = Math.floor(t / 60)
  const s = (t % 60).toFixed(2).padStart(5,'0')
  return `${m}:${s}`
}

export default function RaceHUD({
  speed, lapData, bestLap, totalTime,
  cameraAngle, showMap, carPos,
  paused, showMusic,
  onTogglePause, onCycleCamera, onToggleMap, onToggleMusic,
  onRestart, onBack,
}) {
  const lapPercent = Math.min(100,(lapData.current/lapData.total)*100)
  const prevLap    = lapData.times[lapData.times.length-1]

  return (
    <div className={`race-hud${paused?' hud-paused':''}`}>

      {/* Velocímetro */}
      <div className="hud-speedometer">
        <div className="spd-arc">
          <svg viewBox="0 0 120 70" width="120" height="70">
            <path d="M 10 65 A 55 55 0 0 1 110 65" fill="none" stroke="#ffffff15" strokeWidth="8" strokeLinecap="round"/>
            <path d="M 10 65 A 55 55 0 0 1 110 65" fill="none" stroke="var(--race-accent)" strokeWidth="8"
              strokeLinecap="round" strokeDasharray="173"
              strokeDashoffset={173-(speed/165)*173} style={{transition:'stroke-dashoffset 0.1s'}}/>
          </svg>
          <div className="spd-num">{Math.round(speed)}</div>
          <div className="spd-unit">km/h</div>
        </div>
      </div>

      {/* Voltas e tempo */}
      <div className="hud-top-center">
        <div className="hud-lap-counter">
          <span className="hlc-current">Volta {lapData.current+1}</span>
          <span className="hlc-sep">/</span>
          <span className="hlc-total">{lapData.total}</span>
        </div>
        <div className="hud-total-time">{formatTime(totalTime)}</div>
        {prevLap && (
          <div className="hud-prev-lap">Última: <span className={bestLap===prevLap?'gold':''}>{formatTime(prevLap)}</span></div>
        )}
      </div>

      {/* Melhor volta */}
      <div className="hud-top-right">
        <div className="hud-best">
          <div className="hud-best-label">⭐ Melhor Volta</div>
          <div className="hud-best-val">{bestLap?formatTime(bestLap):'--:--'}</div>
        </div>
      </div>

      {/* Controles teclado — canto inferior esquerdo */}
      <div style={{
        position:'absolute', bottom:70, left:14,
        background:'rgba(5,8,16,.8)', border:'1px solid rgba(255,255,255,.08)',
        borderRadius:10, padding:'8px 12px',
        fontFamily:'Inter,sans-serif', fontSize:11, color:'rgba(200,210,230,.6)',
        pointerEvents:'none', lineHeight:1.8,
      }}>
        <div style={{color:'rgba(200,210,230,.9)',fontWeight:600,marginBottom:4,letterSpacing:1,fontSize:10}}>CONTROLES</div>
        <div><kbd style={kbdStyle}>W/↑</kbd> Acelerar &nbsp; <kbd style={kbdStyle}>S/↓</kbd> Frear</div>
        <div><kbd style={kbdStyle}>A/D</kbd> Direção &nbsp; <kbd style={kbdStyle}>R</kbd> Resetar</div>
        <div><kbd style={kbdStyle}>Shift</kbd> Turbo ⚡ &nbsp; <kbd style={kbdStyle}>Space</kbd> F.Mão</div>
        <div><kbd style={kbdStyle}>C</kbd> Câmera &nbsp; <kbd style={kbdStyle}>M</kbd> Mapa &nbsp; <kbd style={kbdStyle}>H</kbd> Faróis</div>
        <div><kbd style={kbdStyle}>N</kbd> Música 🎵</div>
        <div><kbd style={kbdStyle}>P/Esc</kbd> Pausar</div>
      </div>

      {/* Barra de volta */}
      <div className="hud-lap-bar"><div className="hlb-fill" style={{width:`${lapPercent}%`}}/></div>

      {/* Mini-mapa */}
      {showMap && <div className="hud-minimap"><MiniMap carPos={carPos}/></div>}

      {/* Botões HUD */}
      <div className="hud-controls">
        <button className="hud-ctrl-btn" onClick={onTogglePause} title="Pausar (P)">{paused?'▶':'⏸'}</button>
        <button className="hud-ctrl-btn" onClick={onCycleCamera} title="Câmera (C)">📷</button>
        <button className="hud-ctrl-btn" onClick={onToggleMap}   title="Mapa (M)">🗺</button>
        <button className={`hud-ctrl-btn${showMusic ? " active" : ""}`} onClick={onToggleMusic} title="Música (N)">🎵</button>
        <button className="hud-ctrl-btn hud-ctrl-danger" onClick={onRestart} title="Reiniciar">🔄</button>
      </div>

      <div className="hud-cam-label">{CAMERA_LABELS[cameraAngle]}</div>

      {paused && (
        <div className="pause-overlay">
          <div className="pause-panel">
            <div className="pause-title">⏸ Pausado</div>
            <button className="race-btn race-btn-primary" onClick={onTogglePause}>▶ Continuar</button>
            <button className="race-btn race-btn-secondary" onClick={onRestart}>🔄 Reiniciar</button>
            <button className="race-btn race-btn-ghost" onClick={onBack}>← Configurador</button>
          </div>
        </div>
      )}
    </div>
  )
}

const kbdStyle = {
  display:'inline-flex', alignItems:'center', justifyContent:'center',
  background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.22)',
  borderRadius:4, padding:'1px 5px', fontSize:10, color:'rgba(220,230,245,.9)',
  fontFamily:'inherit', minWidth:20,
}
