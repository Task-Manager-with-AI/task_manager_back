import { Request, Response, NextFunction } from "express";
import { sendSuccess } from "../../shared/utils/response";
import { contactSchema } from "./support.schema";
import { sendContactEmail } from "./support.service";
import { prisma } from "../../prisma/client";

export async function contactController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const dto = contactSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { name: true, email: true },
    });

    await sendContactEmail(
      user?.name ?? "Usuario",
      user?.email ?? req.user!.email,
      dto
    );

    sendSuccess(res, null, "Mensaje enviado al soporte");
  } catch (err) {
    next(err);
  }
}
