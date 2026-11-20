"use strict";

const CACHE_VERSION = "pedro-henry-v5-mobile";
const APP_SHELL = [
  "./",
  "./index.html",
  "./style.css",
  "./game.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE_VERSION).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => {
      if (event.request.mode === "navigate") return caches.match("./index.html");
      return Response.error();
    }))
  );
});

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "CHECK_OFFLINE") return;
  event.waitUntil(caches.open(CACHE_VERSION).then(async (cache) => {
    const results = await Promise.all(APP_SHELL.map((url) => cache.match(url)));
    if (results.every(Boolean) && event.source) event.source.postMessage({ type: "OFFLINE_READY" });
  }));
});
