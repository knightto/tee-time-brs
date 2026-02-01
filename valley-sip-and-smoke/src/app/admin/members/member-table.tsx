"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Plan = { id: string; name: string };

type MemberRow = {
  id: string;
  email: string;
  guestAllowance: number;
  notes: string | null;
  subscriptionStatus: string | null;
  subscriptionPlanId: string | null;
};

export default function MemberTable({
  members,
  plans,
  onSubmitAction,
}: {
  members: MemberRow[];
  plans: Plan[];
  onSubmitAction: (formData: FormData) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const lowered = query.toLowerCase();
    return members.filter((member) => member.email.toLowerCase().includes(lowered));
  }, [members, query]);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search by email"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="space-y-4">
        {filtered.map((member) => (
          <form
            key={member.id}
            action={onSubmitAction}
            className="rounded-2xl border border-border/70 bg-white/70 p-5"
          >
            <input type="hidden" name="userId" value={member.id} />
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <p className="text-sm font-medium text-foreground">{member.email}</p>
                <p className="text-xs text-muted-foreground">Member ID: {member.id}</p>
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Plan
                </label>
                <select
                  name="planId"
                  defaultValue={member.subscriptionPlanId ?? plans[0]?.id}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                >
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Status
                </label>
                <select
                  name="status"
                  defaultValue={member.subscriptionStatus ?? "MANUAL"}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
                >
                  {[
                    "ACTIVE",
                    "PAUSED",
                    "CANCELED",
                    "COMPED",
                    "MANUAL",
                    "PAST_DUE",
                  ].map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Guest allowance
                </label>
                <Input
                  name="guestAllowance"
                  type="number"
                  min={0}
                  defaultValue={member.guestAllowance}
                />
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <Input
                name="notes"
                placeholder="Notes"
                defaultValue={member.notes ?? ""}
              />
              <Button type="submit" className="w-full md:w-auto">
                Save
              </Button>
            </div>
          </form>
        ))}
      </div>
    </div>
  );
}
