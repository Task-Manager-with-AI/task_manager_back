import { z } from "zod";

export const createInviteLinkSchema = z.object({
  memberRole: z.enum(["ADMIN", "MEMBER", "GUEST"]).default("MEMBER"),
});

export const sendInviteEmailSchema = z.object({
  email: z.string().email("Invalid email"),
  memberRole: z.enum(["ADMIN", "MEMBER", "GUEST"]).default("MEMBER"),
});

export type CreateInviteLinkDto = z.infer<typeof createInviteLinkSchema>;
export type SendInviteEmailDto = z.infer<typeof sendInviteEmailSchema>;
