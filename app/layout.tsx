import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SubTrack Pro - Subscription Management",
  description: "Manage your recurring expenses and service plans.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light h-full">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&amp;display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&amp;display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-background text-on-surface min-h-screen relative antialiased">
        {children}
      </body>
    </html>
  );
}
