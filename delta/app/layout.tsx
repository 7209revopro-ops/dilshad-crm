import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { GoeyToaster } from "@/components/ui/goey-toaster";
import NextTopLoader from "nextjs-toploader";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Remote CRM",
  description: "Remote CRM",
  applicationName: "Remote CRM",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Remote CRM",
  },
  formatDetection: {
    telephone: false,
  },
  // Open Graph (looks good when shared)
  openGraph: {
    type: "website",
    siteName: "Remote CRM",
    title: "Remote CRM",
    description: "Remote CRM",
  },
};

// Separate viewport export (required by Next.js 14)
export const viewport: Viewport = {
  themeColor: "#7c3aed",      // the brand purple (--primary, violet-600)
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",        // respect iPhone notch / safe areas
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* iOS standalone splash / status bar */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Remote CRM" />
      </head>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <NextTopLoader
            // The theme's primary, so the bar is the brand purple in either mode.
            color="hsl(var(--primary))"
            shadow="0 0 10px hsl(var(--primary)), 0 0 5px hsl(var(--primary))"
            height={3}
            showSpinner={false}
            easing="ease"
            speed={200}
          />
          <QueryProvider>
            {children}
            <GoeyToaster  />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
