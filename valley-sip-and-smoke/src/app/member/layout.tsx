import Link from "next/link";
import { getServerAuthSession } from "@/lib/session";
import { redirect } from "next/navigation";

const memberLinks = [
  { href: "/member", label: "Dashboard" },
  { href: "/member/rsvp", label: "RSVP" },
  { href: "/member/card", label: "Member Card" },
  { href: "/member/reserve", label: "Reserve List" },
  { href: "/member/requests", label: "Bottle Requests" },
  { href: "/member/profile", label: "Profile" },
];

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerAuthSession();
  if (!session) {
    redirect("/signin");
  }

  return (
    <div className="bg-white/70">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 lg:flex-row">
        <aside className="w-full max-w-xs rounded-3xl border border-border/70 bg-white/80 p-6">
          <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Member portal
          </p>
          <p className="mt-2 font-display text-xl text-foreground">
            Welcome back
          </p>
          <nav className="mt-6 flex flex-col gap-2 text-sm">
            {memberLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-xl px-3 py-2 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="flex-1">{children}</div>
      </div>
    </div>
  );
}
