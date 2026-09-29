import { BAITS, FISHING } from '../../content/fishing';
import type { AnglingRun } from '../../minigames/angling';
import { SCREEN_COPY } from './screen';

const CAST_COST = FISHING.cast.staminaCost;

/** Markup of the river tools and the in-scene console; wiring lives in panel.ts. */
export const ANGLING_MARKUP = `
    <div id="river-tools" hidden><div class="river-tools-heading"><h2 id="river-tools-title"></h2><button id="river-tools-close" aria-label="返回钓鱼">返回钓鱼 ↓</button></div>
    <section id="river-panel-gear" role="tabpanel" aria-labelledby="river-tab-gear" hidden>
    <div class="angling-title"><div><p class="eyebrow">ONE MORE CAST, TOGETHER</p><h2>钓具与鱼篓</h2></div><span id="fishing-level"></span></div>
    <p id="fishing-resources"></p>
    <div id="bait-tray" class="bait-tray"><button data-bait="BREAD">🍞<span>面包<small>常见鱼 · 无限</small></span></button><button data-bait="WORM">🪱<span>蚯蚓<small>鲈鱼 / 锦鲤</small></span></button><button data-bait="SHRIMP">🦐<span>虾饵<small>鲶鱼 / 月光鲤</small></span></button></div>
    <div class="fishing-prep"><label>钓点<select id="fish-location"></select></label><label>同行伙伴<select id="fish-companion"></select></label><label class="bait-select">鱼饵<select id="fish-bait"></select></label></div>
    <label class="direction-label">抛投方向 <output id="direction-value"></output><input type="range" id="fish-direction" min="-${FISHING.input.maxDirection}" max="${FISHING.input.maxDirection}" step="5" value="-30" aria-label="抛投方向"></label>
    <label class="direction-label depth-label">近远落点 <output id="depth-value"></output><input type="range" id="fish-depth" min="0" max="100" step="5" value="50" aria-label="近远落点"></label>
    <p id="companion-specialty" class="fishing-clue"></p><p id="spot-hint" class="fishing-clue"></p><div id="spot-unlocks" class="spot-unlocks"></div>
    <div class="fishing-actions"><button id="cast-start" class="primary">准备抛竿 ↗ · 抛出耗 ${CAST_COST} 体力</button><button id="invite-pepper">邀请 Pepper</button></div>
    <div id="angling-live" class="scene-console" hidden><div class="bar-heading"><strong id="angling-phase"></strong><span id="angling-status"></span></div><p id="angling-instruction"></p>
      <div id="angling-bar" class="angling-bar" role="meter" aria-label="钓鱼操作条" aria-valuemin="0" aria-valuemax="100"><span id="angling-green" class="angling-green"></span><i id="angling-cursor" class="angling-cursor"></i></div>
      <div class="fight-meters"><label>收线 <progress id="fish-progress" max="100" value="0"></progress></label><label>鱼线 <progress id="line-health" max="100" value="100"></progress></label></div>
      <button id="fish-control" class="primary fish-control" aria-label="钓鱼操作"><span class="reel-icon" aria-hidden="true">◎</span><span id="control-label">按住蓄力，松开抛竿</span></button>
      <div class="fishing-actions"><button id="fish-pause">暂停</button><button id="fish-cancel">收竿离开</button></div>
    </div>
    <details class="bait-shop"><summary>补充鱼饵</summary><div class="fishing-actions"><button data-buy-bait="WORM">买蚯蚓 · ${BAITS.WORM.price} 金币</button><button data-buy-bait="SHRIMP">买虾饵 · ${BAITS.SHRIMP.price} 金币</button></div><p>面包无限供应。星级表示鱼种难度；售价按鱼种固定，重量记录个人最佳。</p></details></section>
    <section id="river-panel-bag" role="tabpanel" aria-labelledby="river-tab-bag" hidden>
    <details id="fish-bag" open><summary>鱼篓 <span id="bag-count"></span> · 卖鱼或送给伙伴</summary><p id="fish-tastes"></p><div id="fish-inventory"></div></details>
    <details id="fish-supply-detail" open><summary>钓获补给与垃圾</summary><p id="fish-supplies"></p><div class="fishing-actions"><button id="use-can">吃罐头 · +${FISHING.supplies.canEnergy} 体力</button><button id="recycle-trash">回收垃圾 · +${FISHING.supplies.trashCoins} 金币</button></div><p class="fishing-clue">0–${FISHING.trash.maxStars} 星鱼局失败时有概率钓到垃圾；主动收竿不会获得。面包饵轻抛可钓到罐头或金币袋。</p></details>
    </section><section id="river-panel-atlas" role="tabpanel" aria-labelledby="river-tab-atlas" hidden><details id="fish-atlas"><summary>鱼类图鉴 <span id="atlas-count"></span> · 星级、习性与线索</summary><div id="atlas-list" class="atlas-list"></div></details></section><section id="panel-cats" role="tabpanel" hidden></section></div><p id="fish-result" class="fish-result river-live-result" role="status"></p>`;

/** Button-flow phase titles and instructions (frozen flow, spec 030). */
export const BUTTON_PHASE_NAMES: Record<AnglingRun['phase'], string> = {
  charge: '① 蓄力抛投',
  waiting: '② 等待咬钩',
  hook: '③ 绿色区提竿',
  fight: '④ 控制张力',
  caught: '钓到了',
  escaped: '鱼溜走了',
};
export const BUTTON_PHASE_INSTRUCTIONS: Record<AnglingRun['phase'], string> = {
  charge: `按住蓄力、松开抛投。在绿区松开＝${SCREEN_COPY.cast.precise.buttons}。`,
  waiting: '浮漂动了就准备提竿，现在先松开。',
  hook: '白色游标进入绿色区间时，按一下！',
  fight: '按住增加张力，松开降低。跟着绿色区间，收线进度满就能钓上来。',
  caught: '',
  escaped: '',
};
