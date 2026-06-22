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
