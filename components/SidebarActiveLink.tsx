"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SidebarActiveLink({
  children,
  exact = false,
  href,
  label,
  matchHrefs,
}: {
  children: React.ReactNode;
  exact?: boolean;
  href: string;
  label: string;
  matchHrefs?: string[];
}) {
  const pathname = usePathname();
  const active = matchHrefs?.length
    ? matchHrefs.some((item) => pathname === item || pathname.startsWith(`${item}/`))
    : exact
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link aria-current={active ? "page" : undefined} href={href} className={`sideLink ${active ? "active" : ""}`}>
      {children}
      <span>{label}</span>
    </Link>
  );
}
