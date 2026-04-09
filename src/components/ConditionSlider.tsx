'use client';

export default function ConditionSlider({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-bold text-gray-700 uppercase tracking-wide">
          Condition
        </label>
        <span className="text-sm font-black text-brand-green">{value}/10</span>
      </div>
      <input
        type="range"
        min={1}
        max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>Poor</span>
        <span>Excellent</span>
      </div>
    </div>
  );
}
