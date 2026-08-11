// 广告投放配置：信息流插入间隔、价格、时长档位。

/** 每 N 条有机帖插入 1 条广告（在第 N、2N、3N… 位）。 */
export const AD_STRIDE = 5;

/** 每日投放单价（美分）。 */
export const AD_DAILY_PRICE_CENTS = 1000;

/** 可选投放时长（天）。 */
export const AD_DURATION_DAYS = [1, 3, 7] as const;

export type AdDurationDay = (typeof AD_DURATION_DAYS)[number];

export function isValidAdDuration(days: number): days is AdDurationDay {
  return (AD_DURATION_DAYS as readonly number[]).includes(days);
}

export const AD_CURRENCY = "usd";

export function adPriceCents(days: number): number {
  return days * AD_DAILY_PRICE_CENTS;
}
