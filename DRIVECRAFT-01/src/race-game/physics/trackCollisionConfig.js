/**
 * src/components/race-game/physics/trackCollisionConfig.js
 *
 * Configuração de classificação de colisão para o GLB da pista.
 * Isto é o único lugar que você precisa editar quando trocar de pista
 * ou quiser refinar a colisão da pista atual.
 *
 * NOTA (road__highway.glb): este modelo vem com nomes de mesh genéricos
 * do Sketchfab (Object_0, Object_1, ...), então nenhum padrão de nome
 * abaixo bate — a classificação cai inteira na heurística geométrica em
 * TrackCollisionMap.js (classifyByGeometry). Isso normalmente já resolve
 * bem para uma pista feita de segmentos retos e planos, mas confira o
 * console (logMeshInventory) para ver se algo saiu classificado errado.
 *
 * COMO CALIBRAR:
 *  1. No RaceScene.jsx, com DEBUG_COORDS = true, abra o console do
 *     navegador. `logMeshInventory` roda automaticamente uma vez ao
 *     carregar e imprime uma tabela: nome do mesh | classe | origem
 *     (nome ou heurística).
 *  2. Veja quais meshes decorativos (árvores, placas, arquibancada)
 *     ficaram como 'wall' por engano, ou quais partes do asfalto não
 *     ficaram como 'ground'.
 *  3. Adicione trechos do nome real desses meshes nos arrays abaixo.
 */
export const TRACK_COLLISION_CONFIG = {
  // Substrings (case-insensitive) de nomes de mesh que compõem o CHÃO
  // dirigível (asfalto, meio-fio, saída de pista/gramado da pista).
  // Só estes meshes entram no raycast de altura/limite de pista.
  groundPatterns: [
    'road', 'track', 'asphalt', 'tarmac', 'ground', 'terrain',
    'curb', 'kerb', 'pista', 'estrada', 'runoff', 'circuit',
  ],

  // Substrings de nomes que geram COLISÃO SÓLIDA (muros, guard-rails,
  // pilhas de pneu, cercas). Para estes, um collider AABB simplificado
  // é gerado automaticamente a partir da bounding box — nunca usamos a
  // malha real de colisão (seria caro e desnecessário para geometria
  // majoritariamente reta).
  wallPatterns: [
    'wall', 'barrier', 'fence', 'rail', 'guard', 'tire', 'tyre',
    'muro', 'cerca', 'grade', 'concrete', 'pit_wall', 'armco',
  ],

  // Raio de bounding-box abaixo do qual um objeto candidato a 'wall'
  // é descartado (evita gerar colliders gigantes para meshes enormes
  // classificados errado por nome, como o terreno inteiro).
  maxWallFootprint: 400, // m²

  // Tudo que não bater em nenhum padrão acima E não passar na heurística
  // geométrica cai aqui: é renderizado normalmente, mas IGNORADO tanto
  // pelo raycast de chão quanto pela colisão de paredes. É o balde onde
  // caem árvores, placas, luzes, câmeras, arquibancada, etc.
  fallbackClass: 'decor',
}