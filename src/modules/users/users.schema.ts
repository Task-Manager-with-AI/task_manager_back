import { z } from "zod";

export const updateUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").optional(),
});

export type UpdateUserDto = z.infer<typeof updateUserSchema>;
