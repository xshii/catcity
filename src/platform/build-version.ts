/**
 * In debug mode the page says which build is running, in the bottom-right corner, so a
 * phone's report can be matched to a try-out build.
 */
export function showBuildVersion(version: string) {
  const label = document.createElement('div');
  label.id = 'build-version';
  label.setAttribute('aria-hidden', 'true');
  label.textContent = version;
  label.style.cssText =
    'position:fixed;right:4px;bottom:4px;z-index:9999;pointer-events:none;' +
    'font:10px/1.4 ui-monospace,monospace;padding:1px 6px;border-radius:8px;' +
    'background:rgba(0,0,0,.6);color:#fff';
  document.body.append(label);
}
