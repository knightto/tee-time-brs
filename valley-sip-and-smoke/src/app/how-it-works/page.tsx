import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function HowItWorksPage() {
  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="How it works"
        title="A hosted bourbon + cigar night with priority access"
        subtitle="Valley Sip and Smoke is an ongoing hosted event at On Cue Sports Bar & Grill with limited seating and RSVP encouraged."
      />
      <div className="mx-auto mt-10 grid w-full max-w-5xl gap-6 px-6 md:grid-cols-3">
        <Card className="border-border/70 bg-card/80">
          <CardContent className="pt-6">
            <h3 className="font-display text-lg">Join membership</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Membership provides priority seating, member pour pricing, and access to the
              member portal for reserve lists and RSVPs.
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/80">
          <CardContent className="pt-6">
            <h3 className="font-display text-lg">Arrive + RSVP</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              RSVP ahead to help the host team plan seating. Walk-ins are welcome when space
              allows.
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/80">
          <CardContent className="pt-6">
            <h3 className="font-display text-lg">Enjoy responsibly</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              All alcohol is sold and served by On Cue staff. No outside alcohol is permitted.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mx-auto mt-10 w-full max-w-4xl space-y-4 px-6 text-sm text-muted-foreground">
        <p>
          On Cue Sports Bar & Grill manages all alcohol service through their POS, including member
          pour pricing. Member pricing is per 2 oz pour only. There are no bundled pours, free drinks
          with dues, or unlimited offers.
        </p>
        <p>
          Cigars are welcome. Members may bring their own cigars, and optional club cigars may be
          offered separately from alcohol.
        </p>
        <p>
          Bottle service, if available, remains under staff control and each pour is rung
          individually.
        </p>
      </div>
    </div>
  );
}
