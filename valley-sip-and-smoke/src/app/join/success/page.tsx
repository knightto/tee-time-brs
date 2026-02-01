import Link from "next/link";
import PageHeader from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function JoinSuccessPage() {
  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Membership"
        title="Thanks for joining Valley Sip and Smoke"
        subtitle="Your membership is pending confirmation. You will receive the sign-in passcode once payment is verified."
      />
      <div className="mx-auto mt-8 w-full max-w-xl rounded-2xl border border-border/70 bg-white/70 px-6 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          If you already have the passcode, you can sign in to RSVP and view the reserve list.
        </p>
        <div className="mt-6 flex justify-center">
          <Button asChild>
            <Link href="/signin">Sign in</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
