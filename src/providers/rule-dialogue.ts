import type {
  DialogueContext,
  DialogueProvider,
  DialogueProposal,
} from '../application/dialogue';

export class RuleBasedDialogueProvider implements DialogueProvider {
  async generate(context: DialogueContext): Promise<DialogueProposal> {
    const text = /鱼|fish/i.test(context.message)
      ? '鱼？我的耳朵已经竖起来了。等熟悉一些，我们可以一起在窗边吃吗？'
      : context.recentMemories.length > 0
        ? '我记得你来陪我说过话。今天也可以在这里，安静地坐一会儿吗？'
        : '喵……你好，我是 Mochi。我有一点怕生，不过这里看起来很温暖。';
    return { catId: context.cat.id, text };
  }
}
