import type { Metadata } from "next";
import "./globals.css";
import ThemeToggleInline from "./ThemeToggleInline";

export const metadata: Metadata = {
  title: "Tattva Darpaṇa — Gauḍīya Vaiṣṇava Study",
  description: "A mirror of truth — explore the philosophy, scriptures, saints, and devotional science of Gauḍīya Vaiṣṇavism through living inquiry.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var savedTheme = localStorage.getItem('theme');
                  var theme = 'gauri';
                  if (savedTheme === 'light' || savedTheme === 'gauri') {
                    theme = 'gauri';
                  } else if (savedTheme === 'dark' || savedTheme === 'shyama') {
                    theme = 'shyama';
                  } else {
                    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'shyama' : 'gauri';
                  }
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body>
        <div className="main-container">
          {children}
        </div>
        <ThemeToggleInline />
      </body>
    </html>
  );
}
