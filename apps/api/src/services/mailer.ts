import nodemailer from "nodemailer";
import { config } from "../config.js";

const hasSmtp = Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS);

export async function sendEmail(to: string, subject: string, text: string) {
  if (!hasSmtp) {
    console.info(`[mail:dev] to=${to} subject=${subject}\n${text}`);
    return true;
  }

  const transport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_PORT === 465 || config.SMTP_PORT === 994,
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS
    }
  });

  try {
    await transport.sendMail({
      from: config.SMTP_FROM,
      to,
      subject,
      text
    });
    return true;
  } catch (error) {
    console.warn(`[mail:failed] to=${to} subject=${subject} error=${error instanceof Error ? error.message : String(error)}\n${text}`);
    return false;
  }
}

export async function sendVerificationEmail(email: string, token: string) {
  const url = `${config.API_PUBLIC_URL}/auth/verify-email?token=${encodeURIComponent(token)}`;
  return sendEmail(email, "验证 todoDesk 邮箱", `请打开以下链接完成邮箱验证：\n\n${url}`);
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const url = `${config.APP_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
  return sendEmail(email, "重置 todoDesk 密码", `请打开以下链接重置密码：\n\n${url}`);
}
