import * as React from 'npm:react@18.3.1'
import {
  Body,
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
  brandName?: string
  brandColor?: string
  code?: string
  purposeLabel?: string
  minutes?: number
  trackingPixelUrl?: string
}

const Email = ({
  brandName = 'Super Gestor',
  brandColor = '#ea580c',
  code = '000000',
  purposeLabel = 'Código de verificação',
  minutes = 10,
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{`Seu código de verificação: ${code}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={{ ...accentBar, backgroundColor: brandColor }} />
        <Section style={content}>
          <Text style={{ ...eyebrow, color: brandColor }}>{purposeLabel.toUpperCase()}</Text>
          <Heading style={h1}>Confirme que é você</Heading>
          <Text style={text}>
            Use o código abaixo para concluir a verificação no {brandName}. Ele expira em {minutes} minutos.
          </Text>
          <Section style={codeBox}>
            <Text style={codeText}>{code}</Text>
          </Section>
          <Text style={text}>
            Se você não solicitou este código, ignore este e-mail e mantenha sua senha em segurança.
          </Text>
          <Hr style={hr} />
          <Text style={footer}>Este é um e-mail automático de segurança do {brandName}.</Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `${data?.code ? `${data.code} — ` : ''}Código de verificação ${data?.brandName || 'Super Gestor'}`,
  displayName: 'Código de verificação (2FA / ativação)',
  previewData: {
    brandName: 'Super Gestor',
    brandColor: '#ea580c',
    code: '482913',
    purposeLabel: 'Verificação em duas etapas',
    minutes: 10,
  },
} satisfies TemplateEntry

const FONT = 'Arial, Helvetica, sans-serif'
const main = { backgroundColor: '#f4f4f5', fontFamily: FONT, margin: 0, padding: '24px 0' }
const container = {
  width: '100%',
  maxWidth: '520px',
  margin: '0 auto',
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  border: '1px solid #e4e4e7',
}
const accentBar = { height: '5px', lineHeight: '5px', fontSize: '1px', borderRadius: '12px 12px 0 0' }
const content = { padding: '28px' }
const eyebrow = { fontSize: '11px', lineHeight: '16px', fontWeight: 'bold', margin: '0 0 8px', fontFamily: FONT }
const h1 = { fontSize: '22px', lineHeight: '30px', color: '#18181b', margin: '0 0 14px', fontFamily: FONT }
const text = { fontSize: '15px', lineHeight: '24px', color: '#52525b', margin: '0 0 12px', fontFamily: FONT }
const codeBox = {
  backgroundColor: '#fafafa',
  border: '1px solid #e4e4e7',
  borderRadius: '10px',
  padding: '18px',
  margin: '18px 0',
  textAlign: 'center' as const,
}
const codeText = {
  fontSize: '34px',
  lineHeight: '40px',
  fontWeight: 'bold',
  letterSpacing: '8px',
  color: '#18181b',
  margin: 0,
  fontFamily: FONT,
}
const hr = { borderColor: '#e4e4e7', margin: '22px 0 14px' }
const footer = { fontSize: '12px', lineHeight: '18px', color: '#71717a', margin: 0, fontFamily: FONT }
