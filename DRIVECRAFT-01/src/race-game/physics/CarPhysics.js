/**
 * src/components/race-game/physics/CarPhysics.js
 *
 * Estado e simulação do carro. Não sabe nada sobre Three.js render,
 * React, ou o GLB — só recebe um "collisionMap" (ver TrackCollisionMap.js)
 * e input do teclado, e produz a próxima posição válida.
 *
 * Isto é deliberadamente a "malha física" da arquitetura: independente
 * da malha visual. Se um dia isto for substituído por um rigid body do
 * Rapier, o contrato (step/reset/getWorldPos/getForward/getKmh) é o que
 * PhysicsAdapter.js expõe para o resto do jogo — o render não muda.
 */
import * as THREE from 'three'

/** Resolve colisão círculo (carro, visto de cima) x caixa AABB (parede). */
function resolveCircleAABB(cx, cz, radius, box) {
  const insideX = cx > box.minX && cx < box.maxX
  const insideZ = cz > box.minZ && cz < box.maxZ

  if (insideX && insideZ) {
    // Centro do carro já está dentro do collider (ex.: atravessou a baixa
    // velocidade num frame anterior). Empurra pelo eixo de menor penetração.
    const pushLeft = cx - box.minX
    const pushRight = box.maxX - cx
    const pushDown = cz - box.minZ
    const pushUp = box.maxZ - cz
    const min = Math.min(pushLeft, pushRight, pushDown, pushUp)
    if (min === pushLeft) return { nx: -1, nz: 0, overlap: pushLeft + radius }
    if (min === pushRight) return { nx: 1, nz: 0, overlap: pushRight + radius }
    if (min === pushDown) return { nx: 0, nz: -1, overlap: pushDown + radius }
    return { nx: 0, nz: 1, overlap: pushUp + radius }
  }

  const closestX = Math.max(box.minX, Math.min(cx, box.maxX))
  const closestZ = Math.max(box.minZ, Math.min(cz, box.maxZ))
  const dx = cx - closestX
  const dz = cz - closestZ
  const distSq = dx * dx + dz * dz
  if (distSq >= radius * radius) return null

  const dist = Math.sqrt(distSq) || 0.0001
  return { nx: dx / dist, nz: dz / dist, overlap: radius - dist }
}

export class CarPhysics {
  /**
   * @param {object} opts
   * @param {number} opts.startX
   * @param {number} opts.startZ
   * @param {number} [opts.startRadius] raio da zona de largada (voltas)
   * @param {number} [opts.lapMinDistance] odômetro mínimo entre voltas
   */
  constructor({ startX = 0, startZ = 0, startRadius = 18, lapMinDistance = 400 } = {}) {
    this.startX = startX
    this.startZ = startZ
    this.startRadius = startRadius
    this.lapMinDistance = lapMinDistance

    this.reset(startX, startZ)

    // Corpo do carro para colisão — círculo simplificado (visto de cima).
    // Ajuste conforme a escala real do seu modelo de carro.
    this.radius = 1.15

    // Steering
    this.steerMax = 0.72
    this.steerSpeed = 2.2
    this.steerReturn = 4.0

    // Motor
    this.accel = 14
    this.maxFwd = 28
    this.maxRev = -8
    this.drag = 0.94
    this.brakeFc = 22

    // Turbo
    this.turboBoost = 1.6
  }

  reset(x = this.startX, z = this.startZ) {
    this.x = x
    this.y = 0
    this.z = z
    this.angle = 0
    this.speed = 0
    this.lateral = 0
    this.steer = 0
    this.handbrake = false
    this.driftFactor = 1.0
    this.turbo = false
    this.lapTime = 0
    this.lapCount = 0
    this.odometer = 0
    this.lastLapOdo = 0
    this.awayFromStart = false
    this.progress = 0
    this.shake = 0
    this.lastCollision = false
  }

  /**
   * Avança a simulação em `dt` segundos FIXOS (ver usePhysicsWorld.js —
   * nunca passe o delta variável do requestAnimationFrame aqui).
   *
   * @param {number} dt
   * @param {object} keys
   * @param {ReturnType<typeof import('./TrackCollisionMap').buildTrackCollisionMap>} collisionMap
   */
  step(dt, keys, collisionMap) {
    const spd = Math.abs(this.speed)

    // ── Turbo ────────────────────────────────────────────────────────────
    this.turbo = keys.turbo && this.speed > 2

    // ── Aceleração ───────────────────────────────────────────────────────
    // keys.analogThrottle/analogBrake (0..1) vêm do gatilho do controle VR
    // ou da pinça da mão — se não vierem, cai pro digital do teclado/toque.
    const turboMult = this.turbo ? this.turboBoost : 1.0
    const throttle = typeof keys.analogThrottle === 'number' ? keys.analogThrottle : (keys.up ? 1 : 0)
    const brakeInput = typeof keys.analogBrake === 'number' ? keys.analogBrake : (keys.down ? 1 : 0)
    if (throttle > 0.02) this.speed += this.accel * turboMult * dt * throttle
    if (brakeInput > 0.02) this.speed -= this.brakeFc * dt * brakeInput
    if (throttle <= 0.02 && brakeInput <= 0.02) this.speed *= Math.pow(this.drag, dt * 60)
    this.speed = Math.max(this.maxRev, Math.min(this.maxFwd * turboMult, this.speed))

    // ── Handbrake ────────────────────────────────────────────────────────
    this.handbrake = keys.handbrake
    const targetDrift = this.handbrake ? 0.12 : 1.0
    this.driftFactor += (targetDrift - this.driftFactor) * Math.min(1, dt * 6)

    // ── Steering ─────────────────────────────────────────────────────────
    // keys.analogSteer (-1..1) vem do thumbstick direito ou do volante
    // virtual (pinça + arraste) no modo VR. Sinal invertido porque, no
    // input digital, keys.right (equivalente a analogSteer > 0) DIMINUI
    // this.steer — ver convenção abaixo.
    const speedRatio = Math.min(1, spd / this.maxFwd)
    const steerSens = this.steerMax * (0.55 + 0.45 * (1 - speedRatio))
    if (typeof keys.analogSteer === 'number') {
      const target = THREE.MathUtils.clamp(-keys.analogSteer, -1, 1)
      this.steer += (target - this.steer) * Math.min(1, dt * 10)
    } else {
      if (keys.left) this.steer = Math.min(1, this.steer + this.steerSpeed * dt)
      if (keys.right) this.steer = Math.max(-1, this.steer - this.steerSpeed * dt)
      if (!keys.left && !keys.right) this.steer *= Math.pow(0.05, dt * this.steerReturn)
    }

    // ── Rotação ──────────────────────────────────────────────────────────
    if (Math.abs(this.speed) > 0.3) {
      const turnRate = (this.speed / this.maxFwd) * this.steer * steerSens * 3.2 * this.driftFactor
      this.angle += turnRate * dt
      this.angle = ((this.angle + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI
    }

    // ── Posição candidata ────────────────────────────────────────────────
    const sin = Math.sin(this.angle)
    const cos = Math.cos(this.angle)
    let nx = this.x + sin * this.speed * dt
    let nz = this.z + cos * this.speed * dt

    // ── 1) Colisão com paredes/objetos sólidos ──────────────────────────
    let hitWall = false
    if (collisionMap?.wallColliders?.length) {
      for (const box of collisionMap.wallColliders) {
        // broad-phase barato: ignora colliders longe do carro
        if (
          nx < box.minX - this.radius - 2 || nx > box.maxX + this.radius + 2 ||
          nz < box.minZ - this.radius - 2 || nz > box.maxZ + this.radius + 2
        ) continue

        const hit = resolveCircleAABB(nx, nz, this.radius, box)
        if (hit) {
          nx += hit.nx * hit.overlap
          nz += hit.nz * hit.overlap
          // Resposta de impacto simples: perde boa parte da velocidade
          // (energia absorvida pela colisão). Sem isso o carro "gruda"
          // na parede em vez de reagir ao choque.
          this.speed *= 0.55
          hitWall = true
        }
      }
    }

    // ── 2) Limite da pista — só avança se ainda há chão dirigível ali ──
    let groundY = this.y
    let onTrack = true
    if (collisionMap?.raycastGround) {
      const hit = collisionMap.raycastGround(nx, nz)
      if (hit) {
        groundY = hit.y
      } else {
        onTrack = false
        nx = this.x
        nz = this.z
        this.speed *= 0.5
      }
    }

    this.x = nx
    this.z = nz
    this.y = THREE.MathUtils.lerp(this.y, groundY, 0.35)
    this.lastCollision = hitWall || !onTrack

    // ── Shake do turbo ───────────────────────────────────────────────────
    this.shake = this.turbo ? 0.04 : 0

    // ── Odômetro + volta ─────────────────────────────────────────────────
    this.lapTime += dt
    this.odometer += Math.abs(this.speed) * dt

    const dxs = this.x - this.startX
    const dzs = this.z - this.startZ
    const distToStart = Math.sqrt(dxs * dxs + dzs * dzs)
    this.progress = Math.min(1, (this.odometer - this.lastLapOdo) / this.lapMinDistance)

    if (distToStart > this.startRadius) {
      this.awayFromStart = true
    } else if (this.awayFromStart && (this.odometer - this.lastLapOdo) > this.lapMinDistance) {
      this.awayFromStart = false
      this.lastLapOdo = this.odometer
      this.lapCount++
      const t = this.lapTime
      this.lapTime = 0
      return { lapComplete: true, lapTime: t }
    }
    return { lapComplete: false }
  }

  getWorldPos() { return new THREE.Vector3(this.x, this.y, this.z) }
  getForward() { return new THREE.Vector3(Math.sin(this.angle), 0, Math.cos(this.angle)) }
  getAngle() { return this.angle }
  getKmh() { return Math.abs(this.speed) * 3.6 }
}