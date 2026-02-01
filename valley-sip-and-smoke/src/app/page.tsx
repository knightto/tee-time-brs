import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getUpcomingEvents, formatEventDate, formatEventTime } from "@/lib/events";

export default async function HomePage() {
  const events = await getUpcomingEvents(2);

  return (
    <div>
      <section className="relative overflow-hidden px-6 py-16">
        <div className="mx-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
              Valley Sip and Smoke Night
            </p>
            <h1 className="font-display text-4xl font-semibold text-foreground sm:text-5xl">
              Bourbon + cigar nights hosted at On Cue Sports Bar & Grill.
            </h1>
            <p className="text-lg text-muted-foreground">
              Thursday and Sunday evenings are reserved for relaxed pours, cigar-friendly seating,
              and a curated reserve list. Limited seating, RSVP encouraged.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/join">Join membership</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link href="/schedule">View schedule</Link>
              </Button>
              <Button asChild variant="secondary" size="lg">
                <Link href="/signin">Member sign in</Link>
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Hosted at On Cue Sports Bar & Grill (Front Royal, VA).
            </p>
          </div>
          <div className="rounded-3xl border border-border bg-white/80 p-6 shadow-sm">
            <p className="text-xs uppercase tracking-[0.28em] text-muted-foreground">
              Next events
            </p>
            <div className="mt-4 space-y-4">
              {events.length ? (
                events.map((event) => (
                  <Card key={event.id} className="border-border/80 bg-card/80">
                    <CardHeader className="pb-2">
                      <p className="font-display text-xl text-foreground">
                        {formatEventDate(event.date)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatEventTime(event.startTime, event.endTime)}
                      </p>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        Capacity {event.capacity}. RSVP encouraged for priority seating.
                      </p>
                      {event.notes ? (
                        <p className="mt-2 text-xs text-muted-foreground">{event.notes}</p>
                      ) : null}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Upcoming dates are being posted. Check back soon or view the full schedule.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 bg-white/70 px-6 py-12">
        <div className="mx-auto grid w-full max-w-6xl gap-8 md:grid-cols-3">
          <div className="rounded-2xl border border-border/70 bg-card/80 p-6">
            <h3 className="font-display text-xl">Priority seating</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Membership gives priority seating and earlier access to reserve pours without calling it
              exclusive.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/80 p-6">
            <h3 className="font-display text-xl">Member pricing</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Member pricing is per 2 oz pour and handled through On Cue&apos;s POS. No bundles or free
              pours.
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-card/80 p-6">
            <h3 className="font-display text-xl">Cigar-friendly</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Bring your own cigars or enjoy optional club cigars, sold separately from alcohol.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
