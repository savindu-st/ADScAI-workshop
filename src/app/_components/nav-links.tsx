"use client";

import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth/client";

export function NavLinks() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const links = [
    { href: "/order", label: "Order" },
    { href: "/orders", label: "My Orders" },
  ];

  // If user is kitchen staff, add Kitchen link
  // Use 'any' cast if role is not typed in better-auth session by default
  if (session?.user && (session.user as any).role === "kitchen") {
      links.push({ href: "/kitchen", label: "Kitchen" });
  }

  return (
    <nav style={{ display: "flex", gap: "0.25rem" }}>
      {links.map((l) => {
        const active = pathname === l.href || pathname?.startsWith(l.href + "/");
        return (
          <a key={l.href} href={l.href} className={`nav-link${active ? " active" : ""}`}>
            {l.label}
          </a>
        );
      })}
    </nav>
  );
}
