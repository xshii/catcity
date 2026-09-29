import { bondLevel } from '../content/care';
import { fishById, SPOTS } from '../content/fishing';
import { moodBand, type MoodBand } from '../content/mood';
import type {
  DialogueContext,
  DialogueProposal,
  DialogueProvider,
} from '../application/ports';

/** Small talk in the tone of the cat's mood band; recalled facts never depend on it. */
const SMALL_TALK: Record<MoodBand, readonly string[]> = {
  happy: [
    '喵！今天心情特别好。我们现在就去河边吧？我来带路！',
    '你来啦！我正想找你呢。要不要一起去钓一竿？',
  ],
  calm: [
    '嗯，我在听。可以慢慢说，也可以邀请我一起去河边待一会。',
    '我把尾巴往旁边挪了挪，给你留了个位置。今天有什么想一起做的小事吗？',
    '有时候我不知道该怎么接话，不过和你待在这里，我很放松。',
  ],
  glum: ['今天有点闷……陪我坐一会，或者出去走走也好。'],
  low: ['……嗯。我在。'],
};

/** What a closer cat adds after its small talk, by bond level (spec 036); none at 初识. */
const CLOSER_TALK: readonly string[] = [
  '',
  '你的脚步声，我已经能认出来了。',
  '在你旁边，我可以放心地眯一会儿。',
  '今天也想挨着你坐。',
  '有你在的地方，就是家。',
];

export class RuleBasedDialogueProvider implements DialogueProvider {
  async generate(context: DialogueContext): Promise<DialogueProposal> {
    const { message, cat } = context;
    const gift = context.fishGift;
    const giftMemory = gift
      ? `你送我的${fishById(gift.speciesId).name}，我记得呢。${gift.favorite ? '那是我特别喜欢的鱼，谢谢你记得我的口味。' : '谢谢你想着我。'}`
      : null;
    let text: string;
    if (giftMemory && /送|礼物|收到|gift/i.test(message)) {
      text = giftMemory;
    } else if (/记得|回忆|上次|第一次|remember/i.test(message)) {
      text = context.fishingMemory
        ? `记得呀。第一次和你在${SPOTS[context.fishingMemory.spotId].name}钓到了${fishById(context.fishingMemory.speciesId).name}。我记得收竿时的水花，也记得你在身边。`
        : (giftMemory ??
          '我们还没有一起钓到鱼的回忆呢。要不要从今天开始，留下一件属于我们的回忆？');
    } else if (/累|难过|烦|不开心|孤独|tired|sad/i.test(message)) {
      text =
        '听起来今天不太轻松。先在我旁边歇一会吧，不用急着打起精神。想说说，还是一起去河边看看水？';
    } else if (/开心|高兴|好消息|成功|happy/i.test(message)) {
      text =
        '你的好心情好像也传过来了……我的尾巴都翘起来了。愿意告诉我，发生了什么好事吗？';
    } else if (/谢谢|喜欢你|陪伴|陪我|thank/i.test(message)) {
      text = '我也喜欢这样慢慢熟悉起来。想聊天就来找我，安静地坐在一起也很好。';
    } else if (/鱼|fish/i.test(message)) {
      text =
        giftMemory ??
        `我喜欢${context.favoriteFish.map((id) => fishById(id).name).join('和')}。下次一起去找找吗？`;
    } else if (/名字|你好|hello|hi\b/i.test(message)) {
      text = `喵……我是 ${cat.name}。有一点怕生，也有一点贪吃。你可以慢慢认识我。`;
    } else {
      const responses = SMALL_TALK[moodBand(cat.mood)];
      text =
        responses[context.recentMemories.length % responses.length]! +
        CLOSER_TALK[bondLevel(cat.playerBond)]!;
    }
    return { catId: cat.id, text };
  }
}
