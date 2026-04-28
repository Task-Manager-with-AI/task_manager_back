import cors from "cors";
import { env } from "./env";

export const corsOptions = cors({
  origin: env.FRONTEND_URL,
  credentials: true,
});
