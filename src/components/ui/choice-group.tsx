import { cn } from "@/lib/cn";

/** Grupo de opções grandes (radio nativo), acessível por teclado. */
export function ChoiceGroup({
  legend,
  name,
  options,
  defaultValue,
  errors,
}: {
  legend: string;
  name: string;
  options: { value: string; label: string; hint?: string }[];
  defaultValue?: string;
  errors?: string[];
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 font-semibold">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border-2 border-border bg-surface px-3 py-2.5",
              "has-[:checked]:border-primary has-[:checked]:bg-surface-muted",
              "has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
            )}
          >
            <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} className="mt-1.5 size-5 accent-[var(--primary)]" />
            <span>
              <span className="font-semibold">{o.label}</span>
              {o.hint ? <span className="block text-sm text-muted">{o.hint}</span> : null}
            </span>
          </label>
        ))}
      </div>
      {errors?.length ? <p className="mt-1 text-sm font-semibold text-danger">{errors.join(" ")}</p> : null}
    </fieldset>
  );
}
