import { ChangeEvent, FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { displaySizeValues, titleColorValues, type ApiUser, type DisplaySize, type FooterType as AppFooterType, type ThemeId, type TitleColor, type UserGender } from "@todo/shared";
import { Button, Card, Divider, Input, Modal, Radio, Select, Tabs, Title } from "animal-island-ui";
import { Camera, Check, KeyRound, Mail, Save } from "lucide-react";
import { api } from "../api/client";
import {
  AVATAR_CROP_SIZE,
  type AvatarCrop,
  clampAvatarOffset,
  createCroppedAvatarBlob,
  getAvatarLayout
} from "../lib/avatarCrop";
import { ThemeSettings } from "./ThemeSettings";

interface ProfileCenterProps {
  user: ApiUser;
  displaySize: DisplaySize;
  footerVisible: boolean;
  footerType: AppFooterType;
  themeId: ThemeId;
  titleColor: TitleColor;
  onFooterVisibleChanged(visible: boolean): void;
  onFooterTypeChanged(footerType: AppFooterType): void;
  onDisplaySizeChanged(displaySize: DisplaySize): void;
  onPasswordChanged(): void;
  onTitleColorChanged(titleColor: TitleColor): void;
  onThemeChanged(themeId: ThemeId): void;
  onUserChanged(user: ApiUser): void;
}

interface AvatarDraft {
  url: string;
  width: number;
  height: number;
  name: string;
}

const genderOptions: Array<{ key: UserGender; label: string }> = [
  { key: "PRIVATE", label: "保密" },
  { key: "MALE", label: "男" },
  { key: "FEMALE", label: "女" },
  { key: "OTHER", label: "其他" }
];

const footerVisibilityOptions = [
  { label: "显示", value: "show" },
  { label: "隐藏", value: "hide" }
];

const footerTypeOptions = [
  { label: "sea 样式", value: "sea" },
  { label: "tree 样式", value: "tree" }
];

const displaySizeLabels: Record<DisplaySize, string> = {
  small: "小",
  default: "默认",
  large: "大"
};

const displaySizeOptions = displaySizeValues.map((value) => ({
  label: displaySizeLabels[value],
  value
}));

const titleColorSwatches: Record<TitleColor, string> = {
  default: "var(--color-text)",
  "app-pink": "#f59ec7",
  purple: "#a779e9",
  "app-blue": "#5ba8f7",
  "app-yellow": "#f7cd67",
  "app-orange": "#e59266",
  "app-teal": "#19c8b9",
  "app-green": "#8ac68a",
  "app-red": "#fc736d",
  "lime-green": "#9bd15c",
  "yellow-green": "#bfd65b",
  brown: "#725d42",
  "warm-peach-pink": "#f0a5a6"
};

const initialCrop: AvatarCrop = {
  zoom: 1,
  offsetX: 0,
  offsetY: 0
};

function displayName(user: ApiUser) {
  return user.name || user.email;
}

function avatarInitial(user: ApiUser) {
  return displayName(user).trim().slice(0, 1).toUpperCase();
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败"));
    image.src = src;
  });
}

export function ProfileCenter({
  user,
  displaySize,
  footerVisible,
  footerType,
  themeId,
  titleColor,
  onFooterVisibleChanged,
  onFooterTypeChanged,
  onDisplaySizeChanged,
  onPasswordChanged,
  onTitleColorChanged,
  onThemeChanged,
  onUserChanged
}: ProfileCenterProps) {
  const [name, setName] = useState(user.name ?? "");
  const [gender, setGender] = useState<UserGender>(user.gender ?? "PRIVATE");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);

  const [avatarDraft, setAvatarDraft] = useState<AvatarDraft | null>(null);
  const [avatarCrop, setAvatarCrop] = useState<AvatarCrop>(initialCrop);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [dragging, setDragging] = useState<{ pointerId: number; x: number; y: number } | null>(null);

  const [nextEmail, setNextEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const avatarFileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setName(user.name ?? "");
    setGender(user.gender ?? "PRIVATE");
  }, [user.id, user.name, user.gender]);

  useEffect(() => {
    return () => {
      if (avatarDraft?.url) {
        URL.revokeObjectURL(avatarDraft.url);
      }
    };
  }, [avatarDraft?.url]);

  const avatarLayout = useMemo(() => {
    if (!avatarDraft) {
      return null;
    }
    return getAvatarLayout(avatarDraft, avatarCrop);
  }, [avatarCrop, avatarDraft]);

  async function submitProfile(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setProfileMessage("用户名不能为空");
      return;
    }

    setProfileBusy(true);
    setProfileMessage("");
    try {
      const payload = await api.updateProfile({ name: trimmedName, gender });
      onUserChanged(payload.user);
      setProfileMessage("资料已保存");
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setProfileBusy(false);
    }
  }

  async function selectAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setAvatarMessage("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setAvatarMessage("头像仅支持 PNG、JPEG、WebP");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarMessage("头像不能超过 2MB");
      return;
    }

    const url = URL.createObjectURL(file);
    try {
      const image = await loadImage(url);
      setAvatarDraft({ url, width: image.naturalWidth, height: image.naturalHeight, name: file.name });
      setAvatarCrop(initialCrop);
    } catch (error) {
      URL.revokeObjectURL(url);
      setAvatarMessage(error instanceof Error ? error.message : "图片读取失败");
    }
  }

  function updateAvatarZoom(nextZoom: number) {
    if (!avatarDraft) {
      setAvatarCrop((current) => ({ ...current, zoom: nextZoom }));
      return;
    }

    const nextCrop = { ...avatarCrop, zoom: nextZoom };
    const clamped = clampAvatarOffset(avatarDraft, nextCrop);
    setAvatarCrop({ ...nextCrop, ...clamped });
  }

  function moveAvatar(dx: number, dy: number) {
    if (!avatarDraft) {
      return;
    }

    const nextCrop = {
      ...avatarCrop,
      offsetX: avatarCrop.offsetX + dx,
      offsetY: avatarCrop.offsetY + dy
    };
    const clamped = clampAvatarOffset(avatarDraft, nextCrop);
    setAvatarCrop({ ...nextCrop, ...clamped });
  }

  function startAvatarDrag(event: PointerEvent<HTMLDivElement>) {
    if (!avatarDraft) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging({ pointerId: event.pointerId, x: event.clientX, y: event.clientY });
  }

  function dragAvatar(event: PointerEvent<HTMLDivElement>) {
    if (!dragging || dragging.pointerId !== event.pointerId) {
      return;
    }
    moveAvatar(event.clientX - dragging.x, event.clientY - dragging.y);
    setDragging({ pointerId: event.pointerId, x: event.clientX, y: event.clientY });
  }

  function stopAvatarDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragging?.pointerId === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setDragging(null);
    }
  }

  async function uploadAvatar() {
    if (!avatarDraft) {
      setAvatarMessage("请先选择头像");
      return;
    }

    setAvatarBusy(true);
    setAvatarMessage("");
    try {
      const image = await loadImage(avatarDraft.url);
      const blob = await createCroppedAvatarBlob(image, avatarCrop);
      const payload = await api.uploadAvatar(blob);
      onUserChanged(payload.user);
      setAvatarDraft(null);
      setAvatarCrop(initialCrop);
      setAvatarMessage("头像已更新");
    } catch (error) {
      setAvatarMessage(error instanceof Error ? error.message : "头像上传失败");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    setEmailBusy(true);
    setEmailMessage("");
    try {
      const payload = await api.changeEmail({ email: nextEmail, currentPassword: emailPassword });
      onUserChanged(payload.user);
      setNextEmail("");
      setEmailPassword("");
      setEmailMessage("验证邮件已发送，请验证新邮箱");
    } catch (error) {
      setEmailMessage(error instanceof Error ? error.message : "邮箱重置失败");
    } finally {
      setEmailBusy(false);
    }
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordMessage("两次输入的新密码不一致");
      return;
    }

    setPasswordBusy(true);
    setPasswordMessage("");
    try {
      await api.changePassword({ currentPassword, newPassword });
      onPasswordChanged();
    } catch (error) {
      setPasswordMessage(error instanceof Error ? error.message : "密码修改失败");
    } finally {
      setPasswordBusy(false);
    }
  }

  const securityTabs = [
    {
      key: "email",
      label: (
        <span className="profile-security-tab-label">
          <Mail size={15} />
          重置邮箱
        </span>
      ),
      children: (
        <form className="task-form profile-form profile-security-panel" onSubmit={submitEmail}>
          <label>
            <span>新邮箱</span>
            <Input value={nextEmail} onChange={(event) => setNextEmail(event.target.value)} type="email" autoComplete="email" required allowClear shadow />
          </label>
          <label>
            <span>当前密码</span>
            <Input value={emailPassword} onChange={(event) => setEmailPassword(event.target.value)} type="password" autoComplete="current-password" required shadow />
          </label>
          {emailMessage ? <div className="inline-alert">{emailMessage}</div> : null}
          <Button className="primary-button" disabled={emailBusy} htmlType="submit" icon={<Mail size={16} />} loading={emailBusy} type="primary">
            重置邮箱
          </Button>
        </form>
      )
    },
    {
      key: "password",
      label: (
        <span className="profile-security-tab-label">
          <KeyRound size={15} />
          修改密码
        </span>
      ),
      children: (
        <form className="task-form profile-form profile-security-panel" onSubmit={submitPassword}>
          <label>
            <span>当前密码</span>
            <Input value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} type="password" autoComplete="current-password" required shadow />
          </label>
          <label>
            <span>新密码</span>
            <Input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} type="password" autoComplete="new-password" required shadow />
          </label>
          <label>
            <span>确认新密码</span>
            <Input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" required shadow />
          </label>
          {passwordMessage ? <div className="inline-alert">{passwordMessage}</div> : null}
          <Button className="primary-button" disabled={passwordBusy} htmlType="submit" icon={<KeyRound size={16} />} loading={passwordBusy} type="primary">
            修改密码
          </Button>
        </form>
      )
    }
  ];

  return (
    <section className="profile-layout">
      <Card className="profile-card profile-overview" pattern="default">
        <button className="profile-avatar-large profile-avatar-button" type="button" aria-label="上传头像" onClick={() => avatarFileRef.current?.click()}>
          {user.avatarUrl ? <img src={user.avatarUrl} alt={displayName(user)} /> : <span className="profile-avatar-initial">{avatarInitial(user)}</span>}
          <span className="profile-avatar-edit-icon" aria-hidden="true">
            <Camera size={18} />
          </span>
        </button>
        <div className="profile-overview-text">
          <Title className="profile-display-name" size="small" color="app-teal">{displayName(user)}</Title>
          <span>{user.email}</span>
        </div>
        <Divider type="dashed-teal" />
        <input
          ref={avatarFileRef}
          className="file-input-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={selectAvatar}
        />
        <Button className="ghost-button" icon={<KeyRound size={16} />} type="default" onClick={() => setSecurityOpen(true)}>
          账号安全
        </Button>

        {avatarDraft ? (
          <div className="avatar-editor">
            <div
              className={dragging ? "avatar-crop-stage is-dragging" : "avatar-crop-stage"}
              style={{ width: AVATAR_CROP_SIZE, height: AVATAR_CROP_SIZE }}
              onPointerDown={startAvatarDrag}
              onPointerMove={dragAvatar}
              onPointerUp={stopAvatarDrag}
              onPointerCancel={stopAvatarDrag}
            >
              {avatarLayout ? (
                <img
                  src={avatarDraft.url}
                  alt={avatarDraft.name}
                  draggable={false}
                  style={{
                    width: avatarLayout.displayWidth,
                    height: avatarLayout.displayHeight,
                    left: avatarLayout.left,
                    top: avatarLayout.top
                  }}
                />
              ) : null}
            </div>
            <label className="avatar-zoom">
              <span>缩放</span>
              <input
                type="range"
                min="1"
                max="3"
                step="0.01"
                value={avatarCrop.zoom}
                onChange={(event) => updateAvatarZoom(Number(event.target.value))}
              />
            </label>
            <Button block className="primary-button" disabled={avatarBusy} icon={<Camera size={16} />} loading={avatarBusy} type="primary" onClick={uploadAvatar}>
              上传头像
            </Button>
          </div>
        ) : null}
        {avatarMessage ? <div className="inline-alert">{avatarMessage}</div> : null}
      </Card>

      <div className="profile-sections">
        <Card className="profile-section-card" pattern="default">
          <header className="profile-section-header">
            <Title size="small" color="app-teal">个人资料</Title>
          </header>
          <Divider type="dashed-teal" />
          <form className="task-form profile-form" onSubmit={submitProfile}>
            <div className="form-grid">
              <label>
                <span>用户名</span>
                <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required allowClear shadow />
              </label>
              <label>
                <span>性别</span>
                <Select value={gender} onChange={(next) => setGender(next as UserGender)} options={genderOptions} />
              </label>
            </div>
            {profileMessage ? <div className="inline-alert">{profileMessage}</div> : null}
            <Button className="primary-button" disabled={profileBusy} htmlType="submit" icon={<Save size={16} />} loading={profileBusy} type="primary">
              保存资料
            </Button>
          </form>
        </Card>

        <Card className="profile-section-card" pattern="default">
          <header className="profile-section-header">
            <Title size="small" color="app-yellow">主题配置</Title>
            <Check size={18} />
          </header>
          <Divider type="dashed-teal" />
          <ThemeSettings themeId={themeId} onThemeChanged={onThemeChanged} />
          <div className="title-color-config">
            <span className="title-color-label">标题颜色</span>
            <div className="title-color-grid" aria-label="系统页面标题颜色">
              {titleColorValues.map((color) => (
                <button
                  aria-label={`标题颜色 ${color}`}
                  className={titleColor === color ? "title-color-swatch is-active" : "title-color-swatch"}
                  data-title-color={color}
                  key={color}
                  style={{ background: titleColorSwatches[color] }}
                  title={color}
                  type="button"
                  onClick={() => onTitleColorChanged(color)}
                >
                  {titleColor === color ? <Check size={15} /> : null}
                </button>
              ))}
            </div>
          </div>
          <div className="display-size-config">
            <span className="display-size-config-label">界面显示大小</span>
            <Radio
              options={displaySizeOptions}
              value={displaySize}
              onChange={(value) => onDisplaySizeChanged(value as DisplaySize)}
            />
          </div>
          <div className="footer-config">
            <span className="footer-config-label">Footer 配置</span>
            <div className="footer-config-row">
              <span>显示状态</span>
              <Radio
                options={footerVisibilityOptions}
                value={footerVisible ? "show" : "hide"}
                onChange={(value) => onFooterVisibleChanged(value === "show")}
              />
            </div>
            <div className="footer-config-row">
              <span>显示样式</span>
              <Radio
                disabled={!footerVisible}
                options={footerTypeOptions}
                value={footerType}
                onChange={(value) => onFooterTypeChanged(value as AppFooterType)}
              />
            </div>
          </div>
        </Card>
      </div>

      <Modal open={securityOpen} title="账号安全" width={760} footer={null} typewriter={false} onClose={() => setSecurityOpen(false)}>
        <Tabs className="profile-security-tabs profile-security-modal" defaultActiveKey="email" items={securityTabs} />
      </Modal>
    </section>
  );
}
