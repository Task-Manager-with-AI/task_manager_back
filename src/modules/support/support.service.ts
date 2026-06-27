import { sendSupportContactEmail } from "../../shared/email.service";
import type { ContactDto } from "./support.schema";

export async function sendContactEmail(
  fromName: string,
  fromEmail: string,
  dto: ContactDto
) {
  try {
    await sendSupportContactEmail({
      fromName,
      fromEmail,
      subject: dto.subject,
      message: dto.message,
      category: dto.category,
    });
  } catch (err) {
    // [DEMO] El envío por Resend puede fallar (p.ej. dominio de envío sin
    // verificar). No dejamos que tire el endpoint de soporte: se loguea y
    // se continúa para no colgar la demo.
    console.error("Failed to send support contact email:", err);
  }
}
