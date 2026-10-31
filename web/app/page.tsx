import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-background text-foreground px-4">
      <div className="max-w-md text-center">
        <img src="/app-icon.png" alt="" className="mx-auto h-16 w-16 rounded-2xl" />
        <h1 className="mt-4 text-2xl font-bold">MyEnglish</h1>
        <p className="mt-2 text-muted-foreground">
          Từ vựng Oxford 5000, ngữ pháp, phát âm và ôn tập theo FSRS — cùng tiến độ với app máy tính.
        </p>
        <Link
          href="/learn"
          className="mt-6 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Bắt đầu học
        </Link>
      </div>
    </main>
  );
}
