import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  // Reseller identity
  brandName?: string
  brandColor?: string
  logoUrl?: string
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
  // Optional subject override (configured by the reseller)
  subjectOverride?: string
}

const Email = ({
  brandName = 'Sua Assinatura',
  brandColor = '#ea580c',
  logoUrl,
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
          <Section style={{ ...header, backgroundColor: brandColor }}>
            <Row>
              <Column style={brandColumn}>
                {logoUrl ? (
                  <Img src={logoUrl} alt={brandName} style={logo} />
                ) : (
                  <Text style={brandMark}>{brandName.slice(0, 1).toUpperCase()}</Text>
                )}
              </Column>
              <Column>
                <Heading style={brandTitle}>{brandName}</Heading>
                <Text style={brandSubtitle}>Aviso da sua assinatura</Text>
              </Column>
            </Row>
          </Section>

          <Section style={content}>
            <Text style={{ ...eyebrow, color: brandColor }}>LEMBRETE DE VENCIMENTO</Text>
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
              <Text style={cardTitle}>Detalhes da assinatura</Text>
              {username ? <DetailRow label="Usuário" value={username} /> : null}
              {planName ? <DetailRow label="Plano" value={planName} /> : null}
              {dueDate ? <DetailRow label="Vencimento" value={dueDate} /> : null}
              {amount ? <DetailRow label="Valor" value={amount} highlight /> : null}
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
            <Text style={footerBrand}>{brandName}</Text>
            <Text style={footer}>Você recebeu este aviso porque possui uma assinatura com {brandName}.</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const DetailRow = ({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) => (
  <Row style={detailRow}>
    <Column><Text style={detailLabel}>{label}</Text></Column>
    <Column align="right"><Text style={highlight ? detailHighlight : detailValue}>{value}</Text></Column>
  </Row>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    (typeof data?.subjectOverride === 'string' && data.subjectOverride.trim()) ||
    (data?.dueDate
      ? `${data?.brandName || 'Assinatura'} — vencimento em ${data.dueDate}`
      : `${data?.brandName || 'Assinatura'} — aviso de vencimento`),
  displayName: 'Cobrança / Lembrete de vencimento',
  previewData: {
    brandName: 'IPTV do João',
    brandColor: '#ea580c',
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


const main = { backgroundColor: '#f4f4f5', fontFamily: 'Arial, Helvetica, sans-serif', padding: '28px 12px' }
const container = { maxWidth: '580px', margin: '0 auto', backgroundColor: '#ffffff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 8px 28px rgba(24, 24, 27, 0.10)' }
const header = {
  padding: '22px 28px',
}
const brandColumn = { width: '58px', verticalAlign: 'middle' }
const logo = { display: 'block', width: '46px', height: '46px', objectFit: 'contain' as const, backgroundColor: '#ffffff', borderRadius: '10px', padding: '4px' }
const brandMark = { width: '46px', height: '46px', lineHeight: '46px', textAlign: 'center' as const, margin: 0, borderRadius: '10px', backgroundColor: '#ffffff', color: '#18181b', fontSize: '20px', fontWeight: 'bold' }
const brandTitle = { margin: 0, fontSize: '19px', lineHeight: '24px', color: '#ffffff' }
const brandSubtitle = { margin: '2px 0 0', fontSize: '12px', lineHeight: '16px', color: '#fff7ed' }
const content = {
  padding: '32px 28px 26px',
}
const eyebrow = { fontSize: '11px', lineHeight: '16px', fontWeight: 'bold', margin: '0 0 8px', letterSpacing: '0' }
const h1 = { fontSize: '24px', lineHeight: '31px', color: '#18181b', margin: '0 0 14px' }
const text = { fontSize: '15px', lineHeight: '24px', color: '#52525b', margin: '0 0 10px' }
const card = {
  backgroundColor: '#fafafa',
  border: '1px solid #e4e4e7',
  borderRadius: '10px',
  padding: '18px 18px 10px',
  margin: '22px 0 0',
}
const cardTitle = { fontSize: '12px', lineHeight: '18px', fontWeight: 'bold', color: '#71717a', margin: '0 0 8px' }
const detailRow = { borderTop: '1px solid #e4e4e7' }
const detailLabel = { fontSize: '13px', lineHeight: '20px', color: '#71717a', margin: '9px 0' }
const detailValue = { fontSize: '13px', lineHeight: '20px', color: '#27272a', fontWeight: 'bold', margin: '9px 0' }
const detailHighlight = { ...detailValue, color: '#ea580c' }
const button = {
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold',
  padding: '13px 28px',
  borderRadius: '9px',
  textDecoration: 'none',
  display: 'inline-block',
}
const hr = { borderColor: '#e4e4e7', margin: '28px 0 16px' }
const footerBrand = { fontSize: '13px', lineHeight: '18px', fontWeight: 'bold', color: '#3f3f46', margin: '0 0 4px' }
const footer = { fontSize: '12px', lineHeight: '18px', color: '#71717a', margin: '0 0 4px' }
