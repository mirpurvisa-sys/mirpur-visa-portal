import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "MVC Admin Panel", description: "Mirpur Visa Consultant Admin Panel" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
