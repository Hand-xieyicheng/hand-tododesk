import { ChangeEvent, FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, type DragEndEvent, type DragStartEvent, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { appCloseBehaviorValues, displaySizeValues, fontFamilyValues, sidebarModuleValues, taskCardDisplayModeValues, titleColorValues, type ApiUser, type AppBootstrapResponse, type AppCloseBehavior, type DisplaySize, type FloatingCardThemeId, type FontFamily, type FooterType as AppFooterType, type SidebarModule, type TaskCardDisplayMode, type ThemeId, type TitleColor, type UserGender } from "@todo/shared";
import { Button, Card, Divider, Input, Modal, Radio, Select, Tabs, Title } from "animal-island-ui";
import { Camera, Check, Download, GripVertical, KeyRound, Mail, RefreshCw, RotateCw, Save } from "lucide-react";
import { api } from "../api/client";
import {
  AVATAR_CROP_SIZE,
  type AvatarCrop,
  clampAvatarOffset,
  createCroppedAvatarBlob,
  getAvatarLayout
} from "../lib/avatarCrop";
import type { AppUpdaterController } from "../lib/useAppUpdater";
import { floatingCardThemeOptions } from "../lib/floatingCardThemes";
import { fontRegistry } from "../lib/fonts";
import { ThemeSettings } from "./ThemeSettings";

interface ProfileCenterProps {
  user: ApiUser;
  appBootstrap: AppBootstrapResponse | null;
  appCloseBehavior: AppCloseBehavior;
  displaySize: DisplaySize;
  floatingCardHabitCheckInEnabled: boolean;
  floatingCardThemeId: FloatingCardThemeId;
  footerVisible: boolean;
  footerType: AppFooterType;
  fontFamily: FontFamily;
  pageAnimationEnabled: boolean;
  printButtonEnabled: boolean;
  sidebarModuleOptions: SidebarModuleOption[];
  taskCardDisplayMode: TaskCardDisplayMode;
  themeId: ThemeId;
  titleColor: TitleColor;
  visibleSidebarModules: SidebarModule[];
  onAppCloseBehaviorChanged(appCloseBehavior: AppCloseBehavior): void;
  onFooterVisibleChanged(visible: boolean): void;
  onFooterTypeChanged(footerType: AppFooterType): void;
  onFloatingCardHabitCheckInEnabledChanged(enabled: boolean): void;
  onFloatingCardThemeChanged(floatingCardThemeId: FloatingCardThemeId): void;
  onFontFamilyChanged(fontFamily: FontFamily): void;
  onDisplaySizeChanged(displaySize: DisplaySize): void;
  onPasswordChanged(): void;
  onPageAnimationEnabledChanged(enabled: boolean): void;
  onPrintButtonEnabledChanged(enabled: boolean): void;
  onTaskCardDisplayModeChanged(taskCardDisplayMode: TaskCardDisplayMode): void;
  onTitleColorChanged(titleColor: TitleColor): void;
  onThemeChanged(themeId: ThemeId): void;
  onUserChanged(user: ApiUser): void;
  onVisibleSidebarModulesChanged(modules: SidebarModule[]): void;
  updater: AppUpdaterController;
}

interface SidebarModuleOption {
  id: SidebarModule;
  label: string;
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

const taskCardDisplayModeLabels: Record<TaskCardDisplayMode, string> = {
  full: "完整卡片",
  title: "仅标题"
};

const taskCardDisplayModeOptions = taskCardDisplayModeValues.map((value) => ({
  label: taskCardDisplayModeLabels[value],
  value
}));

const appCloseBehaviorLabels: Record<AppCloseBehavior, string> = {
  hide: "仅关闭页面",
  quit: "退出应用"
};

const appCloseBehaviorOptions = appCloseBehaviorValues.map((value) => ({
  label: appCloseBehaviorLabels[value],
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

const updaterStatusLabels: Record<AppUpdaterController["status"], string> = {
  idle: "未检查",
  checking: "检查中",
  available: "发现新版本",
  downloading: "下载中",
  installing: "安装中",
  installed: "等待重启",
  current: "已是最新版本",
  error: "检查失败",
  unsupported: "当前环境不支持"
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

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function arrayEquals<T>(left: readonly T[], right: readonly T[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function mergeSidebarModuleOrder(
  currentOrder: readonly SidebarModule[],
  visibleModules: readonly SidebarModule[],
  options: readonly SidebarModuleOption[]
) {
  const availableModules = options.map((option) => option.id);
  const availableSet = new Set(availableModules);
  const nextOrder: SidebarModule[] = [];
  const addModule = (module: SidebarModule) => {
    if (availableSet.has(module) && !nextOrder.includes(module)) {
      nextOrder.push(module);
    }
  };

  currentOrder.forEach(addModule);
  visibleModules.forEach(addModule);
  availableModules.forEach(addModule);
  return nextOrder;
}

function isSidebarModule(value: unknown): value is SidebarModule {
  return typeof value === "string" && sidebarModuleValues.includes(value as SidebarModule);
}

interface SortableSidebarModuleOptionProps {
  checked: boolean;
  dragging: boolean;
  option: SidebarModuleOption;
  onToggle(module: SidebarModule): void;
}

function SortableSidebarModuleOption({ checked, dragging, option, onToggle }: SortableSidebarModuleOptionProps) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition
  } = useSortable({ id: option.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };

  return (
    <div
      className={[
        "module-option",
        checked ? "is-active" : "",
        dragging || isDragging ? "is-dragging" : ""
      ].filter(Boolean).join(" ")}
      data-sidebar-module={option.id}
      ref={setNodeRef}
      style={style}
    >
      <label className="module-option-toggle">
        <input
          checked={checked}
          type="checkbox"
          onChange={() => onToggle(option.id)}
        />
        <span className="module-option-check" aria-hidden="true">
          {checked ? <Check size={14} /> : null}
        </span>
        <span>{option.label}</span>
      </label>
      <button
        {...attributes}
        {...listeners}
        aria-label={`拖动排序 ${option.label}`}
        className="module-option-drag"
        ref={setActivatorNodeRef}
        type="button"
      >
        <GripVertical size={15} />
      </button>
    </div>
  );
}

export function ProfileCenter({
  user,
  appBootstrap,
  appCloseBehavior,
  displaySize,
  floatingCardHabitCheckInEnabled,
  floatingCardThemeId,
  footerVisible,
  footerType,
  fontFamily,
  pageAnimationEnabled,
  printButtonEnabled,
  sidebarModuleOptions,
  taskCardDisplayMode,
  themeId,
  titleColor,
  visibleSidebarModules,
  onAppCloseBehaviorChanged,
  onFooterVisibleChanged,
  onFooterTypeChanged,
  onFloatingCardHabitCheckInEnabledChanged,
  onFloatingCardThemeChanged,
  onFontFamilyChanged,
  onDisplaySizeChanged,
  onPasswordChanged,
  onPageAnimationEnabledChanged,
  onPrintButtonEnabledChanged,
  onTaskCardDisplayModeChanged,
  onTitleColorChanged,
  onThemeChanged,
  onUserChanged,
  onVisibleSidebarModulesChanged,
  updater
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
  const [sidebarModuleOrder, setSidebarModuleOrder] = useState<SidebarModule[]>(() => sidebarModuleOptions.map((option) => option.id));
  const [draggingSidebarModule, setDraggingSidebarModule] = useState<SidebarModule | null>(null);

  const avatarFileRef = useRef<HTMLInputElement | null>(null);
  const sidebarModuleOrderRef = useRef<SidebarModule[]>(sidebarModuleOptions.map((option) => option.id));
  const sidebarModuleSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

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

  useEffect(() => {
    setSidebarModuleOrder((currentOrder) => {
      const nextOrder = mergeSidebarModuleOrder(currentOrder, visibleSidebarModules, sidebarModuleOptions);
      sidebarModuleOrderRef.current = nextOrder;
      return arrayEquals(currentOrder, nextOrder) ? currentOrder : nextOrder;
    });
  }, [sidebarModuleOptions, visibleSidebarModules]);

  const avatarLayout = useMemo(() => {
    if (!avatarDraft) {
      return null;
    }
    return getAvatarLayout(avatarDraft, avatarCrop);
  }, [avatarCrop, avatarDraft]);
  const showVersionUpdate = updater.status !== "unsupported";
  const updateBusy = ["checking", "downloading", "installing"].includes(updater.status);
  const updateCanInstall = updater.status === "available";
  const updateCanRestart = updater.status === "installed";
  const updateProgressPercent = updater.totalBytes
    ? Math.min(100, Math.round((updater.receivedBytes / updater.totalBytes) * 100))
    : updater.status === "installed"
      ? 100
      : 0;
  const updateVersionLabel = updater.targetVersion ?? appBootstrap?.desktop.latestVersion ?? updater.currentVersion;
  const updateProgressLabel = updater.totalBytes
    ? `${formatBytes(updater.receivedBytes)} / ${formatBytes(updater.totalBytes)}`
    : updater.status === "downloading"
      ? `${formatBytes(updater.receivedBytes)} 已下载`
    : "";
  const sidebarModuleOptionMap = useMemo(() => (
    new Map(sidebarModuleOptions.map((option) => [option.id, option]))
  ), [sidebarModuleOptions]);
  const orderedSidebarModuleOptions = useMemo(() => (
    sidebarModuleOrder
      .map((module) => sidebarModuleOptionMap.get(module))
      .filter((option): option is SidebarModuleOption => Boolean(option))
  ), [sidebarModuleOrder, sidebarModuleOptionMap]);

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

  function toggleSidebarModule(module: SidebarModule) {
    const nextModuleSet = new Set(visibleSidebarModules);
    if (nextModuleSet.has(module)) {
      nextModuleSet.delete(module);
    } else {
      nextModuleSet.add(module);
    }

    const nextOrder = mergeSidebarModuleOrder(sidebarModuleOrderRef.current, [...nextModuleSet], sidebarModuleOptions);
    onVisibleSidebarModulesChanged(nextOrder.filter((item) => nextModuleSet.has(item)));
  }

  function commitSidebarModuleOrder(order: readonly SidebarModule[]) {
    const visibleModuleSet = new Set(visibleSidebarModules);
    onVisibleSidebarModulesChanged(order.filter((module) => visibleModuleSet.has(module)));
  }

  function handleSidebarModuleDragStart(event: DragStartEvent) {
    if (isSidebarModule(event.active.id)) {
      setDraggingSidebarModule(event.active.id);
    }
  }

  function handleSidebarModuleDragEnd(event: DragEndEvent) {
    setDraggingSidebarModule(null);
    const activeModule = event.active.id;
    const overModule = event.over?.id;
    if (!isSidebarModule(activeModule) || !isSidebarModule(overModule) || activeModule === overModule) {
      return;
    }

    const oldIndex = sidebarModuleOrderRef.current.indexOf(activeModule);
    const newIndex = sidebarModuleOrderRef.current.indexOf(overModule);
    if (oldIndex < 0 || newIndex < 0) {
      return;
    }

    const nextOrder = arrayMove(sidebarModuleOrderRef.current, oldIndex, newIndex);
    sidebarModuleOrderRef.current = nextOrder;
    setSidebarModuleOrder(nextOrder);
    commitSidebarModuleOrder(nextOrder);
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
              style={{ width: `min(100%, ${AVATAR_CROP_SIZE}px)`, aspectRatio: "1 / 1" }}
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
            <Button className="primary-button profile-header-save-button" disabled={profileBusy} form="profile-form" htmlType="submit" icon={<Save size={16} />} loading={profileBusy} type="primary">
              保存资料
            </Button>
          </header>
          <Divider type="dashed-teal" />
          <form id="profile-form" className="task-form profile-form" onSubmit={submitProfile}>
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
          </form>
        </Card>

        {showVersionUpdate ? (
          <Card className="profile-section-card version-section-card" pattern="default">
            <header className="profile-section-header">
              <Title size="small" color="app-blue">版本更新</Title>
              <span className="version-status-badge">{updaterStatusLabels[updater.status]}</span>
            </header>
            <Divider type="dashed-teal" />
            <div className="version-details">
              <div>
                <span>当前版本</span>
                <strong>{updater.currentVersion}</strong>
              </div>
              <div>
                <span>最新版本</span>
                <strong>{updateVersionLabel}</strong>
              </div>
              <div>
                <span>最低支持</span>
                <strong>{appBootstrap?.desktop.minimumVersion ?? "-"}</strong>
              </div>
            </div>
            {updater.status === "downloading" || updater.status === "installing" || updater.status === "installed" ? (
              <div className="version-progress" aria-label="更新进度">
                <div className="version-progress-track">
                  <span style={{ width: `${updateProgressPercent}%` }} />
                </div>
                <span>{updateProgressLabel || `${updateProgressPercent}%`}</span>
              </div>
            ) : null}
            {updater.releaseNotes ? (
              <div className="version-release-notes">
                <span>更新说明</span>
                <p>{updater.releaseNotes}</p>
              </div>
            ) : null}
            {updater.error ? <div className="inline-alert">{updater.error}</div> : null}
            <div className="version-actions">
              <Button
                className="ghost-button"
                disabled={updateBusy}
                icon={<RefreshCw size={16} />}
                loading={updater.status === "checking"}
                type="default"
                onClick={() => void updater.checkForUpdate()}
              >
                检查更新
              </Button>
              {updateCanInstall ? (
                <Button className="primary-button" icon={<Download size={16} />} type="primary" onClick={() => void updater.installUpdate()}>
                  下载并安装
                </Button>
              ) : null}
              {updateCanRestart ? (
                <Button className="primary-button" icon={<RotateCw size={16} />} type="primary" onClick={() => void updater.restartApp()}>
                  重启更新
                </Button>
              ) : null}
            </div>
          </Card>
        ) : null}

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
          <div className="floating-card-theme-config">
            <span className="floating-card-theme-label">固定卡片主题</span>
            <div className="floating-card-theme-grid" aria-label="固定卡片主题">
              {floatingCardThemeOptions.map((theme) => (
                <button
                  aria-label={`固定卡片主题 ${theme.label}`}
                  className={floatingCardThemeId === theme.id ? "floating-card-theme-option is-active" : "floating-card-theme-option"}
                  data-floating-card-theme={theme.id}
                  key={theme.id}
                  style={{
                    background: theme.background,
                    borderColor: theme.border,
                    color: theme.text
                  }}
                  title={theme.label}
                  type="button"
                  onClick={() => onFloatingCardThemeChanged(theme.id)}
                >
                  <span className="floating-card-theme-sample" style={{ background: theme.surface, borderColor: theme.border }} />
                  <strong>{theme.label}</strong>
                  {floatingCardThemeId === theme.id ? <Check size={15} /> : null}
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
          <div className="font-family-config">
            <span className="font-family-config-label">字体配置</span>
            <div className="font-family-grid" aria-label="界面字体">
              {fontFamilyValues.map((value) => {
                const font = fontRegistry[value];
                return (
                  <button
                    className={fontFamily === value ? "font-family-option is-active" : "font-family-option"}
                    key={value}
                    style={{ fontFamily: font.stack }}
                    type="button"
                    onClick={() => onFontFamilyChanged(value)}
                  >
                    <strong>{font.label}</strong>
                    <span>待办事项 ABC 123</span>
                    {fontFamily === value ? <Check size={15} /> : null}
                  </button>
                );
              })}
            </div>
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

        <Card className="profile-section-card" pattern="default">
          <header className="profile-section-header">
            <Title size="small" color="app-blue">系统配置</Title>
            <Check size={18} />
          </header>
          <Divider type="dashed-teal" />
          <div className="display-size-config">
            <span className="display-size-config-label">待办事项卡片显示</span>
            <Radio
              options={taskCardDisplayModeOptions}
              value={taskCardDisplayMode}
              onChange={(value) => onTaskCardDisplayModeChanged(value as TaskCardDisplayMode)}
            />
          </div>
          <div className="display-size-config">
            <span className="display-size-config-label">开启页面动画效果</span>
            <Radio
              options={[
                { label: "是", value: "on" },
                { label: "否", value: "off" }
              ]}
              value={pageAnimationEnabled ? "on" : "off"}
              onChange={(value) => onPageAnimationEnabledChanged(value === "on")}
            />
          </div>
          <div className="display-size-config">
            <span className="display-size-config-label">便签打印</span>
            <Radio
              options={[
                { label: "隐藏打印按钮", value: "off" },
                { label: "显示打印按钮", value: "on" }
              ]}
              value={printButtonEnabled ? "on" : "off"}
              onChange={(value) => onPrintButtonEnabledChanged(value === "on")}
            />
          </div>
          <div className="display-size-config">
            <span className="display-size-config-label">固定卡片快捷习惯打卡</span>
            <Radio
              options={[
                { label: "是", value: "on" },
                { label: "否", value: "off" }
              ]}
              value={floatingCardHabitCheckInEnabled ? "on" : "off"}
              onChange={(value) => onFloatingCardHabitCheckInEnabledChanged(value === "on")}
            />
          </div>
          <div className="module-display-config">
            <span className="module-display-config-label">显示模块</span>
            <DndContext
              collisionDetection={closestCenter}
              sensors={sidebarModuleSensors}
              onDragCancel={() => setDraggingSidebarModule(null)}
              onDragEnd={handleSidebarModuleDragEnd}
              onDragStart={handleSidebarModuleDragStart}
            >
              <SortableContext items={sidebarModuleOrder} strategy={rectSortingStrategy}>
                <div className="module-option-grid" aria-label="侧边导航显示模块">
                  {orderedSidebarModuleOptions.map((option) => (
                    <SortableSidebarModuleOption
                      checked={visibleSidebarModules.includes(option.id)}
                      dragging={draggingSidebarModule === option.id}
                      key={option.id}
                      option={option}
                      onToggle={toggleSidebarModule}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
          <div className="display-size-config">
            <span className="display-size-config-label">关闭 app 时</span>
            <Radio
              options={appCloseBehaviorOptions}
              value={appCloseBehavior}
              onChange={(value) => onAppCloseBehaviorChanged(value as AppCloseBehavior)}
            />
          </div>
        </Card>
      </div>

      <Modal className="profile-security-dialog" open={securityOpen} title="账号安全" width={760} footer={null} typewriter={false} onClose={() => setSecurityOpen(false)}>
        <Tabs className="profile-security-tabs profile-security-modal" defaultActiveKey="email" items={securityTabs} />
      </Modal>
    </section>
  );
}
