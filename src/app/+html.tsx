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
        {process.env.NODE_ENV === 'production' ? <script dangerouslySetInnerHTML={{ __html: registerServiceWorker }} /> : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
