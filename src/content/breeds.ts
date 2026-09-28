export const CAT_BREED_IDS = ['RAGDOLL', 'BRITISH_SHORTHAIR'] as const;
export type CatBreed = (typeof CAT_BREED_IDS)[number];
// Game-specific affinities, not claims about real cats' fishing abilities.
export const CAT_BREEDS: Record<
  CatBreed,
  { name: string; fishingHint: string }
> = {
  RAGDOLL: { name: '布偶猫', fishingHint: '能吸引 4 星锦鲤' },
  BRITISH_SHORTHAIR: { name: '英短猫', fishingHint: '能吸引 5 星月光鲤' },
};
