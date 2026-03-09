import { NextRequest, NextResponse } from "next/server";
import Omise from "omise";

const omise = Omise({
  secretKey: process.env.OMISE_SECRET_KEY ?? "",
});

const QR_EXPIRE_MINUTES = 15;

type ChargeCreateRequest = {
  amount: number;
  currency: string;
  card?: string;
  source?: string | { type: string };
  expires_at?: string;
};

function runCharge(data: ChargeCreateRequest): Promise<Omise.Charges.ICharge> {
  return new Promise((resolve, reject) => {
    omise.charges.create(data, (err, resp) => {
      if (err) reject(err);
      else resolve(resp as Omise.Charges.ICharge);
    });
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, source, amount, currency = "thb", promptpay } = body;

    if (!amount || (amount < 2000 || amount > 150000000)) {
      return NextResponse.json(
        { error: "จำนวนเงินต้องอยู่ระหว่าง 20 ถึง 1,500,000 บาท (หน่วย satang)" },
        { status: 400 }
      );
    }

    const chargeData: ChargeCreateRequest = {
      amount: Number(amount),
      currency: currency.toLowerCase(),
    };

    if (token) {
      chargeData.card = token;
    } else if (source) {
      chargeData.source = source;
    } else if (promptpay) {
      // สร้าง charge แบบ PromptPay ทันที (แสดง QR ได้เลย) หมดอายุใน 15 นาที
      chargeData.source = { type: "promptpay" };
      const expiresAt = new Date(Date.now() + QR_EXPIRE_MINUTES * 60 * 1000);
      chargeData.expires_at = expiresAt.toISOString();
    } else {
      return NextResponse.json(
        { error: "ต้องส่ง token (บัตรเครดิต), source หรือ promptpay: true" },
        { status: 400 }
      );
    }

    const charge = await runCharge(chargeData);

    // สำหรับ PromptPay ส่ง QR code URL กลับไปให้ฝั่ง client แสดง
    const src = charge.source as Omise.Sources.ISource | undefined;
    const qrImageUri =
      src?.scannable_code?.image && "download_uri" in src.scannable_code.image
        ? (src.scannable_code.image as { download_uri: string }).download_uri
        : null;

    return NextResponse.json({
      id: charge.id,
      status: charge.status,
      amount: charge.amount,
      currency: charge.currency,
      authorize_uri: charge.authorize_uri ?? null,
      qr_image_uri: qrImageUri,
      expires_at: charge.expires_at ?? null,
      paid_at: charge.paid_at,
      failure_message: charge.failure_message ?? null,
    });
  } catch (err: unknown) {
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : "เกิดข้อผิดพลาดในการสร้าง charge";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
