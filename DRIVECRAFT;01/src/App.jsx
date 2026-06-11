/**
 * App.jsx — v5 com upload de GLB direto pelo site
 *
 * NOVIDADES:
 *  🚗 Upload de qualquer .glb direto pelo navegador (botão ou drag & drop)
 *  🚗 Seletor de modelos na sidebar — troca de carro com um clique
 *  🚗 Escala automática ajustável por modelo
 *  🚗 Fiat 500 já vem pré-carregado
 *  ✅ Integração total com RaceGame, Scene, CarModel existentes
 */

import { useState, useCallback, useRef, useEffect, Suspense } from 'react'
import Scene   from './components/Scene'
import RaceGame from './race-game/RaceGame'

// ══════════════════════════════════════════════════════
//  MODELOS PRÉ-CADASTRADOS
//  Para adicionar: jogue o .glb em public/models/ e adicione uma linha aqui
// ══════════════════════════════════════════════════════
const BUILTIN_MODELS = [
  {
    id:    'fiat500f',
    name:  'Fiat 500 Classic',
    icon:  '🚗',
    path:  '/models/fiat500f.glb',
    scale: 100,
  },
  {
    id:    'gol_gti',
    name:  'VW Gol GTI G2 1999',
    icon:  '🏎️',
    path:  '/models/1999_volkswagen_gol_2000_gti_g2.glb',
    scale: 1,
  },
  {
    id:    'bmw_x3',
    name:  'BMW X3 M40i',
    icon:  '🚙',
    path:  '/models/bmw_x3_m40i.glb',
    scale: 1,
  },
  {
    id:    'bmw_z8',
    name:  'BMW Z8',
    icon:  '🏁',
    path:  '/models/bmw_z8__www_vecarz_com.glb',
    scale: 1,
  },
  {
    id:    'kadett',
    name:  'Chevrolet Kadett',
    icon:  '🚘',
    path:  '/models/chevrolet_kadett_brasileiro.glb',
    scale: 1,
  },
]

// ══════════════════════════════════════════════════════
//  DATA
// ══════════════════════════════════════════════════════
const BODY_COLORS = [
  { label:'Branco Perolado',  v:'#F0EFE8' }, { label:'Preto Fosco',     v:'#1A1A1A' },
  { label:'Vermelho Alfa',    v:'#C0392B' }, { label:'Azul Glacier',    v:'#2980B9' },
  { label:'Prata Metálico',   v:'#95A5A6' }, { label:'Verde Floresta',  v:'#27AE60' },
  { label:'Amarelo Sport',    v:'#F39C12' }, { label:'Laranja Tocha',   v:'#E67E22' },
  { label:'Roxo Metálico',    v:'#8E44AD' }, { label:'Cinza Grafite',   v:'#555555' },
  { label:'Azul Navy',        v:'#1B3A6B' }, { label:'Rosa Chiclete',   v:'#E91E8C' },
  { label:'Dourado',          v:'#C9A93B' }, { label:'Titanium',        v:'#4A4E69' },
  { label:'Verde Militar',    v:'#4A5240' }, { label:'Vermelho Ferrari', v:'#FF2800' },
  { label:'Turquesa',         v:'#00BCD4' }, { label:'Champanhe',       v:'#E8D5B7' },
]
const RIM_COLORS = [
  { label:'Cromado',       v:'#d4d4d4' }, { label:'Preto Brilh.', v:'#111111' },
  { label:'Dourado',       v:'#c9a93b' }, { label:'Bronze',        v:'#8B6914' },
  { label:'Prata',         v:'#aaaaaa' }, { label:'Azul Escuro',   v:'#1a237e' },
  { label:'Vermelho',      v:'#b71c1c' }, { label:'Grafite',       v:'#424242' },
  { label:'Cobre',         v:'#b87333' }, { label:'Titan.',        v:'#587B7F' },
  { label:'Verde Militar', v:'#4E5D2E' }, { label:'Branco',        v:'#f5f5f5' },
]
const CALIPER_COLORS = [
  { label:'Vermelho', v:'#e53935' }, { label:'Amarelo',   v:'#f9a825' },
  { label:'Azul',     v:'#1565C0' }, { label:'Preto',     v:'#1a1a1a' },
  { label:'Branco',   v:'#f5f5f5' }, { label:'Verde',     v:'#2e7d32' },
  { label:'Laranja',  v:'#E65100' }, { label:'Roxo',      v:'#6A1B9A' },
  { label:'Rosa',     v:'#AD1457' }, { label:'Dourado',   v:'#F57F17' },
  { label:'Prata',    v:'#9E9E9E' }, { label:'Ciano',     v:'#00BCD4' },
]
const DESIGNS = [
  { id:'none',    label:'Sem Design',  bg:'#1a2030',                                                      icon:'○' },
  { id:'flames',  label:'Chamas',      bg:'linear-gradient(135deg,#ff4500,#ff8c00)',                       icon:'🔥' },
  { id:'stripes', label:'Listras',     bg:'repeating-linear-gradient(90deg,#fff 0,#fff 10px,transparent 10px,transparent 24px)', icon:'⚡' },
  { id:'tribal',  label:'Tribal',      bg:'linear-gradient(135deg,#1a1a1a,#333)',                          icon:'⬡' },
  { id:'racing',  label:'Racing',      bg:'linear-gradient(180deg,#e53935,#111)',                          icon:'🏁' },
  { id:'camo',    label:'Camuflagem',  bg:'linear-gradient(135deg,#4A5240,#6B7A5A,#3D4435)',              icon:'🌿' },
  { id:'carbon',  label:'Carbono',     bg:'repeating-linear-gradient(45deg,#222 0,#222 5px,#333 5px,#333 10px)', icon:'⬛' },
  { id:'chrome',  label:'Cromo',       bg:'linear-gradient(135deg,#ccc,#eee,#999)',                       icon:'🪞' },
  { id:'galaxy',  label:'Galáxia',     bg:'radial-gradient(circle at 30% 40%,#2C1D6B,#080B10)',           icon:'🌌' },
]
const PARTS = [
  { id:'body',    label:'Carroceria' }, { id:'roof',    label:'Teto'          },
  { id:'hood',    label:'Capô'       }, { id:'doors',   label:'Portas'        },
  { id:'trunk',   label:'Porta-Malas'}, { id:'bumpers', label:'Para-choques'  },
]
const ENVS = [
  { id:'studio', icon:'🌟', name:'Estúdio'  },
  { id:'garage', icon:'🏭', name:'Garagem'  },
  { id:'street', icon:'🏙️', name:'Rua'      },
  { id:'track',  icon:'🏁', name:'Pista'    },
]
const CAM_PRESETS = {
  front: [0,   1.2,  6.5],
  side:  [6.5, 1.2,  0  ],
  rear:  [0,   1.2, -6.5],
  top:   [0,   7,    2  ],
  low:   [3,   0.5,  5  ],
  diag:  [3.5, 1.8,  5  ],
}
const FINISH_PRESETS = {
  glossy:      { metalness:0.8,  roughness:0.1,  label:'Brilhante',  icon:'✨' },
  matte:       { metalness:0.0,  roughness:0.95, label:'Fosco',      icon:'⬛' },
  satin:       { metalness:0.4,  roughness:0.4,  label:'Acetinado',  icon:'🔘' },
  chrome:      { metalness:1.0,  roughness:0.0,  label:'Cromado',    icon:'🪞' },
  pearlescent: { metalness:0.5,  roughness:0.2,  label:'Perolado',   icon:'🔵' },
}

const INIT = {
  bodyColor:'#C0392B', rimColor:'#d4d4d4', caliperColor:'#e53935',
  metalness:0.8, roughness:0.15, envIntensity:1.6, clearCoat:0.8,
  glassTint:0.15, finish:'glossy', rimFinish:'chrome',
  wheelScale:1.0, suspension:0, steerAngle:0,
  wheelOffsetFront:0, wheelOffsetRear:0,
  rotateWheels:false, wheelRotSpeed:1.0,
  headlightsOn:false, lightColor:'#ffffff', lightIntensity:2.0,
  environment:'studio',
  showWireframe:false, showGrid:false,
  autoRotate:false, fov:45,
  selectedParts: PARTS.map(p=>p.id), selectedAll:true,
  selectedDesign:null,
  designOffsetX:0, designOffsetY:0, designRotation:0, designScale:1.0,
  plateText:'FIA-T500',
}

// ══════════════════════════════════════════════════════
//  SUB-COMPONENTS
// ══════════════════════════════════════════════════════
function Swatch({ color, active, label, onClick }) {
  return (
    <div className={`swatch${active?' active':''}`}
      style={{ background: color }} title={label} onClick={onClick}>
      <div className="swatch-check">✓</div>
    </div>
  )
}
function ColorGrid({ colors, current, onPick }) {
  return (
    <div className="color-grid">
      {colors.map(c => (
        <Swatch key={c.v} color={c.v} active={current===c.v} label={c.label} onClick={()=>onPick(c.v,c.label)} />
      ))}
    </div>
  )
}
function CustomColorRow({ value, onChange }) {
  return (
    <div className="custom-color-row">
      <input type="color" value={value} onInput={e=>onChange(e.target.value)} />
      <span className="hex-display">{value.toUpperCase()}</span>
      <span className="custom-label">custom</span>
    </div>
  )
}
function SliderRow({ label, min, max, step, value, unit='', onChange }) {
  const disp = step < 1 ? parseFloat(value).toFixed(1) : Math.round(value)
  return (
    <div className="slider-row">
      <div className="slider-head">
        <label>{label}</label>
        <span className="slider-val">{disp}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onInput={e=>onChange(parseFloat(e.target.value))} />
    </div>
  )
}
function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="toggle-row">
      <span className="toggle-label">{label}</span>
      <div className={`toggle-sw${checked?' on':''}`} onClick={()=>onChange(!checked)} />
    </div>
  )
}
function SectionLabel({ children }) { return <div className="sec-label">{children}</div> }
function InfoTip({ children })      { return <div className="info-tip">{children}</div> }

// ══════════════════════════════════════════════════════
//  PAINEL DE CARROS — upload + seletor
// ══════════════════════════════════════════════════════
function CarsPanel({ models, activeId, onSelect, onUpload, onRemove, onScaleChange, notify }) {
  const fileRef     = useRef()
  const dropRef     = useRef()
  const [dragging, setDragging] = useState(false)
  const [scaleEdit, setScaleEdit] = useState(null) // id do modelo sendo editado

  const processFile = useCallback((file) => {
    if (!file || !file.name.endsWith('.glb')) {
      notify('❌ Apenas arquivos .glb são aceitos')
      return
    }
    const url  = URL.createObjectURL(file)
    const name = file.name.replace('.glb','').replace(/[-_]/g,' ')
      .replace(/\b\w/g, c => c.toUpperCase())
    const id   = 'upload_' + Date.now()
    onUpload({ id, name, icon:'🚗', path: url, scale: 1.0, isUpload: true, fileName: file.name })
    notify(`✅ "${name}" carregado!`)
  }, [onUpload, notify])

  const handleFileInput = (e) => { processFile(e.target.files[0]); e.target.value = '' }

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false)
    processFile(e.dataTransfer.files[0])
  }

  return (
    <div>
      {/* Drop zone */}
      <div
        ref={dropRef}
        onDragOver={e=>{e.preventDefault();setDragging(true)}}
        onDragLeave={()=>setDragging(false)}
        onDrop={handleDrop}
        onClick={()=>fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? 'var(--accent)' : 'rgba(0,212,255,.28)'}`,
          borderRadius: 12,
          padding: '22px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: 16,
          background: dragging ? 'rgba(0,212,255,.08)' : 'rgba(0,212,255,.03)',
          transition: 'all .2s',
        }}>
        <div style={{fontSize:28, marginBottom:6}}>📂</div>
        <div style={{fontSize:13, fontWeight:600, color:'var(--accent)', marginBottom:3}}>
          Clique ou arraste um .glb
        </div>
        <div style={{fontSize:11, color:'var(--text-muted)'}}>
          O modelo aparece instantaneamente no configurador
        </div>
        <input ref={fileRef} type="file" accept=".glb" style={{display:'none'}} onChange={handleFileInput}/>
      </div>

      {/* Lista de modelos */}
      <SectionLabel>Modelos Disponíveis</SectionLabel>
      <div style={{display:'flex',flexDirection:'column',gap:6}}>
        {models.map(m => (
          <div key={m.id} style={{
            background: activeId===m.id ? 'var(--bg-active)' : 'var(--bg-card)',
            border: `1px solid ${activeId===m.id ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 10,
            padding: '10px 12px',
            cursor: 'pointer',
            transition: 'all .15s',
          }}
          onClick={()=>onSelect(m)}>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:20}}>{m.icon}</span>
              <div style={{flex:1}}>
                <div style={{
                  fontSize:13, fontWeight:600,
                  color: activeId===m.id ? 'var(--accent)' : 'var(--text-primary)',
                }}>{m.name}</div>
                <div style={{fontSize:10,color:'var(--text-muted)',marginTop:1}}>
                  {m.isUpload ? `📁 ${m.fileName}` : '📦 Pré-instalado'}
                </div>
              </div>
              {activeId===m.id && (
                <span style={{fontSize:10,color:'var(--accent)',fontWeight:700,letterSpacing:.5}}>
                  ● ATIVO
                </span>
              )}
              {m.isUpload && (
                <div
                  onClick={e=>{e.stopPropagation();onRemove(m.id);notify(`🗑️ "${m.name}" removido`)}}
                  style={{
                    fontSize:14,cursor:'pointer',color:'var(--text-muted)',padding:'2px 6px',
                    borderRadius:4,transition:'all .15s',
                  }}
                  title="Remover">✕</div>
              )}
            </div>

            {/* Escala — só mostra para o ativo */}
            {activeId===m.id && (
              <div style={{marginTop:10}} onClick={e=>e.stopPropagation()}>
                <div style={{
                  display:'flex',alignItems:'center',justifyContent:'space-between',
                  marginBottom:4,fontSize:11,color:'var(--text-muted)',
                }}>
                  <span>Escala do modelo</span>
                  <span style={{color:'var(--accent)',fontFamily:'var(--font-head)',fontSize:12}}>
                    {m.scale}×
                  </span>
                </div>
                <input type="range" min={0.001} max={200} step={0.001}
                  value={m.scale}
                  onInput={e=>onScaleChange(m.id, parseFloat(e.target.value))}
                  style={{width:'100%'}}
                />
                <div style={{
                  display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:3,marginTop:4
                }}>
                  {[0.01, 1, 100, 200].map(v=>(
                    <button key={v}
                      onClick={()=>onScaleChange(m.id,v)}
                      style={{
                        background:'rgba(0,212,255,.08)',border:'1px solid rgba(0,212,255,.2)',
                        borderRadius:4,padding:'2px 0',fontSize:10,color:'var(--accent)',
                        cursor:'pointer',
                      }}>
                      {v}×
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <InfoTip style={{marginTop:12}}>
        💡 O arquivo .glb fica em memória — não precisa copiar para nenhuma pasta. Ao recarregar a página, modelos enviados somem (isso é normal).
      </InfoTip>
    </div>
  )
}

// ══════════════════════════════════════════════════════
//  PANELS (iguais ao original)
// ══════════════════════════════════════════════════════
function PaintPanel({ s, set, notify }) {
  const finishes = Object.entries(FINISH_PRESETS)
  const finishPreview = {
    glossy:      { background:'#888', boxShadow:'inset 0 4px 8px rgba(255,255,255,.5)' },
    matte:       { background:'#555' },
    satin:       { background:'#777' },
    chrome:      { background:'linear-gradient(135deg,#ccc,#fff,#999)' },
    pearlescent: { background:'linear-gradient(135deg,#a0c4ff,#ffb6c1)' },
  }
  return (
    <>
      <button className={`btn-selectall${s.selectedAll?' sel':''}`}
        onClick={() => {
          const next = !s.selectedAll
          set({ selectedAll:next, selectedParts: next ? PARTS.map(p=>p.id) : [] })
          notify(next ? '✅ Todas as partes selecionadas' : '⬜ Seleção limpa')
        }}>
        {s.selectedAll ? '✅ Todas as Partes Selecionadas' : '⬜ Selecionar Todas as Partes'}
      </button>
      <div className="section">
        <SectionLabel>Partes do Veículo</SectionLabel>
        <div className="chip-wrap">
          {PARTS.map(p => (
            <div key={p.id}
              className={`chip${s.selectedParts.includes(p.id)?' active':''}`}
              onClick={() => {
                const next = s.selectedParts.includes(p.id)
                  ? s.selectedParts.filter(x=>x!==p.id)
                  : [...s.selectedParts, p.id]
                set({ selectedParts:next, selectedAll: next.length===PARTS.length })
              }}>{p.label}</div>
          ))}
        </div>
      </div>
      <div className="section">
        <SectionLabel>Cores de Pintura</SectionLabel>
        <ColorGrid colors={BODY_COLORS} current={s.bodyColor}
          onPick={(v,l) => { set({ bodyColor:v }); notify(`🎨 ${l}`) }} />
        <CustomColorRow value={s.bodyColor} onChange={v=>set({ bodyColor:v })} />
      </div>
      <div className="section">
        <SectionLabel>Tipo de Acabamento</SectionLabel>
        <div className="finish-grid">
          {finishes.map(([id, p]) => (
            <div key={id} className={`finish-btn${s.finish===id?' active':''}`}
              onClick={() => {
                const fp = FINISH_PRESETS[id]
                set({ finish:id, metalness:fp.metalness, roughness:fp.roughness, clearCoat:fp.clearCoat||0.8 })
                notify(`${p.icon} Acabamento: ${p.label}`)
              }}>
              <div className="finish-preview" style={finishPreview[id]} />
              {p.icon} {p.label}
            </div>
          ))}
        </div>
      </div>
      <div className="section">
        <SectionLabel>Material Avançado</SectionLabel>
        <SliderRow label="Metalicidade"     min={0} max={1}  step={0.01} value={s.metalness}    onChange={v=>set({metalness:v})} />
        <SliderRow label="Rugosidade"       min={0} max={1}  step={0.01} value={s.roughness}    onChange={v=>set({roughness:v})} />
        <SliderRow label="Clear Coat"       min={0} max={1}  step={0.01} value={s.clearCoat}    onChange={v=>set({clearCoat:v})} />
        <SliderRow label="Reflexo Ambiente" min={0} max={3}  step={0.1}  value={s.envIntensity} onChange={v=>set({envIntensity:v})} />
      </div>
      <div className="section">
        <SectionLabel>Vidros</SectionLabel>
        <SliderRow label="Tingimento" min={0} max={0.9} step={0.01} value={s.glassTint} onChange={v=>set({glassTint:v})} />
      </div>
    </>
  )
}

function WrapPanel({ s, set, notify }) {
  const hasDesign = s.selectedDesign && s.selectedDesign !== 'none'
  return (
    <>
      <div className="section">
        <SectionLabel>Biblioteca de Designs</SectionLabel>
        <div className="design-grid">
          {DESIGNS.map(d => (
            <div key={d.id}
              className={`design-card${s.selectedDesign===d.id?' active':''}`}
              style={{ background: d.bg }}
              onClick={() => {
                const next = s.selectedDesign===d.id ? null : d.id
                set({ selectedDesign: next })
                notify(next ? `📐 Design: ${d.label}` : '📐 Design removido')
              }}>
              <span style={{ fontSize:26, filter:'drop-shadow(0 2px 4px rgba(0,0,0,.5))' }}>{d.icon}</span>
              <div className="design-label">{d.label}</div>
            </div>
          ))}
        </div>
      </div>
      {hasDesign && (
        <div className="section">
          <SectionLabel>Transformar Design</SectionLabel>
          <div className="transform-box">
            {[
              ['Horizontal', 'designOffsetX',  -100, 100, 1,    ''],
              ['Vertical',   'designOffsetY',  -100, 100, 1,    ''],
              ['Rotação',    'designRotation', -180, 180, 1,    '°'],
              ['Escala',     'designScale',     0.1,   3, 0.05, 'x'],
            ].map(([label, key, min, max, step, unit]) => (
              <div key={key} className="transform-row">
                <label>{label}</label>
                <input type="range" min={min} max={max} step={step} value={s[key]}
                  onInput={e=>set({[key]:parseFloat(e.target.value)})} />
                <span className="tval">{parseFloat(s[key]).toFixed(step<1?2:0)}{unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <InfoTip>💡 O design fica sobre a cor base — você pode alterar a pintura sem perder o adesivo aplicado.</InfoTip>
    </>
  )
}

function WheelsPanel({ s, set, notify }) {
  return (
    <>
      <div className="section">
        <SectionLabel>Cor dos Aros</SectionLabel>
        <ColorGrid colors={RIM_COLORS} current={s.rimColor}
          onPick={(v,l) => { set({rimColor:v}); notify(`🛞 Aro: ${l}`) }} />
        <CustomColorRow value={s.rimColor} onChange={v=>set({rimColor:v})} />
      </div>
      <div className="section">
        <SectionLabel>Acabamento do Aro</SectionLabel>
        <div className="rim-grid">
          {[['chrome','🪞','Cromo'],['plastic','⬛','Plástico'],['brushed','⚙️','Escovado']].map(([id,icon,name]) => (
            <div key={id} className={`rim-card${s.rimFinish===id?' active':''}`}
              onClick={() => { set({rimFinish:id}); notify(`🔧 Acabamento aro: ${name}`) }}>
              <span className="rim-icon">{icon}</span>
              <div className="rim-name">{name}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="section">
        <SectionLabel>Pinças de Freio</SectionLabel>
        <ColorGrid colors={CALIPER_COLORS} current={s.caliperColor}
          onPick={(v,l) => { set({caliperColor:v}); notify(`🔴 Pinça: ${l}`) }} />
        <CustomColorRow value={s.caliperColor} onChange={v=>set({caliperColor:v})} />
      </div>
      <div className="section">
        <SectionLabel>Geometria & Suspensão</SectionLabel>
        <SliderRow label="Escala da Roda"    min={0.7} max={1.5} step={0.01} value={s.wheelScale}       unit="x"  onChange={v=>set({wheelScale:v})} />
        <SliderRow label="Rebaixamento"      min={0}   max={80}  step={1}    value={s.suspension}       unit="mm" onChange={v=>set({suspension:v})} />
        <SliderRow label="Ângulo de Esterço" min={-45} max={45}  step={1}    value={s.steerAngle}       unit="°"  onChange={v=>set({steerAngle:v})} />
        <SliderRow label="Offset Dianteiro"  min={-30} max={30}  step={1}    value={s.wheelOffsetFront} unit="mm" onChange={v=>set({wheelOffsetFront:v})} />
        <SliderRow label="Offset Traseiro"   min={-30} max={30}  step={1}    value={s.wheelOffsetRear}  unit="mm" onChange={v=>set({wheelOffsetRear:v})} />
      </div>
      <div className="section">
        <SectionLabel>Animação</SectionLabel>
        <ToggleRow label="Rotacionar Rodas" checked={s.rotateWheels} onChange={v=>set({rotateWheels:v})} />
        {s.rotateWheels && (
          <SliderRow label="Velocidade" min={0.1} max={5} step={0.1} value={s.wheelRotSpeed} unit="x" onChange={v=>set({wheelRotSpeed:v})} />
        )}
      </div>
    </>
  )
}

function LightsPanel({ s, set, notify }) {
  return (
    <>
      <div className="section">
        <SectionLabel>Faróis</SectionLabel>
        <ToggleRow label="Faróis Dianteiros" checked={s.headlightsOn}
          onChange={v=>{ set({headlightsOn:v}); notify(v?'💡 Faróis ON':'💡 Faróis OFF') }} />
        <ToggleRow label="Névoa (Fog)" checked={s.fogEnabled} onChange={v=>set({fogEnabled:v})} />
      </div>
      {s.headlightsOn && (
        <div className="section">
          <SectionLabel>Configurar Luz</SectionLabel>
          <div className="custom-color-row" style={{ marginBottom:12 }}>
            <input type="color" value={s.lightColor} onInput={e=>set({lightColor:e.target.value})} />
            <span className="hex-display">{s.lightColor.toUpperCase()}</span>
            <span className="custom-label">Cor da Luz</span>
          </div>
          <SliderRow label="Intensidade" min={0.1} max={5} step={0.1} value={s.lightIntensity} onChange={v=>set({lightIntensity:v})} />
        </div>
      )}
      <InfoTip>💡 Para ver melhor os faróis, use o ambiente Garagem ou Pista.</InfoTip>
    </>
  )
}

function EnvPanel({ s, set, notify }) {
  return (
    <>
      <div className="section">
        <SectionLabel>Ambiente de Exibição</SectionLabel>
        <div className="env-grid">
          {ENVS.map(e => (
            <div key={e.id} className={`env-card${s.environment===e.id?' active':''}`}
              onClick={() => { set({environment:e.id}); notify(`🌐 Ambiente: ${e.name}`) }}>
              <span className="env-icon">{e.icon}</span>
              <div className="env-name">{e.name}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="section">
        <SectionLabel>Exposição</SectionLabel>
        <SliderRow label="Reflexo Ambiente" min={0} max={3} step={0.1} value={s.envIntensity} onChange={v=>set({envIntensity:v})} />
      </div>
      <InfoTip>💡 O ambiente altera a iluminação, sombras e reflexos do carro.</InfoTip>
    </>
  )
}

function CameraPanel({ s, set, notify, onCameraGo }) {
  return (
    <>
      <div className="section">
        <SectionLabel>Posições Rápidas</SectionLabel>
        <div className="cam-grid">
          {[['front','⬆','Frontal'],['side','➡','Lateral'],['rear','⬇','Traseira'],
            ['top','🔼','Topo'],['low','🔽','Baixo'],['diag','↗','Diagonal']].map(([id,icon,label]) => (
            <button key={id} className="action-btn"
              onClick={() => { onCameraGo(id); notify(`📷 ${label}`) }}>
              <span className="ab-icon">{icon}</span>{label}
            </button>
          ))}
        </div>
      </div>
      <div className="section">
        <SectionLabel>Opções</SectionLabel>
        <SliderRow label="Campo de Visão (FOV)" min={20} max={90} step={1} value={s.fov} unit="°" onChange={v=>set({fov:v})} />
        <ToggleRow label="Auto-Rotação" checked={s.autoRotate} onChange={v=>set({autoRotate:v})} />
      </div>
    </>
  )
}

function ProjectPanel({ s, set, notify }) {
  return (
    <>
      <div className="section">
        <SectionLabel>Exportar</SectionLabel>
        {[
          ['📸','Screenshot (PNG)', ()=>notify('📸 Use Ctrl+Shift+S para capturar a tela')],
          ['📄','Configuração JSON', ()=>exportJSON(s,notify)],
          ['🔗','Copiar Link',       ()=>notify('🔗 Link copiado!')],
          ['🔄','Resetar Config',    ()=>notify('🔄 Use o botão Reset na toolbar')],
        ].map(([icon,label,fn]) => (
          <button key={label} className="action-btn" onClick={fn}>
            <span className="ab-icon">{icon}</span>{label}
          </button>
        ))}
      </div>
      <div className="section">
        <SectionLabel>Placa do Veículo</SectionLabel>
        <input className="plate-input" maxLength={8} value={s.plateText}
          onInput={e=>set({plateText:e.target.value.toUpperCase()})} placeholder="ABC-1234" />
      </div>
      <div className="section">
        <SectionLabel>Resumo da Configuração</SectionLabel>
        <div className="spec-box">
          {[
            ['Carroceria',  s.bodyColor.toUpperCase()],
            ['Acabamento',  FINISH_PRESETS[s.finish]?.label || s.finish],
            ['Aro',         s.rimColor.toUpperCase()],
            ['Pinça',       s.caliperColor.toUpperCase()],
            ['Design',      s.selectedDesign || 'Nenhum'],
            ['Ambiente',    ENVS.find(e=>e.id===s.environment)?.name || s.environment],
            ['Rebaixamento',`-${s.suspension}mm`],
          ].map(([k,v]) => (
            <div key={k} className="spec-row">
              <span>{k}</span><span className="spec-val">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

function CartPanel({ s }) {
  const items = buildCartItems(s)
  const total = items.reduce((a,i)=>a+i.price,0)
  return (
    <>
      <div className="section">
        <SectionLabel>Itens Selecionados</SectionLabel>
        <div className="spec-box">
          {items.map(i => (
            <div key={i.label} className="spec-row">
              <span>{i.icon} {i.label}</span>
              <span className="spec-val">R$ {i.price.toLocaleString('pt-BR')}</span>
            </div>
          ))}
          <div className="spec-row" style={{ borderTop:'1px solid var(--accent)', marginTop:6, paddingTop:6 }}>
            <span style={{ color:'var(--accent)' }}>TOTAL ESTIMADO</span>
            <span className="spec-val" style={{ color:'var(--accent)', fontSize:15 }}>
              R$ {total.toLocaleString('pt-BR')}
            </span>
          </div>
        </div>
      </div>
      <button className="btn-cart" style={{ width:'100%', padding:'11px', borderRadius:8, fontSize:14 }}>
        🛒 Finalizar Pedido
      </button>
      <InfoTip style={{ marginTop:8 }}>Valores estimados. Sujeito a avaliação técnica presencial.</InfoTip>
    </>
  )
}

// ══════════════════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════════════════
function buildCartItems(s) {
  const items = [{ icon:'🎨', label:'Pintura automotiva', price:1200 }]
  if (s.finish !== 'glossy')           items.push({ icon:'✨', label:`Acabamento ${FINISH_PRESETS[s.finish]?.label}`, price:600 })
  if (s.selectedDesign && s.selectedDesign!=='none') items.push({ icon:'📐', label:`Design ${s.selectedDesign}`, price:890 })
  if (s.rimColor !== '#d4d4d4')        items.push({ icon:'🛞', label:'Aros customizados', price:450 })
  if (s.caliperColor !== '#e53935')    items.push({ icon:'🔴', label:'Pinças coloridas', price:220 })
  if (s.suspension > 0)                items.push({ icon:'⬇', label:`Rebaixamento ${s.suspension}mm`, price:750 })
  if (s.glassTint > 0.3)               items.push({ icon:'🪟', label:'Insulfilm premium', price:380 })
  return items
}
function exportJSON(s, notify) {
  const cfg = {
    bodyColor:s.bodyColor, rimColor:s.rimColor, caliperColor:s.caliperColor,
    finish:s.finish, design:s.selectedDesign, suspension:s.suspension,
    environment:s.environment, wheelScale:s.wheelScale, steerAngle:s.steerAngle,
    metalness:s.metalness, roughness:s.roughness, glassTint:s.glassTint,
  }
  const blob = new Blob([JSON.stringify(cfg,null,2)],{type:'application/json'})
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href=url; a.download='config.json'; a.click()
  URL.revokeObjectURL(url)
  notify('📄 JSON exportado!')
}

const PANEL_META = {
  paint:   ['Pintura & Acabamento',   'Fiat 500 Classic 1967'],
  wrap:    ['Design & Envelopamento', 'Sistema de camadas'],
  wheels:  ['Rodas & Suspensão',      'Aros, pneus e pinças'],
  lights:  ['Sistema de Luzes',       'Faróis e iluminação'],
  env:     ['Ambiente',               'Iluminação de cena'],
  camera:  ['Câmera',                 'Posicionamento e FOV'],
  project: ['Projeto',                'Exportar e configurações'],
  cart:    ['Carrinho',               'Orçamento de customização'],
  cars:    ['Modelos de Carro',       'Upload e seleção de GLB'],
}
const ENV_NAMES = { studio:'Estúdio', garage:'Garagem', street:'Rua', track:'Pista' }

// ══════════════════════════════════════════════════════
//  APP
// ══════════════════════════════════════════════════════
export default function App() {
  const [s, setS]         = useState(INIT)
  const [panel, setPanel] = useState('paint')
  const [toast, setToast] = useState({ msg:'', show:false })
  const [hoverPart, setHoverPart] = useState(null)
  const [loaded, setLoaded]       = useState(false)
  const [camTarget, setCamTarget] = useState(null)
  const [raceMode, setRaceMode]   = useState(false)

  // ── Modelos de carro ─────────────────────────────────
  const [models, setModels]       = useState(BUILTIN_MODELS)
  const [activeModel, setActiveModel] = useState(BUILTIN_MODELS[0])
  // Revoga URLs de blob ao remover modelo
  const blobUrlsRef = useRef({})

  const toastRef = useRef()
  const set = useCallback(patch => setS(prev => ({...prev,...patch})), [])

  const notify = useCallback(msg => {
    setToast({ msg, show:true })
    clearTimeout(toastRef.current)
    toastRef.current = setTimeout(() => setToast(t=>({...t,show:false})), 2500)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setLoaded(true); notify('✅ Modelo carregado!') }, 2200)
    return () => clearTimeout(t)
  }, [activeModel, notify]) // re-loading quando troca modelo

  const handleCameraGo = useCallback(preset => {
    const pos = CAM_PRESETS[preset]
    if (pos) setCamTarget([...pos])
  }, [])

  const handleClickPart = useCallback((partLabel, matName) => {
    const n = matName.toLowerCase()
    if (n.includes('tyre')||n.includes('rim')||n.includes('brake')) {
      setPanel('wheels'); notify(`🛞 ${partLabel} — edite na aba Rodas`)
    } else if (n.includes('light')||n.includes('glass')) {
      setPanel('lights'); notify(`💡 ${partLabel} — edite na aba Luzes`)
    } else {
      setPanel('paint'); notify(`🎨 ${partLabel} — edite na aba Pintura`)
    }
  }, [notify])

  const handleReset = useCallback(() => { setS(INIT); notify('🔄 Configuração resetada!') }, [notify])

  // ── Upload de modelo ──────────────────────────────────
  const handleUpload = useCallback((newModel) => {
    blobUrlsRef.current[newModel.id] = newModel.path
    setModels(prev => [...prev, newModel])
    setActiveModel(newModel)
    setLoaded(false)
    setPanel('paint')
  }, [])

  const handleRemove = useCallback((id) => {
    // Libera a memória do blob
    const url = blobUrlsRef.current[id]
    if (url) { URL.revokeObjectURL(url); delete blobUrlsRef.current[id] }
    setModels(prev => {
      const next = prev.filter(m => m.id !== id)
      return next
    })
    // Se era o ativo, volta para o primeiro
    setActiveModel(prev => prev.id === id ? BUILTIN_MODELS[0] : prev)
  }, [])

  const handleSelectModel = useCallback((model) => {
    setActiveModel(model)
    setLoaded(false)
    notify(`🚗 ${model.name} selecionado`)
  }, [notify])

  const handleScaleChange = useCallback((id, scale) => {
    setModels(prev => prev.map(m => m.id===id ? {...m, scale} : m))
    setActiveModel(prev => prev.id===id ? {...prev, scale} : prev)
  }, [])

  // Cleanup de blobs ao desmontar
  useEffect(() => () => {
    Object.values(blobUrlsRef.current).forEach(URL.revokeObjectURL)
  }, [])

  const [title, subtitle] = PANEL_META[panel] || ['Editor','']
  const price = buildCartItems(s).reduce((a,i)=>a+i.price,0)

  const sideItems = [
    { id:'cars',   icon:'🚗', label:'Carros'   },
    null,
    { id:'paint',  icon:'🎨', label:'Pintura'  },
    { id:'wrap',   icon:'📐', label:'Design'   },
    { id:'wheels', icon:'🛞', label:'Rodas'    },
    { id:'lights', icon:'💡', label:'Luzes'    },
    null,
    { id:'env',    icon:'🌐', label:'Ambiente' },
    { id:'camera', icon:'📷', label:'Câmera'   },
    null,
    { id:'project',icon:'📁', label:'Projeto'  },
    'spacer',
    { id:'cart',   icon:'🛒', label:'Carrinho' },
  ]

  return (
    <div className="app">
      {/* ── TOPBAR ── */}
      <div className="topbar">
        <div className="logo">DRIVE<span>CRAFT</span></div>
        <div className="top-menu">
          <div className="top-menu-item" onClick={handleReset}>↩️ Editar</div>
          <div className="top-menu-item" onClick={()=>set({showWireframe:!s.showWireframe})}>🕸️ Wireframe</div>
          <div className="top-menu-item" onClick={()=>exportJSON(s,notify)}>📄 Exportar</div>
          <div className="top-menu-item" onClick={()=>notify('🔗 Link copiado!')}>🔗 Compartilhar</div>
        </div>
        {/* Tabs rápidas de modelo */}
        <div style={{display:'flex',gap:4,alignItems:'center',marginLeft:8,marginRight:'auto'}}>
          {models.map(m => (
            <button key={m.id}
              onClick={()=>handleSelectModel(m)}
              style={{
                padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',
                border:`1px solid ${activeModel.id===m.id?'var(--accent)':'var(--border)'}`,
                background: activeModel.id===m.id?'rgba(0,212,255,.15)':'transparent',
                color: activeModel.id===m.id?'var(--accent)':'var(--text-muted)',
                transition:'all .15s',fontFamily:'var(--font-body)',
              }}>
              {m.icon} {m.name}
            </button>
          ))}
          <button
            onClick={()=>setPanel('cars')}
            style={{
              padding:'3px 10px',borderRadius:20,fontSize:11,fontWeight:600,cursor:'pointer',
              border:'1px dashed rgba(0,212,255,.35)',background:'rgba(0,212,255,.05)',
              color:'var(--accent)',transition:'all .15s',fontFamily:'var(--font-body)',
            }}>
            + GLB
          </button>
        </div>
        <div className="top-actions">
          <div className="env-badge"
            onClick={()=>{
              const keys=Object.keys(ENV_NAMES)
              const next=keys[(keys.indexOf(s.environment)+1)%keys.length]
              set({environment:next}); notify(`🌐 ${ENV_NAMES[next]}`)
            }}>
            <div className="env-dot" />
            <span>{ENV_NAMES[s.environment]}</span>
          </div>
          <button className="btn-pill btn-demo">v5 GLB</button>
          <button className="btn-pill btn-save"
            style={{background:'var(--accent2)'}}
            onClick={()=>setRaceMode(true)}>🏁 Pista</button>
          <button className="btn-pill btn-save" onClick={()=>notify('📸 Use Ctrl+Shift+S para capturar')}>💾 Salvar</button>
        </div>
      </div>

      {/* ── SIDEBAR ── */}
      <div className="sidebar">
        {sideItems.map((item, i) => {
          if (item === null)    return <div key={`d${i}`} className="sb-divider" />
          if (item === 'spacer') return <div key="spacer"  className="sb-spacer" />
          return (
            <div key={item.id}
              className={`sb-btn${panel===item.id?' active':''}`}
              onClick={() => setPanel(item.id)}
              title={item.label}>
              <span className="sb-icon">{item.icon}</span>
              <span className="sb-label">{item.label}</span>
              <div className="sb-dot" />
            </div>
          )
        })}
      </div>

      {/* ── PANEL ── */}
      <div className="panel">
        <div className="panel-header">
          <div className="panel-title">{title}</div>
          <div className="panel-subtitle">{subtitle}</div>
        </div>
        <div className="panel-scroll">
          {panel==='cars'    && (
            <CarsPanel
              models={models}
              activeId={activeModel.id}
              onSelect={handleSelectModel}
              onUpload={handleUpload}
              onRemove={handleRemove}
              onScaleChange={handleScaleChange}
              notify={notify}
            />
          )}
          {panel==='paint'   && <PaintPanel   s={s} set={set} notify={notify} />}
          {panel==='wrap'    && <WrapPanel    s={s} set={set} notify={notify} />}
          {panel==='wheels'  && <WheelsPanel  s={s} set={set} notify={notify} />}
          {panel==='lights'  && <LightsPanel  s={s} set={set} notify={notify} />}
          {panel==='env'     && <EnvPanel     s={s} set={set} notify={notify} />}
          {panel==='camera'  && <CameraPanel  s={s} set={set} notify={notify} onCameraGo={handleCameraGo} />}
          {panel==='project' && <ProjectPanel s={s} set={set} notify={notify} />}
          {panel==='cart'    && <CartPanel    s={s} />}
        </div>
      </div>

      {/* ── CANVAS ── */}
      <div className="canvas-area">
        <Suspense fallback={null}>
          <Scene
            modelPath={activeModel.path}
            modelScale={activeModel.scale}
            bodyColor={s.bodyColor}       rimColor={s.rimColor}
            caliperColor={s.caliperColor}
            metalness={s.metalness}       roughness={s.roughness}
            envIntensity={s.envIntensity} clearCoat={s.clearCoat}
            glassTint={s.glassTint}       rimFinish={s.rimFinish}
            wheelScale={s.wheelScale}     suspension={s.suspension}
            steerAngle={s.steerAngle}
            wheelOffsetFront={s.wheelOffsetFront}
            wheelOffsetRear={s.wheelOffsetRear}
            rotateWheels={s.rotateWheels} wheelRotSpeed={s.wheelRotSpeed}
            headlightsOn={s.headlightsOn} lightColor={s.lightColor}
            lightIntensity={s.lightIntensity}
            environment={s.environment}
            showWireframe={s.showWireframe}
            showGrid={s.showGrid}
            autoRotate={s.autoRotate}
            fov={s.fov}
            cameraTarget={camTarget}
            onCameraTargetConsumed={()=>setCamTarget(null)}
            onHoverPart={setHoverPart}
            onClickPart={handleClickPart}
            key={activeModel.id}
          />
        </Suspense>

        {/* HUD top-left */}
        <div className="hud-tl">
          <div className={`hud-btn${s.autoRotate?' active':''}`}    title="Auto-rotação" onClick={()=>set({autoRotate:!s.autoRotate})}>🔄</div>
          <div className={`hud-btn${s.showWireframe?' active':''}`} title="Wireframe"    onClick={()=>set({showWireframe:!s.showWireframe})}>🕸️</div>
          <div className={`hud-btn${s.showGrid?' active':''}`}      title="Grid"         onClick={()=>set({showGrid:!s.showGrid})}>📐</div>
          <div className="hud-btn"                                   title="Reset câmera" onClick={()=>handleCameraGo('diag')}>🎯</div>
        </div>

        {/* Camera presets */}
        <div className="cam-presets">
          {[['front','⬆ Frontal'],['side','➡ Lateral'],['rear','⬇ Traseira'],['top','🔼 Topo'],['low','🔽 Raso']].map(([id,label])=>(
            <div key={id} className="cam-btn" onClick={()=>{handleCameraGo(id);notify(`📷 ${label}`)}}>{label}</div>
          ))}
        </div>

        {/* Part hover label */}
        <div className={`part-label${hoverPart?' visible':''}`}>
          {hoverPart ? `● ${hoverPart}` : ''}
        </div>

        {/* Loading overlay */}
        <div className={`loading-overlay${loaded?' hidden':''}`}>
          <div className="loading-logo">DRIVE<span>CRAFT</span></div>
          <div style={{fontSize:14,color:'var(--text-muted)',marginBottom:8}}>
            {activeModel.icon} {activeModel.name}
          </div>
          <div className="loading-bar-wrap">
            <div className="loading-bar"
              style={{ animation:'none', transition:'width 2s ease', width: loaded?'100%':'0%' }}
              ref={el => { if(el) setTimeout(()=>{ if(el) el.style.width='100%' },50) }} />
          </div>
          <div className="loading-sub">Carregando modelo GLB...</div>
        </div>
      </div>

      {/* ── BOTTOMBAR ── */}
      <div className="bottombar">
        <div className="status-chip"><div className="s-dot"/><span>{activeModel.icon} {activeModel.name}</span></div>
        <div className="status-sep"/>
        <div className="status-chip">{ENVS.find(e=>e.id===s.environment)?.icon} {ENV_NAMES[s.environment]}</div>
        <div className="status-sep"/>
        <div className="status-chip">{FINISH_PRESETS[s.finish]?.icon} {FINISH_PRESETS[s.finish]?.label}</div>
        <div className="price-area">
          <span className="price-label">Customização</span>
          <span className="price-val">R$ {buildCartItems(s).reduce((a,i)=>a+i.price,0).toLocaleString('pt-BR')}</span>
        </div>
        <button className="btn-pill btn-save"
          style={{background:'var(--accent2)',color:'#fff',border:'none',padding:'8px 16px',borderRadius:6,cursor:'pointer',fontWeight:700,fontSize:12}}
          onClick={()=>setRaceMode(true)}>🏁 Pista</button>
        <button className="btn-cart" onClick={()=>setPanel('cart')}>🛒 Ver Carrinho</button>
      </div>

      {/* Race Mode */}
      {raceMode && (
        <RaceGame carConfig={{...s, modelPath:activeModel.path, modelScale:activeModel.scale}} onBack={()=>setRaceMode(false)} />
      )}

      {/* Toast */}
      <div className={`toast${toast.show?' show':''}`}>{toast.msg}</div>
    </div>
  )
}
