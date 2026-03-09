export const COINS_STORAGE_KEY = "payment_page_coins";

export const COINS_PER_BAHT = 1; // 1 เหรียญ = 1 บาท (อัตราแลกเปลี่ยน)

export function getCoins(): number {
  if (typeof window === "undefined") return 0;
  const v = localStorage.getItem(COINS_STORAGE_KEY);
  return parseInt(v ?? "0", 10) || 0;
}

export function setCoinsBalance(value: number): void {
  if (typeof window === "undefined") return;
  const n = Math.max(0, Math.floor(value));
  localStorage.setItem(COINS_STORAGE_KEY, String(n));
}
