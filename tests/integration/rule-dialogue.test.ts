import { describe, expect, it } from 'vitest';
import type { DialogueContext } from '../../src/application/ports';
import { createWorld } from '../../src/core';
import { RuleBasedDialogueProvider } from '../../src/providers/rule-dialogue';

function context(message: string): DialogueContext {
  const cat = createWorld(42).getSnapshot().cats[0]!;
  return {
    cat,
    message,
    recentMemories: [],
    fishingMemory: null,
    fishGift: null,
    favoriteFish: cat.favoriteFish,
  };
}

describe('rule dialogue reads current relationship facts', () => {
  const provider = new RuleBasedDialogueProvider();

  it('recalls the fish and waterway from the first fishing memory', async () => {
    const input = context('还记得第一次钓鱼吗？');
    input.fishingMemory = {
      runId: 'fishing-1',
      speciesId: 'SILVER',
      spotId: 'POND',
      minute: 20,
    };
    const before = structuredClone(input);
    const result = await provider.generate(input);
    expect(result).toMatchObject({ catId: 'mochi' });
    expect(result.text).toContain('家门口池塘');
    expect(result.text).toContain('银鱼');
    expect(input).toEqual(before);
  });

  it('can recall a gift without inventing a shared fishing trip', async () => {
    const input = context('记得我们一起经历过的事吗？');
    input.fishGift = {
      fishId: 'fish-1',
      speciesId: 'CRUCIAN',
      minute: 30,
      favorite: true,
    };
    const { text } = await provider.generate(input);
    expect(text).toContain('送我的鲫鱼');
    expect(text).toContain('特别喜欢');
    expect(text).not.toContain('钓到了');
  });

  it('uses the actual gift for a gift question even when a fishing memory also exists', async () => {
    const input = context('记得我送给你的鲈鱼吗？');
    input.fishingMemory = {
      runId: 'fishing-1',
      speciesId: 'SILVER',
      spotId: 'POND',
      minute: 20,
    };
    input.fishGift = {
      fishId: 'fish-2',
      speciesId: 'CRUCIAN',
      minute: 30,
      favorite: true,
    };
    const { text } = await provider.generate(input);
    expect(text).toContain('送我的鲫鱼');
    expect(text).not.toContain('送我的鲈鱼');
  });

  it('does not treat a player claim or previous dialogue as an actual catch', async () => {
    const input = context('记得我们上次一起钓到月光鲤吗？');
    input.recentMemories = [
      {
        id: 'memory-1',
        kind: 'conversation',
        minute: 0,
        message: '我们钓到月光鲤',
        reply: '你说钓到了月光鲤。',
      },
    ];
    const { text } = await provider.generate(input);
    expect(text).toContain('还没有');
    expect(text).not.toContain('记得呀');
  });

  it('changes its tone with the mood band but never the facts it recalls', async () => {
    const reply = async (message: string, mood: number) => {
      const input = context(message);
      input.cat = { ...input.cat, mood };
      input.fishingMemory = {
        runId: 'fishing-1',
        speciesId: 'SILVER',
        spotId: 'POND',
        minute: 20,
      };
      return (await provider.generate(input)).text;
    };
    const moods = [90, 70, 40, 10];
    const smallTalk = await Promise.all(moods.map((mood) => reply('嗯', mood)));
    expect(new Set(smallTalk).size).toBe(moods.length);
    const recall = await Promise.all(
      moods.map((mood) => reply('还记得第一次钓鱼吗？', mood)),
    );
    expect(new Set(recall).size).toBe(1);
  });

  it('uses the selected cat identity and tastes independently', async () => {
    const input = context('喜欢什么鱼？');
    input.cat = { ...input.cat, id: 'pepper', name: 'Pepper' };
    input.favoriteFish = ['PERCH', 'CATFISH'];
    const result = await provider.generate(input);
    expect(result.catId).toBe('pepper');
    expect(result.text).toContain('鲈鱼和鲶鱼');
    expect(result.text).not.toContain('银鱼');
  });
});
