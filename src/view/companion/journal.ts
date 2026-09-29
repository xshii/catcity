import type { GameSession } from '../../application';
import { fishById, SPOTS } from '../../content/fishing';

/** Read relationship facts; only the current fishing commands create these memories. */
export function mountCompanionship(session: GameSession) {
  const get = (id: string) => document.getElementById(id)!;
  const render = () => {
    const world = session.getSnapshot();
    const cat =
      world.cats.find((item) => item.id === session.selectedEntity) ??
      world.cats[0]!;
    const fishing = cat.fishingMemory;
    const gift = cat.fishGift;
    const remembered = !!fishing || !!gift;
    get('reunion').textContent = fishing
      ? `你又来啦。还想去我们第一次钓鱼的${SPOTS[fishing.spotId].name}吗？`
      : gift
        ? `你送我的${fishById(gift.speciesId).name}，我还记得呢。`
        : `我是 ${cat.name}。这里给你留了个位置。`;
    get('bond').textContent = remembered
      ? '有了一段共同回忆 · 慢慢熟悉中'
      : cat.memories.length
        ? '已经聊过几次 · 慢慢熟悉中'
        : '初次见面 · 不用急着熟悉';
    get('memory-empty').hidden = remembered;
    get('memory-card').hidden = !remembered;
    get('journal-count').textContent = remembered
      ? '01 / 一起经历过'
      : '等待第一个瞬间';
    if (fishing) {
      get('memory-date').textContent =
        `第 ${Math.floor(fishing.minute / 1440) + 1} 天 · ${SPOTS[fishing.spotId].name}`;
      get('memory-fact').textContent =
        `第一次和 ${cat.name} 钓到${fishById(fishing.speciesId).name}`;
      get('memory-caption').textContent =
        '“我记得收竿时的水花，也记得身边的你。”';
    } else if (gift) {
      get('memory-date').textContent =
        `第 ${Math.floor(gift.minute / 1440) + 1} 天 · 一份小礼物`;
      get('memory-fact').textContent =
        `${cat.name} 收到了你送的${fishById(gift.speciesId).name}`;
      get('memory-caption').textContent = gift.favorite
        ? '“你记得我的口味，我也记得这份心意。”'
        : '“谢谢你想着我。”';
    }
  };
  session.subscribe(render);
  render();
}
