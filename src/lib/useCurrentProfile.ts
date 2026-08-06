'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { AllowedUser, Location } from '@/lib/types';

export interface CurrentProfile {
  email: string;
  profile: AllowedUser | null;
  locations: Location[];
  loading: boolean;
  refresh: () => Promise<void>;
}

export function useCurrentProfile(): CurrentProfile {
  const [email, setEmail] = useState('');
  const [profile, setProfile] = useState<AllowedUser | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const load = async () => {
    setLoading(true);
    const [{ data: { user } }, { data: locs }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('locations').select('*').order('name'),
    ]);
    if (locs) setLocations(locs as Location[]);
    if (user?.email) {
      setEmail(user.email);
      const { data } = await supabase
        .from('allowed_users')
        .select('*')
        .eq('email', user.email.toLowerCase())
        .single();
      setProfile((data as AllowedUser) ?? null);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return { email, profile, locations, loading, refresh: load };
}
