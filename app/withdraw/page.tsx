"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getCoins, setCoinsBalance, COINS_PER_BAHT } from "../lib/coins";

const MIN_WITHDRAW_COINS = 30; // Omise ขั้นต่ำ 30 บาท = 30 เหรียญ

export default function WithdrawPage() {
  const [coins, setCoins] = useState(0);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setCoins(getCoins());
  }, []);

  const handleWithdraw = useCallback(async () => {
    setMessage(null);
    const amount = Math.floor(parseFloat(withdrawAmount) || 0);
    if (amount < MIN_WITHDRAW_COINS) {
      setMessage({
        type: "error",
        text: `กรุณาถอนอย่างน้อย ${MIN_WITHDRAW_COINS} เหรียญ (เทียบเท่า ${MIN_WITHDRAW_COINS} บาท) ตามข้อกำหนด Omise`,
      });
      return;
    }
    const balance = getCoins();
    if (amount > balance) {
      setMessage({ type: "error", text: `ยอดเหรียญไม่เพียงพอ (คงเหลือ ${balance.toLocaleString("th-TH")} เหรียญ)` });
      return;
    }

    setLoading(true);
    const amountSatang = amount * COINS_PER_BAHT * 100; // เหรียญ → บาท → satang

    try {
      const res = await fetch("/api/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountSatang }),
      });
      const data = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: data.error ?? "ถอนเงินผ่าน Omise ไม่สำเร็จ" });
        setLoading(false);
        return;
      }

      const newBalance = balance - amount;
      setCoinsBalance(newBalance);
      setCoins(newBalance);
      setWithdrawAmount("");
      const baht = amount * COINS_PER_BAHT;
      setMessage({
        type: "success",
        text: `ถอน ${amount.toLocaleString("th-TH")} เหรียญ (${baht.toLocaleString("th-TH")} บาท) ผ่าน Omise สำเร็จ เงินจะโอนเข้าบัญชีตามที่ตั้งค่า`,
      });
    } catch {
      setMessage({ type: "error", text: "เกิดข้อผิดพลาดในการเชื่อมต่อ Omise" });
    } finally {
      setLoading(false);
    }
  }, [withdrawAmount]);

  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-12 dark:bg-zinc-950">
        <main className="w-full max-w-md">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-center text-zinc-500">กำลังโหลด...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-12 dark:bg-zinc-950">
      <main className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            ← กลับหน้าชำระเงิน
          </Link>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            ถอนเหรียญ
          </h1>
          <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
            อัตราแลกเปลี่ยน 1 เหรียญ = 1 บาท • ถอนผ่าน Omise ขั้นต่ำ {MIN_WITHDRAW_COINS} เหรียญ
          </p>

          <div className="mb-6 rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">ยอดเหรียญคงเหลือ</p>
            <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {coins.toLocaleString("th-TH")} <span className="text-base font-normal text-zinc-500">เหรียญ</span>
            </p>
          </div>

          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              จำนวนเหรียญที่ต้องการถอน
            </label>
            <input
              type="number"
              min="1"
              max={coins}
              step="1"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500"
            />
            {withdrawAmount && !Number.isNaN(parseFloat(withdrawAmount)) && (
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
                เทียบเท่า{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {(Math.floor(parseFloat(withdrawAmount) || 0) * COINS_PER_BAHT).toLocaleString("th-TH")} บาท
                </span>
              </p>
            )}
          </div>

          {message && (
            <div
              className={`mb-4 rounded-lg p-3 text-sm ${
                message.type === "success"
                  ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300"
                  : "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300"
              }`}
            >
              {message.text}
            </div>
          )}

          <button
            type="button"
            onClick={handleWithdraw}
            disabled={loading || coins < MIN_WITHDRAW_COINS || !withdrawAmount.trim()}
            className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-zinc-400 disabled:cursor-not-allowed"
          >
            {loading ? "กำลังดำเนินการผ่าน Omise..." : "ถอนเหรียญผ่าน Omise"}
          </button>
        </div>
      </main>
    </div>
  );
}
