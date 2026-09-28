import { RequestUser } from "../../middleware/checkAuth";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { doctorService } from "./doctor.service";

const applyDoctor = catchAsync(async (req, res) => {
	const payload = req.body;
	await doctorService.applyDoctor(payload);
	sendResponse(res, {
		statusCode: 200,
		success: true,
		message: "Apply Success, Please check your email for OTP",
		data: null,
	});
});

const verifyDoctor = catchAsync(async (req, res) => {
	const files = req.files as Record<string, Express.Multer.File[]>;

	const resume = files?.resume?.[0];
	const additionalFiles = files?.additionalFiles?.map((file: any) => file);
	const payload = req.body.body;

	const data = await doctorService.verifyDoctor(
		JSON.parse(payload),
		resume,
		additionalFiles,
	);
	sendResponse(res, {
		statusCode: 201,
		success: true,
		message: "Verify Success, You can now login as a doctor",
		data,
	});
});

const approveDoctor = catchAsync(async (req, res) => {
	const reviewer = req.user;
	const payload = req.body;
	await doctorService.approveDoctor(payload, reviewer as RequestUser);
	sendResponse(res, {
		statusCode: 200,
		success: true,
		message: "Doctor verification status updated successfully",
		data: null,
	});
});

const getAllDoctors = catchAsync(async (req, res) => {
	const query = req.query;
	const data = await doctorService.getAllDoctors(query);
	sendResponse(res, {
		statusCode: 200,
		success: true,
		message: "Doctors fetched successfully",
		data,
	});
});

export const DoctorController = {
	verifyDoctor,
	applyDoctor,
	approveDoctor,
	getAllDoctors,
};
