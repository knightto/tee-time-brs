import { getUpcomingEvents, formatEventDate, formatEventTime } from "@/lib/events";
import { getServerAuthSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { setRsvp, cancelRsvp } from "@/app/member/rsvp/actions";

export default async function MemberRsvpPage() {
  const session = await getServerAuthSession();
  const events = await getUpcomingEvents(10);
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { rsvps: true },
      })
    : null;

  const rsvpMap = new Map(user?.rsvps.map((rsvp) => [rsvp.eventNightId, rsvp]));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/70 bg-white/80 p-6">
        <h1 className="font-display text-3xl text-foreground">RSVP for upcoming nights</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          RSVP encouraged to help reserve seating. Guest allowance: {user?.guestAllowance ?? 2}.
        </p>
      </div>

      <div className="space-y-4">
        {events.map((event) => {
          const rsvp = rsvpMap.get(event.id);
          const status = rsvp?.status ?? "NONE";
          const guestCount = rsvp?.guestCount ?? 0;

          return (
            <div
              key={event.id}
              className="rounded-2xl border border-border/70 bg-white/70 px-6 py-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-display text-xl">{formatEventDate(event.date)}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatEventTime(event.startTime, event.endTime)}
                  </p>
                </div>
                <div className="text-sm text-muted-foreground">Capacity {event.capacity}</div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <form action={setRsvp} className="flex flex-wrap items-center gap-3">
                  <input type="hidden" name="eventId" value={event.id} />
                  <label className="text-sm text-muted-foreground" htmlFor={`guests-${event.id}`}>
                    Guests
                  </label>
                  <select
                    id={`guests-${event.id}`}
                    name="guestCount"
                    defaultValue={guestCount}
                    className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  >
                    {Array.from({ length: (user?.guestAllowance ?? 2) + 1 }, (_, i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </select>
                  <Button type="submit">{status === "GOING" ? "Update" : "RSVP"}</Button>
                </form>
                {status === "GOING" ? (
                  <form action={cancelRsvp}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <Button type="submit" variant="outline">
                      Cancel
                    </Button>
                  </form>
                ) : null}
                <p className="text-sm text-muted-foreground">
                  Status: {status === "NONE" ? "Not RSVPed" : status}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
