import { submitRequest } from "@/app/member/requests/actions";
import { prisma } from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default async function MemberRequestsPage() {
  const session = await getServerAuthSession();
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { bottleRequests: { orderBy: { createdAt: "desc" }, take: 6 } },
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/70 bg-white/80 p-6">
        <h1 className="font-display text-3xl text-foreground">Bottle requests</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Suggest bottles for the reserve list. These are requests only; On Cue controls purchasing.
        </p>
      </div>

      <form action={submitRequest} className="rounded-2xl border border-border/70 bg-white/70 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bottleName">Bottle name</Label>
            <Input id="bottleName" name="bottleName" placeholder="Producer + expression" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" placeholder="Anything special to note" />
          </div>
        </div>
        <Button type="submit" className="mt-4">
          Submit request
        </Button>
      </form>

      <div className="space-y-3">
        <h2 className="font-display text-2xl">Recent requests</h2>
        {user?.bottleRequests?.length ? (
          user.bottleRequests.map((request) => (
            <div
              key={request.id}
              className="rounded-2xl border border-border/70 bg-white/70 px-6 py-4"
            >
              <p className="font-medium text-foreground">{request.bottleName}</p>
              {request.notes ? (
                <p className="mt-1 text-sm text-muted-foreground">{request.notes}</p>
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No requests yet.</p>
        )}
      </div>
    </div>
  );
}
