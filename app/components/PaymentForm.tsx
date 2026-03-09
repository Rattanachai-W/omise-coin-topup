"use client";

import Script from "next/script";
import { useCallback, useEffect, useState } from "react";

declare global {
  interface Window {
    OmiseCard?: {
      configure: (config: { publicKey: string }) => void;
      open: (config: {
        amount: number;
        currency: string;
        defaultPaymentMethod: string;
        onCreateTokenSuccess: (nonce: string) => void;
        onFormClosed?: () => void;
      }) => void;
    };
  }
}

type PaymentMethod = "promptpay" | "credit_card";

type ChargeResponse = {
  id?: string;
  status?: string;
  amount?: number;
  authorize_uri?: string | null;
  qr_image_uri?: string | null;
  expires_at?: string | null;
  paid_at?: string | null;
  failure_message?: string | null;
  error?: string;
};

const OMISE_SCRIPT = "https://cdn.omise.co/omise.js";

const AMOUNT_OPTIONS: readonly number[] = [50, 100, 250, 400, 800, 1500];
const AMOUNT_SET = new Set<number>(AMOUNT_OPTIONS);

import { getCoins, setCoinsBalance, COINS_STORAGE_KEY, COINS_PER_BAHT } from "../lib/coins";

type PopupState = { open: true; type: "success" | "error"; message: string } | { open: false };

export default function PaymentForm() {
  const [amount, setAmount] = useState<number | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("credit_card");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrUri, setQrUri] = useState<string | null>(null);
  const [qrChargeId, setQrChargeId] = useState<string | null>(null);
  const [qrPaymentAmountBaht, setQrPaymentAmountBaht] = useState<number | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [popup, setPopup] = useState<PopupState>({ open: false });
  const [omiseReady, setOmiseReady] = useState(false);
  const [coins, setCoins] = useState(0);

  useEffect(() => {
    setCoins(getCoins());
  }, []);

  const addCoins = useCallback((baht: number) => {
    const toAdd = Math.floor(baht) * COINS_PER_BAHT;
    if (toAdd <= 0) return;
    setCoins((prev) => {
      const next = prev + toAdd;
      setCoinsBalance(next);
      return next;
    });
  }, []);

  const showPopup = useCallback((type: "success" | "error", message: string) => {
    setPopup({ open: true, type, message });
  }, []);

  const closePopup = useCallback(() => {
    setPopup({ open: false });
  }, []);

  const closeQrModal = useCallback(() => {
    setQrUri(null);
    setQrChargeId(null);
    setQrPaymentAmountBaht(null);
    setQrExpiresAt(null);
  }, []);

  useEffect(() => {
    if (!popup.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closePopup();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [popup.open, closePopup]);

  useEffect(() => {
    if (!qrUri) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeQrModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qrUri, closeQrModal]);

  // โพลสถานะ charge ของ PromptPay เมื่อผู้ใช้สแกน QR จนรู้ผลสำเร็จ/ล้มเหลว (Omise อัปเดตสถานะเมื่อลูกค้าชำระหรือ QR หมดอายุ)
  useEffect(() => {
    if (!qrChargeId || !qrUri) return;
    const poll = async (): Promise<boolean> => {
      try {
        const res = await fetch(`/api/charge/${qrChargeId}`);
        const data = await res.json();
        if (!res.ok) return false;
        const status = data.status as string | undefined;
        if (status === "successful") {
          setSuccess(true);
          const addedBaht = qrPaymentAmountBaht ?? 0;
          addCoins(addedBaht);
          showPopup("success", `ชำระเงินสำเร็จ ได้รับ ${addedBaht} เหรียญ`);
          closeQrModal();
          return true;
        }
        if (status === "failed" || status === "expired") {
          const msg =
            status === "expired"
              ? "QR Code หมดอายุ"
              : data.failure_message || "การชำระเงินไม่สำเร็จ";
          showPopup("error", msg);
          closeQrModal();
          return true;
        }
      } catch {
        // ไม่ต้องแจ้ง error ทุกครั้งที่โพล fail
      }
      return false;
    };
    void poll(); // เช็คทันทีเมื่อเปิด Modal
    const t = setInterval(() => {
      void poll().then((done) => {
        if (done) clearInterval(t);
      });
    }, 3000);
    return () => clearInterval(t);
  }, [qrChargeId, qrUri, qrPaymentAmountBaht, showPopup, closeQrModal, addCoins]);

  // นับถอยหลัง QR หมดอายุ
  useEffect(() => {
    if (!qrExpiresAt) {
      setCountdown(null);
      return;
    }
    const update = () => {
      const end = new Date(qrExpiresAt).getTime();
      const now = Date.now();
      const left = Math.max(0, Math.floor((end - now) / 1000));
      if (left <= 0) {
        setCountdown("หมดอายุ");
        return true;
      }
      const m = Math.floor(left / 60);
      const s = left % 60;
      setCountdown(`${m}:${s.toString().padStart(2, "0")}`);
      return false;
    };
    update();
    const t = setInterval(() => {
      if (update()) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [qrExpiresAt]);

  const publicKey = process.env.NEXT_PUBLIC_OMISE_PUBLIC_KEY ?? "";

  const handleScriptLoad = useCallback(() => {
    if (typeof window !== "undefined" && window.OmiseCard && publicKey) {
      window.OmiseCard.configure({ publicKey });
      setOmiseReady(true);
    }
  }, [publicKey]);

  const handlePay = useCallback(async () => {
    if (amount == null || !AMOUNT_SET.has(amount)) {
      const msg = "กรุณาเลือกจำนวนเงิน";
      setError(msg);
      showPopup("error", msg);
      return;
    }
    const num = amount * 100; // บาท -> satang

    setError(null);
    setQrUri(null);
    setQrChargeId(null);
    setQrPaymentAmountBaht(null);
    setQrExpiresAt(null);
    setSuccess(false);
    setLoading(true);

    // PromptPay: เรียก API เลย แล้วแสดง QR ทันที (ไม่เปิดฟอร์ม Omise)
    if (method === "promptpay") {
      try {
        const res = await fetch("/api/charge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: num,
            currency: "thb",
            promptpay: true,
          }),
        });

        const data: ChargeResponse = await res.json();

        if (!res.ok) {
          const msg = data.error ?? "เกิดข้อผิดพลาด";
          setError(msg);
          showPopup("error", msg);
          return;
        }

        if (data.qr_image_uri && data.id) {
          setQrUri(data.qr_image_uri);
          setQrChargeId(data.id);
          setQrPaymentAmountBaht(amount);
          setQrExpiresAt(data.expires_at ?? null);
        } else {
          showPopup("error", "ไม่พบ QR Code");
        }
      } catch (e) {
        const msg = "เกิดข้อผิดพลาดในการเชื่อมต่อ";
        setError(msg);
        showPopup("error", msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    // บัตรเครดิต: เปิดฟอร์ม Omise ก่อน
    if (!publicKey) {
      const msg = "ยังไม่ได้ตั้งค่า Omise Public Key (NEXT_PUBLIC_OMISE_PUBLIC_KEY)";
      setError(msg);
      showPopup("error", msg);
      setLoading(false);
      return;
    }
    if (!omiseReady || !window.OmiseCard) {
      const msg = "กำลังโหลด Omise กรุณารอสักครู่";
      setError(msg);
      showPopup("error", msg);
      setLoading(false);
      return;
    }

    window.OmiseCard.open({
      amount: num,
      currency: "THB",
      defaultPaymentMethod: method,
      onCreateTokenSuccess: async (nonce: string) => {
        try {
          const isSource = nonce.startsWith("src_");
          const body: Record<string, string | number> = {
            amount: num,
            currency: "thb",
          };
          if (isSource) body.source = nonce;
          else body.token = nonce;

          const res = await fetch("/api/charge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

          const data: ChargeResponse = await res.json();

          if (!res.ok) {
            const msg = data.error ?? "เกิดข้อผิดพลาด";
            setError(msg);
            showPopup("error", msg);
            setLoading(false);
            return;
          }

          if (data.authorize_uri) {
            window.location.href = data.authorize_uri;
            return;
          }

          if (data.qr_image_uri) {
            setQrUri(data.qr_image_uri);
            setQrExpiresAt(data.expires_at ?? null);
            setLoading(false);
            return;
          }

          if (data.status === "successful") {
            setSuccess(true);
            const addedBaht = num / 100;
            addCoins(addedBaht);
            showPopup("success", `ชำระเงินสำเร็จ ได้รับ ${addedBaht} เหรียญ`);
          } else if (data.failure_message) {
            setError(data.failure_message);
            showPopup("error", data.failure_message);
          } else {
            const msg = "การชำระเงินไม่สำเร็จ";
            setError(msg);
            showPopup("error", msg);
          }
        } catch (e) {
          const msg = "เกิดข้อผิดพลาดในการเชื่อมต่อ";
          setError(msg);
          showPopup("error", msg);
        } finally {
          setLoading(false);
        }
      },
      onFormClosed: () => {
        setLoading(false);
      },
    });
  }, [amount, method, publicKey, omiseReady, showPopup, addCoins]);

  return (
    <>
      <Script
        src={OMISE_SCRIPT}
        strategy="afterInteractive"
        onLoad={handleScriptLoad}
      />

      {/* Popup แจ้งผลสำเร็จ/ล้มเหลว */}
      {popup.open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="popup-title"
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closePopup}
          />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-zinc-900">
            <div
              className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full ${
                popup.type === "success"
                  ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
              }`}
            >
              {popup.type === "success" ? (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <h3 id="popup-title" className="mb-2 text-center text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              {popup.type === "success" ? "ชำระเงินสำเร็จ" : "ชำระเงินไม่สำเร็จ"}
            </h3>
            <p className="mb-6 text-center text-zinc-600 dark:text-zinc-400">
              {popup.message}
            </p>
            <button
              type="button"
              onClick={closePopup}
              className={`w-full rounded-lg px-4 py-3 font-medium text-white transition-colors ${
                popup.type === "success"
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-zinc-700 hover:bg-zinc-600 dark:bg-zinc-600 dark:hover:bg-zinc-500"
              }`}
            >
              ปิด
            </button>
          </div>
        </div>
      )}

      {/* Modal แสดง QR Code */}
      {qrUri && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-modal-title"
        >
          <div
            className="absolute inset-0 bg-black/60"
            onClick={closeQrModal}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <button
              type="button"
              onClick={closeQrModal}
              className="absolute right-3 top-3 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
              aria-label="ปิด"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h3 id="qr-modal-title" className="mb-1 pr-8 text-center text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              สแกน QR Code
            </h3>
            <p className="mb-2 text-center text-xs text-amber-600 dark:text-amber-400">
              สแกนด้วยแอปธนาคารหรือกระเป๋าเงิน • หมดอายุภายใน 15 นาที
            </p>
            <p className="mb-3 text-center text-xs text-zinc-500 dark:text-zinc-400">
              เมื่อชำระเสร็จหรือล้มเหลว ระบบจะแจ้งผลให้ทราบอัตโนมัติ
            </p>
            <img
              src={qrUri}
              alt="PromptPay QR Code"
              className="mx-auto max-h-64 w-auto rounded-lg bg-white"
            />
            {countdown !== null && (
              <p
                className={`mt-4 text-center text-lg font-semibold tabular-nums ${
                  countdown === "หมดอายุ"
                    ? "text-red-600 dark:text-red-400"
                    : "text-zinc-700 dark:text-zinc-300"
                }`}
              >
                {countdown === "หมดอายุ" ? "หมดอายุ" : `เหลือเวลา ${countdown}`}
              </p>
            )}
            <button
              type="button"
              onClick={closeQrModal}
              className="mt-4 w-full rounded-lg bg-zinc-200 px-4 py-3 font-medium text-zinc-800 transition-colors hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-600"
            >
              ปิด
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            ชำระเงินด้วย Omise
          </h2>
          <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            <span aria-hidden>🪙</span>
            <span>เหรียญ {coins.toLocaleString("th-TH")}</span>
          </div>
        </div>

        <div className="mb-6">
          <label className="mb-3 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            เลือกจำนวนเงิน (บาท)
          </label>
          <div className="grid grid-cols-3 gap-2">
            {AMOUNT_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => {
                  setAmount(option);
                  setError(null);
                }}
                className={`rounded-lg border px-4 py-3 text-center font-medium transition-colors ${
                  amount === option
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-500 dark:hover:bg-zinc-700/50"
                }`}
              >
                ฿{option}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <span className="mb-2 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            ช่องทางการชำระ
          </span>
          <div className="flex gap-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="method"
                checked={method === "credit_card"}
                onChange={() => setMethod("credit_card")}
                className="h-4 w-4 border-zinc-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-zinc-700 dark:text-zinc-300">
                บัตรเครดิต / เดบิต
              </span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="method"
                checked={method === "promptpay"}
                onChange={() => setMethod("promptpay")}
                className="h-4 w-4 border-zinc-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-zinc-700 dark:text-zinc-300">
                PromptPay
              </span>
            </label>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
            ชำระเงินสำเร็จ
          </div>
        )}

        <button
          type="button"
          onClick={handlePay}
          disabled={loading || amount == null}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:bg-zinc-400 disabled:cursor-not-allowed"
        >
          {loading ? "กำลังดำเนินการ..." : amount != null ? `ชำระเงิน ฿${amount}` : "เลือกจำนวนเงิน"}
        </button>
      </div>
    </>
  );
}
