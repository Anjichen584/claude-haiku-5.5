import type { NpcDef } from '../data/schema';
import type { PlacedLocation } from './placement';

export interface TilePoint { x: number; y: number }
export interface PlacedNpc extends TilePoint { id: string; location: string }
export interface ReservedArea extends TilePoint { radius: number }
export const NPC_SPACING = 6;
export const NPC_TALK_RADIUS = 2.5;
export const SETTLEMENT_CLEARANCE = 5;

const compareId = (a: {id: string}, b: {id: string}) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
const distance = (a: TilePoint, b: TilePoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** Stable, compact courtyards, independent of JSON order. Location/save coordinates do not move. */
export function placeNpcs(
  npcs: readonly NpcDef[], places: readonly PlacedLocation[], reserved: readonly ReservedArea[] = [],
): Map<string, PlacedNpc> {
  const result = new Map<string, PlacedNpc>();
  const byPlace = new Map(places.map(p => [p.id, p]));
  if (byPlace.size !== places.length) throw new Error('Duplicate location id');
  const occupied = [...places.map(p => ({...p, radius: SETTLEMENT_CLEARANCE})), ...reserved];
  // A separate candidate cursor per settlement keeps allocation compact without index-based shifts.
  const groups = new Map<string, NpcDef[]>();
  for (const npc of [...npcs].sort(compareId)) {
    if (!byPlace.has(npc.location)) throw new Error(`NPC ${npc.id}: unknown location ${npc.location}`);
    if (result.has(npc.id)) throw new Error(`Duplicate NPC id: ${npc.id}`);
    result.set(npc.id, {id: npc.id, location: npc.location, x: 0, y: 0});
    const group = groups.get(npc.location) ?? [];
    group.push(npc); groups.set(npc.location, group);
  }
  result.clear();
  for (const [location, group] of [...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    const center = byPlace.get(location)!;
    const candidates: TilePoint[] = [];
    // Front court first, then side/rear courts. Expand only for unusually crowded settlements.
    for (let ring = 1; ring <= 20; ring++) {
      for (let y = ring; y >= -ring; y--) {
        for (let x = -ring; x <= ring; x++) {
          if (Math.max(Math.abs(x), Math.abs(y)) !== ring) continue;
          candidates.push({ x: center.x + x * NPC_SPACING, y: center.y + y * NPC_SPACING });
        }
      }
    }
    let cursor = 0;
    for (const npc of group) {
      let position: TilePoint | undefined;
      while (cursor < candidates.length) {
        const candidate = candidates[cursor++];
        if (occupied.some(p => distance(candidate, p) < p.radius)) continue;
        if ([...result.values()].some(p => distance(candidate, p) < NPC_SPACING)) continue;
        position = candidate; break;
      }
      if (!position) throw new Error(`No space for NPC ${npc.id}`);
      result.set(npc.id, { ...position, id: npc.id, location });
    }
  }
  return result;
}

/** Tie-break by id rather than data-file order; render hints and E interaction share this selection. */
export function nearestNpc(positions: ReadonlyMap<string, PlacedNpc>, player: TilePoint, radius = NPC_TALK_RADIUS): string | null {
  let best: PlacedNpc | undefined;
  let bestDistance = radius;
  for (const npc of positions.values()) {
    const d = distance(player, npc);
    if (d <= radius && (!best || d < bestDistance || (d === bestDistance && npc.id < best.id))) {
      best = npc; bestDistance = d;
    }
  }
  return best?.id ?? null;
}

/** Prevent props/hostile encounters from blocking settlement interaction space. */
export function inSettlement(point: TilePoint, places: readonly TilePoint[], npcs: ReadonlyMap<string, PlacedNpc>): boolean {
  return places.some(p => distance(p, point) < SETTLEMENT_CLEARANCE)
    || [...npcs.values()].some(p => distance(p, point) < SETTLEMENT_CLEARANCE);
}
