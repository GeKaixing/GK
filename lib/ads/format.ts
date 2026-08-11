/** 把美分金额格式化为货币字符串，例如 1500 → "$15.00"。 */
export function formatCents(cents: number, currency: string = "usd"): string {
  const code = currency.toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}
