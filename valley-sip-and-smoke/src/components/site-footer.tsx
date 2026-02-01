import Link from "next/link";

export default function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-white/80">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
        <div>
          <p className="font-display text-lg text-foreground">Valley Sip and Smoke</p>
          <p className="mt-1">Hosted at On Cue Sports Bar & Grill (Front Royal, VA)</p>
          <p className="mt-2 text-xs">
            Limited seating. RSVP encouraged. Members receive priority seating and member benefits.
          </p>
        </div>
        <div className="flex flex-wrap gap-4 text-xs uppercase tracking-[0.18em]">
          <Link href="/rules" className="transition-colors hover:text-foreground">
            Rules
          </Link>
          <Link href="/schedule" className="transition-colors hover:text-foreground">
            Schedule
          </Link>
          <Link href="/contact" className="transition-colors hover:text-foreground">
            Contact
          </Link>
          <Link href="/print/rules-pricing" className="transition-colors hover:text-foreground">
            Print Sheet
          </Link>
        </div>
      </div>
    </footer>
  );
}
