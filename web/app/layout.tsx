import type { Metadata, Viewport } from "next";
import "../../src/index.css";

export const metadata: Metadata = {
  title: "MyEnglish",
  description: "Học tiếng Anh mỗi ngày: từ vựng Oxford, ngữ pháp, phát âm, ôn tập theo FSRS.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/app-icon.png", apple: "/app-icon.png" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f172a",
};

// Applies the saved theme before first paint (same key and rule as src/services/theme.ts)
const themeScript = `try{var t=localStorage.getItem("myenglish_theme_mode_v1");if(t!=="light"&&t!=="system")t="dark";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var c=document.documentElement.classList;c.toggle("dark",d);c.toggle("light",!d)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
