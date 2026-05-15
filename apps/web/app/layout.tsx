import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ACAD.ID Operations",
  description: "ACAD.ID infrastructure operations portal",
  icons: {
    icon: "/acadid-symbol.png",
    shortcut: "/acadid-symbol.png",
    apple: "/acadid-symbol.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
