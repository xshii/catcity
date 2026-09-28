import { CAT_BREEDS } from '../../content/breeds';
import {
  discoveredSpecies,
  FISH,
  fishById,
  fishHabitats,
  fishStars,
  LOOT,
  SPOTS,
} from '../../content/fishing';
import type { GameCommand } from '../../core';
import type { CatEntity, WorldState } from '../../core';
import { fishIllustration } from '../art/illustrations';

type FishAction = Extract<GameCommand, { type: 'SELL_FISH' | 'GIFT_FISH' }>;

/** Read-only catalogue rendering; clicks return commands to the application adapter. */
export function renderFishingCatalog(
  world: WorldState,
  cat: CatEntity,
  onAction: (command: FishAction, message: string) => void,
) {
  const f = world.fishing;
  const discovered = discoveredSpecies(f.atlas);
  const get = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  get('fish-supplies').textContent =
    `垃圾 ${f.supplies.trash} 件 · 罐头 ${f.supplies.cans} 份 · 已打开金币袋 ${f.supplies.coinBags} 个`;
  get<HTMLButtonElement>('use-can').disabled =
    f.supplies.cans === 0 || cat.needs.energy === 100;
  get<HTMLButtonElement>('recycle-trash').disabled = f.supplies.trash === 0;
  get('fish-tastes').textContent =
    `${cat.name} 喜欢：${cat.favoriteFish.map((id) => fishById(id).name).join('、')}。${cat.fishGift ? `上次收到${fishById(cat.fishGift.speciesId).name}，${cat.fishGift.favorite ? '特别开心。' : '轻轻说了谢谢。'}` : '鱼可以卖出，也可以留给喜欢它的猫。'}`;
  get('bag-count').textContent = `${f.inventory.length}/30`;
  get('fish-inventory').replaceChildren(
    ...f.inventory.map((fish) => {
      const def = fishById(fish.speciesId);
      const row = document.createElement('div');
      row.className = 'fish-item';
      const label = document.createElement('span');
      label.textContent = `${fishStars(def.stars)} ${def.name} · ${fish.weight}g · ${(fish.lengthMm / 10).toFixed(1)} cm`;
      row.append(label);
      const sell = document.createElement('button');
      sell.textContent = `卖出 +${def.price}`;
      sell.dataset.sellFish = fish.id;
      sell.addEventListener('click', () =>
        onAction(
          { type: 'SELL_FISH', fishId: fish.id },
          `${def.name}卖出了 ${def.price} 金币。`,
        ),
      );
      const gift = document.createElement('button');
      gift.textContent = `送给 ${cat.name}${cat.favoriteFish.includes(fish.speciesId) ? ' ♡' : ''}`;
      gift.dataset.giftFish = fish.id;
      gift.addEventListener('click', () =>
        onAction(
          {
            type: 'GIFT_FISH',
            fishId: fish.id,
            catId: cat.id,
          },
          `${cat.name} 收到了${def.name}，这件小事已经记下了。`,
        ),
      );
      row.append(sell, gift);
      return row;
    }),
  );
  if (!f.inventory.length)
    get('fish-inventory').textContent = '鱼篓空空的。下一竿会遇见谁呢？';
  get('atlas-count').textContent = `${discovered}/${FISH.length}`;
  get('atlas-list').replaceChildren(
    ...FISH.map((fish) => {
      const record = f.atlas[fish.id];
      const card = document.createElement('article');
      card.className = 'fish-entry';
      card.dataset.species = fish.id;
      card.dataset.stars = String(fish.stars);
      card.dataset.discovered = String(record.count > 0);
      card.innerHTML = `<span class="fish-silhouette" aria-hidden="true">${fishIllustration(fish.id)}</span><strong>${fishStars(fish.stars)} ${record.count ? fish.name : '未发现的鱼影'}</strong><span>${fish.price} 金币 · ${fish.behavior}</span><p>出没：${fishHabitats(
        fish.id,
      )
        .map((id) => SPOTS[id].name)
        .join(
          '、',
        )}</p><p>${fish.clue}</p><p>${fish.requiredBreed ? `仅限${CAT_BREEDS[fish.requiredBreed].name}同行 · ${fish.requiredBreed === cat.breedId ? '品种条件已满足' : '需更换同行猫'}` : '所有品种都能钓到'}</p><p>体长范围：${(fish.minLengthMm / 10).toFixed(1)}～${(fish.maxLengthMm / 10).toFixed(1)} cm<br>鱼种最大长度：${(fish.maxLengthMm / 10).toFixed(1)} cm<br>个人最长：${record.bestLengthMm ? `${(record.bestLengthMm / 10).toFixed(1)} cm` : '尚无纪录'}</p><small>${record.count ? `已钓 ${record.count} 条 · 最大 ${record.bestWeight}g` : '符合线索后，来点耐心'}</small>`;
      return card;
    }),
  );
  const result = f.lastResult;
  get('fish-result').textContent = result
    ? result.caught
      ? result.speciesId
        ? `钓到了！${fishStars(fishById(result.speciesId).stars)} ${fishById(result.speciesId).name} · ${result.weight}g · ${(result.lengthMm / 10).toFixed(1)} cm · 可卖 ${fishById(result.speciesId).price} 金币，已放入鱼篓。`
        : `钓到了${LOOT[result.catchKind as keyof typeof LOOT]}！${result.catchKind === 'coins' ? `已打开，获得 ${result.lootAmount} 金币。` : result.catchKind === 'can' ? '罐头已收好，需要时可以恢复体力。' : '已收入鱼篓补给。'}`
      : `${result.reason === 'missed-hook' ? '错过了提竿时机' : result.reason === 'line-break' ? '张力太极端，鱼儿挣脱了' : '鱼儿溜走了'}。${result.trashAmount ? '钓到一件垃圾，已收好，可回收换取 3 金币。' : '调整一下，再试一竿吧。'}`
    : '';
}
