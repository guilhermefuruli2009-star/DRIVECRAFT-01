/**
 * src/physics/PhysicsAdapter.js
 *
 * Contrato que qualquer motor de física deve respeitar. Hoje só existe
 * o RaycastPhysicsAdapter (colisão simplificada por raycast + AABB).
 * No futuro, um RapierPhysicsAdapter pode implementar a mesma interface
 * — RaceScene.jsx e os componentes de render (RaceCar, RaceCamera,
 * DayEnvironment) não precisam mudar, porque todos leem apenas
 * x/y/z/angle/speed/getForward()/getKmh(), não a implementação interna.
 */
import { CarPhysics } from './CarPhysics'

export class PhysicsAdapter {
  setCollisionMap(collisionMap) { this.collisionMap = collisionMap }
  step(_dt, _input) { throw new Error('PhysicsAdapter.step não implementado') }
  reset(_x, _z) { throw new Error('PhysicsAdapter.reset não implementado') }
  /** Deve expor x, y, z, angle, speed, getForward(), getKmh() */
  getState() { throw new Error('PhysicsAdapter.getState não implementado') }
}

export class RaycastPhysicsAdapter extends PhysicsAdapter {
  constructor(raceConfig) {
    super()
    this.car = new CarPhysics(raceConfig)
  }
  step(dt, input) {
    return this.car.step(dt, input, this.collisionMap)
  }
  reset(x, z) { this.car.reset(x, z) }
  getState() { return this.car }
}

/**
 * ESBOÇO (não implementado) de como ficaria a migração para Rapier —
 * mantido aqui como referência de arquitetura, não é chamado em runtime:
 *
 * export class RapierPhysicsAdapter extends PhysicsAdapter {
 *   constructor(world, carRigidBody) {
 *     super()
 *     this.world = world
 *     this.body = carRigidBody
 *   }
 *   step(dt, input) {
 *     applyInputAsForces(this.body, input) // acelerar/frear/esterço vira força/torque
 *     this.world.step()
 *     const t = this.body.translation()
 *     const r = this.body.rotation()
 *     this._state = { x: t.x, y: t.y, z: t.z, angle: quatToYaw(r), speed: ... }
 *     return { lapComplete: false } // lógica de volta continua igual
 *   }
 *   getState() { return this._state }
 * }
 */