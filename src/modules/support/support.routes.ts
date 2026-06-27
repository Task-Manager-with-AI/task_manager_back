import { Router } from "express";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { contactController } from "./support.controller";

export const supportRouter = Router();

supportRouter.use(authMiddleware);

supportRouter.post("/support/contact", contactController);
