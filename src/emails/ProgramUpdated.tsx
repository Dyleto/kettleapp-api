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

interface ProgramUpdatedEmailProps {
  clientFirstName: string;
  coachFirstName: string;
  coachLastName: string;
  sessionCount: number;
  isNew: boolean; // true = nouvelle séance ajoutée, false = modification
}

export const ProgramUpdatedEmail = ({
  clientFirstName,
  coachFirstName,
  coachLastName,
  sessionCount,
  isNew,
}: ProgramUpdatedEmailProps) => {
  const subject = isNew
    ? 'Une nouvelle séance a été ajoutée à ton programme'
    : 'Ton programme a été mis à jour';

  return (
    <Html>
      <Head />
      <Preview>{subject}</Preview>
      <Body style={body}>
        <Container style={container}>
          <Text style={brand}>🏋️ Kettle</Text>

          <Heading style={heading}>{subject}</Heading>

          <Text style={paragraph}>Bonjour {clientFirstName},</Text>
          <Text style={paragraph}>
            Ton coach{' '}
            <strong>
              {coachFirstName} {coachLastName}
            </strong>{' '}
            {isNew
              ? 'a ajouté une nouvelle séance à ton programme.'
              : 'a modifié ton programme.'}
          </Text>

          <Section style={infoBox}>
            <Text style={infoText}>
              🗓 {sessionCount} séance{sessionCount > 1 ? 's' : ''} au programme
            </Text>
          </Section>

          <Text style={paragraph}>
            Connecte-toi pour découvrir les changements et préparer ta prochaine
            séance.
          </Text>

          <Section style={btnSection}>
            <Button style={button} href="https://kettleapp.fr">
              Voir mon programme
            </Button>
          </Section>

          <Hr style={hr} />
          <Text style={footer}>Kettle — Application de coaching sportif</Text>
        </Container>
      </Body>
    </Html>
  );
};

export default ProgramUpdatedEmail;

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

const infoBox: React.CSSProperties = {
  backgroundColor: '#1a1a1a',
  borderRadius: '8px',
  padding: '16px',
  margin: '24px 0',
  borderLeft: '3px solid #fbbf24',
};

const infoText: React.CSSProperties = {
  fontSize: '14px',
  color: '#d1d5db',
  margin: 0,
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
