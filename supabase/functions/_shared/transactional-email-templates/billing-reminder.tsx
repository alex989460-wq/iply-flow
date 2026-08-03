import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  // Reseller identity
  brandName?: string
  brandColor?: string
  // Customer data
  customerName?: string
  username?: string
  planName?: string
  dueDate?: string
  amount?: string
  // Message body already rendered by the caller (variables substituted)
  messageBody?: string
  // Optional payment link (checkout / Pix)
  paymentUrl?: string
  supportPhone?: string
}

const Email = ({
  brandName = 'Sua Assinatura',
  brandColor = '#16a34a',
  customerName,
  username,
  planName,
  dueDate,
  amount,
  messageBody,
  paymentUrl,
  supportPhone,
}: Props) => {
  const greeting = customerName ? `Olá, ${customerName}!` : 'Olá!'
  const paragraphs = (messageBody || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>
        {dueDate ? `Seu plano vence em ${dueDate}` : 'Aviso de vencimento da sua assinatura'}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ ...header, borderTopColor: brandColor }}>
            <Heading style={brandTitle}>{brandName}</Heading>
          </Section>

          <Section style={content}>
            <Heading style={h1}>{greeting}</Heading>

            {paragraphs.length > 0 ? (
              paragraphs.map((line, i) => (
                <Text key={i} style={text}>
                  {line}
                </Text>
              ))
            ) : (
              <Text style={text}>
                Este é um lembrete sobre o vencimento da sua assinatura.
              </Text>
            )}

            <Section style={card}>
              {username ? <Text style={row}>Usuário: <strong>{username}</strong></Text> : null}
              {planName ? <Text style={row}>Plano: <strong>{planName}</strong></Text> : null}
              {dueDate ? <Text style={row}>Vencimento: <strong>{dueDate}</strong></Text> : null}
              {amount ? <Text style={row}>Valor: <strong>{amount}</strong></Text> : null}
            </Section>

            {paymentUrl ? (
              <Section style={{ textAlign: 'center', margin: '28px 0 8px' }}>
                <Button style={{ ...button, backgroundColor: brandColor }} href={paymentUrl}>
                  Renovar agora
                </Button>
              </Section>
            ) : null}

            <Hr style={hr} />
            <Text style={footer}>
              {supportPhone
                ? `Dúvidas? Fale com a gente pelo WhatsApp ${supportPhone}.`
                : 'Em caso de dúvidas, responda este e-mail.'}
            </Text>
            <Text style={footer}>{brandName}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    data?.dueDate
      ? `${data?.brandName || 'Assinatura'} — vencimento em ${data.dueDate}`
      : `${data?.brandName || 'Assinatura'} — aviso de vencimento`,
  displayName: 'Cobrança / Lembrete de vencimento',
  previewData: {
    brandName: 'IPTV do João',
    brandColor: '#16a34a',
    customerName: 'Maria Silva',
    username: 'maria123',
    planName: 'Mensal',
    dueDate: '10/08/2026',
    amount: 'R$ 35,00',
    messageBody: 'Seu plano vence em breve.\nRenove para continuar assistindo sem interrupções.',
    paymentUrl: 'https://supergestor.top/c/joao',
    supportPhone: '(41) 99999-9999',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { maxWidth: '560px', margin: '0 auto', padding: '24px 0' }
const header = {
  borderTop: '4px solid #16a34a',
  backgroundColor: '#f8fafc',
  padding: '18px 24px',
  borderRadius: '10px 10px 0 0',
}
const brandTitle = { margin: 0, fontSize: '18px', color: '#0f172a' }
const content = {
  border: '1px solid #e2e8f0',
  borderTop: 'none',
  borderRadius: '0 0 10px 10px',
  padding: '24px',
}
const h1 = { fontSize: '20px', color: '#0f172a', margin: '0 0 12px' }
const text = { fontSize: '15px', lineHeight: '24px', color: '#334155', margin: '0 0 10px' }
const card = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '14px 16px',
  margin: '18px 0 0',
}
const row = { fontSize: '14px', color: '#334155', margin: '0 0 6px' }
const button = {
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold',
  padding: '12px 24px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
}
const hr = { borderColor: '#e2e8f0', margin: '24px 0 14px' }
const footer = { fontSize: '12px', color: '#64748b', margin: '0 0 4px' }
