import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import JoinForm from "@/app/join/join-form";
import { prisma } from "@/lib/prisma";

export default async function JoinPage() {
  const plans = await prisma.membershipPlan.findMany({ where: { active: true } });

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Join"
        title="Membership for priority seating + member benefits"
        subtitle="Limited seating, RSVP encouraged. Membership provides priority access and member pour pricing."
      />

      <div className="mx-auto mt-10 grid w-full max-w-5xl gap-6 px-6 md:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.id} className="border-border/70 bg-card/80">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">
                  ${(plan.monthlyPriceCents / 100).toFixed(0)}/mo
                </p>
              </div>
              {plan.description ? (
                <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
              ) : null}
              <JoinForm
                planId={plan.id}
                planName={plan.name}
                priceLabel={`$${(plan.monthlyPriceCents / 100).toFixed(0)}/mo`}
              />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mx-auto mt-10 w-full max-w-4xl space-y-3 px-6 text-sm text-muted-foreground">
        <p>
          Membership supports the hosted experience and provides priority seating. All alcohol is sold
          and served by On Cue staff. No outside alcohol is permitted.
        </p>
        <p>
          Once your membership is confirmed, you will receive the sign-in passcode to access the
          member portal for RSVPs, reserve lists, and your digital member card.
        </p>
      </div>
    </div>
  );
}
