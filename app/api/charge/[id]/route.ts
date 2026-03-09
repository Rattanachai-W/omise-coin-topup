import { NextRequest, NextResponse } from "next/server";
import Omise from "omise";

const omise = Omise({
  secretKey: process.env.OMISE_SECRET_KEY ?? "",
});

function getCharge(chargeId: string): Promise<Omise.Charges.ICharge> {
  return new Promise((resolve, reject) => {
    omise.charges.retrieve(chargeId, (err, resp) => {
      if (err) reject(err);
      else resolve(resp as Omise.Charges.ICharge);
    });
  });
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "ไม่มี charge id" }, { status: 400 });
    }
    const charge = await getCharge(id);
    return NextResponse.json({
      id: charge.id,
      status: charge.status,
      failure_message: charge.failure_message ?? null,
      paid_at: charge.paid_at ?? null,
    });
  } catch (err: unknown) {
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message: string }).message)
        : "ไม่พบ charge";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
