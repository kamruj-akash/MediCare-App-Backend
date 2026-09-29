import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { upload } from "../../lib/multer";
import { auth } from "../../middleware/checkAuth";
import { DoctorController } from "./doctor.controller";

const router = Router();
router.post("/apply", DoctorController.applyDoctor);
router.post(
	"/approve",
	auth(Role.ADMIN, Role.SUPER_ADMIN),
	DoctorController.approveDoctor,
);
router.post(
	"/verify",
	upload.fields([
		{
			name: "resume",
			maxCount: 1,
		},
		{
			name: "additionalFiles",
			maxCount: 5,
		},
	]),
	DoctorController.verifyDoctor,
);
router.get("/all-doctors", DoctorController.getAllDoctors);

export const DoctorRoutes = router;
