'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Header from '@/components/Header';
import GradientButton from '@/components/GradientButton';

interface AllowedUser {
  email: string;
  role: 'admin' | 'lotter';
  location_id: string | null;
  created_at: string;
}

interface Location {
  id: string;
  name: string;
  active: boolean;
}

export default function UsersPage() {
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'lotter'>('lotter');
  const [newLocationId, setNewLocationId] = useState('');
  const [adding, setAdding] = useState(false);
  const supabase = createClient();

  const locationName = (id: string | null) => {
    if (!id) return null;
    return locations.find((l) => l.id === id)?.name ?? 'Unknown location';
  };

  const fetchData = async () => {
    const [{ data: userData }, { data: locData }] = await Promise.all([
      supabase.from('allowed_users').select('*').order('created_at', { ascending: true }),
      supabase.from('locations').select('id, name, active').order('name', { ascending: true }),
    ]);
    if (userData) setUsers(userData as any);
    if (locData) setLocations(locData as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
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
    await fetchData();
    setAdding(false);
  };

  const removeUser = async (email: string) => {
    if (!confirm(`Remove ${email}?`)) return;
    await supabase.from('allowed_users').delete().eq('email', email);
    fetchData();
  };

  const toggleRole = async (email: string, currentRole: string) => {
    const role = currentRole === 'admin' ? 'lotter' : 'admin';
    await supabase.from('allowed_users').update({ role }).eq('email', email);
    fetchData();
  };

  const setLocation = async (email: string, locationId: string) => {
    await supabase
      .from('allowed_users')
      .update({ location_id: locationId || null })
      .eq('email', email);
    fetchData();
  };

  const activeLocations = locations.filter((l) => l.active);

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
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
            >
              <option value="lotter">Lotter (can lot and upload)</option>
              <option value="admin">Admin (full access)</option>
            </select>
            <select
              value={newLocationId}
              onChange={(e) => setNewLocationId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm"
            >
              <option value="">No location (HQ / admin)</option>
              {activeLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
            <GradientButton type="submit" loading={adding}>
              Add User
            </GradientButton>
          </form>
          {activeLocations.length === 0 && (
            <p className="text-xs text-gray-400 mt-3">
              No locations yet — add them on the Locations screen to assign users.
            </p>
          )}
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
                className="flex items-center justify-between p-4 border-b border-gray-100 last:border-b-0 gap-2"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-brand-navy truncate">{user.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => toggleRole(user.email, user.role)}
                      className={`text-xs font-medium ${
                        user.role === 'admin' ? 'text-brand-blue' : 'text-gray-500'
                      }`}
                    >
                      {user.role}
                    </button>
                    <select
                      value={user.location_id ?? ''}
                      onChange={(e) => setLocation(user.email, e.target.value)}
                      className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5 max-w-[10rem]"
                    >
                      <option value="">No location</option>
                      {/* Keep the currently-assigned location selectable even if it's archived */}
                      {user.location_id && !activeLocations.some((l) => l.id === user.location_id) && (
                        <option value={user.location_id}>{locationName(user.location_id)}</option>
                      )}
                      {activeLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => removeUser(user.email)}
                  className="text-xs font-bold text-red-500 ml-2 shrink-0"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        <p className="text-xs text-gray-400 text-center">
          Users must also be in the ALLOWED_EMAILS env var on Vercel for now.
        </p>
      </div>
    </div>
  );
}
