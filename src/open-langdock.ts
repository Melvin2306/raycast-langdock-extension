import { getApplications, open } from "@raycast/api";
import { webAppUrl } from "./lib/langdock";

const DESKTOP_BUNDLE_ID = "com.langdock.desktop";

export default async function Command() {
  const applications = await getApplications();
  const desktopApp = applications.find((app) => app.bundleId === DESKTOP_BUNDLE_ID);
  await open(desktopApp ? desktopApp.path : webAppUrl());
}
