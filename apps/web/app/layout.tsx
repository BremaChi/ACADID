import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AcadID Operations",
  description: "AcadID infrastructure operations portal"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
