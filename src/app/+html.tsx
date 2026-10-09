import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

// Runs only in Node during static rendering, so it decides here whether the page
// registers the service worker. Development builds never do, which keeps Metro's
// live bundles out of the cache.
const registerServiceWorker = `
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
}`;

/**
 * If the app has not started 10 seconds after the page loads, offer a reload that
 * also drops the service worker and its caches, so a broken or stale copy can never
 * leave someone on the static loading screen. The app removes it once it starts.
 */
const startupWatchdog = `
(function () {
  var started = false;
  window.__switchifyStarted = function () {
    started = true;
    var shown = document.getElementById('switchify-start-failed');
    if (shown) shown.remove();
  };
  function reload() {
    var work = [];
    if (navigator.serviceWorker) work.push(navigator.serviceWorker.getRegistrations().then(function (all) { return Promise.all(all.map(function (r) { return r.unregister(); })); }));
    if (window.caches) work.push(caches.keys().then(function (keys) { return Promise.all(keys.map(function (k) { return caches.delete(k); })); }));
    Promise.all(work).catch(function () {}).then(function () { location.reload(); });
  }
  setTimeout(function () {
    if (started || !document.body) return;
    var box = document.createElement('div');
    box.id = 'switchify-start-failed';
    box.setAttribute('role', 'alert');
    box.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;background:#0B0B0D;color:#F7F7F8;font:16px/1.5 system-ui,sans-serif;text-align:center';
    var title = document.createElement('p');
    title.style.cssText = 'margin:0;font-size:22px;font-weight:600';
    title.textContent = 'Switchify Remote didn’t start';
    var body = document.createElement('p');
    body.style.cssText = 'margin:0;max-width:28em;color:#B4B4BE';
    body.textContent = 'Reload to fetch a fresh copy. Your saved PCs and settings are kept.';
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Reload';
    button.style.cssText = 'font:inherit;font-weight:600;min-height:52px;padding:0 32px;border:0;border-radius:12px;background:#D90429;color:#fff';
    button.addEventListener('click', reload);
    box.append(title, body, button);
    document.body.appendChild(box);
    button.focus();
  }, 10000);
})();`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="theme-color" content="#050505" />
        <meta name="description" content="Control a Windows PC or Mac running Switchify PC over Bluetooth." />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <ScrollViewStyleReset />
        {process.env.NODE_ENV === 'production' ? <script dangerouslySetInnerHTML={{ __html: startupWatchdog }} /> : null}
        {process.env.NODE_ENV === 'production' ? <script dangerouslySetInnerHTML={{ __html: registerServiceWorker }} /> : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
