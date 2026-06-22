import { describe, expect, it } from "vitest";
import { buildPasswordResetEmail, buildVerificationEmail } from "./mailer.js";

describe("verification email", () => {
  it("builds a registration invitation with system IP and accept button", () => {
    const email = buildVerificationEmail("token with/slash");

    expect(email.subject).toBe("小柴记用户注册邀请函");
    expect(email.verificationUrl).toContain("/auth/verify-email?token=token%20with%2Fslash");
    expect(email.text).toContain(`系统 IP：${email.systemEndpoint}`);
    expect(email.text).toContain("接受邀请：");
    expect(email.text).not.toContain("请打开以下链接完成邮箱验证");
    expect(email.html).toContain("用户注册邀请函");
    expect(email.html).toContain("系统 IP");
    expect(email.html).toContain(email.systemEndpoint);
    expect(email.html).toContain(">接受邀请</a>");
    expect(email.html).toContain(email.verificationUrl);
  });

  it("uses email-change copy when requested", () => {
    const email = buildVerificationEmail("token", "email-change");

    expect(email.subject).toBe("小柴记邮箱验证邀请函");
    expect(email.html).toContain("邮箱验证邀请函");
    expect(email.html).toContain("完成新邮箱验证");
  });

  it("builds a password reset invitation with system IP and reset button", () => {
    const email = buildPasswordResetEmail("reset token");

    expect(email.subject).toBe("小柴记密码重置邀请函");
    expect(email.resetUrl).toContain("/#/reset-password?token=reset%20token");
    expect(email.text).toContain(`系统 IP：${email.systemEndpoint}`);
    expect(email.text).toContain("重置密码：");
    expect(email.text).not.toContain("请打开以下链接重置密码");
    expect(email.html).toContain("密码重置邀请函");
    expect(email.html).toContain("系统 IP");
    expect(email.html).toContain(email.systemEndpoint);
    expect(email.html).toContain(">重置密码</a>");
    expect(email.html).toContain(email.resetUrl);
  });
});
