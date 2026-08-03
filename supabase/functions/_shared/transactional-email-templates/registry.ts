import type { ComponentType } from 'npm:react@18.3.1'
import { template as billingReminder } from './billing-reminder.tsx'
import { template as paymentConfirmation } from './payment-confirmation.tsx'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string
}

export const TEMPLATES: Record<string, TemplateEntry> = {
  'billing-reminder': billingReminder,
  'payment-confirmation': paymentConfirmation,
}
