// BCN — simple service worker: cache the app shell so it opens fast and works offline.
// Firestore data itself is cached by Firebase's offline persistence, not by this worker.
// v2: পাতা (index.html) সবসময় নেট থেকে নতুন নেওয়া হয় — নেট না থাকলে ক্যাশ থেকে খোলে।
// তাই নতুন আপডেট ফোনে আটকে থাকবে না।
const CACHE = "bcn-v2";
const ASSETS = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Only handle same-origin GET requests. Never cache Firebase/Auth/Firestore calls.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  // পাতা (navigation): নেট থেকে নতুন নাও, না পেলে ক্যাশ থেকে খোলো
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match("/index.html"))),
    );
    return;
  }

  // বাকি ফাইল (JS/CSS/আইকন): ক্যাশে থাকলে সেটা, না থাকলে নেট থেকে নিয়ে ক্যাশে রাখো
  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ||
        fetch(event.request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        }),
    ),
  );
});
