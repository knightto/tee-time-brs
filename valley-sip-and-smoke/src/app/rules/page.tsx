import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function RulesPage() {
  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="House rules"
        title="Simple, compliance-safe rules for every night"
        subtitle="These guidelines keep Valley Sip and Smoke welcoming and aligned with On Cue policies."
      />

      <div className="mx-auto mt-10 grid w-full max-w-5xl gap-6 px-6 md:grid-cols-2">
        <Card className="border-border/70 bg-card/80">
          <CardContent className="pt-6">
            <h3 className="font-display text-lg">Alcohol service</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>All alcohol is sold and served by On Cue staff through their POS.</li>
              <li>No outside alcohol (no BYOB alcohol).</li>
              <li>Member pricing applies per 2 oz pour only. No bundles or free pours.</li>
              <li>2 oz pours are priced proportionately. No larger pour for the same price.</li>
              <li>Any time-based reduced pricing ends by 9 PM.</li>
            </ul>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/80">
          <CardContent className="pt-6">
            <h3 className="font-display text-lg">Cigars + conduct</h3>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>Members may bring their own cigars.</li>
              <li>Club cigars, if offered, are separate from alcohol and never bundled.</li>
              <li>Be respectful of staff and fellow guests.</li>
              <li>Keep the lounge area clean and follow posted smoking guidelines.</li>
              <li>Any bottle service stays under staff control; pours are rung individually.</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="mx-auto mt-10 w-full max-w-4xl space-y-3 px-6 text-sm text-muted-foreground">
        <p>
          Valley Sip and Smoke is a hosted event with limited seating. Membership provides priority
          seating and member benefits, but all guests are welcome when space allows.
        </p>
      </div>
    </div>
  );
}
