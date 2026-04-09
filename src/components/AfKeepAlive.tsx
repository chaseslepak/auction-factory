'use client';

import { useEffect } from 'react';

const PING_INTERVAL = 10 * 60 * 1000; // 10 minutes

export default function AfKeepAlive() {
  useEffect(() => {
    const ping = () => {
      fetch('/api/af-keepalive').catch(() => {});
    };

    // Ping once on mount
    ping();

    // Then every 10 minutes
    const interval = setInterval(ping, PING_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  return null; // Invisible component
}
