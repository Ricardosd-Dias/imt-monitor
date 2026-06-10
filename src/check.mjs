import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const URL_TO_CHECK = 'https://www.imt-ip.pt/';
const HASH_FILE = 'last-hash.txt';

const KEYWORDS = [
  'formulário',
  'candidatura',
  '110-a/2026',
  'adblue',
  'combustível',
  'inscrição',
  'disponível',
  'disponibilizado',
  'submissão',
  'mercadorias',
  'registo',
  '2026',
];

const TO_EMAILS = ['ricardosd.dias@gmail.com'];
const FROM_EMAIL = 'onboarding@resend.dev';

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

async function readPreviousHash() {
  try {
    const content = await readFile(HASH_FILE, 'utf-8');
    return content.trim();
  } catch {
    return null;
  }
}

async function sendEmail(foundKeywords, excerpt) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }

  const subject = '🚨 IMT – Formulário de candidatura pode estar disponível!';
  const html = `
    <h2>Foi detectada uma alteração na página da IMT</h2>
    <p><strong>URL:</strong> <a href="${URL_TO_CHECK}">${URL_TO_CHECK}</a></p>
    <p><strong>Palavras-chave encontradas:</strong> ${foundKeywords.join(', ')}</p>
    <h3>Excerto da página:</h3>
    <pre style="white-space: pre-wrap; font-family: inherit;">${excerpt}</pre>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: TO_EMAILS,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Resend API error (${response.status}): ${errorText}`);
  }

  console.log('Email enviado com sucesso.');
}

async function main() {
  console.log(`A verificar ${URL_TO_CHECK}...`);

  const response = await fetch(URL_TO_CHECK, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8',
    },
  });
  if (!response.ok) {
    throw new Error(`Falha ao obter a página: HTTP ${response.status}`);
  }
  const html = await response.text();

  const currentHash = createHash('md5').update(html).digest('hex');
  const previousHash = await readPreviousHash();

  if (previousHash === null) {
    console.log('Primeira execução. A guardar hash inicial.');
    await writeFile(HASH_FILE, currentHash, 'utf-8');
    return;
  }

  if (currentHash === previousHash) {
    console.log('Sem alterações detectadas.');
    return;
  }

  console.log('Alteração detectada. A guardar novo hash.');
  await writeFile(HASH_FILE, currentHash, 'utf-8');

  const text = htmlToText(html);
  const lowerText = text.toLowerCase();

  const foundKeywords = KEYWORDS.filter((keyword) =>
    lowerText.includes(keyword.toLowerCase())
  );

  if (foundKeywords.length === 0) {
    console.log('Página alterada, mas sem palavras-chave relevantes.');
    return;
  }

  console.log(`Palavras-chave encontradas: ${foundKeywords.join(', ')}`);

  const excerpt = text.slice(0, 800);
  await sendEmail(foundKeywords, excerpt);
}

main().catch((error) => {
  console.error('Erro:', error);
  process.exit(1);
});
