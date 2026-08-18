# Plan: Lead Capture Finalization & Cakto Naming Fix

Finalize the Lead Capture module into a professional prospecting tool with full persistence and integration, while correcting the naming in the Cakto integration within the Billing settings.

## Proposed Changes

### 1. Database Schema (`supabase/migrations/`)
- Create tables for lead management:
  - `lead_lists`: `id, user_id, name, created_at, status`
  - `leads`: `id, phone (unique), name, address, city, category, site, whatsapp_available, score (hot/warm/cold)`
  - `lead_list_items`: Junction between `leads` and `lead_lists` with status per list.
  - `lead_history`: Log of messages sent, results, and timestamps.
- Add RLS policies for reseller isolation.

### 2. UI Updates (`src/pages/LeadCapture.tsx`)
- **Redesign Search UI**: Google-like search bar for queries like "bares em Curitiba".
- **Advanced Filtering**: Add toggles for WhatsApp, Site, City, Category, and Duplicate status.
- **Classification System**: Implement visual badges for 🔥 Hot, 🟡 Warm, ⚪ Cold leads.
- **List Management**: Side panel or tab to manage "Lists", view total leads, and export.
- **Deduplication Logic**: Check existing `leads` table before adding new entries.
- **Dashboard Widgets**: Add counters for Total, Valid, Contacted, and Pending leads.

### 3. Edge Function (`supabase/functions/google-lead-scraper/`)
- Enhance to return more metadata: Site, Category, Address.
- Implement logic to help classify "Hot Leads" (e.g., has both phone and site).

### 4. Cakto Settings Correction (`src/pages/BillingSettings.tsx`)
- Rename the tab and triggers from "Cakto" (or whatever placeholder name is visible) to the correct label "Cakto" if needed, ensuring it's properly labeled as "Cakto (Integração)" as requested.

### 5. Quick Renewal Panel Integration (`src/components/chat/QuickRenewalPanel.tsx`)
- Ensure the "Lead List" is available as a source for quick messaging within the chat context.

## Technical Details
- Use `TanStack Query` for caching lead lists.
- Timezone: `America/Sao_Paulo`.
- Phone Normalization: Use `src/lib/phone.ts` to ensure `55` prefix and DDI logic.
- RLS: Use `auth.uid()` to scope all lead data to the specific reseller.
