import Link from "next/link";
import PaymentForm from "./components/PaymentForm";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-12 dark:bg-zinc-950">
      <main className="flex w-full max-w-lg flex-col items-center">
        <div className="mb-8 flex w-full items-center justify-between">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            หน้าชำระเงิน
          </h1>
          <Link
            href="/withdraw"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            ถอนเหรียญ →
          </Link>
        </div>
        <PaymentForm />
      </main>
    </div>
  );
}
