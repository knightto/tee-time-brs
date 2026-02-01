import { prisma } from "@/lib/prisma";
import { createAnnouncement, toggleAnnouncement } from "@/app/admin/announcements/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export default async function AdminAnnouncementsPage() {
  const announcements = await prisma.announcement.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/70 bg-white/80 p-6">
        <h1 className="font-display text-3xl text-foreground">Announcements</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Post updates for members and toggle visibility.
        </p>
      </div>

      <form action={createAnnouncement} className="rounded-2xl border border-border/70 bg-white/70 p-6">
        <h2 className="font-display text-xl text-foreground">Create announcement</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <input
            name="title"
            placeholder="Title"
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            required
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              type="date"
              name="visibleFrom"
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
            <input
              type="date"
              name="visibleTo"
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
          </div>
        </div>
        <Textarea
          name="body"
          placeholder="Announcement details"
          className="mt-4"
          required
        />
        <Button type="submit" className="mt-4">
          Create
        </Button>
      </form>

      <div className="space-y-4">
        {announcements.map((announcement) => (
          <form
            key={announcement.id}
            action={toggleAnnouncement}
            className="rounded-2xl border border-border/70 bg-white/70 p-5"
          >
            <input type="hidden" name="id" value={announcement.id} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg text-foreground">{announcement.title}</p>
                <p className="text-sm text-muted-foreground">{announcement.body}</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" name="published" defaultChecked={announcement.published} />
                Published
              </label>
            </div>
            <Button type="submit" className="mt-4">
              Save
            </Button>
          </form>
        ))}
      </div>
    </div>
  );
}
