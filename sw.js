/* シャカリンゴ サービスワーカー
   - アプリ本体（index.html）はネット優先：つながっていれば最新版、圏外なら保存した版で動く
   - アイコンなどは保存した版を優先
   - Google Fonts は使うたびに保存しておき、圏外でも同じフォントで表示する
   アプリを更新したら VERSION を上げる */
const VERSION = 'yougo-v18';
const STATE = 'shakaringo-state';   // 通知の文面に使う、おさらいの予定日（アプリが書く）
const CORE = ['./', './index.html', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png'];

self.addEventListener('install', e => {
  // ブラウザのキャッシュを通さず、サーバーから最新のファイルを取りなおして保存する
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== STATE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // アプリ本体: ネット優先（ブラウザのキャッシュも確認しなおす）
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req.url, { cache: 'no-cache' }).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Google Fonts: 保存した版をすぐ返し、裏で新しくする
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(VERSION).then(c => c.match(req).then(hit => {
        const net = fetch(req).then(res => { c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      }))
    );
    return;
  }

  // 同じサイトのファイル: 保存した版を優先
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
  }
});

// リマインド通知: サーバーからの合図（中身なし）を受けて、ここで文面を作る
const REMIND_LINES = [
  '今日の用語、まだだよ。3分だけいっしょにやろう！',
  'ぼくはここで待ってるよ。今日も1レッスンやってみない？',
  '連続記録をのばすチャンス！今日も1レッスンいこう',
  '宝箱の鍵のかけら、今日も集めよう！',
];
async function remindBody() {
  try {
    const r = await (await caches.open(STATE)).match(new URL('__state', self.registration.scope).href);
    if (r) {
      const d = new Date();
      const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const n = ((await r.json()).dues || []).filter(x => x <= today).length;
      if (n > 0) return 'おさらいが' + n + 'レッスンあるよ。忘れる前にいっしょにやろう！';
    }
  } catch (e) {}
  return REMIND_LINES[Math.floor(Math.random() * REMIND_LINES.length)];
}
self.addEventListener('push', e => {
  e.waitUntil(remindBody().then(body => self.registration.showNotification('モンテくんより', {
    body, icon: './icons/icon-192.png', tag: 'shakaringo-daily', data: { url: self.registration.scope },
  })));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.registration.scope) && 'focus' in c);
    return open ? open.focus() : clients.openWindow(self.registration.scope);
  }));
});
