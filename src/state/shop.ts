/**
 * 地牢商店（阶段 7 / 第 9 项）。纯逻辑，不依赖 Phaser。
 *
 * - 库存：除材料外、有价格的物品；
 * - 价格：基础价 × 声望倍率。倍率取玩家声望最高的阵营（"你在哪里最受欢迎，就按哪里的价格"）；
 * - 购买只增加背包物品，金币不足时不会购买。
 */
import type { FactionDef, ItemDef } from '../data/schema';
import { priceMultiplier } from '../factions/reputation';
import type { WorldState } from './WorldState';
import type { GameSession } from './session';

export function shopStock(items: readonly ItemDef[]): ItemDef[] {
  return items.filter((i) => i.type !== 'material' && i.price > 0);
}

/** 当前声望倍率：取声望最高的阵营（若所有阵营都是 0，则为 1）。 */
export function currentPriceMultiplier(world: WorldState, factions: readonly FactionDef[]): number {
  let best: FactionDef | undefined;
  let bestValue = 0;
  for (const f of factions) {
    const v = world.getReputation(f.id);
    if (v > bestValue) {
      bestValue = v;
      best = f;
    }
  }
  return best ? priceMultiplier(world, best.id) : 1;
}

export function buyPrice(item: ItemDef, multiplier: number): number {
  return Math.ceil(item.price * multiplier);
}

export interface BuyResult {
  ok: boolean;
  message: string;
}

/** 购买一件物品。金币不足时返回 ok=false，不做任何改动。 */
export function buyItem(
  session: GameSession,
  item: ItemDef,
  multiplier: number,
): BuyResult {
  const price = buyPrice(item, multiplier);
  if (session.player.gold < price) {
    return { ok: false, message: `金币不足：${item.name} 需要 ${price}，你有 ${session.player.gold}` };
  }
  session.player.gold -= price;
  session.world.addItem(item.id, 1);
  return { ok: true, message: `购买了 ${item.name}（-${price} 金币）` };
}

/** 商店列表文本，每行一个物品，行首编号与数字键对应。 */
export function shopLines(items: readonly ItemDef[], multiplier: number): string[] {
  return items.map((item, i) => `[${i + 1}] ${item.name}  ${buyPrice(item, multiplier)} 金币`);
}
