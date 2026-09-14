import bcrypt from "bcryptjs";
import crypto from "crypto";
import { TokenPayload } from "google-auth-library";
import { JwtPayload, SignOptions } from "jsonwebtoken";
import {
	AuthProvider,
	Role,
	UserStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { googleClient } from "../../lib/googleClient";
import { prisma } from "../../lib/prisma";
import { redisClient } from "../../lib/redis";
import {
	sendPasswordResetConfirmationEmail,
	sendPasswordResetOtp,
	sendRegistrationOtp,
	sendWelcomeEmail,
} from "../../lib/resend";
import { AppError } from "../../utils/appError";
import { jwtUtils } from "../../utils/jwt";
import {
	IForgetPassword,
	IGLogin,
	ILoginUserPayload,
	IRegisterPatientPayload,
	IRequestUser,
	IResetPassword,
} from "./auth.interface";

const registerPatient = async (payload: IRegisterPatientPayload) => {
	const { name, password } = payload;
	const email = payload.email.trim().toLowerCase();

	const isUserExists = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExists) {
		throw new AppError(409, "User with this email already exists");
	}

	const newUserData = {
		name,
		password: await bcrypt.hash(password, 8),
		email,
		role: Role.PATIENT,
	};

	const otp = crypto.randomInt(100000, 999999).toString();
	const otpKey = `UserRegistration-OTP:${email}`;
	const userKey = `UserRegistration:${email}`;

	await Promise.all([
		redisClient.set(otpKey, otp, {
			expiration: { type: "EX", value: 60 * 10 },
		}),
		redisClient.set(userKey, JSON.stringify(newUserData), {
			expiration: { type: "EX", value: 60 * 10 },
		}),
	]);

	await sendRegistrationOtp(email, otp);

	return;
};

const verifyEmail = async (payload: { email: string; otp: string }) => {
	const { email, otp } = payload;
	const otpKey = `UserRegistration-OTP:${email}`;
	const userKey = `UserRegistration:${email}`;
	const redisOtp = await redisClient.get(otpKey);
	const userData = await redisClient.get(userKey);
	if (!userData || !redisOtp) {
		throw new AppError(400, "User data not found, please register again!");
	}
	if (redisOtp !== otp) {
		throw new AppError(400, "Invalid OTP");
	}
	const { name, password } = JSON.parse(userData);

	const user = await prisma.user.create({
		data: {
			name,
			email,
			role: Role.PATIENT,
			password,
			status: UserStatus.ACTIVE,
			emailVerified: true,
			patient: {
				create: { name, email },
			},
		},
		omit: { password: true },
		include: { patient: true },
	});

	await sendWelcomeEmail(user.email, user.name);

	await redisClient.del([otpKey, userKey]);

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return { accessToken, refreshToken };
};

const loginUser = async (payload: ILoginUserPayload) => {
	const { password } = payload;
	console.log(payload);
	const email = payload.email.trim().toLowerCase();

	const user = await prisma.user.findUnique({
		where: { email },
	});

	if (!user) {
		throw new AppError(404, "User not found");
	}

	if (user.status === UserStatus.BLOCKED) {
		throw new AppError(400, "User is blocked");
	}

	if (user.isDeleted || user.status === UserStatus.DELETED) {
		throw new AppError(400, "User is deleted");
	}

	if (user.password === null && user.googleId !== null) {
		throw new AppError(400, "Please login with google, set password!");
	}

	const isPasswordMatched = await bcrypt.compare(
		password,
		user.password as string,
	);

	if (!isPasswordMatched) {
		throw new AppError(400, "Invalid credentials");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

const getMe = async (user: IRequestUser) => {
	const isUserExists = await prisma.user.findUnique({
		where: {
			id: user.userId,
		},
		include: {
			patient: true,
		},
		omit: {
			password: true,
		},
	});

	if (!isUserExists) {
		throw new AppError(404, "User not found");
	}

	return isUserExists;
};

const refreshToken = async (token: string) => {
	const verifiedRefreshToken = jwtUtils.verifyToken(
		token,
		config.jwt_refresh_secret,
	);

	if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
		throw new AppError(400, "Invalid refresh token");
	}

	const data = verifiedRefreshToken.data as JwtPayload;

	const user = await prisma.user.findUnique({
		where: { id: data.userId },
	});

	if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
		throw new AppError(400, "User is inactive or not found");
	}

	const jwtPayload = {
		userId: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return {
		accessToken,
		refreshToken,
	};
};

const googleLogin = async (payload: IGLogin) => {
	let googleIdTokenPayload: TokenPayload | undefined;
	try {
		const ticket = await googleClient.verifyIdToken({
			idToken: payload.idToken,
			audience: config.gClient_id,
		});
		googleIdTokenPayload = ticket.getPayload();
	} catch (error: any) {
		throw new AppError(
			400,
			error.message || "Invalid or expired Google Id Token!",
		);
	}

	if (!googleIdTokenPayload?.email || !googleIdTokenPayload.email_verified) {
		throw new AppError(400, "Google account email is missing or not verified!");
	}

	const { name, email, sub: googleId } = googleIdTokenPayload;

	let patient = await prisma.user.findFirst({
		where: { email, role: Role.PATIENT },
	});

	if (!patient) {
		patient = await prisma.user.create({
			data: {
				name: name ?? email.split("@")[0],
				email,
				googleId,
				role: Role.PATIENT,
				authProvider: AuthProvider.GOOGLE,
				emailVerified: true,
				patient: {
					create: {
						name: name ?? email.split("@")[0],
						email: email,
					},
				},
			},
		});
	}

	const jwtPayload = {
		userId: patient.id,
		name: patient.name,
		email: patient.email,
		role: patient.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return { accessToken, refreshToken };
};

export const forgetPassword = async (payload: IForgetPassword) => {
	const { email } = payload;
	const isUserExists = await prisma.user.findUniqueOrThrow({
		where: {
			email,
			status: UserStatus.ACTIVE,
		},
	});

	if (!isUserExists) {
		throw new AppError(404, "User is not exist or Blocked!");
	}

	if (
		isUserExists.authProvider !== AuthProvider.CREDENTIAL &&
		!isUserExists.password
	) {
		throw new AppError(400, "Please Login with Google!");
	}

	const otp = crypto.randomInt(100000, 999999).toString();
	const otpKey = `ForgetPassword-OTP:${email}`;

	await redisClient.set(otpKey, otp, {
		expiration: {
			type: "EX",
			value: 60 * 5,
		},
	});

	await sendPasswordResetOtp(isUserExists.name, email, otp);
};

export const resetPassword = async (payload: IResetPassword) => {
	const { email, newPassword, otp } = payload;
	const otpKey = `ForgetPassword-OTP:${email}`;
	const redisOtp = await redisClient.get(otpKey);
	if (!redisOtp) {
		throw new AppError(400, "OTP is expired or invalid!");
	}

	if (redisOtp !== otp) {
		throw new AppError(400, "Otp is incorrect!");
	}

	const hashedPassword = await bcrypt.hash(
		newPassword,
		Number(config.bcrypt_salt_rounds),
	);

	const updatedUser = await prisma.user.update({
		where: {
			email,
		},
		data: {
			password: hashedPassword,
		},
	});

	await redisClient.del([otpKey]);

	await sendPasswordResetConfirmationEmail(updatedUser.name, updatedUser.email);

	return;
};

export const AuthService = {
	registerPatient,
	loginUser,
	getMe,
	refreshToken,
	googleLogin,
	forgetPassword,
	resetPassword,
	verifyEmail,
};
