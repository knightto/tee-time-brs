"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type EventOption = {
  id: string;
  label: string;
};

type LookupResult = {
  user: {
    id: string;
    email: string;
    name?: string | null;
    memberCode: string;
    guestAllowance: number;
    membershipStatus: string;
    plan: string;
  };
  alreadyCheckedIn: boolean;
};

export default function CheckInClient({ events }: { events: EventOption[] }) {
  const [selectedEvent, setSelectedEvent] = useState(events[0]?.id ?? "");
  const [memberCode, setMemberCode] = useState("");
  const [status, setStatus] = useState("");
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserQRCodeReader | null>(null);

  const handleLookup = useCallback(
    async (code: string) => {
      setStatus("Looking up...");
      setLookup(null);

      const response = await fetch("/api/checkin/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memberCode: code, eventId: selectedEvent }),
      });

      if (!response.ok) {
        setStatus("Member not found.");
        return;
      }

      const data = (await response.json()) as LookupResult;
      setLookup(data);
      setStatus("");
    },
    [selectedEvent],
  );

  useEffect(() => {
    if (!scanning) {
      readerRef.current?.reset();
      return;
    }

    const reader = new BrowserQRCodeReader();
    readerRef.current = reader;

    reader.decodeFromVideoDevice(undefined, videoRef.current!, (result, error) => {
      if (result) {
        handleLookup(result.getText());
        setScanning(false);
      }
      if (error && error.name !== "NotFoundException") {
        console.error(error);
      }
    });

    return () => {
      reader.reset();
    };
  }, [scanning, handleLookup]);

  async function handleCheckIn() {
    if (!lookup) {
      return;
    }
    setStatus("Checking in...");
    const response = await fetch("/api/checkin/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: lookup.user.id, eventId: selectedEvent }),
    });

    if (!response.ok) {
      setStatus("Unable to check in.");
      return;
    }

    setStatus("Checked in.");
    setLookup({ ...lookup, alreadyCheckedIn: true });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/70 bg-white/70 p-6">
        <label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Select event night
        </label>
        <select
          value={selectedEvent}
          onChange={(event) => setSelectedEvent(event.target.value)}
          className="mt-2 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
        >
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-white/70 p-6">
          <p className="font-display text-lg text-foreground">Scan member QR</p>
          <div className="mt-4 aspect-video w-full overflow-hidden rounded-2xl border border-border">
            <video ref={videoRef} className="h-full w-full object-cover" />
          </div>
          <Button className="mt-4" onClick={() => setScanning((prev) => !prev)}>
            {scanning ? "Stop camera" : "Start camera"}
          </Button>
        </div>

        <div className="rounded-2xl border border-border/70 bg-white/70 p-6">
          <p className="font-display text-lg text-foreground">Manual lookup</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Input
              placeholder="Enter member code"
              value={memberCode}
              onChange={(event) => setMemberCode(event.target.value)}
            />
            <Button onClick={() => handleLookup(memberCode)}>Lookup</Button>
          </div>
        </div>
      </div>

      {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}

      {lookup ? (
        <div className="rounded-2xl border border-border/70 bg-white/70 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-display text-xl">{lookup.user.name ?? lookup.user.email}</p>
              <p className="text-sm text-muted-foreground">{lookup.user.memberCode}</p>
            </div>
            <div className="text-sm text-muted-foreground">
              Status: {lookup.user.membershipStatus} · Plan: {lookup.user.plan}
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Guest allowance: {lookup.user.guestAllowance}
          </p>
          <Button
            className="mt-4"
            onClick={handleCheckIn}
            disabled={lookup.alreadyCheckedIn}
          >
            {lookup.alreadyCheckedIn ? "Already checked in" : "Check in"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
