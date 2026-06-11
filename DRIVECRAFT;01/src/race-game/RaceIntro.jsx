/**
 * RaceIntro.jsx — v4 com novos controles
 */
export default function RaceIntro({ carConfig, onStart, onBack }) {
  const specs = [
    { label:'Motor',      value:'595cc Turbo' },
    { label:'Potência',   value:'75 cv' },
    { label:'0-100 km/h', value:'10.5s' },
    { label:'Top Speed',  value:'165 km/h' },
  ]
  const finishName = {
    glossy:'Brilhante', matte:'Fosco', satin:'Acetinado',
    chrome:'Cromado', pearlescent:'Perolado',
  }
  return (
    <div className="race-intro">
      <div className="intro-panel">
        <div className="intro-header">
          <div className="intro-logo">3D<span>CHANGER</span></div>
          <div className="intro-badge">🏁 MODO PISTA</div>
        </div>
        <h1 className="intro-title">Teste na Pista</h1>
        <p className="intro-sub">Coloque seu Fiat 500 à prova no circuito clássico</p>

        <div className="intro-car-card">
          <div className="icc-color-bar" style={{background:carConfig.bodyColor}}/>
          <div className="icc-body">
            <div className="icc-name">Fiat 500 Classic</div>
            <div className="icc-config">
              <span className="icc-tag" style={{background:carConfig.bodyColor+'33',borderColor:carConfig.bodyColor}}>
                🎨 {carConfig.bodyColor.toUpperCase()}
              </span>
              <span className="icc-tag">✨ {finishName[carConfig.finish]||carConfig.finish}</span>
            </div>
          </div>
          <div className="icc-rim" style={{background:carConfig.rimColor}}/>
        </div>

        <div className="intro-specs">
          {specs.map(s=>(
            <div key={s.label} className="ispec">
              <div className="ispec-val">{s.value}</div>
              <div className="ispec-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="intro-track-info">
          <div className="track-meta">
            <span>🏟️ Circuito Cidade</span><span>•</span>
            <span>3 voltas</span><span>•</span><span>~800m</span>
          </div>
          <div className="track-controls" style={{gridTemplateColumns:'1fr 1fr',gap:'3px 12px'}}>
            <div className="ctrl-row"><kbd>W</kbd>/<kbd>↑</kbd> Acelerar</div>
            <div className="ctrl-row"><kbd>S</kbd>/<kbd>↓</kbd> Frear / Ré</div>
            <div className="ctrl-row"><kbd>A</kbd><kbd>D</kbd> Direção</div>
            <div className="ctrl-row"><kbd>Shift</kbd> ⚡ Turbo</div>
            <div className="ctrl-row"><kbd>Space</kbd> 🅿 Freio de mão</div>
            <div className="ctrl-row"><kbd>R</kbd> Resetar posição</div>
            <div className="ctrl-row"><kbd>C</kbd> Mudar câmera</div>
            <div className="ctrl-row"><kbd>M</kbd> 🗺 Mapa cidade</div>
            <div className="ctrl-row"><kbd>H</kbd> 💡 Faróis</div>
            <div className="ctrl-row"><kbd>P</kbd>/<kbd>Esc</kbd> Pausar</div>
          </div>
        </div>

        <div className="intro-actions">
          <button className="race-btn race-btn-primary race-btn-big" onClick={onStart}>
            🏁 Iniciar Corrida
          </button>
          <button className="race-btn race-btn-ghost" onClick={onBack}>
            ← Voltar ao Configurador
          </button>
        </div>
      </div>
    </div>
  )
}
