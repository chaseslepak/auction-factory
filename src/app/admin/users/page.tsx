'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AllowedUser, Location } from '@/lib/types';
import Header from '@/components/Header';
import GradientButton from '@/components/GradientButton';

export default function UsersPage() {
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'lotter'>('lotter');
  const [newLocationId, setNewLocationId] = useState('');
  const [adding, setAdding] = useState(false);
  const supabase = createClient();

  const fetchAll = async () => {
    const [{ data: userRows }, { data: locRows }] = await Promise.all([
      supabase
        .from('allowed_users')
        .select('*')
        .order('created_at', { ascending: true }),
      supabase.from('locations').select('*').order('name'),
    ]);
    if (userRows) setUsers(userRows as AllowedUser[]);
    if (locRows) setLocations(locRows as Location[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setAdding(true);
    await supabase.from('allowed_users').upsert({
      email: newEmail.trim().toLowerCase(),
      role: newRole,
      location_id: newLocationId || null,
    });
    setNewEmail('');
    setNewRole('lotter');
    setNewLocationId('');
    await fetchAll();
    setAdding(false);
  };

  const removeUser = async (email: string) => {
    if (!confirm(`Remove ${email}?`)) return;
    await supabase.from('allowed_users').delete().eq('email', email);
    fetchAll();
  };

  const toggleRole = async (email: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'lotter' : 'admin';
    await supabase.from('allowed_users').update({ role: newRole }).eq('email', email);
    fetchAll();
  };

  const setUserLocation = async (email: string, location_id: string) => {
    await supabase
      .from('allowed_users')
      .update({ location_id: location_id || null })
      .eq('email', email);
    fetchAll();
  };

  const locationName = (id: string | null) =>
    id ? locations.find((l) => l.id === id)?.name ?? '—' : 'Unassigned';

  return (
    <div className="min-h-screen bg-brand-bg pb-24">
      <Header title="Users" backHref="/admin" />

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-3">
            Add User
          </h3>
          <form onSubmit={addUser} className="space-y-3">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@example.com"
              required
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-blue"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as any)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
            >
              <option value="lotter">Lotter (can lot and upload)</option>
              <option value="admin">Admin (sees all locations)</option>
            </select>
            <select
              value={newLocationId}
              onChange={(e) => setNewLocationId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white"
            >
              <option value="">
                Location (leave blank = user picks on first login)
              </option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
            <GradientButton type="submit" loading={adding}>
              Add User
            </GradientButton>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide p-4 border-b border-gray-100">
            Authorized Users ({users.length})
          </h3>
          {loading ? (
            <p className="text-sm text-gray-400 p-4 text-center">Loading...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-gray-400 p-4 text-center">No users yet</p>
          ) : (
            users.map((user) => (
              <div
                key={user.email}
                className="p-4 border-b border-gray-100 last:border-b-0 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-brand-navy truncate">
                      {user.email}
                    </p>
                    <button
                      onClick={() => toggleRole(user.email, user.role)}
                      className={`text-xs font-medium mt-0.5 ${
                        user.role === 'admin' ? 'text-brand-blue' : 'text-gray-500'
                      }`}
                    >
                      {user.role}
                    </button>
                  </div>
                  <button
                    onClick={() => removeUser(user.email)}
                    className="text-xs font-bold text-red-500"
                  >
                    Remove
                  </button>
                </div>
                {user.role !== 'admin' && (
                  <select
                    value={user.location_id ?? ''}
                    onChange={(e) => setUserLocation(user.email, e.target.value)}
                    className="w-full px-2 py-1.5 rounded border border-gray-200 text-xs bg-white"
                  >
                    <option value="">Unassigned</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                )}
                {user.role === 'admin' && (
                  <p className="text-xs text-gray-400">Admin — sees all locations</p>
                )}
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-gray-400 text-center">
          Rename locations in Supabase → Table Editor → <code>locations</code>.
          Users must also be in the ALLOWED_EMAILS env var on Vercel.
        </p>
      </div>
    </div>
  );
}
