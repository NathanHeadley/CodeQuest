import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  db: {
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER || "codequest",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "codequest",
  },
  jwt: {
    publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH || "./keys/jwt_public.pem",
    issuer: process.env.JWT_ISSUER || "joltcomputing.com",
    audience: process.env.JWT_AUDIENCE || "codequest",
  },
  validatorUrl: process.env.VALIDATOR_URL || "http://127.0.0.1:5001",
};
