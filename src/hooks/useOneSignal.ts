import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const ONESIGNAL_APP_ID = '737b0b75-28da-4cc7-afe3-10887a45f0aa';

/**
 * Initializes OneSignal on native platforms (iOS/Android) and persists
 * the device's OneSignal player id into `device_tokens` for the logged user.
 * No-op on web.
 */
export function useOneSignal() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;

    (async () => {
      try {
        // Dynamic import so web bundles don't try to resolve the cordova plugin.
        const mod: any = await import('onesignal-cordova-plugin');
        const OneSignal = mod.default ?? mod;

        OneSignal.initialize(ONESIGNAL_APP_ID);

        // Prompt for iOS/Android 13+ notification permission
        OneSignal.Notifications.requestPermission(true);

        const saveToken = async () => {
          try {
            const playerId: string | null =
              (await OneSignal.User.pushSubscription.getIdAsync?.()) ??
              OneSignal.User.pushSubscription.id ??
              null;
            if (!playerId || cancelled) return;

            const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
            await supabase.from('device_tokens').upsert(
              {
                user_id: user.id,
                token: playerId,
                platform,
                last_seen_at: new Date().toISOString(),
              },
              { onConflict: 'user_id,token' }
            );
          } catch (e) {
            console.warn('[OneSignal] token save failed', e);
          }
        };

        // Save now and whenever subscription changes
        await saveToken();
        OneSignal.User.pushSubscription.addEventListener?.('change', saveToken);
      } catch (err) {
        console.warn('[OneSignal] init skipped', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);
}
