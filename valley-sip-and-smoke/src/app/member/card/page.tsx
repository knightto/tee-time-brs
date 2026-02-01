import Image from "next/image";
import { getServerAuthSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { toDataURL } from "qrcode";

export default async function MemberCardPage() {
  const session = await getServerAuthSession();
  const user = session?.user?.email
    ? await prisma.user.findUnique({ where: { email: session.user.email } })
    : null;

  if (!user) {
    return null;
  }

  const qr = await toDataURL(user.memberCode, { margin: 1, width: 240 });

  return (
    <div className="rounded-3xl border border-border/70 bg-white/80 p-6">
      <h1 className="font-display text-3xl text-foreground">Digital member card</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Show this QR code at check-in. It is tied to your member ID, not personal info.
      </p>
      <div className="mt-6 flex flex-col items-center gap-4">
        <Image
          src={qr}
          alt="Member QR code"
          width={240}
          height={240}
          className="h-60 w-60 rounded-2xl border"
          unoptimized
        />
        <div className="text-center">
          <p className="text-sm text-muted-foreground">Member code</p>
          <p className="font-display text-xl text-foreground">{user.memberCode}</p>
        </div>
      </div>
    </div>
  );
}
