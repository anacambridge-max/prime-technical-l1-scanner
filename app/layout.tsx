import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prime Technical L-1 Scanner",
  description: "Live 5-minute Prime Technical L-1 breakout scanner",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
