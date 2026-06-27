import sidebarLogoSvg from "../assets/tododesk-sidebar-logo.svg?raw";

type SidebarLogoProps = {
  className?: string;
};

export function SidebarLogo({ className }: SidebarLogoProps) {
  const logoClassName = ["brand-logo", className].filter(Boolean).join(" ");

  return (
    <span
      aria-label="小柴记"
      className={logoClassName}
      data-logo-format="svg"
      role="img"
      dangerouslySetInnerHTML={{ __html: sidebarLogoSvg }}
    />
  );
}
