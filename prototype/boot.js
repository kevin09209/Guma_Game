/* v0.6 啟動器：未指定 debug tolerance 時，明確使用 100，避免 Number(null) 被判定為 0。 */
import { installPreCardFlow } from "./js/pre-card-flow.js";

const originalUrl = location.href;
const url = new URL(originalUrl);
const needsDefaultTolerance = !url.searchParams.has("tolerance");

if (needsDefaultTolerance) {
  url.searchParams.set("tolerance", "100");
  history.replaceState(null, "", url);
}

installPreCardFlow();
await import("./main.js");

if (needsDefaultTolerance) {
  history.replaceState(null, "", originalUrl);
}
