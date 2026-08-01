import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cordyceps",
  description:
    "Context-aware access control: not just whether you can access this, but whether you should right now.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // `dark` is set here, not by next-themes: there is no toggle and nothing to
    // persist, and mounting a provider would add a hydration-flash class swap in
    // front of the one screen that gets judged.
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        {/* No ThemeProvider is mounted, so `useTheme()` inside the shadcn
            Toaster falls back to "system" — which would render light toasts on
            a light-preferring machine. Pin it to match the forced dark root. */}
        <Toaster theme="dark" />
      </body>
    </html>
  );
}
