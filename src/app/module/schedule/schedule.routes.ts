import { Router } from "express";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";
import { scheduleController } from "./schedule.controller";

const router = Router();
router.post(
	"/create-schedule",
	auth(Role.DOCTOR),
	scheduleController.createSchedule,
);
router.get(
	"/my-schedules",
	auth(Role.DOCTOR),
	scheduleController.getMySchedule,
);
router.get(
	"/all-schedules",
	auth(Role.ADMIN),
	scheduleController.getAllSchedules,
);
router.get(
	"/schedule/:id",
	auth(Role.ADMIN),
	scheduleController.getScheduleById,
);
router.get(
	"/doctor/:doctorId/today",
	scheduleController.getScheduleByDoctorId,
);
router.patch(
	"/schedule/:id",
	auth(Role.DOCTOR),
	scheduleController.updateSchedule,
);
router.patch(
	"/publish-schedule/:id",
	auth(Role.DOCTOR),
	scheduleController.publishSchedule,
);
router.delete(
	"/delete-schedule/:id",
	auth(Role.DOCTOR),
	scheduleController.deleteSchedule,
);

export const ScheduleRoutes = router;
