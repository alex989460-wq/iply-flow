import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.supergestor.app',
  appName: 'Super Gestor',
  webDir: 'dist',
  server: {
    url: 'https://supergestor.top',
    cleartext: false,
    androidScheme: 'https',
  },
  plugins: {
    OneSignal: {
      appId: '737b0b75-28da-4cc7-afe3-10887a45f0aa',
    },
  },
};

export default config;
