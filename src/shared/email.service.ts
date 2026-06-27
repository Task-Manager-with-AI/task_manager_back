import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false, // STARTTLS on port 587
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export async function sendProjectInviteEmail(
  to: string,
  projectName: string,
  inviteUrl: string,
  inviterName: string
): Promise<void> {
  await transporter.sendMail({
    from: env.SMTP_FROM,
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
  await transporter.sendMail({
    from: env.SMTP_FROM,
    to: env.SMTP_USER,
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
  await transporter.sendMail({
    from: env.SMTP_FROM,
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
