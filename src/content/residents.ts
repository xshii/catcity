/** Residents, the lodges' NPC cats (spec 041 R-40 – R-46, design 6). */

/** The city holds at most this many residents (R-46). */
export const MAX_RESIDENTS = 16;

/**
 * A resident may move in when the game clock reaches a multiple of this: the start of
 * each game day, one at most (R-41).
 */
export const ARRIVAL_MINUTES = 24 * 60;

/**
 * Residents' names, none a companion's and at least one for every resident: each city
 * deals them out in its own order, so no two of its residents share one.
 */
export const RESIDENT_NAMES = [
  '年年',
  '豆豆',
  '米米',
  '团团',
  '圆圆',
  '乐乐',
  '多多',
  '球球',
  '毛毛',
  '花花',
  '点点',
  '糖糖',
  '果果',
  '朵朵',
  '贝贝',
  '妞妞',
  '丁丁',
  '皮皮',
  '可可',
  '奇奇',
  '甜甜',
  '暖暖',
  '糯糯',
  '栗栗',
] as const;
