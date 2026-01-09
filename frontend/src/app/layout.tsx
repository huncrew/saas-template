import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
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
    default: "Oasify - AI-Powered Application Builder",
    template: "%s | Oasify",
  },
  description: "AI-powered application builder platform. Chat with AI to build full-stack applications, get instant previews, and deploy to production with one click.",
  keywords: ["AI", "Builder", "Next.js", "AWS", "TypeScript", "Development", "Deployment"],
  authors: [{ name: "Oasify" }],
  creator: "Oasify",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://oasify.build",
    title: "Oasify - AI-Powered Application Builder",
    description: "AI-powered application builder platform. Chat with AI to build full-stack applications, get instant previews, and deploy to production.",
    siteName: "Oasify",
  },
  twitter: {
    card: "summary_large_image",
    title: "Oasify - AI-Powered Application Builder",
    description: "AI-powered application builder platform. Chat with AI to build full-stack applications, get instant previews, and deploy to production.",
    creator: "@oasify",
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
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ClerkProvider publishableKey={publishableKey}>
          <ErrorBoundary>{children}</ErrorBoundary>
          <Toaster />
        </ClerkProvider>
      </body>
    </html>
  );
}
