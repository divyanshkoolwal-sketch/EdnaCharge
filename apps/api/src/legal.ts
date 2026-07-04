/** @file apps/api/src/legal.ts. */
import type { FastifyInstance } from 'fastify';
import { LEGAL_DOCS, LEGAL_SUPPORT_EMAIL, LEGAL_UPDATED, type LegalDoc } from '@edna/schemas';

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function legalBody(doc: LegalDoc): string {
  const blocks = doc.blocks
    .map((block) => {
      const heading = block.heading ? `<h2>${escapeHtml(block.heading)}</h2>` : '';
      const body = block.body ? `<p>${escapeHtml(block.body)}</p>` : '';
      const bullets = block.bullets?.length
        ? `<ul>${block.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`
        : '';
      return `${heading}${body}${bullets}`;
    })
    .join('');
  return `<h1>${escapeHtml(doc.title)}</h1><div class="meta">Last updated: ${LEGAL_UPDATED}</div><p>${escapeHtml(doc.intro)}</p>${blocks}`;
}

function page(title: string, bodyHtml: string): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${escapeHtml(title)} - EdnaCharge</title>` +
    `<style>:root{color-scheme:light}body{font-family:-apple-system,BlinkMacSystemFont,system-ui,"Segoe UI",Roboto,sans-serif;` +
    `max-width:760px;margin:0 auto;padding:32px 20px 64px;color:#1a1a1f;line-height:1.6}` +
    `h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 8px}` +
    `.meta{color:#6b7280;font-size:14px;margin-bottom:24px}p,li{font-size:15px}a{color:#2563eb}` +
    `footer{margin-top:40px;color:#6b7280;font-size:13px;border-top:1px solid #e5e7eb;padding-top:16px}</style>` +
    `</head><body>${bodyHtml}` +
    `<footer>EdnaCharge &middot; Last updated ${LEGAL_UPDATED} &middot; <a href="/privacy">Privacy</a> &middot; <a href="/terms">Terms</a> &middot; <a href="/delete-account">Delete account</a></footer>` +
    `</body></html>`
  );
}

const DELETE_ACCOUNT = page(
  'Delete Account',
  `<h1>Delete Account</h1><div class="meta">Last updated: ${LEGAL_UPDATED}</div>
<p>You can permanently delete your EdnaCharge account and associated account data in the app or request deletion from the web if you no longer have access to the app.</p>

<h2>Delete in the app</h2>
<p>Open EdnaCharge, go to Settings, then choose Delete account. The app will ask you to confirm before deleting your profile, listings, bookings, chat history, and account record. Active payment authorizations are canceled where possible.</p>

<h2>Request deletion from the web</h2>
<p>If you cannot access the app, email <a href="mailto:${LEGAL_SUPPORT_EMAIL}?subject=EdnaCharge%20account%20deletion%20request">${LEGAL_SUPPORT_EMAIL}</a> from the email address on your EdnaCharge account and include "account deletion request" in the subject. We may ask for information needed to verify that you own the account before deleting it.</p>

<h2>Data we may retain</h2>
<p>We may retain limited records where required for legal, tax, accounting, fraud-prevention, chargeback, dispute, safety, or security obligations. Any retained records are kept only for those purposes.</p>

<h2>Questions</h2>
<p>For questions about deletion or data access, email <a href="mailto:${LEGAL_SUPPORT_EMAIL}">${LEGAL_SUPPORT_EMAIL}</a>.</p>`,
);

export function registerLegalPages(app: FastifyInstance): void {
  app.get('/privacy', async (_req, reply) =>
    reply.type('text/html').send(page(LEGAL_DOCS.privacy.title, legalBody(LEGAL_DOCS.privacy))),
  );
  app.get('/terms', async (_req, reply) =>
    reply.type('text/html').send(page(LEGAL_DOCS.terms.title, legalBody(LEGAL_DOCS.terms))),
  );
  app.get('/delete-account', async (_req, reply) =>
    reply.type('text/html').send(DELETE_ACCOUNT),
  );
}
