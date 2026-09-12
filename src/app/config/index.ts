import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
  node_env: process.env.NODE_ENV,
  port: process.env.PORT,
  database_url: process.env.DATABASE_URL,
  backend_url: process.env.BACKEND_URL,
  frontend_url: process.env.FRONTEND_URL,
  bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS as string,

  // jwt
  jwt_access_secret: process.env.JWT_ACCESS_SECRET as string,
  jwt_refresh_secret: process.env.JWT_REFRESH_SECRET as string,
  jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN as string,
  jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN as string,

  // google auth
  gClient_id: process.env.GOOGLE_CLIENT_ID as string,
  gClient_secret: process.env.GOOGLE_CLIENT_SECRET as string,
  gRedirect_url: process.env.GOOGLE_REDIRECT_URL as string,
  resend_api: process.env.RESEND_API as string,

  // redis
  redis_url: process.env.REDIS_URL,

  // cloudinary
  cloudinary_cloud_name: process.env.CLOUDINARY_NAME,
  cloudinary_api_key: process.env.CLOUDINARY_KEY,
  cloudinary_api_secret: process.env.CLOUDINARY_SECRET,

  // bKash
  bkash_url: process.env.BKASH_BASE_URL as string,
  bkash_user: process.env.BKASH_USERNAME as string,
  bkash_pass: process.env.BKASH_PASSWORD as string,
  bkash_app_key: process.env.BKASH_APP_KEY as string,
  bkash_app_secret: process.env.BKASH_APP_SECRET as string,
  bkash_callback_url: process.env.APP_BASE_URL,
};
