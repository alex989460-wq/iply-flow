import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.09f4055a43fb40dc9c1068a1a5c219ce',
  appName: 'iply-flow',
  webDir: 'dist',
  server: {
    url: 'https://09f4055a-43fb-40dc-9c10-68a1a5c219ce.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    OneSignal: {
      appId: '737b0b75-28da-4cc7-afe3-10887a45f0aa',
    },
  },
};

export default config;
