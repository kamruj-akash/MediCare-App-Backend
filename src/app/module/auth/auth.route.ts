import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { dataValidationZod } from "../../middleware/validation";
import { AuthController } from "./auth.controller";
import {
	// GLoginZod,
	LoginPatientZod,
	RegisterPatientZod,
} from "./auth.validation";

const router = Router();

router.post(
	"/register",
	dataValidationZod(RegisterPatientZod),
	AuthController.registerPatient,
);
router.post(
	"/login",
	dataValidationZod(LoginPatientZod),
	AuthController.loginUser,
);
router.get(
	"/me",
	auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
	AuthController.getMe,
);
router.post("/refresh-token", AuthController.refreshToken);

router.post(
	"/google",
	// dataValidationZod(GLoginZod),
	AuthController.googleLogin,
);

router.post("/verify-email", AuthController.verifyEmail);
router.post("/forget-password", AuthController.forgetPassword);
router.post("/reset-password", AuthController.resetPassword);
router.post("/logout", AuthController.logout);

export const AuthRoutes = router;
