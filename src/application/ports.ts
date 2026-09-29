import type { CatEntity } from '../core';

export interface SaveRepository {
  read(): string | null;
  write(save: string): void;
}
export interface DialogueContext {
  cat: Pick<
    CatEntity,
    'id' | 'name' | 'mood' | 'playerBond' | 'personality' | 'preferences'
  >;
  message: string;
  recentMemories: CatEntity['memories'];
  fishingMemory: CatEntity['fishingMemory'];
  fishGift: CatEntity['fishGift'];
  favoriteFish: CatEntity['favoriteFish'];
}
export interface DialogueProposal {
  catId: string;
  text: string;
}
export interface DialogueProvider {
  generate(context: DialogueContext): Promise<unknown>;
}
