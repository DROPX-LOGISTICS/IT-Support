import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "DropX IT Support", description: "Report a problem or ask for a feature." };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
