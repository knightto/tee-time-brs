import { prisma } from "@/lib/prisma";
import { getServerAuthSession } from "@/lib/session";

export default async function MemberProfilePage() {
  const session = await getServerAuthSession();
  const user = session?.user?.email
    ? await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { subscription: { include: { plan: true } } },
      })
    : null;

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-border/70 bg-white/80 p-6">
        <h1 className="font-display text-3xl text-foreground">Profile</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          View your membership status and guest allowance.
        </p>
      </div>

      <div className="rounded-2xl border border-border/70 bg-white/70 px-6 py-5 text-sm text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">Email:</span> {user.email}
        </p>
        <p className="mt-2">
          <span className="font-medium text-foreground">Member code:</span> {user.memberCode}
        </p>
        <p className="mt-2">
          <span className="font-medium text-foreground">Plan:</span>{" "}
          {user.subscription?.plan?.name ?? "Pending"}
        </p>
        <p className="mt-2">
          <span className="font-medium text-foreground">Status:</span>{" "}
          {user.subscription?.status ?? "Pending"}
        </p>
        <p className="mt-2">
          <span className="font-medium text-foreground">Guest allowance:</span>{" "}
          {user.guestAllowance}
        </p>
      </div>
    </div>
  );
}
