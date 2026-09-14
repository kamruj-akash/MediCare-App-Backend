import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { z } from "zod";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";

export const dataValidationZod = (zodSchema: z.ZodObject) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const payload = req.body ?? {};
    // console.log("data in ZOD is", payload);
    const result = zodSchema.safeParse(payload);
    if (!result.success) {
      console.log(result.error);
      console.log(result.error.issues);
      throw new AppError(httpStatus.BAD_REQUEST, result.error.message);
    }
    req.body = result.data;
    next();
  });
};
