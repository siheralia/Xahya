import { ClerkProvider } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import NavigationShell from "@/app/components/navigation-shell";
import { db } from "@/lib/db";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Xahya — RPG Character Management System",
  description: "Xahya: gestión de personajes, estadísticas, recursos y sistemas RPG.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { userId: clerkId } = await auth();
  let canManage = false;

  if (clerkId) {
    const users = await db.orm.public.User.all();
    const currentUser = users.find((user) => user.clerkId === clerkId);
    canManage = ["GM", "ADMIN"].includes(String(currentUser?.role ?? ""));
  }

  return (
    <html lang="es" className={geistSans.variable + " " + geistMono.variable + " h-full antialiased"}>
      <body className="min-h-full flex flex-col">
        <ClerkProvider>
          <NavigationShell canManage={canManage}>{children}</NavigationShell>
        </ClerkProvider>
      </body>
    </html>
  );
}
