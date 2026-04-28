import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
});

export const addMemberSchema = z.object({
  userId: z.string().uuid("userId must be a valid UUID"),
  memberRole: z.enum(["ADMIN", "MEMBER", "GUEST"]).default("MEMBER"),
});

export type CreateProjectDto = z.infer<typeof createProjectSchema>;
export type UpdateProjectDto = z.infer<typeof updateProjectSchema>;
export type AddMemberDto = z.infer<typeof addMemberSchema>;
