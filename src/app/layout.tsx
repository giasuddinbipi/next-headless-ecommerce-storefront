import type { Metadata } from "next";

import "./globals.css";

import AuthProvider from "@/components/auth/AuthProvider";
import Footer from "@/components/layout/Footer";
import Header from "@/components/layout/Header";

export const metadata: Metadata = {
  title: {
    default: "MyStore",
    template: "%s | MyStore",
  },

  description:
    "A modern ecommerce website powered by Next.js and WooCommerce.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <AuthProvider>
          <Header />

          <div className="min-h-[70vh]">
            {children}
          </div>

          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}