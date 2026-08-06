'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Location } from '@/lib/types';
import GradientButton from '@/components/GradientButton';

interface Props {
  email: string;
  locations: Location[];
  onPicked: () => void;
}

export default function LocationPicker({ email, locations, onPicked }: Props) {
  const [selected, setSelected] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const { error: upsertError } = await supabase
      .from('allowed_users')
      .upsert(
        { email: email.toLowerCase(), role: 'lotter', location_id: selected },
        { onConflict: 'email' }
      );
    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
      return;
    }
    onPicked();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center px-4">
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 space-y-4">
        <div>
          <h2 className="font-black text-brand-navy text-lg">Pick your location</h2>
          <p className="text-sm text-gray-500 mt-1">
            You&apos;ll only see auctions from this location. Ask an admin if
            you need to change it later.
          </p>
        </div>

        <div className="space-y-1 max-h-72 overflow-y-auto">
          {locations.map((loc) => (
            <label
              key={loc.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${
                selected === loc.id
                  ? 'border-brand-blue bg-brand-blue/5'
                  : 'border-gray-200'
              }`}
            >
              <input
                type="radio"
                name="location"
                value={loc.id}
                checked={selected === loc.id}
                onChange={(e) => setSelected(e.target.value)}
                className="accent-brand-blue"
              />
              <span className="font-medium text-brand-navy">{loc.name}</span>
            </label>
          ))}
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <GradientButton onClick={save} loading={saving} disabled={!selected}>
          Confirm
        </GradientButton>
      </div>
    </div>
  );
}
