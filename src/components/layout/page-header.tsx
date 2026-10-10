export function PageHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-5">
      <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>
      {description ? <p className="mt-1 text-muted">{description}</p> : null}
    </div>
  );
}
