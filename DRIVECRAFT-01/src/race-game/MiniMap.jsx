/**
 * MiniMap.jsx — Minimapa SVG da pista
 */

// Pontos do circuito (normalizado 0-1)
const TRACK_POINTS = [
  [0.5,  0.9],  // start/finish
  [0.8,  0.85],
  [0.92, 0.7],
  [0.9,  0.5],
  [0.8,  0.3],
  [0.65, 0.15],
  [0.5,  0.1],
  [0.35, 0.15],
  [0.2,  0.3],
  [0.1,  0.5],
  [0.12, 0.7],
  [0.25, 0.85],
  [0.5,  0.9],
]

function buildPath(pts, w, h) {
  return pts.map((p, i) =>
    `${i === 0 ? 'M' : 'L'} ${p[0] * w} ${p[1] * h}`
  ).join(' ') + ' Z'
}

export default function MiniMap({ carPos }) {
  const W = 140, H = 140

  // Converter progresso (0-1) para posição no mapa
  const progress   = carPos.progress || 0
  const totalPts   = TRACK_POINTS.length - 1
  const segIdx     = Math.floor(progress * totalPts)
  const segT       = (progress * totalPts) % 1
  const pA         = TRACK_POINTS[Math.min(segIdx,     totalPts - 1)]
  const pB         = TRACK_POINTS[Math.min(segIdx + 1, totalPts - 1)]
  const cx         = (pA[0] + (pB[0] - pA[0]) * segT) * W
  const cy         = (pA[1] + (pB[1] - pA[1]) * segT) * H

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="minimap-svg">
      {/* Background */}
      <rect width={W} height={H} rx="8" fill="#00000088" />

      {/* Track shadow */}
      <path
        d={buildPath(TRACK_POINTS, W, H)}
        fill="none"
        stroke="#ffffff22"
        strokeWidth="10"
        strokeLinejoin="round"
      />

      {/* Track */}
      <path
        d={buildPath(TRACK_POINTS, W, H)}
        fill="none"
        stroke="#334"
        strokeWidth="8"
        strokeLinejoin="round"
      />

      {/* Track center line */}
      <path
        d={buildPath(TRACK_POINTS, W, H)}
        fill="none"
        stroke="#ffffff18"
        strokeWidth="1"
        strokeDasharray="4 4"
        strokeLinejoin="round"
      />

      {/* Start/Finish line */}
      <line
        x1={TRACK_POINTS[0][0] * W - 8}
        y1={TRACK_POINTS[0][1] * H}
        x2={TRACK_POINTS[0][0] * W + 8}
        y2={TRACK_POINTS[0][1] * H}
        stroke="#ffffff"
        strokeWidth="2"
      />

      {/* Car dot */}
      <circle cx={cx} cy={cy} r="5" fill="var(--race-accent)" />
      <circle cx={cx} cy={cy} r="5" fill="transparent" stroke="white" strokeWidth="1.5" />

      {/* Label */}
      <text x="4" y="12" fontSize="8" fill="#ffffff66">PISTA</text>
    </svg>
  )
}
