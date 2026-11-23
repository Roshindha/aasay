import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Assay", description: "Review AI-written code: hallucinations, drift, theater, phantom dependencies." };

/** Runs before first paint: picks the saved theme, else the OS preference. No flash, no layout shift. */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("assay-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","dark")}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body>{children}</body>
    </html>
  );
}
