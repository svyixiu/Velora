import "./globals.css";

export const metadata = {
  title: "Velora — Roblox account mirror",
  description:
    "A privacy-first Roblox account mirror using Quick Login validation without creating a Roblox session.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
