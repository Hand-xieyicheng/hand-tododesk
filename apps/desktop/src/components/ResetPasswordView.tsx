import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { defaultThemeId } from "@todo/shared";
import { Button, Card, Divider, Input, Loading, Title } from "animal-island-ui";
import { KeyRound } from "lucide-react";
import { api } from "../api/client";
import { clearSession } from "../lib/authStorage";
import { applyTheme } from "../lib/themes";
import { SidebarLogo } from "./SidebarLogo";

interface ResetPasswordViewProps {
  onSessionCleared(): void;
}

export function ResetPasswordView({ onSessionCleared }: ResetPasswordViewProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState(token ? "" : "重置链接无效或缺少 token");
  const [busy, setBusy] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    applyTheme(defaultThemeId);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      setMessage("重置链接无效或缺少 token");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("两次输入的密码不一致");
      return;
    }

    setBusy(true);
    setMessage("");
    try {
      await api.resetPassword(token, password);
      await clearSession();
      onSessionCleared();
      setPassword("");
      setConfirmPassword("");
      setCompleted(true);
      setMessage("密码已重置，请登录");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重置失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-animated-bg" aria-hidden="true">
        <div className="auth-wave-layer" />
        <div className="auth-island-stage">
          <Loading className="auth-island-loading" />
        </div>
        <span className="auth-drift-leaf auth-drift-leaf-one" />
        <span className="auth-drift-leaf auth-drift-leaf-two" />
        <span className="auth-drift-leaf auth-drift-leaf-three" />
      </div>
      <div className="auth-page-brand" aria-label="小柴记 桌面待办">
        <SidebarLogo className="auth-page-logo" />
      </div>
      <Card className="auth-panel" pattern="default">
        <div className="auth-card-header">
          <Title size="large" color="app-orange">
            重置密码
          </Title>
        </div>
        <Divider type="dashed-brown" />

        <form className="auth-form" onSubmit={submit}>
          <label>
            <span>新密码</span>
            <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" required shadow />
          </label>
          <label>
            <span>确认密码</span>
            <Input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" required shadow />
          </label>
          {message ? <div className="inline-alert">{message}</div> : null}
          <Button
            block
            className="primary-button auth-submit"
            disabled={busy || !token || completed}
            htmlType="submit"
            icon={<KeyRound size={16} />}
            loading={busy}
            type="primary"
          >
            {busy ? "处理中..." : "重置密码"}
          </Button>
        </form>

        <div className="auth-switcher">
          <Button type="text" onClick={() => navigate("/auth", { replace: true })}>
            返回登录
          </Button>
        </div>
      </Card>
    </div>
  );
}
