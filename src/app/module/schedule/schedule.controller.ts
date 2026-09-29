import httpStatus from "http-status";
import { RequestUser } from "../../middleware/checkAuth";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { scheduleService } from "./schedule.service";

const createSchedule = catchAsync(async (req, res) => {
	const payload = req.body;
	const user = req.user as RequestUser;
	const schedule = await scheduleService.createSchedule(user, payload);
	sendResponse(res, {
		statusCode: 201,
		success: true,
		message: "Schedule created successfully",
		data: schedule,
	});
});
const updateSchedule = catchAsync(async (req, res) => {
	const schedule = await scheduleService.updateSchedule(
		req.params.id as string,
		req.user as RequestUser,
		req.body,
	);
	sendResponse(res, {
		statusCode: 201,
		success: true,
		message: "Schedule updated successfully",
		data: schedule,
	});
});
const getMySchedule = catchAsync(async (req, res) => {
	const schedule = await scheduleService.getMySchedule(
		req.query,
		req.user as RequestUser,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedule retrieved successfully",
		data: schedule,
	});
});
const getAllSchedules = catchAsync(async (req, res) => {
	const schedule = await scheduleService.getAllSchedules(req.query);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedule retrieved successfully",
		data: schedule,
	});
});
const getScheduleById = catchAsync(async (req, res) => {
	const schedule = await scheduleService.getScheduleById(
		req.params.id as string,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedule retrieved successfully",
		data: schedule,
	});
});
const deleteSchedule = catchAsync(async (req, res) => {
	const user = req.user as RequestUser;
	const schedule = await scheduleService.deleteSchedule(
		req.params.id as string,
		user,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedule deleted successfully",
		data: schedule,
	});
});
const getScheduleByDoctorId = catchAsync(async (req, res) => {
	const schedule = await scheduleService.getScheduleByDoctorId(
		req.params.doctorId as string,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctor's today schedule retrieved successfully",
		data: schedule,
	});
});
const publishSchedule = catchAsync(async (req, res) => {
	const user = req.user as RequestUser;
	const schedule = await scheduleService.publishSchedule(
		req.params.id as string,
		user,
	);
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Schedule published successfully",
		data: schedule,
	});
});

export const scheduleController = {
	createSchedule,
	getMySchedule,
	getAllSchedules,
	getScheduleById,
	getScheduleByDoctorId,
	updateSchedule,
	publishSchedule,
	deleteSchedule,
};
