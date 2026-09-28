import { z } from 'zod';
import type {
  DialogueContext,
  DialogueProvider,
  DialogueProposal,
} from './ports';

const proposalSchema = z.strictObject({
  catId: z.string().min(1).max(100),
  text: z.string().trim().min(1).max(500),
});

export async function resolveDialogue(
  provider: DialogueProvider,
  fallback: DialogueProvider,
  context: DialogueContext,
  timeoutMs = 1500,
): Promise<{ proposal: DialogueProposal; usedFallback: boolean }> {
  const validate = (value: unknown) => {
    const proposal = proposalSchema.parse(value);
    if (proposal.catId !== context.cat.id)
      throw new Error('Dialogue target mismatch');
    return proposal;
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      Promise.resolve().then(() => provider.generate(structuredClone(context))),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Dialogue timeout')),
          timeoutMs,
        );
      }),
    ]);
    return { proposal: validate(result), usedFallback: false };
  } catch {
    return {
      proposal: validate(await fallback.generate(structuredClone(context))),
      usedFallback: true,
    };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
