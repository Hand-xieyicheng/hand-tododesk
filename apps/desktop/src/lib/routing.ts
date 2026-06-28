export function normalizeResetPasswordHashRoute(
  location: Pick<Location, "hash" | "pathname" | "search">,
  history: Pick<History, "replaceState">
) {
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  if (!location.hash && pathname === "/reset-password") {
    history.replaceState(null, "", `/#/reset-password${location.search}`);
    return true;
  }
  return false;
}

export function printTokenFromPathname(pathname: string) {
  const normalizedPathname = pathname.replace(/\/+$/, "");
  const match = /^\/print\/([^/?#]+)$/.exec(normalizedPathname);
  const token = match?.[1];
  return token ? decodeURIComponent(token) : null;
}
