import nodemailer from "nodemailer";
import { config } from "../config.js";

const hasSmtp = Boolean(config.SMTP_HOST && config.SMTP_USER && config.SMTP_PASS);

interface EmailMessage {
  text: string;
  html?: string;
}

export type VerificationEmailPurpose = "registration" | "email-change";

interface ActionEmailOptions {
  subject: string;
  headline: string;
  description: string;
  systemEndpoint: string;
  actionLabel: string;
  actionUrl: string;
  expiresLabel: string;
  expiresValue: string;
  kicker?: string;
  footer?: string;
}

function normalizeEmailMessage(message: string | EmailMessage): EmailMessage {
  return typeof message === "string" ? { text: message } : message;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function systemEndpointFromUrl(publicUrl: string) {
  try {
    const parsed = new URL(publicUrl);
    return parsed.port ? `${parsed.hostname}:${parsed.port}` : parsed.hostname;
  } catch {
    return publicUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

function buildVerificationUrl(token: string) {
  return `${config.API_PUBLIC_URL.replace(/\/+$/, "")}/auth/verify-email?token=${encodeURIComponent(token)}`;
}

function buildPasswordResetUrl(token: string) {
  return `${config.APP_ORIGIN.replace(/\/+$/, "")}/#/reset-password?token=${encodeURIComponent(token)}`;
}

function buildActionEmail(options: ActionEmailOptions) {
  const footer = options.footer ?? "如果不是你本人操作，可以忽略此邮件。";
  const escapedSubject = escapeHtml(options.subject);
  const escapedHeadline = escapeHtml(options.headline);
  const escapedDescription = escapeHtml(options.description);
  const escapedSystemEndpoint = escapeHtml(options.systemEndpoint);
  const escapedActionUrl = escapeHtml(options.actionUrl);
  const escapedActionLabel = escapeHtml(options.actionLabel);
  const escapedExpiresLabel = escapeHtml(options.expiresLabel);
  const escapedExpiresValue = escapeHtml(options.expiresValue);
  const escapedKicker = escapeHtml(options.kicker ?? "TODODESK INVITATION");
  const escapedFooter = escapeHtml(footer);

  const text = [
    options.subject,
    "",
    options.description,
    "",
    `系统 IP：${options.systemEndpoint}`,
    `${options.expiresLabel}：${options.expiresValue}`,
    "",
    `${options.actionLabel}：`,
    options.actionUrl,
    "",
    `如果按钮无法打开，请复制链接到浏览器。${footer}`
  ].join("\n");

  const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapedSubject}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef7f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18352f;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef7f3;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d6ebe2;border-radius:18px;overflow:hidden;box-shadow:0 18px 42px rgba(15,118,110,0.14);">
            <tr>
              <td style="background:#0f766e;padding:26px 32px;color:#ffffff;">
                <div style="font-size:13px;letter-spacing:2px;text-transform:uppercase;opacity:0.78;">${escapedKicker}</div>
                <h1 style="margin:10px 0 0;font-size:28px;line-height:1.25;font-weight:800;">${escapedHeadline}</h1>
                <p style="margin:10px 0 0;font-size:15px;line-height:1.7;color:#d9fff4;">小柴记待办与习惯管理系统</p>
              </td>
            </tr>
            <tr>
              <td style="padding:30px 32px 10px;">
                <p style="margin:0;font-size:16px;line-height:1.8;color:#24443e;">${escapedDescription}</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;border:1px solid #d9ece5;border-radius:14px;background:#f7fcfa;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <div style="font-size:12px;line-height:1.5;color:#5f7f77;">系统 IP</div>
                      <div style="margin-top:4px;font-size:18px;line-height:1.4;font-weight:700;color:#0f4f49;">${escapedSystemEndpoint}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="border-top:1px solid #d9ece5;padding:16px 18px;">
                      <div style="font-size:12px;line-height:1.5;color:#5f7f77;">${escapedExpiresLabel}</div>
                      <div style="margin-top:4px;font-size:16px;line-height:1.4;font-weight:700;color:#0f4f49;">${escapedExpiresValue}</div>
                    </td>
                  </tr>
                </table>
                <div style="text-align:center;margin:28px 0 24px;">
                  <a href="${escapedActionUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:10px;padding:14px 26px;font-size:16px;line-height:1.2;font-weight:800;">${escapedActionLabel}</a>
                </div>
                <p style="margin:0 0 12px;font-size:13px;line-height:1.7;color:#66847c;">如果按钮无法打开，请复制以下链接到浏览器：</p>
                <p style="margin:0;word-break:break-all;font-size:13px;line-height:1.7;color:#0f766e;">${escapedActionUrl}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 30px;">
                <p style="margin:0;border-top:1px solid #e5f1ed;padding-top:18px;font-size:12px;line-height:1.7;color:#7d9690;">${escapedFooter}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    text,
    html
  };
}

export function buildVerificationEmail(token: string, purpose: VerificationEmailPurpose = "registration") {
  const verificationUrl = buildVerificationUrl(token);
  const systemEndpoint = systemEndpointFromUrl(config.API_PUBLIC_URL);
  const subject = purpose === "registration" ? "小柴记用户注册邀请函" : "小柴记邮箱验证邀请函";
  const headline = purpose === "registration" ? "用户注册邀请函" : "邮箱验证邀请函";
  const description = purpose === "registration"
    ? "你正在创建小柴记账号。请接受邀请，完成邮箱验证后即可登录系统。"
    : "你正在更新小柴记账号邮箱。请接受邀请，完成新邮箱验证。";
  const content = buildActionEmail({
    subject,
    headline,
    description,
    systemEndpoint,
    actionLabel: "接受邀请",
    actionUrl: verificationUrl,
    expiresLabel: "邀请有效期",
    expiresValue: "24 小时",
    footer: "若非本人操作，可忽略此邮件。"
  });

  return {
    subject,
    text: content.text,
    html: content.html,
    verificationUrl,
    systemEndpoint
  };
}

export function buildPasswordResetEmail(token: string) {
  const resetUrl = buildPasswordResetUrl(token);
  const systemEndpoint = systemEndpointFromUrl(config.APP_ORIGIN);
  const subject = "小柴记密码重置邀请函";
  const content = buildActionEmail({
    subject,
    headline: "密码重置邀请函",
    description: "你正在重置小柴记账号密码。请点击按钮进入重置页面，设置新的登录密码。",
    systemEndpoint,
    actionLabel: "重置密码",
    actionUrl: resetUrl,
    expiresLabel: "链接有效期",
    expiresValue: "1 小时",
    kicker: "TODODESK SECURITY",
    footer: "若非本人操作，可忽略此邮件，当前密码不会被修改。"
  });

  return {
    subject,
    text: content.text,
    html: content.html,
    resetUrl,
    systemEndpoint
  };
}

export async function sendEmail(to: string, subject: string, message: string | EmailMessage) {
  const content = normalizeEmailMessage(message);
  if (!hasSmtp) {
    console.info(`[mail:dev] to=${to} subject=${subject}\n${content.text}${content.html ? `\n\n[html]\n${content.html}` : ""}`);
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
      text: content.text,
      html: content.html
    });
    return true;
  } catch (error) {
    console.warn(`[mail:failed] to=${to} subject=${subject} error=${error instanceof Error ? error.message : String(error)}\n${content.text}`);
    return false;
  }
}

export async function sendVerificationEmail(email: string, token: string, purpose: VerificationEmailPurpose = "registration") {
  const invitation = buildVerificationEmail(token, purpose);
  return sendEmail(email, invitation.subject, {
    text: invitation.text,
    html: invitation.html
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const reset = buildPasswordResetEmail(token);
  return sendEmail(email, reset.subject, {
    text: reset.text,
    html: reset.html
  });
}
