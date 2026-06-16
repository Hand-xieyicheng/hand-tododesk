import { FormEvent, useEffect, useState } from "react";
import type { ApiUser } from "@todo/shared";
import { Button, Card, Divider, Input, Loading, Title } from "animal-island-ui";
import { KeyRound, Mail, UserPlus } from "lucide-react";
import { api } from "../api/client";
import todoDeskLogo from "../assets/tododesk-logo.png";
import { deleteRememberedPassword, getLastLoginEmail, getRememberedPassword, getRememberedPasswordEmail, saveLastLoginEmail, saveRememberedPassword } from "../lib/authStorage";
import { applyTheme } from "../lib/themes";

type AuthMode = "login" | "register" | "forgot";

const authModeActions: Array<{ mode: AuthMode; label: string }> = [
  { mode: "login", label: "登录" },
  { mode: "register", label: "注册" },
  { mode: "forgot", label: "忘记密码" }
];

interface AuthViewProps {
  onAuthed(user: ApiUser): void;
}

function getInitialLoginEmail() {
  return getLastLoginEmail() || getRememberedPasswordEmail();
}

export function AuthView({ onAuthed }: AuthViewProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState(() => getInitialLoginEmail());
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(() => {
    const initialEmail = getInitialLoginEmail();
    return Boolean(initialEmail && initialEmail === getRememberedPasswordEmail());
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    applyTheme("default");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function restoreRememberedPassword() {
      if (mode !== "login" || !email) {
        return;
      }

      const rememberedPassword = await getRememberedPassword(email);
      if (!cancelled && rememberedPassword) {
        setPassword(rememberedPassword);
        setRememberPassword(true);
      }
    }

    void restoreRememberedPassword();

    return () => {
      cancelled = true;
    };
  }, [email, mode]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      if (mode === "login") {
        const payload = await api.login(email, password);
        saveLastLoginEmail(payload.user.email);
        if (rememberPassword) {
          await saveRememberedPassword(payload.user.email, password);
        } else {
          await deleteRememberedPassword(payload.user.email);
        }
        onAuthed(payload.user);
      } else if (mode === "register") {
        await api.register({ email, password, name: name || undefined });
        setMessage("验证邮件已发送");
        setMode("login");
      } else {
        await api.forgotPassword(email);
        setMessage("重置邮件已发送");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "提交失败");
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
      <div className="auth-page-brand" aria-label="todoDesk 桌面待办">
        <img className="brand-logo auth-page-logo" src={todoDeskLogo} alt="todoDesk" />
      </div>
      <Card className="auth-panel" pattern="default">
        <div className="auth-card-header">
          <Title size="large" color={mode === "login" ? "app-teal" : mode === "register" ? "app-yellow" : "app-orange"}>
            {mode === "login" ? "登录" : mode === "register" ? "注册" : "忘记密码"}
          </Title>
        </div>
        <Divider type="dashed-brown" />

        <form className="auth-form" onSubmit={submit}>
          {mode === "register" ? (
            <label>
              <span>名称</span>
              <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" allowClear shadow />
            </label>
          ) : null}
          <label>
            <span>邮箱</span>
            <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required allowClear shadow />
          </label>
          {mode !== "forgot" ? (
            <label>
              <span>密码</span>
              <Input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required shadow />
            </label>
          ) : null}
          {mode === "login" ? (
            <label className="auth-remember-row">
              <input type="checkbox" checked={rememberPassword} onChange={(event) => setRememberPassword(event.target.checked)} />
              <span>记住密码</span>
            </label>
          ) : null}
          {message ? <div className="inline-alert">{message}</div> : null}
          <Button
            block
            className="primary-button auth-submit"
            disabled={busy}
            htmlType="submit"
            icon={mode === "login" ? <KeyRound size={16} /> : mode === "register" ? <UserPlus size={16} /> : <Mail size={16} />}
            loading={busy}
            type="primary"
          >
            {busy ? "处理中..." : mode === "login" ? "登录" : mode === "register" ? "注册" : "发送邮件"}
          </Button>
        </form>

        <div className="auth-switcher">
          {authModeActions
            .filter((action) => action.mode !== mode)
            .map((action) => (
              <Button key={action.mode} type="text" onClick={() => setMode(action.mode)}>
                {action.label}
              </Button>
            ))}
        </div>
      </Card>
    </div>
  );
}
