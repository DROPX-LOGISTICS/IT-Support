import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "DropX IT Support", template: "%s · DropX IT Support" },
  description: "Report a problem or ask for a feature.",
  applicationName: "DropX IT Support",
  icons: { icon: "/favicon.png", shortcut: "/favicon.png" },
};
export const viewport: Viewport = {
  width: "device-width", initialScale: 1, viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#151a29" }],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
