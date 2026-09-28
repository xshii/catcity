import type {
  DialogueContext,
  DialogueProvider,
} from '../../src/application/ports';

export class MockDialogueProvider implements DialogueProvider {
  constructor(
    private readonly respond: (
      context: DialogueContext,
    ) => unknown | Promise<unknown>,
  ) {}
  async generate(context: DialogueContext): Promise<unknown> {
    return this.respond(context);
  }
}
