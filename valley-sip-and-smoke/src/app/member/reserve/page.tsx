import { prisma } from "@/lib/prisma";

function formatMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function MemberReservePage() {
  const reserveWeek = await prisma.reserveWeek.findFirst({
    where: { published: true },
    orderBy: { weekOfDate: "desc" },
    include: { items: { include: { bottle: true } } },
  });

  const featured = reserveWeek?.items.filter((item) => item.isFeatured) ?? [];
  const leftovers = reserveWeek?.items.filter((item) => item.isLeftover) ?? [];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/70 bg-white/80 p-6">
        <h1 className="font-display text-3xl text-foreground">Club Reserve</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Weekly featured pours plus a leftover shelf. Member pricing is per 2 oz pour.
        </p>
      </div>

      {reserveWeek ? (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border/70 bg-white/70 px-6 py-4">
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">{reserveWeek.label}</p>
            <p className="text-sm text-muted-foreground">
              Public pricing and member pricing are listed per 2 oz pour.
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="font-display text-2xl">This week’s club reserve</h2>
            {featured.length ? (
              <div className="space-y-3">
                {featured.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/70 bg-white/70 px-6 py-4"
                  >
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
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No featured bottles posted yet.</p>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-display text-2xl">Leftover shelf</h2>
            {leftovers.length ? (
              <div className="space-y-3">
                {leftovers.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/70 bg-white/70 px-6 py-4"
                  >
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
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No leftovers listed yet.</p>
            )}
          </section>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Reserve list is being posted. Check back soon.</p>
      )}
    </div>
  );
}
