import { NextRequest, NextResponse } from "next/server";
import Omise from "omise";

const omise = Omise({
  secretKey: process.env.OMISE_SECRET_KEY ?? "",
});

const MIN_WITHDRAW_SATANG = 3000; // Omise ขั้นต่ำ 30 บาท

function createTransfer(amount: number): Promise<Omise.Transfers.ITransfer> {
  return new Promise((resolve, reject) => {
    omise.transfers.create({ amount }, (err, resp) => {
      if (err) reject(err);
      else resolve(resp as Omise.Transfers.ITransfer);
    });
  });
}

/**
 * สร้าง Transfer ผ่าน Omise (โอนจากยอด Omise ไปบัญชี default recipient)
 * Body: { amount: number } หน่วยเป็น satang (บาท * 100)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const amount = Number(body.amount);

    if (!Number.isFinite(amount) || amount < MIN_WITHDRAW_SATANG) {
      return NextResponse.json(
        { error: `จำนวนถอนขั้นต่ำ ${MIN_WITHDRAW_SATANG / 100} บาท (หน่วย satang)` },
        { status: 400 }
      );
    }

    const transfer = await createTransfer(amount);

    return NextResponse.json({
      id: transfer.id,
      amount: transfer.amount,
      currency: transfer.currency,
      sent: transfer.sent,
      failure_message: transfer.failure_message ?? null,
    });
  } catch (err: unknown) {
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : "เกิดข้อผิดพลาดในการถอนเงินผ่าน Omise";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
