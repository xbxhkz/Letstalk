import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getSessionUser } from "@/lib/auth";
import { Providers } from "@/components/Providers";
import { BottomNav } from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "Letstalk",
  description: "Short-form vertical videos",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  return (
    <html lang="en">
      <body>
        <div id="app-root" className="relative mx-auto flex h-[100dvh] max-w-[430px] flex-col overflow-hidden bg-black text-white">
          <Providers initialUser={user}>
            <main className="relative min-h-0 flex-1">{children}</main>
            <BottomNav />
          </Providers>
        </div>
      </body>
    </html>
  );
}
