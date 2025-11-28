import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/providers/session-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Simple SaaS Template - AI-Powered Business Solutions",
    template: "%s | Simple SaaS Template",
  },
  description: "A minimal, production-ready SaaS starter template built with Next.js, AWS, and Stripe. Perfect for AI-focused applications with subscription management and modern UI.",
  keywords: ["SaaS", "AI", "Next.js", "AWS", "Stripe", "Template", "Starter"],
  authors: [{ name: "Simple SaaS Template" }],
  creator: "Simple SaaS Template",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://simple-saas-template.com",
    title: "Simple SaaS Template - AI-Powered Business Solutions",
    description: "A minimal, production-ready SaaS starter template built with Next.js, AWS, and Stripe.",
    siteName: "Simple SaaS Template",
  },
  twitter: {
    card: "summary_large_image",
    title: "Simple SaaS Template - AI-Powered Business Solutions",
    description: "A minimal, production-ready SaaS starter template built with Next.js, AWS, and Stripe.",
    creator: "@simplesaastemplate",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}
