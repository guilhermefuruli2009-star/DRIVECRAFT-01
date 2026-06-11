/**
 * DiagnosticMode.jsx — Modo Diagnóstico DriveCraft
 *
 * Inspirado na análise não-destrutiva do acelerador de partículas Sirius (CNPEM, Campinas/SP).
 * Assim como a luz síncrotron revela a estrutura interna de materiais sem danificá-los,
 * este modo exibe as camadas internas do veículo de forma visual e interativa.
 */

import { useState, useEffect } from 'react'
import './DiagnosticMode.css'

// ── Dados dos componentes do veículo ──────────────────────────────────────────
const COMPONENTS = [
  {
    id: 'chassis',
    layer: 1,
    label: 'Chassi',
    icon: '⬛',
    color: '#00e5ff',
    material: 'Aço de Alta Resistência',
    function: 'Estrutura principal do veículo. Suporta todos os componentes e absorve impactos.',
    status: 'original',
    weight: '280 kg',
    category: 'estrutura',
  },
  {
    id: 'engine',
    layer: 2,
    label: 'Motor',
    icon: '⚙️',
    color: '#ff6d00',
    material: 'Bloco de Alumínio',
    function: 'Converte energia química (combustível) em energia mecânica para mover o veículo.',
    status: 'original',
    weight: '140 kg',
    category: 'motor',
  },
  {
    id: 'transmission',
    layer: 2,
    label: 'Câmbio',
    icon: '🔧',
    color: '#ffab00',
    material: 'Aço Temperado',
    function: 'Transmite a força do motor às rodas, controlando torque e velocidade.',
    status: 'original',
    weight: '45 kg',
    category: 'motor',
  },
  {
    id: 'suspension',
    layer: 3,
    label: 'Suspensão',
    icon: '〰️',
    color: '#69f0ae',
    material: 'Aço Mola / Amortecedor Hidráulico',
    function: 'Absorve irregularidades do solo, garantindo conforto e estabilidade direcional.',
    status: 'original',
    weight: '60 kg',
    category: 'suspensao',
  },
  {
    id: 'brakes',
    layer: 3,
    label: 'Freios',
    icon: '🔴',
    color: '#ff1744',
    material: 'Disco de Aço / Pastilha de Carbono',
    function: 'Reduz a velocidade do veículo convertendo energia cinética em calor por atrito.',
    status: 'customizado',
    weight: '28 kg',
    category: 'suspensao',
  },
  {
    id: 'exhaust',
    layer: 4,
    label: 'Escapamento',
    icon: '💨',
    color: '#ea80fc',
    material: 'Aço Inoxidável',
    function: 'Conduz e filtra os gases resultantes da combustão, reduzindo ruído e emissões.',
    status: 'customizado',
    weight: '18 kg',
    category: 'motor',
  },
  {
    id: 'fuel',
    layer: 4,
    label: 'Sistema de Combustível',
    icon: '⛽',
    color: '#ffff00',
    material: 'Polietileno de Alta Densidade',
    function: 'Armazena e distribui o combustível ao motor com pressão controlada.',
    status: 'original',
    weight: '12 kg',
    category: 'motor',
  },
  {
    id: 'electrical',
    layer: 5,
    label: 'Sistema Elétrico',
    icon: '⚡',
    color: '#76ff03',
    material: 'Cobre / PCB Automotivo',
    function: 'Gerencia toda a eletricidade do veículo: partida, luzes, sensores e ECU.',
    status: 'original',
    weight: '22 kg',
    category: 'eletrico',
  },
  {
    id: 'body',
    layer: 6,
    label: 'Carroceria',
    icon: '🚗',
    color: '#40c4ff',
    material: 'Aço Estampado / Fibra de Vidro',
    function: 'Proteção externa do veículo. Define a aerodinâmica e absorve impactos laterais.',
    status: 'customizado',
    weight: '320 kg',
    category: 'estrutura',
  },
]

const CATEGORY_LABELS = {
  estrutura: '🏗 Estrutura',
  motor:     '⚙️ Motorização',
  suspensao: '🔩 Suspensão & Freios',
  eletrico:  '⚡ Elétrico',
}

const SCAN_LINES = Array.from({ length: 14 }, (_, i) => i)

// ── Componente principal ───────────────────────────────────────────────────────
export default function DiagnosticMode({ active, onClose, carName, bodyColor }) {
  const [selected, setSelected]       = useState(null)
  const [scanning, setScanning]       = useState(true)
  const [visibleLayers, setVisible]   = useState([])
  const [activeFilter, setFilter]     = useState('all')

  // Animação de scan ao abrir
  useEffect(() => {
    if (!active) return
    setScanning(true)
    setVisible([])
    setSelected(null)

    let layer = 1
    const interval = setInterval(() => {
      setVisible(prev => {
        const next = [...new Set([...prev, layer])]
        return next
      })
      layer++
      if (layer > 6) {
        clearInterval(interval)
        setTimeout(() => setScanning(false), 500)
      }
    }, 280)

    return () => clearInterval(interval)
  }, [active])

  if (!active) return null

  const filtered = COMPONENTS.filter(c =>
    activeFilter === 'all' || c.category === activeFilter
  )

  const totalWeight = COMPONENTS.reduce((a, c) => {
    const kg = parseFloat(c.weight)
    return a + (isNaN(kg) ? 0 : kg)
  }, 0)

  const customCount = COMPONENTS.filter(c => c.status === 'customizado').length

  return (
    <div className="diag-overlay">

      {/* ── Scan lines animadas ── */}
      {scanning && (
        <div className="diag-scan-container">
          {SCAN_LINES.map(i => (
            <div key={i} className="diag-scan-line" style={{ animationDelay: `${i * 0.06}s` }} />
          ))}
          <div className="diag-scan-text">ANALISANDO ESTRUTURA...</div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="diag-header">
        <div className="diag-logo">
          <span className="diag-logo-icon">🔬</span>
          <div>
            <div className="diag-logo-title">MODO DIAGNÓSTICO</div>
            <div className="diag-logo-sub">Inspirado na análise não-destrutiva · CNPEM / Sirius</div>
          </div>
        </div>
        <div className="diag-header-stats">
          <div className="diag-stat">
            <span className="diag-stat-val">{COMPONENTS.length}</span>
            <span className="diag-stat-label">Componentes</span>
          </div>
          <div className="diag-stat">
            <span className="diag-stat-val" style={{ color: '#ffab00' }}>{customCount}</span>
            <span className="diag-stat-label">Customizados</span>
          </div>
          <div className="diag-stat">
            <span className="diag-stat-val">{totalWeight} kg</span>
            <span className="diag-stat-label">Peso Total</span>
          </div>
        </div>
        <button className="diag-close" onClick={onClose}>✕ Fechar</button>
      </div>

      {/* ── Corpo ── */}
      <div className="diag-body">

        {/* ── Visualização central (Exploded View) ── */}
        <div className="diag-canvas">
          <div className="diag-canvas-label">{carName || 'Veículo'}</div>

          {/* Grade de fundo estilo técnico */}
          <div className="diag-grid" />

          {/* Silhueta do carro com efeito raio-X */}
          <div className="diag-car-xray">
            <svg viewBox="0 0 500 220" xmlns="http://www.w3.org/2000/svg" className="diag-car-svg">
              {/* Sombra base */}
              <ellipse cx="250" cy="210" rx="180" ry="8" fill="rgba(0,229,255,0.08)" />

              {/* Carroceria (layer 6) */}
              <g className={`diag-layer ${visibleLayers.includes(6) ? 'visible' : ''}`}
                style={{ opacity: selected && selected.id !== 'body' ? 0.15 : 1 }}>
                <path d="M 80 140 Q 80 100 130 85 L 180 65 Q 220 50 260 50 Q 300 50 340 65 L 390 95 Q 420 110 422 140 Z"
                  fill={bodyColor ? bodyColor + '33' : 'rgba(0,229,255,0.12)'}
                  stroke={selected?.id === 'body' ? '#40c4ff' : 'rgba(64,196,255,0.6)'}
                  strokeWidth={selected?.id === 'body' ? 2 : 1} />
                <path d="M 80 140 L 78 165 Q 78 175 90 175 L 410 175 Q 422 175 422 165 L 422 140 Z"
                  fill={bodyColor ? bodyColor + '22' : 'rgba(0,229,255,0.08)'}
                  stroke="rgba(64,196,255,0.5)" strokeWidth="1" />
              </g>

              {/* Chassi (layer 1) */}
              <g className={`diag-layer ${visibleLayers.includes(1) ? 'visible' : ''}`}
                style={{ opacity: selected && selected.id !== 'chassis' ? 0.2 : 1 }}>
                <rect x="95" y="162" width="315" height="12" rx="4"
                  fill={selected?.id === 'chassis' ? 'rgba(0,229,255,0.3)' : 'rgba(0,229,255,0.15)'}
                  stroke={selected?.id === 'chassis' ? '#00e5ff' : 'rgba(0,229,255,0.7)'}
                  strokeWidth={selected?.id === 'chassis' ? 2 : 1} />
                <line x1="150" y1="162" x2="150" y2="174" stroke="rgba(0,229,255,0.5)" strokeWidth="1" />
                <line x1="350" y1="162" x2="350" y2="174" stroke="rgba(0,229,255,0.5)" strokeWidth="1" />
              </g>

              {/* Motor (layer 2) */}
              <g className={`diag-layer ${visibleLayers.includes(2) ? 'visible' : ''}`}
                style={{ opacity: selected && selected.id !== 'engine' ? 0.15 : 1 }}>
                <rect x="280" y="95" width="95" height="65" rx="6"
                  fill={selected?.id === 'engine' ? 'rgba(255,109,0,0.25)' : 'rgba(255,109,0,0.1)'}
                  stroke={selected?.id === 'engine' ? '#ff6d00' : 'rgba(255,109,0,0.7)'}
                  strokeWidth={selected?.id === 'engine' ? 2 : 1}
                  strokeDasharray={selected?.id === 'engine' ? '0' : '4 2'} />
                <text x="328" y="132" textAnchor="middle" fill="rgba(255,109,0,0.9)" fontSize="10" fontFamily="monospace">MOTOR</text>
              </g>

              {/* Câmbio (layer 2) */}
              <g className={`diag-layer ${visibleLayers.includes(2) ? 'visible' : ''}`}
                style={{ opacity: selected && selected.id !== 'transmission' ? 0.15 : 1 }}>
                <rect x="220" y="115" width="55" height="40" rx="4"
                  fill={selected?.id === 'transmission' ? 'rgba(255,171,0,0.25)' : 'rgba(255,171,0,0.08)'}
                  stroke={selected?.id === 'transmission' ? '#ffab00' : 'rgba(255,171,0,0.6)'}
                  strokeWidth={selected?.id === 'transmission' ? 2 : 1}
                  strokeDasharray="3 2" />
                <text x="248" y="138" textAnchor="middle" fill="rgba(255,171,0,0.9)" fontSize="8" fontFamily="monospace">CÂMBIO</text>
              </g>

              {/* Suspensão / molas (layer 3) */}
              <g className={`diag-layer ${visibleLayers.includes(3) ? 'visible' : ''}`}
                style={{ opacity: selected && selected.id !== 'suspension' ? 0.15 : 1 }}>
                {[130, 360].map(x => (
                  <g key={x}>
                    <line x1={x} y1="155" x2={x} y2="174"
                      stroke={selected?.id === 'suspension' ? '#69f0ae' : 'rgba(105,240,174,0.7)'}
                      strokeWidth={selected?.id === 'suspension' ? 3 : 2}
                      strokeDasharray="4 2" />
                    <circle cx={x} cy="175" r="5"
                      fill="none"
                      stroke={selected?.id === 'suspension' ? '#69f0ae' : 'rgba(105,240,174,0.6)'}
                      strokeWidth="1.5" />
                  </g>
                ))}
              </g>

              {/* Rodas + freios (layer 3) */}
              <g className={`diag-layer ${visibleLayers.includes(3) ? 'visible' : ''}`}
                style={{ opacity: selected && selected.id !== 'brakes' ? 0.15 : 1 }}>
                {[130, 362].map(x => (
                  <g key={x}>
                    <circle cx={x} cy="182" r="22"
                      fill="rgba(20,20,35,0.8)"
                      stroke="rgba(150,150,180,0.5)" strokeWidth="1" />
                    <circle cx={x} cy="182" r="16"
                      fill="none"
                      stroke={selected?.id === 'brakes' ? '#ff1744' : 'rgba(255,23,68,0.7)'}
                      strokeWidth={selected?.id === 'brakes' ? 2.5 : 1.5}
                      strokeDasharray={selected?.id === 'brakes' ? '0' : '5 3'} />
                    <circle cx={x} cy="182" r="6" fill="rgba(150,150,160,0.4)" stroke="rgba(200,200,210,0.5)" strokeWidth="1" />
                  </g>
                ))}
              </g>

              {/* Escapamento (layer 4) */}
              <g className={`diag-layer ${visibleLayers.includes(4) ? 'visible' : ''}`}
                style={{ opacity: selected && selected.id !== 'exhaust' ? 0.15 : 1 }}>
                <path d="M 280 155 Q 220 158 160 155 Q 120 154 100 158"
                  fill="none"
                  stroke={selected?.id === 'exhaust' ? '#ea80fc' : 'rgba(234,128,252,0.6)'}
                  strokeWidth={selected?.id === 'exhaust' ? 3 : 1.5}
                  strokeDasharray="6 2" />
              </g>

              {/* Sistema elétrico (layer 5) */}
              <g className={`diag-layer ${visibleLayers.includes(5) ? 'visible' : ''}`}
                style={{ opacity: selected && selected.id !== 'electrical' ? 0.1 : 1 }}>
                <path d="M 300 100 L 240 100 L 200 120 L 160 120 L 130 140"
                  fill="none"
                  stroke={selected?.id === 'electrical' ? '#76ff03' : 'rgba(118,255,3,0.5)'}
                  strokeWidth="1" strokeDasharray="3 2" />
                <path d="M 300 108 L 250 108 L 200 128 L 165 128"
                  fill="none"
                  stroke={selected?.id === 'electrical' ? '#76ff03' : 'rgba(118,255,3,0.4)'}
                  strokeWidth="1" strokeDasharray="2 3" />
              </g>

              {/* Pontos clicáveis */}
              {COMPONENTS.map(c => {
                const positions = {
                  chassis:      { x: 250, y: 168 },
                  engine:       { x: 328, y: 128 },
                  transmission: { x: 248, y: 135 },
                  suspension:   { x: 245, y: 155 },
                  brakes:       { x: 248, y: 182 },
                  exhaust:      { x: 190, y: 158 },
                  electrical:   { x: 215, y: 110 },
                  body:         { x: 250, y: 75  },
                  fuel:         { x: 170, y: 135 },
                }
                const pos = positions[c.id]
                if (!pos || !visibleLayers.includes(c.layer)) return null
                return (
                  <g key={c.id} className="diag-hotspot" onClick={() => setSelected(s => s?.id === c.id ? null : c)}>
                    <circle cx={pos.x} cy={pos.y} r={selected?.id === c.id ? 10 : 7}
                      fill={selected?.id === c.id ? c.color + '55' : 'rgba(0,0,0,0.4)'}
                      stroke={c.color} strokeWidth={selected?.id === c.id ? 2 : 1.5} />
                    <circle cx={pos.x} cy={pos.y} r="3" fill={c.color} />
                    {selected?.id === c.id && (
                      <circle cx={pos.x} cy={pos.y} r="14" fill="none" stroke={c.color} strokeWidth="1" opacity="0.5">
                        <animate attributeName="r" from="10" to="18" dur="1.2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" from="0.5" to="0" dur="1.2s" repeatCount="indefinite" />
                      </circle>
                    )}
                  </g>
                )
              })}
            </svg>

            {/* Legenda de camadas */}
            <div className="diag-layers-legend">
              {[
                { n: 1, label: 'Estrutura'    },
                { n: 2, label: 'Motor'         },
                { n: 3, label: 'Susp. / Freios'},
                { n: 4, label: 'Escape / Comb.'},
                { n: 5, label: 'Elétrico'      },
                { n: 6, label: 'Carroceria'    },
              ].map(({ n, label }) => (
                <div key={n} className={`diag-layer-item ${visibleLayers.includes(n) ? 'visible' : ''}`}>
                  <span className="diag-layer-n">C{n}</span>
                  <span className="diag-layer-label">{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Card de detalhe do componente selecionado */}
          {selected && (
            <div className="diag-detail-card" style={{ '--comp-color': selected.color }}>
              <div className="diag-detail-header">
                <span className="diag-detail-icon">{selected.icon}</span>
                <div>
                  <div className="diag-detail-name">{selected.label}</div>
                  <div className="diag-detail-cat">{CATEGORY_LABELS[selected.category]}</div>
                </div>
                <div className={`diag-detail-badge ${selected.status}`}>
                  {selected.status === 'customizado' ? '✦ Customizado' : '✓ Original'}
                </div>
              </div>
              <div className="diag-detail-rows">
                <div className="diag-detail-row"><span>Material</span><strong>{selected.material}</strong></div>
                <div className="diag-detail-row"><span>Peso</span><strong>{selected.weight}</strong></div>
                <div className="diag-detail-row func"><span>Função</span><p>{selected.function}</p></div>
              </div>
            </div>
          )}
        </div>

        {/* ── Painel lateral de componentes ── */}
        <div className="diag-panel">
          <div className="diag-panel-title">COMPONENTES</div>

          {/* Filtros */}
          <div className="diag-filters">
            {[['all', '🔍 Todos'], ...Object.entries(CATEGORY_LABELS)].map(([k, v]) => (
              <button key={k}
                className={`diag-filter-btn ${activeFilter === k ? 'active' : ''}`}
                onClick={() => setFilter(k)}>{v}</button>
            ))}
          </div>

          {/* Lista */}
          <div className="diag-list">
            {filtered.map(c => (
              <div key={c.id}
                className={`diag-list-item ${selected?.id === c.id ? 'active' : ''} ${visibleLayers.includes(c.layer) ? 'loaded' : 'loading'}`}
                style={{ '--comp-color': c.color }}
                onClick={() => setSelected(s => s?.id === c.id ? null : c)}>
                <div className="diag-item-dot" />
                <div className="diag-item-icon">{c.icon}</div>
                <div className="diag-item-info">
                  <div className="diag-item-name">{c.label}</div>
                  <div className="diag-item-mat">{c.material}</div>
                </div>
                <div className="diag-item-right">
                  <div className="diag-item-weight">{c.weight}</div>
                  <div className={`diag-item-status ${c.status}`}>
                    {c.status === 'customizado' ? '✦' : '✓'}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Rodapé do painel */}
          <div className="diag-panel-footer">
            <div className="diag-compat">
              <div className="diag-compat-title">⚡ STATUS DE COMPATIBILIDADE</div>
              <div className="diag-compat-ok">✓ Freios ↔ Suspensão — Compatível</div>
              <div className="diag-compat-ok">✓ Escapamento ↔ Motor — Compatível</div>
              <div className="diag-compat-ok">✓ Carroceria ↔ Chassi — Compatível</div>
            </div>
            <div className="diag-science-note">
              🔬 <em>Técnica inspirada na análise não-destrutiva por luz síncrotron do Sirius (CNPEM, Campinas/SP)</em>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
