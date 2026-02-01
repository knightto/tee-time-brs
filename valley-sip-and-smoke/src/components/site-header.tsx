import Link from "next/link";
import { getServerAuthSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import SignOutButton from "@/components/sign-out-button";

const navLinks = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/schedule", label: "Schedule" },
  { href: "/rules", label: "Rules" },
  { href: "/faq", label: "FAQ" },
  { href: "/join", label: "Join" },
  { href: "/contact", label: "Contact" },
];

export default async function SiteHeader() {
  const session = await getServerAuthSession();

  return (
    <header className="border-b border-border/60 bg-white/70 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-display text-xl text-foreground">
            Valley Sip and Smoke
          </Link>
          <span className="hidden text-xs uppercase tracking-[0.28em] text-muted-foreground md:block">
            Hosted at On Cue
          </span>
        </div>
        <nav className="hidden items-center gap-4 text-sm text-muted-foreground lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          {session ? (
            <>
              <Button asChild variant="secondary">
                <Link href="/member">Member Portal</Link>
              </Button>
              <SignOutButton />
            </>
          ) : (
            <>
              <Button asChild variant="secondary">
                <Link href="/join">Join</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/signin">Sign in</Link>
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="border-t border-border/60 bg-white/60 lg:hidden">
        <nav className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-4 px-6 py-3 text-sm text-muted-foreground">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
