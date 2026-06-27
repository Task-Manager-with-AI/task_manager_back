import { sendSupportContactEmail } from "../../shared/email.service";
import type { ContactDto } from "./support.schema";

export async function sendContactEmail(
  fromName: string,
  fromEmail: string,
  dto: ContactDto
) {
  await sendSupportContactEmail({
    fromName,
    fromEmail,
    subject: dto.subject,
    message: dto.message,
    category: dto.category,
  });
}
