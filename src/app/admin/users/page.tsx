'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Header from '@/components/Header';
import GradientButton from '@/components/GradientButton';

interface AllowedUser {
  email: string;
  role: 'admin' | 'lotter';
  created_at: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'lotter'>('lotter');
  const [adding, setAdding] = useState(false);
  const supabase = createClient();

  const fetchUsers = async () => {
    const { data } = await supabase.from('allowed_users').select('*').order('created_at', { ascending: true });
    if (data) setUsers(data as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return;
    setAdding(true);
    await supabase.from('allowed_users').upsert({
      email: newEmail.trim().toLowerCase(),
      role: newRole,
    });
    setNewEmail('');
    setNewRole('lotter');
    await fetchUsers();
    setAdding(false);
  };

  const removeUser = async (email: string) => {
    if (!confirm(`Remove ${email}?`)) return;
    await supabase.from('allowed_users').delete().eq('email', email);
    fetchUsers();
  };

  const toggleRole = async (email: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'lotter' : 'admin';
    await supabase.from('allowed_users').update({ role: newRole }).eq('email', email);
    fetchUsers();
  };

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
                className="flex items-center justify-between p-4 border-b border-gray-100 last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-brand-navy truncate">{user.email}</p>
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
                  className="text-xs font-bold text-red-500 ml-2"
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
