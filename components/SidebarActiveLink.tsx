"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

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
  const searchParams = useSearchParams();
  const [hrefPath, hrefQuery] = href.split("?");
  const caseFilterMatches = hrefPath !== "/admin/cases" || (hrefQuery ? searchParams.get("assigned") === "me" : searchParams.get("assigned") !== "me");
  const active = caseFilterMatches && ( matchHrefs?.length
    ? matchHrefs.some((item) => pathname === item || pathname.startsWith(`${item}/`))
    : exact
      ? pathname === href
      : pathname === hrefPath || pathname.startsWith(`${hrefPath}/`));

  return (
    <Link aria-current={active ? "page" : undefined} href={href} className={`sideLink ${active ? "active" : ""}`}>
      {children}
      <span>{label}</span>
    </Link>
  );
}
