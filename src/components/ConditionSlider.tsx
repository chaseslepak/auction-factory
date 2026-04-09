'use client';

const CONDITIONS = [
  { value: 10, label: '10 - New in box' },
  { value: 9, label: '9 - Like New' },
  { value: 8, label: '8 - Excellent' },
  { value: 7, label: '7 - Good' },
  { value: 6, label: '6 - Average' },
  { value: 5, label: '5 - Well used' },
  { value: 4, label: '4 - Functions' },
  { value: 3, label: '3 - Needs parts' },
  { value: 2, label: '2 - Repairable' },
  { value: 1, label: '1 - Broken' },
];

export default function ConditionSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
        Condition
      </label>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:border-brand-blue text-sm font-medium"
      >
        {CONDITIONS.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </div>
  );
}
