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
} from '@react-email/components';
import * as React from 'react';

interface ClientJoinedEmailProps {
  coachFirstName: string;
  clientFirstName: string;
  clientLastName: string;
  clientEmail: string;
}

export const ClientJoinedEmail = ({
  coachFirstName,
  clientFirstName,
  clientLastName,
  clientEmail,
}: ClientJoinedEmailProps) => (
  <Html>
    <Head />
    <Preview>
      {clientFirstName} {clientLastName} a rejoint votre espace coach
    </Preview>
    <Body style={body}>
      <Container style={container}>
        {/* Logo / titre app */}
        <Text style={brand}>🏋️ Kettle</Text>

        <Heading style={heading}>Nouveau client inscrit</Heading>

        <Text style={paragraph}>Bonjour {coachFirstName},</Text>
        <Text style={paragraph}>
          <strong>
            {clientFirstName} {clientLastName}
          </strong>{' '}
          ({clientEmail}) vient de rejoindre votre espace coach via votre lien
          d'invitation.
        </Text>
        <Text style={paragraph}>
          Vous pouvez maintenant lui créer ou lui assigner un programme depuis
          votre tableau de bord.
        </Text>

        <Section style={btnSection}>
          <Button style={button} href="https://kettleapp.fr/coach">
            Voir mes clients
          </Button>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>Kettle — Application de coaching sportif</Text>
      </Container>
    </Body>
  </Html>
);

export default ClientJoinedEmail;

// ─── Styles ───────────────────────────────────────────────────────────────────

const body: React.CSSProperties = {
  backgroundColor: '#0f0f0f',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const container: React.CSSProperties = {
  margin: '0 auto',
  padding: '40px 24px',
  maxWidth: '560px',
};

const brand: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 'bold',
  color: '#fbbf24',
  marginBottom: '32px',
};

const heading: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: 'bold',
  color: '#ffffff',
  margin: '0 0 24px',
};

const paragraph: React.CSSProperties = {
  fontSize: '15px',
  lineHeight: '1.6',
  color: '#9ca3af',
  margin: '0 0 16px',
};

const btnSection: React.CSSProperties = {
  margin: '32px 0',
};

const button: React.CSSProperties = {
  backgroundColor: '#fbbf24',
  color: '#0f0f0f',
  fontWeight: 'bold',
  fontSize: '14px',
  padding: '12px 24px',
  borderRadius: '8px',
  textDecoration: 'none',
  display: 'inline-block',
};

const hr: React.CSSProperties = {
  borderColor: '#1f1f1f',
  margin: '32px 0 24px',
};

const footer: React.CSSProperties = {
  fontSize: '12px',
  color: '#4b5563',
  margin: 0,
};
