import PageHeader from "@/components/page-header";

const faqs = [
  {
    question: "Is this an exclusive event?",
    answer:
      "No. Valley Sip and Smoke is a hosted night with limited seating and RSVP encouraged. Members receive priority seating and benefits, but seating can open to walk-ins when space allows.",
  },
  {
    question: "Who serves the bourbon?",
    answer:
      "All alcohol is sold and served by On Cue staff through their POS. No outside alcohol is allowed.",
  },
  {
    question: "Can I bring my own cigars?",
    answer:
      "Yes. Members may bring their own cigars. Optional club cigars may be offered separately from alcohol.",
  },
  {
    question: "How does member pricing work?",
    answer:
      "Member pricing is applied per 2 oz pour only. There are no bundles, free pours, or unlimited deals.",
  },
  {
    question: "What if I cannot RSVP?",
    answer:
      "RSVPs help the host team plan seating. Walk-ins are welcome when capacity allows.",
  },
];

export default function FAQPage() {
  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="FAQ"
        title="Questions about Valley Sip and Smoke"
        subtitle="Quick answers for guests and members."
      />

      <div className="mx-auto mt-10 w-full max-w-4xl space-y-6 px-6">
        {faqs.map((faq) => (
          <div
            key={faq.question}
            className="rounded-2xl border border-border/70 bg-white/70 px-6 py-5"
          >
            <h3 className="font-display text-lg text-foreground">{faq.question}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{faq.answer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
