import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  brandName?: string
  brandColor?: string
  logoUrl?: string
  customerName?: string
  username?: string
  planName?: string
  serverName?: string
  dueDate?: string
  amount?: string
  supportPhone?: string
  subjectOverride?: string
  unsubscribeUrl?: string
}

const Email = ({
  brandName = 'Sua Assinatura',
  brandColor = '#ea580c',
  logoUrl,
  customerName,
  username,
  planName,
  serverName,
  dueDate,
  amount,
  supportPhone,
  unsubscribeUrl,
}: Props) => {
  const greeting = customerName ? `Pagamento confirmado, ${customerName}!` : 'Pagamento confirmado!'

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>
        {dueDate ? `Pagamento confirmado — acesso liberado até ${dueDate}` : 'Pagamento confirmado'}
      </Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ ...accentBar, backgroundColor: brandColor }} />
          <Section style={header}>
            {logoUrl ? (
              <Img src={logoUrl} alt={brandName} width="140" style={logoImg} />
            ) : (
            <table cellPadding={0} cellSpacing={0} role="presentation" style={{ margin: '0 auto 12px' }}>
              <tbody>
                <tr>
                  <td style={{ ...logoBadge, backgroundColor: brandColor }}>
                    {(brandName || 'A').trim().charAt(0).toUpperCase()}
                  </td>
                </tr>
              </tbody>
            </table>
            )}
            <Heading style={brandTitle}>{brandName}</Heading>
            <Text style={brandSubtitle}>Confirmação de pagamento</Text>
          </Section>

          <Section style={content}>
            <Text style={{ ...eyebrow, color: '#16a34a' }}>PAGAMENTO CONFIRMADO</Text>
            <Heading style={h1}>{greeting}</Heading>
            <Text style={text}>
              Recebemos o seu pagamento e a sua assinatura já está ativa. Obrigado!
            </Text>

            <Section style={card}>
              <Text style={cardTitle}>Detalhes da assinatura</Text>
              {username ? <DetailRow label="Usuário" value={username} /> : null}
              {planName ? <DetailRow label="Plano" value={planName} /> : null}
              {serverName ? <DetailRow label="Servidor" value={serverName} /> : null}
              {dueDate ? <DetailRow label="Próximo vencimento" value={dueDate} /> : null}
              {amount ? <DetailRow label="Valor pago" value={amount} color="#16a34a" /> : null}
            </Section>

            <Hr style={hr} />
            <Text style={footer}>
              {supportPhone
                ? `Dúvidas? Fale com a gente pelo WhatsApp ${supportPhone}.`
                : 'Em caso de dúvidas, responda este e-mail.'}
            </Text>
            <Text style={footerBrand}>{brandName}</Text>
          </Section>
        </Container>

        <Container style={outerFooter}>
          <Text style={footerSmall}>
            Você recebeu este e-mail porque possui uma assinatura com {brandName}.
          </Text>
          {unsubscribeUrl ? (
            <Text style={footerSmall}>
              <Link href={unsubscribeUrl} style={footerLink}>
                Cancelar o recebimento destes e-mails
              </Link>
            </Text>
          ) : null}
        </Container>
      </Body>
    </Html>
  )
}

const DetailRow = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <table width="100%" cellPadding={0} cellSpacing={0} role="presentation" style={detailTable}>
    <tbody>
      <tr>
        <td style={detailLabelCell}>{label}</td>
        <td style={{ ...detailValueCell, ...(color ? { color } : {}) }}>{value}</td>
      </tr>
    </tbody>
  </table>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    (typeof data?.subjectOverride === 'string' && data.subjectOverride.trim()) ||
    `${data?.brandName || 'Assinatura'} — pagamento confirmado`,
  displayName: 'Confirmação de pagamento',
  previewData: {
    brandName: 'IPTV do João',
    brandColor: '#ea580c',
    customerName: 'Maria Silva',
    username: 'maria123',
    planName: 'Mensal',
    serverName: 'Servidor 1',
    dueDate: '10/09/2026',
    amount: 'R$ 35,00',
    supportPhone: '(41) 99999-9999',
    unsubscribeUrl: 'https://supergestor.top/unsubscribe?token=demo',
  },
} satisfies TemplateEntry

const FONT = 'Arial, Helvetica, sans-serif'

const main = { backgroundColor: '#f4f4f5', fontFamily: FONT, margin: 0, padding: '24px 0' }
const container = {
  width: '100%',
  maxWidth: '580px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  border: '1px solid #e4e4e7',
}
const accentBar = {
  height: '5px',
  lineHeight: '5px',
  fontSize: '1px',
  borderRadius: '12px 12px 0 0',
}
const header = {
  padding: '26px 28px 18px',
  textAlign: 'center' as const,
  backgroundColor: '#ffffff',
  borderBottom: '1px solid #e4e4e7',
}
const logoBadge = {
  width: '52px',
  height: '52px',
  borderRadius: '12px',
  color: '#ffffff',
  fontFamily: FONT,
  fontSize: '24px',
  fontWeight: 'bold',
  textAlign: 'center' as const,
  verticalAlign: 'middle' as const,
  lineHeight: '52px',
}
const brandTitle = { margin: 0, fontSize: '21px', lineHeight: '27px', color: '#18181b', fontFamily: FONT, letterSpacing: '0.3px' }
const brandSubtitle = { margin: '4px 0 0', fontSize: '12px', lineHeight: '16px', color: '#a1a1aa', fontFamily: FONT }
const content = { padding: '28px 28px 24px' }
const eyebrow = { fontSize: '11px', lineHeight: '16px', fontWeight: 'bold', margin: '0 0 8px', fontFamily: FONT }
const h1 = { fontSize: '23px', lineHeight: '30px', color: '#18181b', margin: '0 0 14px', fontFamily: FONT }
const text = { fontSize: '15px', lineHeight: '24px', color: '#52525b', margin: '0 0 10px', fontFamily: FONT }
const card = {
  backgroundColor: '#fafafa',
  border: '1px solid #e4e4e7',
  borderRadius: '10px',
  padding: '16px 18px',
  margin: '22px 0 0',
}
const cardTitle = { fontSize: '12px', lineHeight: '18px', fontWeight: 'bold', color: '#71717a', margin: '0 0 6px', fontFamily: FONT }
const detailTable = { borderTop: '1px solid #e4e4e7', borderCollapse: 'collapse' as const }
const detailLabelCell = { fontSize: '13px', lineHeight: '20px', color: '#71717a', padding: '9px 0', fontFamily: FONT, textAlign: 'left' as const }
const detailValueCell = { fontSize: '13px', lineHeight: '20px', color: '#27272a', fontWeight: 'bold', padding: '9px 0', fontFamily: FONT, textAlign: 'right' as const }
const hr = { borderColor: '#e4e4e7', margin: '26px 0 16px' }
const footerBrand = { fontSize: '13px', lineHeight: '18px', fontWeight: 'bold', color: '#3f3f46', margin: '0', fontFamily: FONT }
const footer = { fontSize: '12px', lineHeight: '18px', color: '#71717a', margin: '0 0 4px', fontFamily: FONT }
const outerFooter = { width: '100%', maxWidth: '580px', margin: '0 auto', padding: '16px 12px 0', textAlign: 'center' as const }
const footerSmall = { fontSize: '11px', lineHeight: '17px', color: '#a1a1aa', margin: '0 0 4px', textAlign: 'center' as const, fontFamily: FONT }
const footerLink = { color: '#a1a1aa', textDecoration: 'underline' }

const logoImg = { display: 'block', margin: '0 auto 12px', maxWidth: '140px', height: 'auto' }
