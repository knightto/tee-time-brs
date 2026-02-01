import { prisma } from "@/lib/prisma";
import { updateMember } from "@/app/admin/members/actions";
import MemberTable from "@/app/admin/members/member-table";

export default async function AdminMembersPage() {
  const [members, plans] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { subscription: true },
    }),
    prisma.membershipPlan.findMany({ orderBy: { monthlyPriceCents: "asc" } }),
  ]);

  const memberRows = members.map((member) => ({
    id: member.id,
    email: member.email,
    guestAllowance: member.guestAllowance,
    notes: member.notes,
    subscriptionStatus: member.subscription?.status ?? null,
    subscriptionPlanId: member.subscription?.planId ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/70 bg-white/80 p-6">
        <h1 className="font-display text-3xl text-foreground">Members</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Update membership status, plan, guest allowance, and notes.
        </p>
      </div>
      <MemberTable members={memberRows} plans={plans} onSubmitAction={updateMember} />
    </div>
  );
}
