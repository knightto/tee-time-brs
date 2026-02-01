export default function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="mx-auto w-full max-w-4xl px-6 pt-12 text-center">
      {eyebrow ? (
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="mt-3 font-display text-3xl font-semibold text-foreground sm:text-4xl">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-3 text-base text-muted-foreground">{subtitle}</p>
      ) : null}
    </header>
  );
}
