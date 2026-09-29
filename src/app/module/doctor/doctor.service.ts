import bcrypt from "bcryptjs";
import { UploadApiResponse } from "cloudinary";
import crypto from "crypto";
import httpStatus from "http-status";
import {
	DoctorVerificationStatus,
	Role,
} from "../../../generated/prisma/enums";
import { DoctorWhereInput } from "../../../generated/prisma/models";
import config from "../../config";
import { IQuery } from "../../interface";
import cloudinary from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";
import { redisClient } from "../../lib/redis";
import {
	sendDoctorApprovalEmail,
	sendDoctorRejectionEmail,
	sendDoctorVerificationOtp,
} from "../../lib/resend";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/appError";
import {
	IApplyDoctor,
	IApproveDoctorPayload,
	IVerifyDoctor,
} from "./doctor.interface";

const applyDoctor = async (doctorData: IApplyDoctor) => {
	const { email, password, name } = doctorData;
	const findDoctor = await prisma.user.findUnique({
		where: { email, role: Role.DOCTOR },
	});

	if (findDoctor) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Doctor with this email already exists, Please login instead",
		);
	}
	const otp = crypto.randomInt(100000, 999999).toString();
	const otpKey = `DoctorRegistration-OTP:${email}`;
	const doctorKey = `doctorRegistration:${email}`;

	await redisClient.set(otpKey, otp, { EX: 60 * 60 });
	await redisClient.set(
		doctorKey,
		JSON.stringify({
			name,
			email,
			password: await bcrypt.hash(password, Number(config.bcrypt_salt_rounds)),
		}),
		{
			EX: 60 * 60,
		},
	);
	await sendDoctorVerificationOtp(email, otp);
	return;
};

const verifyDoctor = async (
	payload: IVerifyDoctor,
	resume: Express.Multer.File,
	additionalFiles: Express.Multer.File[],
) => {
	const {
		email,
		otp,
		specialization,
		licenseNumber,
		qualification,
		expYear,
		bio,
		consultationFee,
		contactNumber,
	} = payload;
	const otpKey = `DoctorRegistration-OTP:${email}`;
	const doctorKey = `doctorRegistration:${email}`;
	const redisOtp = await redisClient.get(otpKey);
	if (!redisOtp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP has expired or is invalid");
	}
	if (redisOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
	}
	const doctorData = await redisClient.get(doctorKey);
	if (!doctorData) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor data not found");
	}
	const { name, password } = JSON.parse(doctorData);

	const resumeUploadResult = await new Promise<UploadApiResponse>(
		(resolve, reject) => {
			cloudinary.uploader
				.upload_stream(
					{
						resource_type: "auto",
					},

					async (error, result) => {
						if (error) {
							return reject(error);
						}

						if (!result) {
							return reject(
								new AppError(
									httpStatus.INTERNAL_SERVER_ERROR,
									"No result returned from Cloudinary",
								),
							);
						}

						resolve(result);
					},
				)
				.end(resume?.buffer);
		},
	);

	const additionalFilesUploadResults = await Promise.all(
		additionalFiles.map((file) => {
			return new Promise<UploadApiResponse>((resolve, reject) => {
				cloudinary.uploader
					.upload_stream(
						{
							resource_type: "auto",
						},

						async (error, result) => {
							if (error) {
								return reject(error);
							}

							if (!result) {
								return reject(
									new AppError(
										httpStatus.INTERNAL_SERVER_ERROR,
										"No result returned from Cloudinary",
									),
								);
							}
							resolve(result);
						},
					)
					.end(file.buffer);
			});
		}),
	);

	const transaction = await prisma.$transaction(async (tx) => {
		const newDoctor = await tx.user.create({
			data: {
				name,
				email,
				password: await bcrypt.hash(
					password,
					Number(config.bcrypt_salt_rounds),
				),
				role: Role.DOCTOR,
				emailVerified: true,
				doctor: {
					create: {
						name,
						email,
						specialization,
						licenseNumber,
						qualification,
						expYear,
						bio,
						consultationFee,
						contactNumber,
						verificationStatus: DoctorVerificationStatus.PENDING,
						resume: {
							resumeUrl: resumeUploadResult.secure_url,
							publicId: resumeUploadResult.public_id,
						},
						additionalFiles: additionalFilesUploadResults.map((file) => ({
							url: file.secure_url,
							publicId: file.public_id,
						})),
					},
				},
			},
			omit: {
				password: true,
			},
			include: {
				doctor: true,
			},
		});

		await redisClient.del(otpKey);
		await redisClient.del(doctorKey);
		return newDoctor;
	});
	return transaction;
};

const approveDoctor = async (
	payload: IApproveDoctorPayload,
	reviewer: RequestUser,
) => {
	const { doctorId, verificationStatus, rejectionReason } = payload;
	const existingDoctor = await prisma.doctor.findUnique({
		where: { id: doctorId },
		include: { user: true },
	});
	if (!existingDoctor) {
		throw new AppError(httpStatus.NOT_FOUND, "Doctor Application Not Found");
	}

	if (existingDoctor?.verificationStatus === DoctorVerificationStatus.APPROVE) {
		throw new AppError(httpStatus.BAD_REQUEST, "Doctor is already approved");
	}
	if (
		existingDoctor?.verificationStatus === DoctorVerificationStatus.REJECTED
	) {
		throw new AppError(httpStatus.BAD_REQUEST, "Doctor is rejected");
	}
	if (
		verificationStatus === DoctorVerificationStatus.REJECTED &&
		!rejectionReason
	) {
		throw new AppError(httpStatus.BAD_REQUEST, "Rejection reason is required");
	}

	await prisma.doctor.update({
		where: { id: doctorId },
		data: {
			verificationStatus: DoctorVerificationStatus[verificationStatus],
			rejectionReason: rejectionReason || null,
			reviewedBy: reviewer.userId,
			reviewedAt: new Date(),
		},
	});

	if (verificationStatus === DoctorVerificationStatus.APPROVE) {
		void sendDoctorApprovalEmail(
			existingDoctor.user.email,
			existingDoctor.user.name,
		).catch((error) => {
			console.error("Failed to send doctor approval email", error);
		});
	} else if (rejectionReason) {
		void sendDoctorRejectionEmail(
			existingDoctor.user.email,
			existingDoctor.user.name,
			rejectionReason,
		).catch((error) => {
			console.error("Failed to send doctor rejection email", error);
		});
	}
};

const getAllDoctors = async (query: IQuery) => {
	const searchTerm = query.searchTerm || "";
	const page = Number(query.page) || 1;
	const limit = Number(query.limit) || 10;
	const sortBy = query.sortBy || "createdAt";
	const sortOrder = query.sortOrder || "asc";

	const andConditions: DoctorWhereInput[] = [];

	if (query.searchTerm) {
		andConditions.push({
			OR: [
				{ name: { contains: searchTerm, mode: "insensitive" } },
				{ qualification: { contains: searchTerm, mode: "insensitive" } },
				{ specialization: { contains: searchTerm, mode: "insensitive" } },
			],
		});
	}
	// public route: only expose approved doctors, regardless of query
	andConditions.push({ verificationStatus: DoctorVerificationStatus.APPROVE });
	andConditions.push({ isDeleted: false });

	const doctors = await prisma.doctor.findMany({
		where: {
			AND: andConditions,
		},
		skip: (page - 1) * limit,
		take: limit,
		orderBy: {
			[sortBy]: sortOrder,
		},
		omit: {
			licenseNumber: true,
			rejectionReason: true,
			reviewedBy: true,
			reviewedAt: true,
			resume: true,
			additionalFiles: true,
		},
		include: {
			user: {
				omit: {
					password: true,
					googleId: true,
					phoneNo: true,
				},
			},
		},
	});

	const totalDoctors = await prisma.doctor.count({
		where: {
			AND: andConditions,
		},
	});

	return {
		data: doctors,
		meta: {
			total: totalDoctors,
			page,
			limit,
			totalPages: Math.ceil(totalDoctors / limit),
		},
	};
};

export const doctorService = {
	applyDoctor,
	verifyDoctor,
	approveDoctor,
	getAllDoctors,
};
