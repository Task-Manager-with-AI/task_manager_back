import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must be at most 72 characters"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

export const verifyEmailSchema = z.object({
  email: z.string().email("Invalid email"),
  code: z.string().length(6, "Verification code must be 6 digits"),
});

export const resendVerificationSchema = z.object({
  email: z.string().email("Invalid email"),
});

export const googleAuthSchema = z.object({
  credential: z.string().min(1, "Google credential is required"),
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;
export type ResendVerificationDto = z.infer<typeof resendVerificationSchema>;
export type GoogleAuthDto = z.infer<typeof googleAuthSchema>;
