import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function ContactPage() {
  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Contact"
        title="Reach the Valley Sip and Smoke host team"
        subtitle="Questions about membership, RSVPs, or reserve pours? Let us know."
      />

      <div className="mx-auto mt-10 grid w-full max-w-4xl gap-6 px-6 md:grid-cols-2">
        <Card className="border-border/70 bg-card/80">
          <CardContent className="pt-6">
            <h3 className="font-display text-lg">On Cue Sports Bar & Grill</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Front Royal, VA
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Ask the host team for Valley Sip and Smoke nights or call the restaurant for seating
              questions.
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/80">
          <CardContent className="pt-6">
            <h3 className="font-display text-lg">Membership help</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Email the club organizer to confirm membership, get the sign-in passcode, or update
              your guest allowance.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Reply to your membership confirmation email if you need anything.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
