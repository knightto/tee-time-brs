export default function RulesPricingPrintPage() {
  return (
    <div className="print-sheet mx-auto w-full max-w-3xl px-6 py-12">
      <div className="rounded-3xl border border-border/70 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Valley Sip and Smoke
          </p>
          <h1 className="font-display text-3xl text-foreground">
            Rules + Pricing Sheet
          </h1>
          <p className="text-sm text-muted-foreground">
            Hosted at On Cue Sports Bar & Grill (Front Royal, VA)
          </p>
        </div>

        <div className="mt-6 grid gap-4 text-sm text-muted-foreground">
          <div>
            <h2 className="font-display text-lg text-foreground">Alcohol service</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>All alcohol is sold and served by On Cue staff through their POS.</li>
              <li>No outside alcohol (no BYOB alcohol).</li>
              <li>Member pricing applies per 2 oz pour only. No bundles or free pours.</li>
              <li>2 oz pours are priced proportionately.</li>
              <li>Time-based reduced pricing ends by 9 PM.</li>
            </ul>
          </div>
          <div>
            <h2 className="font-display text-lg text-foreground">Cigars + conduct</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Members may bring their own cigars.</li>
              <li>Club cigars, if offered, are separate from alcohol.</li>
              <li>Respect staff and guests; keep the lounge clean.</li>
              <li>Bottle service, if offered, stays under staff control.</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-dashed border-border/80 bg-muted/30 p-6">
          <h2 className="font-display text-lg text-foreground">
            Weekly featured bottles (On Cue to fill in)
          </h2>
          <div className="mt-4 grid gap-3">
            <div className="h-8 rounded-lg border border-border/70 bg-white"></div>
            <div className="h-8 rounded-lg border border-border/70 bg-white"></div>
            <div className="h-8 rounded-lg border border-border/70 bg-white"></div>
          </div>
        </div>

        <div className="mt-6 text-xs text-muted-foreground">
          Limited seating. RSVP encouraged. Members receive priority seating and member benefits.
        </div>
      </div>
    </div>
  );
}
