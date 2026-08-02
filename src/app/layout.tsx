import type { Metadata } from "next";
import { Anta, Geist, Geist_Mono, Inter } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { cn } from "@/lib/utils";
import {
  HIDDEN_AMOUNTS_CLASS,
  HIDDEN_AMOUNTS_COOKIE,
  isHiddenAmountsValue,
} from "@/lib/hidden-amounts";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

const anta = Anta({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anta",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Holdsight",
  description: "Universal portfolio tracker",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read on the server so the very first paint is already masked. Applying the
  // class after hydration would stream the real values to screen first, which
  // is the one thing this feature exists to prevent.
  const cookieStore = await cookies();
  const hiddenAmounts = isHiddenAmountsValue(
    cookieStore.get(HIDDEN_AMOUNTS_COOKIE)?.value,
  );

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        inter.variable,
        anta.variable,
        hiddenAmounts && HIDDEN_AMOUNTS_CLASS,
      )}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
