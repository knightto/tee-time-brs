import { prisma } from "@/lib/prisma";
import {
  toggleReserveWeek,
  createReserveWeek,
  createReserveItem,
  updateReserveItem,
} from "@/app/admin/reserve/actions";
import { Button } from "@/components/ui/button";

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function AdminReservePage() {
  const weeks = await prisma.reserveWeek.findMany({
    orderBy: { weekOfDate: "desc" },
    include: { items: { include: { bottle: true } } },
  });
  const activeWeek = weeks.find((week) => week.published) ?? weeks[0];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/70 bg-white/80 p-6">
        <h1 className="font-display text-3xl text-foreground">Reserve list</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Manage weekly featured pours and leftovers. Pricing is per 2 oz pour.
        </p>
      </div>

      <div className="rounded-2xl border border-border/70 bg-white/70 p-6 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Pricing guidance (optional)</p>
        <p className="mt-2">
          Featured pours: typically $2–$3 off mid-tier bottles or 5–10% off premium bottles (cap
          discount at $5). Leftovers usually match or slightly smaller discounts.
        </p>
      </div>

      <form action={createReserveWeek} className="rounded-2xl border border-border/70 bg-white/70 p-6">
        <h2 className="font-display text-xl text-foreground">Create new reserve week</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <input
            type="date"
            name="weekOfDate"
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            required
          />
          <input
            type="text"
            name="label"
            placeholder="Week of Feb 2, 2026"
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            required
          />
          <Button type="submit">Create week</Button>
        </div>
      </form>

      {activeWeek ? (
        <div className="space-y-4">
          <form action={toggleReserveWeek} className="rounded-2xl border border-border/70 bg-white/70 p-5">
            <input type="hidden" name="weekId" value={activeWeek.id} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-xl">{activeWeek.label}</p>
                <p className="text-sm text-muted-foreground">
                  {activeWeek.items.length} items
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" name="published" defaultChecked={activeWeek.published} />
                Published to members
              </label>
            </div>
            <Button type="submit" className="mt-4">
              Save
            </Button>
          </form>

          <form action={createReserveItem} className="rounded-2xl border border-border/70 bg-white/70 p-6">
            <input type="hidden" name="weekId" value={activeWeek.id} />
            <h2 className="font-display text-xl text-foreground">Add bottle</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <input
                name="name"
                placeholder="Bottle name"
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                required
              />
              <input
                name="distillery"
                placeholder="Distillery"
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
              />
              <input
                name="type"
                placeholder="Type (Bourbon, Rye, etc.)"
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
              />
              <input
                name="proof"
                placeholder="Proof"
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
              />
              <input
                name="publicPriceCents"
                type="number"
                placeholder="Public price (cents)"
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                required
              />
              <input
                name="memberPriceCents"
                type="number"
                placeholder="Member price (cents)"
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                required
              />
              <select
                name="category"
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
              >
                <option value="featured">Featured</option>
                <option value="leftover">Leftover</option>
              </select>
            </div>
            <Button type="submit" className="mt-4">
              Add bottle
            </Button>
          </form>

          <div className="space-y-3">
            {activeWeek.items.map((item) => (
              <form
                key={item.id}
                action={updateReserveItem}
                className="rounded-2xl border border-border/70 bg-white/70 p-5"
              >
                <input type="hidden" name="itemId" value={item.id} />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-foreground">{item.bottle.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.bottle.distillery ?? ""} {item.bottle.type ? `· ${item.bottle.type}` : ""}
                    </p>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Public {formatMoney(item.publicPriceCents)} · Member {formatMoney(item.memberPriceCents)}
                  </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <input
                    name="publicPriceCents"
                    type="number"
                    defaultValue={item.publicPriceCents}
                    className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  />
                  <input
                    name="memberPriceCents"
                    type="number"
                    defaultValue={item.memberPriceCents}
                    className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  />
                  <select
                    name="category"
                    defaultValue={item.isLeftover ? "leftover" : "featured"}
                    className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
                  >
                    <option value="featured">Featured</option>
                    <option value="leftover">Leftover</option>
                  </select>
                </div>
                <Button type="submit" className="mt-4">
                  Update
                </Button>
              </form>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Create a reserve week to get started.</p>
      )}
    </div>
  );
}
