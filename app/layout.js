import "./globals.css";
import Script from "next/script";

export const metadata = {
  title: "MOTION.AI — Kling Motion Control Studio",
  description: "Generate motion control videos using reference image and motion video.",
  manifest: "/manifest.json",
  themeColor: "#7c6eff",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" }
    ],
    apple: "/icons/icon.svg"
  }
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#7c6eff"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Script id="sw-register" strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {})); }`}
        </Script>
      </body>
    </html>
  );
}
