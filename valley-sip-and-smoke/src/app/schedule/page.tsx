import PageHeader from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { getUpcomingEvents, formatEventDate, formatEventTime } from "@/lib/events";

export default async function SchedulePage() {
  const events = await getUpcomingEvents(12);

  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Schedule"
        title="Thursday + Sunday nights, 5:00–9:00 PM"
        subtitle="Recurring hosted nights with limited seating and RSVP encouraged."
      />

      <div className="mx-auto mt-10 grid w-full max-w-5xl gap-6 px-6 md:grid-cols-2">
        <Card className="border-border/70 bg-card/80">
          <CardContent className="pt-6">
            <h3 className="font-display text-lg">Thursdays</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              5:00–9:00 PM, hosted by On Cue staff with reserve pours and cigar-friendly seating.
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-card/80">
          <CardContent className="pt-6">
            <h3 className="font-display text-lg">Sundays</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              5:00–9:00 PM, end the week with curated bourbon pours and lounge seating.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mx-auto mt-10 w-full max-w-4xl space-y-3 px-6">
        <h2 className="font-display text-2xl">Upcoming dates</h2>
        <div className="space-y-3">
          {events.length ? (
            events.map((event) => (
              <div
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-white/70 px-5 py-4"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {formatEventDate(event.date)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatEventTime(event.startTime, event.endTime)}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">Capacity {event.capacity}</div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Upcoming dates are being published. Please check back or contact the host team.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
