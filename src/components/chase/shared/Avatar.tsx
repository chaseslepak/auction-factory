export default function Avatar({
  name,
  size = 32,
}: {
  name?: string | null;
  size?: number;
}) {
  const initials = (name || '?')
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      title={name || ''}
      aria-label={name || ''}
    >
      {initials}
    </span>
  );
}
