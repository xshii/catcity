/** The domestic cat is the stray's to be (spec 041 T-14): no template has it. */
export const CAT_BREED_IDS = [
  'DOMESTIC',
  'RAGDOLL',
  'BRITISH_SHORTHAIR',
] as const;
export type CatBreed = (typeof CAT_BREED_IDS)[number];
// Game-specific affinities, not claims about real cats' fishing abilities.
export const CAT_BREEDS: Record<
  CatBreed,
  { name: string; fishingHint: string }
> = {
  DOMESTIC: { name: '田园猫', fishingHint: '什么鱼都愿意陪你钓' },
  RAGDOLL: { name: '布偶猫', fishingHint: '能吸引 4 星锦鲤' },
  BRITISH_SHORTHAIR: { name: '英短猫', fishingHint: '能吸引 5 星月光鲤' },
};
