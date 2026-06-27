import { env } from "../config/env";

interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

/**
 * Envía correo a través de la API HTTP de Resend.
 * Usa HTTPS (puerto 443), que los hosts cloud como Render no bloquean
 * (a diferencia de SMTP, que puede hacer timeout en 25/465/587 o ser filtrado).
 */
async function sendEmail({ to, subject, html, replyTo }: SendEmailInput): Promise<void> {
  const body: Record<string, unknown> = {
    from: env.SMTP_FROM,
    to,
    subject,
    html,
  };
  if (replyTo) body.reply_to = replyTo;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend API error ${res.status}: ${detail}`);
  }
}

export async function sendProjectInviteEmail(
  to: string,
  projectName: string,
  inviteUrl: string,
  inviterName: string
): Promise<void> {
  await sendEmail({
    to,
    subject: `Invitación al proyecto "${projectName}" — Task Manager`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a1a1a">Te invitaron a un proyecto</h2>
        <p><strong>${inviterName}</strong> te ha invitado a unirte al proyecto
           <strong>${projectName}</strong> en Task Manager.</p>
        <div style="margin:24px 0">
          <a href="${inviteUrl}"
             style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;
                    border-radius:6px;text-decoration:none;font-weight:600">
            Unirme al proyecto
          </a>
        </div>
        <p style="color:#6b7280;font-size:.875rem">
          Este link expira en 7 días y solo puede usarse una vez.<br>
          Si no esperabas esta invitación, puedes ignorar este mensaje.
        </p>
      </div>
    `,
  });
}

export async function sendSupportContactEmail(params: {
  fromName: string;
  fromEmail: string;
  subject: string;
  message: string;
  category: string;
}): Promise<void> {
  await sendEmail({
    to: env.SMTP_USER ?? "fsociety.soporte@gmail.com",
    replyTo: params.fromEmail,
    subject: `[Soporte][${params.category}] ${params.subject}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2>Mensaje de contacto — Task Manager</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
          <tr><td style="padding:4px 8px"><strong>De:</strong></td><td>${params.fromName} (${params.fromEmail})</td></tr>
          <tr><td style="padding:4px 8px"><strong>Categoría:</strong></td><td>${params.category}</td></tr>
          <tr><td style="padding:4px 8px"><strong>Asunto:</strong></td><td>${params.subject}</td></tr>
        </table>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
        <p style="white-space:pre-wrap;color:#374151">${params.message}</p>
      </div>
    `,
  });
}

export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Verifica tu correo electrónico — Task Manager",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#1a1a1a">Verifica tu correo</h2>
        <p>Usa el siguiente código para verificar tu cuenta. Expira en <strong>10 minutos</strong>.</p>
        <div style="font-size:2rem;font-weight:700;letter-spacing:.5rem;text-align:center;
                    padding:24px;background:#f4f4f5;border-radius:8px;margin:24px 0">
          ${code}
        </div>
        <p style="color:#6b7280;font-size:.875rem">
          Si no creaste una cuenta en Task Manager, ignora este mensaje.
        </p>
      </div>
    `,
  });
}
