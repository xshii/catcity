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
import { MAX_STAT, type CatEntity, type WorldState } from '../../core';
import { fishIllustration } from '../art/illustrations';
import { withMoodNote } from '../shell/mood';
import { atlasStars, SCREEN_COPY } from './screen';

type FishAction = Extract<GameCommand, { type: 'SELL_FISH' | 'GIFT_FISH' }>;
type BagFish = WorldState['fishing']['inventory'][number];
type FishBag = ReturnType<typeof mountFishBag>;

/**
 * The bag's fish, each a row with sell and gift buttons. The clock changes the world every
 * second: rows are kept by fish id, so a tap that spans a tick and keyboard focus stay on
 * their button (spec 041, design 10.2). Clicks return commands to the application adapter.
 */
export function mountFishBag(
  inventory: HTMLElement,
  onAction: (command: FishAction, message: string) => void,
) {
  const rows = new Map<string, { row: HTMLElement; gift: HTMLButtonElement }>();
  /** A gift goes to the cat chosen when the bag last rendered, not when its row was made. */
  let chosen: CatEntity;
  const bagRow = (fish: BagFish) => {
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
    gift.dataset.giftFish = fish.id;
    gift.addEventListener('click', () =>
      onAction(
        {
          type: 'GIFT_FISH',
          fishId: fish.id,
          catId: chosen.id,
        },
        `${chosen.name} 收到了${def.name}，这件小事已经记下了。`,
      ),
    );
    row.append(sell, gift);
    const made = { row, gift };
    rows.set(fish.id, made);
    return made;
  };
  const render = (fishes: readonly BagFish[], cat: CatEntity) => {
    chosen = cat;
    const shown = fishes.map((fish) => {
      const { row, gift } = rows.get(fish.id) ?? bagRow(fish);
      const giftText = `送给 ${cat.name}${cat.favoriteFish.includes(fish.speciesId) ? ' ♡' : ''}`;
      if (gift.textContent !== giftText) gift.textContent = giftText;
      return row;
    });
    for (const [id, { row }] of rows) if (!shown.includes(row)) rows.delete(id);
    // Only another set or order of fish touches the list.
    if (
      shown.length !== inventory.children.length ||
      shown.some((row, index) => row !== inventory.children[index])
    )
      inventory.replaceChildren(...shown);
    if (!fishes.length)
      inventory.textContent = '鱼篓空空的。下一竿会遇见谁呢？';
  };
  return { render };
}

/** Read-only catalogue rendering; the bag renders its own rows. */
export function renderFishingCatalog(
  /** The fishing markup's elements by id. */
  get: <T extends HTMLElement = HTMLElement>(id: string) => T,
  world: WorldState,
  cat: CatEntity,
  bag: FishBag,
  /** How the last result changed its cat's mood band, if it did (spec 032). */
  resultNote: string,
) {
  const f = world.fishing;
  const discovered = discoveredSpecies(f.atlas);
  get('fish-supplies').textContent =
    `垃圾 ${f.supplies.trash} 件 · 罐头 ${f.supplies.cans} 份 · 已打开金币袋 ${f.supplies.coinBags} 个`;
  get<HTMLButtonElement>('use-can').disabled =
    f.supplies.cans === 0 || cat.needs.energy === MAX_STAT;
  get<HTMLButtonElement>('recycle-trash').disabled = f.supplies.trash === 0;
  get('fish-tastes').textContent =
    `${cat.name} 喜欢：${cat.favoriteFish.map((id) => fishById(id).name).join('、')}。${cat.fishGift ? `上次收到${fishById(cat.fishGift.speciesId).name}，${cat.fishGift.favorite ? '特别开心。' : '轻轻说了谢谢。'}` : '鱼可以卖出，也可以留给喜欢它的猫。'}`;
  get('bag-count').textContent = `${f.inventory.length}/30`;
  bag.render(f.inventory, cat);
  get('atlas-count').textContent = `${discovered}/${FISH.length}`;
  get('atlas-list').replaceChildren(
    ...FISH.map((fish) => {
      const record = f.atlas[fish.id];
      const card = document.createElement('article');
      card.className = 'fish-entry';
      card.dataset.species = fish.id;
      card.dataset.stars = String(fish.stars);
      card.dataset.discovered = String(record.count > 0);
      const stars = atlasStars(fish.id, record);
      if (stars) card.dataset.lengthStars = String(stars.lit);
      const silhouette = `<span class="fish-silhouette" aria-hidden="true">${fishIllustration(fish.id)}</span>`;
      const where = `<p>出没：${fishHabitats(fish.id)
        .map((id) => SPOTS[id].name)
        .join('、')}</p>`;
      // A fish never caught keeps its stars and where it may be found, nothing more.
      card.innerHTML = !record.count
        ? `${silhouette}<strong>${fishStars(fish.stars)} ${SCREEN_COPY.atlas.unknown}</strong>${where}`
        : `${silhouette}<strong>${fishStars(fish.stars)} ${fish.name}</strong><span>${fish.price} 金币 · ${fish.behavior}</span>${where}<p>${fish.clue}</p><p>${fish.requiredBreed ? `仅限${CAT_BREEDS[fish.requiredBreed].name}同行 · ${fish.requiredBreed === cat.breedId ? '品种条件已满足' : '需更换同行猫'}` : '所有品种都能钓到'}</p><p>体长范围：${(fish.minLengthMm / 10).toFixed(1)}～${(fish.maxLengthMm / 10).toFixed(1)} cm<br>鱼种最大长度：${(fish.maxLengthMm / 10).toFixed(1)} cm<br>个人最长：${(record.bestLengthMm / 10).toFixed(1)} cm${stars ? ` ${starsMarkup(stars)}` : ''}</p><small>已钓 ${record.count} 条 · 最大 ${record.bestWeight}g</small>`;
      return card;
    }),
  );
  const result = f.lastResult;
  get('fish-result').textContent = result
    ? withMoodNote(resultText(result), resultNote)
    : '';
}

/** A record's bronze, silver and gold, each lit or not; read as words, not glyphs. */
function starsMarkup({
  marks,
  label,
}: NonNullable<ReturnType<typeof atlasStars>>) {
  const { glyph } = SCREEN_COPY.atlas;
  const icons = marks
    .map(({ name, lit }) =>
      lit
        ? `<i class="lit">${glyph.lit}${name}</i>`
        : `<i>${glyph.unlit}${name}</i>`,
    )
    .join(' ');
  return `<span class="length-stars" role="img" aria-label="${label}">${icons}</span>`;
}

function resultText(result: NonNullable<WorldState['fishing']['lastResult']>) {
  return result.caught
    ? result.speciesId
      ? `钓到了！${fishStars(fishById(result.speciesId).stars)} ${fishById(result.speciesId).name} · ${result.weight}g · ${(result.lengthMm / 10).toFixed(1)} cm · 可卖 ${fishById(result.speciesId).price} 金币，已放入鱼篓。`
      : `钓到了${LOOT[result.catchKind as keyof typeof LOOT]}！${result.catchKind === 'coins' ? `已打开，获得 ${result.lootAmount} 金币。` : result.catchKind === 'can' ? '罐头已收好，需要时可以恢复体力。' : '已收入鱼篓补给。'}`
    : `${result.reason === 'missed-hook' ? '错过了提竿时机' : result.reason === 'line-break' ? '张力太极端，鱼儿挣脱了' : '鱼儿溜走了'}。${result.trashAmount ? '钓到一件垃圾，已收好，可回收换取 3 金币。' : '调整一下，再试一竿吧。'}`;
}
