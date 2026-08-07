'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Header from '@/components/Header';
import GradientButton from '@/components/GradientButton';

interface Location {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export default function LocationsPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [userCounts, setUserCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const supabase = createClient();

  const fetchLocations = async () => {
    const { data } = await supabase
      .from('locations')
      .select('*')
      .order('name', { ascending: true });
    if (data) setLocations(data as any);

    // How many users are assigned to each location, so an admin can see
    // which locations are still unstaffed before the rollout.
    const { data: users } = await supabase
      .from('allowed_users')
      .select('location_id');
    if (users) {
      const counts: Record<string, number> = {};
      users.forEach((u: any) => {
        if (u.location_id) counts[u.location_id] = (counts[u.location_id] || 0) + 1;
      });
      setUserCounts(counts);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLocations();
  }, []);

  const addLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    const { error } = await supabase.from('locations').insert({ name });
    if (error) {
      alert(
        error.code === '23505'
          ? `A location named "${name}" already exists.`
          : `Could not add location: ${error.message}`
      );
    } else {
      setNewName('');
      await fetchLocations();
    }
    setAdding(false);
  };

  const rename = async (loc: Location) => {
    const name = prompt('Rename location', loc.name)?.trim();
    if (!name || name === loc.name) return;
    const { error } = await supabase.from('locations').update({ name }).eq('id', loc.id);
    if (error) {
      alert(
        error.code === '23505'
          ? `A location named "${name}" already exists.`
          : `Could not rename: ${error.message}`
      );
      return;
    }
    fetchLocations();
  };

  const toggleActive = async (loc: Location) => {
    await supabase.from('locations').update({ active: !loc.active }).eq('id', loc.id);
    fetchLocations();
  };

  return (
    <div className="min-h-screen bg-brand-bg pb-24">
      <Header title="Locations" backHref="/admin" />

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-3">
            Add Location
          </h3>
          <form onSubmit={addLocation} className="space-y-3">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Columbus North"
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-blue"
            />
            <GradientButton type="submit" loading={adding}>
              Add Location
            </GradientButton>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide p-4 border-b border-gray-100">
            Locations ({locations.length})
          </h3>
          {loading ? (
            <p className="text-sm text-gray-400 p-4 text-center">Loading...</p>
          ) : locations.length === 0 ? (
            <p className="text-sm text-gray-400 p-4 text-center">
              No locations yet. Add your first one above.
            </p>
          ) : (
            locations.map((loc) => (
              <div
                key={loc.id}
                className="flex items-center justify-between p-4 border-b border-gray-100 last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm font-bold truncate ${
                      loc.active ? 'text-brand-navy' : 'text-gray-400 line-through'
                    }`}
                  >
                    {loc.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {userCounts[loc.id] || 0} user{(userCounts[loc.id] || 0) === 1 ? '' : 's'}
                    {!loc.active && ' · archived'}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-2">
                  <button onClick={() => rename(loc)} className="text-xs font-bold text-brand-blue">
                    Rename
                  </button>
                  <button
                    onClick={() => toggleActive(loc)}
                    className="text-xs font-bold text-gray-500"
                  >
                    {loc.active ? 'Archive' : 'Restore'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-gray-400 text-center">
          Assign users to a location on the Users screen. Archiving a location keeps its
          history and simply unassigns it from the Add-User dropdown.
        </p>
      </div>
    </div>
  );
}
