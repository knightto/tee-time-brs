import { prisma } from "@/lib/prisma";
import { updateEvent, createEvent } from "@/app/admin/events/actions";
import { formatEventDate } from "@/lib/events";
import { Button } from "@/components/ui/button";

export default async function AdminEventsPage() {
  const events = await prisma.eventNight.findMany({
    orderBy: { date: "asc" },
    include: { rsvps: true, checkIns: true },
  });

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/70 bg-white/80 p-6">
        <h1 className="font-display text-3xl text-foreground">Event nights</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Edit capacity, notes, and published status. Export RSVP and attendance as CSV.
        </p>
      </div>

      <form action={createEvent} className="rounded-2xl border border-border/70 bg-white/70 p-6">
        <h2 className="font-display text-xl text-foreground">Add special event date</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <input
            type="date"
            name="date"
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            required
          />
          <input
            type="time"
            name="startTime"
            defaultValue="17:00"
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            required
          />
          <input
            type="time"
            name="endTime"
            defaultValue="21:00"
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            required
          />
          <input
            type="number"
            name="capacity"
            min={0}
            defaultValue={48}
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
          />
        </div>
        <Button type="submit" className="mt-4">
          Add event
        </Button>
      </form>

      <div className="space-y-4">
        {events.map((event) => (
          <form
            key={event.id}
            action={updateEvent}
            className="rounded-2xl border border-border/70 bg-white/70 p-5"
          >
            <input type="hidden" name="eventId" value={event.id} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-xl">{formatEventDate(event.date)}</p>
                <p className="text-sm text-muted-foreground">
                  {event.startTime}–{event.endTime}
                </p>
              </div>
              <div className="text-sm text-muted-foreground">
                RSVPs {event.rsvps.length} · Check-ins {event.checkIns.length}
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-4">
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Capacity
                </label>
                <input
                  type="number"
                  name="capacity"
                  defaultValue={event.capacity}
                  min={0}
                  className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Notes
                </label>
                <input
                  type="text"
                  name="notes"
                  defaultValue={event.notes ?? ""}
                  className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" name="published" defaultChecked={event.published} />
                Published
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button type="submit">Save</Button>
              <Button asChild variant="outline">
                <a href={`/api/admin/events/${event.id}/export`}>Export CSV</a>
              </Button>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
