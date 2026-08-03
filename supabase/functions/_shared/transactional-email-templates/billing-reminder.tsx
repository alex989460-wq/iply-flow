import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
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
  // Reseller identity
  brandName?: string
  brandColor?: string
  logoUrl?: string
  // Customer data
  customerName?: string
  username?: string
  planName?: string
  serverName?: string
  dueDate?: string
  amount?: string
  // Message body already rendered by the caller (variables substituted)
  messageBody?: string
  // Optional payment link (checkout / Pix)
  paymentUrl?: string
  fallbackUrl?: string
  supportPhone?: string
  // Optional subject override (configured by the reseller)
  subjectOverride?: string
  // Unsubscribe link (injected by the send function)
  unsubscribeUrl?: string
  trackingPixelUrl?: string
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
  messageBody,
  paymentUrl,
  fallbackUrl,
  supportPhone,
  unsubscribeUrl,
  trackingPixelUrl,
}: Props) => {
  const greeting = customerName ? `Olá, ${customerName}!` : 'Olá!'

  const rawLines = (messageBody || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  // A mensagem configurada (padrão WhatsApp) costuma repetir os dados da
  // assinatura. Removemos essas linhas — os dados aparecem no card abaixo.
  const DATA_LINE =
    /^[^A-Za-zÀ-ÿ0-9]*\s*\*?\s*(usu[áa]rio(\(s\))?|valor|plano|servidor|vencimento|data de vencimento|seguem os dados|renove pelo site|link de renova[çc][ãa]o|renova[çc][ãa]o)\b/i

  const linkMatch = (messageBody || '').match(/https?:\/\/[^\s<>"']+/)
  const extractedUrl = linkMatch ? linkMatch[0] : undefined
  const ctaUrl = paymentUrl || extractedUrl || fallbackUrl

  const clean = (line: string) =>
    line
      .replace(/https?:\/\/[^\s<>"']+/g, '')
      .replace(/\*/g, '')
      .replace(/^[^A-Za-zÀ-ÿ0-9]+/, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/[\s:,-]+$/, '')
      .trim()

  const paragraphs = rawLines
    .filter((line) => !DATA_LINE.test(line))
    .map(clean)
    .filter((line) => line.length > 1 && line.toLowerCase() !== greeting.toLowerCase())

  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>
        {dueDate ? `Seu plano vence em ${dueDate}` : 'Aviso de vencimento da sua assinatura'}
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
            <Text style={brandSubtitle}>Aviso da sua assinatura</Text>
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
              {serverName ? <DetailRow label="Servidor" value={serverName} /> : null}
              {dueDate ? <DetailRow label="Vencimento" value={dueDate} /> : null}
              {amount ? <DetailRow label="Valor" value={amount} color={brandColor} /> : null}
            </Section>

            {ctaUrl ? (
              <Section style={{ textAlign: 'center', margin: '28px 0 8px' }}>
                <Button style={{ ...button, backgroundColor: brandColor }} href={ctaUrl}>
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
          </Section>
        </Container>

        {/* Rodapé em português (fora do card, mesmo padrão da parte de baixo) */}
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
    serverName: 'Servidor 1',
    dueDate: '10/08/2026',
    amount: 'R$ 35,00',
    messageBody: 'Seu plano vence em breve.\nRenove para continuar assistindo sem interrupções.',
    paymentUrl: 'https://supergestor.top/c/joao',
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
const button = {
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 'bold',
  padding: '13px 28px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
  fontFamily: FONT,
}
const hr = { borderColor: '#e4e4e7', margin: '26px 0 16px' }
const footerBrand = { fontSize: '13px', lineHeight: '18px', fontWeight: 'bold', color: '#3f3f46', margin: '0', fontFamily: FONT }
const footer = { fontSize: '12px', lineHeight: '18px', color: '#71717a', margin: '0 0 4px', fontFamily: FONT }
const outerFooter = { width: '100%', maxWidth: '580px', margin: '0 auto', padding: '16px 12px 0', textAlign: 'center' as const }
const footerSmall = { fontSize: '11px', lineHeight: '17px', color: '#a1a1aa', margin: '0 0 4px', textAlign: 'center' as const, fontFamily: FONT }
const footerLink = { color: '#a1a1aa', textDecoration: 'underline' }

const logoImg = { display: 'block', margin: '0 auto 12px', maxWidth: '140px', height: 'auto' }

const pixel = { display: 'block', width: '1px', height: '1px', border: 0, opacity: 0.01 }
