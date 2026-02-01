"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function JoinForm({
  planId,
  planName,
  priceLabel,
}: {
  planId: string;
  planName: string;
  priceLabel: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    const response = await fetch("/api/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, planId }),
    });

    if (!response.ok) {
      setStatus("error");
      setMessage("Unable to start membership. Please try again.");
      return;
    }

    const data = await response.json();
    if (data.url) {
      window.location.href = data.url;
      return;
    }

    setStatus("success");
    setMessage(
      "Your request is in. A host will confirm your membership and share the sign-in passcode.",
    );
  }

  return (
    <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
      <div className="space-y-1">
        <Label htmlFor={`email-${planId}`}>Email</Label>
        <Input
          id={`email-${planId}`}
          type="email"
          placeholder="you@email.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={status === "loading"}>
        {status === "loading" ? "Starting..." : `Join ${planName} · ${priceLabel}`}
      </Button>
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
    </form>
  );
}
