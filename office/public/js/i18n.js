// Turkish / English for everything on screen. The language is switched on the cork board (TR | EN) and remembered.
// Pooled dialogue lines and the LED news carry both languages (written together by Gemini Flash on the server);
// everything else is a plain dictionary here. Missing English falls back to Turkish, never to an empty string.
(function () {
  'use strict';
  const DICT = {
    tr: {
      'hint': 'tekerlek: yakınlaş · sürükle: kaydır · masaya ya da karaktere tıkla',
      'zoom.in': 'Yakınlaştır', 'zoom.out': 'Uzaklaştır', 'zoom.fit': 'Sığdır', 'zoom.group': 'Yakınlaştırma',
      'canvas.label': 'Piksel art açık ofis: masalarda koordinatörler, pencere, LED haber ekranı',
      'toast.server': 'Sunucuya ulaşılamıyor.', 'toast.connecting': 'Sunucuya bağlanılıyor…',
      'confirm.location': 'Konum izni kaldırılsın mı? Hava durumu LED’den kalkar.',
      'geo.unsupported': 'Tarayıcı konumu desteklemiyor.', 'geo.denied': 'Konum izni verilmedi.',
      // board
      'board.loc.on': 'Konum: açık', 'board.loc.off': 'Konum: kapalı',
      'board.nearby': 'Yakın çevre', 'board.country': 'Türkiye',
      'board.feels': 'Hissedilen', 'board.humidity': 'Nem', 'board.wind': 'Rüzgâr', 'board.windUnit': 'km/s', 'board.rain': 'Yağış',
      'board.sunrise': 'Gün doğumu', 'board.sunset': 'batımı', 'board.today': 'Bugün', 'board.localTime': 'Yerel saat',
      'locale': 'tr-TR',
      // LED
      'led.news': 'GÜNDEM', 'led.todays': 'GÜNÜN HABERLERİ', 'led.ai': 'YAPAY ZEKÂ',
      'led.preparing': 'Günün başlıkları hazırlanıyor…', 'led.unreachable': 'Haber akışına ulaşılamıyor.', 'led.waiting': 'Güncel haber bekleniyor.',
      'led.weather': 'HAVA', 'led.noLocation': 'HAVA · konum izni gerekli', 'led.noWeather': 'HAVA · alınamadı',
      // name plates
      'tag.ready': 'hazır', 'tag.replying': 'yanıtlıyor', 'tag.session': 'oturum', 'tag.thinking': 'düşünüyor', 
      // chat
      'chat.label': 'Sohbet', 'chat.ready': 'Sohbete hazır', 'chat.replying': 'Yanıtlıyor', 'chat.close': 'Sohbeti kapat',
      'chat.resume': 'Resume kopyala', 'chat.resume.ok': 'Kopyalandı ✔', 'chat.resume.none': 'Oturum yok', 'chat.resume.fail': 'Kopyalanamadı',
      'chat.resume.title': 'Bu oturumu kendi terminalinde sürdürmek için komutu panoya kopyalar',
      'chat.cli': 'CLI çıktısı', 'chat.chat': 'Sohbet', 'chat.send': 'Gönder', 'chat.new': 'Yeni konuşma',
      'chat.placeholder': 'Mesaj yaz… (Enter gönderir, Shift+Enter yeni satır)', 'chat.message': 'Mesaj',
      'chat.note': 'Tek oturum: sen sıfırlamadıkça konuşma aynı CLI oturumunda sürer. Sohbet salt-okunurdur.',
      'chat.empty.desk': 'Henüz mesaj yok. Bu masada ne istediğini yaz.',
      'chat.preparing': 'Yanıt hazırlanıyor…', 'chat.terminal': 'Canlı CLI çıktısı',
      'chat.noCli': 'Henüz CLI çağrısı yok. Sohbetten mesaj gönderdiğinde CLI’ın çıktısı burada görünür.', 'chat.cliError': 'CLI çıktısına ulaşılamadı.',
      'chat.error': 'Hata',
      // popups
      'pop.news': 'Günün haberi', 'pop.newsDetail': 'Haber detayı', 'pop.closeNews': 'Haberi kapat', 'pop.closeTalk': 'Konuşmayı kapat', 'pop.talk': 'Simlerin konuşması',
      'pop.prev': '← Önceki', 'pop.next': 'Sonraki →', 'pop.item': 'Haber', 'pop.nav': 'Haberler',
      'pop.gemini': 'Gemini açıklaması · Başlık ve kaynak akışına dayanır',
      'pop.pending': 'Kısa açıklama hazırlanıyor…', 'pop.unavailable': 'Kısa açıklama şu anda hazır değil. Haberi kaynağından okuyabilirsin.',
      'pop.refreshing': 'Günün başlıkları hazırlanıyor…', 'pop.none': 'Henüz haber yok.', 'pop.talking': 'Konuşuyorlar…',
      'fb.label': 'Haber geri bildirimi', 'fb.question': 'Bu haber ilgini çekti mi?', 'fb.like': '👍 Beğendim', 'fb.dislike': '👎 İlgimi çekmedi', 'fb.rating': 'Değerlendirdiğim ',
      'fb.aria': 'Geri bildirim konusu', 'fb.topic': 'Konu', 'fb.source': 'Haber kaynağı', 'fb.repeat': 'Tekrar sıklığı', 'fb.style': 'Diyalog anlatımı',
      'fb.saving': 'Kaydediliyor…', 'fb.savedStyle': 'Kaydedildi · Sonraki diyalog üretimini etkiler.', 'fb.saved': 'Kaydedildi · Sonraki haber aramasını etkiler.',
      'fb.existing': 'Tercihin kayıtlı. Aynı düğmeyle geri alabilirsin.', 'fb.hint': 'Tercihin sonraki haber seçimlerine yön verir.',
      'fb.loadFail': 'Haber tercihi yüklenemedi.', 'fb.saveFail': 'Tercihin kaydedilemedi. Tekrar deneyebilirsin.',
      'topic.ai': 'Yapay zekâ', 'topic.technology': 'Teknoloji', 'topic.germany': 'Almanya', 'topic.turkey': 'Türkiye', 'topic.europe': 'Avrupa', 'topic.science': 'Bilim', 'topic.culture': 'Kültür', 'topic.business': 'İş dünyası', 'topic.general': 'Gündem',
      'tag.ai-agents': 'Otonom ajanlar', 'tag.model-releases': 'Yeni modeller', 'tag.coding-tools': 'Kodlama araçları', 'tag.ai-policy': 'AI düzenlemeleri', 'tag.chips': 'Çipler', 'tag.space': 'Uzay', 'tag.mobility': 'Ulaşım', 'tag.german-politics': 'Almanya siyaseti', 'tag.turkish-politics': 'Türkiye siyaseti', 'tag.careers': 'Kariyer', 'tag.design': 'Tasarım', 'tag.research': 'Araştırma',
      // weather
      'wmo.0': 'açık', 'wmo.2': 'az bulutlu', 'wmo.3': 'bulutlu', 'wmo.48': 'sisli', 'wmo.57': 'çiseliyor', 'wmo.67': 'yağmurlu', 'wmo.77': 'karlı', 'wmo.82': 'sağanak', 'wmo.86': 'kar sağanağı', 'wmo.99': 'fırtınalı',
    },
    en: {
      'hint': 'wheel: zoom · drag: pan · click a desk or a character',
      'zoom.in': 'Zoom in', 'zoom.out': 'Zoom out', 'zoom.fit': 'Fit', 'zoom.group': 'Zoom',
      'canvas.label': 'Pixel-art open office: coordinators at their desks, windows, an LED news screen',
      'toast.server': 'Cannot reach the server.', 'toast.connecting': 'Connecting to the server…',
      'confirm.location': 'Remove the location permission? The weather leaves the LED.',
      'geo.unsupported': 'This browser does not support location.', 'geo.denied': 'Location permission was not granted.',
      'board.loc.on': 'Location: on', 'board.loc.off': 'Location: off',
      'board.nearby': 'Nearby', 'board.country': 'Türkiye',
      'board.feels': 'Feels like', 'board.humidity': 'Humidity', 'board.wind': 'Wind', 'board.windUnit': 'km/h', 'board.rain': 'Rain',
      'board.sunrise': 'Sunrise', 'board.sunset': 'sunset', 'board.today': 'Today', 'board.localTime': 'Local time',
      'locale': 'en-GB',
      'led.news': 'NEWS', 'led.todays': 'TODAY’S NEWS', 'led.ai': 'AI',
      'led.preparing': 'Preparing today’s headlines…', 'led.unreachable': 'The news feed is unreachable.', 'led.waiting': 'Waiting for current news.',
      'led.weather': 'WEATHER', 'led.noLocation': 'WEATHER · location permission needed', 'led.noWeather': 'WEATHER · unavailable',
      'tag.ready': 'ready', 'tag.replying': 'replying', 'tag.session': 'session', 'tag.thinking': 'thinking', 
      'chat.label': 'Chat', 'chat.ready': 'Ready to chat', 'chat.replying': 'Replying', 'chat.close': 'Close chat',
      'chat.resume': 'Copy resume', 'chat.resume.ok': 'Copied ✔', 'chat.resume.none': 'No session', 'chat.resume.fail': 'Copy failed',
      'chat.resume.title': 'Copies the command that continues this session in your own terminal',
      'chat.cli': 'CLI output', 'chat.chat': 'Chat', 'chat.send': 'Send', 'chat.new': 'New conversation',
      'chat.placeholder': 'Write a message… (Enter sends, Shift+Enter adds a line)', 'chat.message': 'Message',
      'chat.note': 'One session: the conversation continues in the same CLI session until you reset it. Chat is read-only.',
      'chat.empty.desk': 'No messages yet. Tell this desk what you need.',
      'chat.preparing': 'Preparing the reply…', 'chat.terminal': 'Live CLI output',
      'chat.noCli': 'No CLI calls yet. When you send a message the CLI output shows up here.', 'chat.cliError': 'Could not reach the CLI output.',
      'chat.error': 'Error',
      'pop.news': 'News of the day', 'pop.newsDetail': 'News detail', 'pop.closeNews': 'Close the story', 'pop.closeTalk': 'Close the conversation', 'pop.talk': 'Colleagues talking',
      'pop.prev': '← Previous', 'pop.next': 'Next →', 'pop.item': 'Story', 'pop.nav': 'Stories',
      'pop.gemini': 'Gemini summary · based on the headline and the feed',
      'pop.pending': 'Preparing a short summary…', 'pop.unavailable': 'No short summary yet. You can read the story at its source.',
      'pop.refreshing': 'Preparing today’s headlines…', 'pop.none': 'No stories yet.', 'pop.talking': 'Talking…',
      'fb.label': 'News feedback', 'fb.question': 'Did this story interest you?', 'fb.like': '👍 Liked it', 'fb.dislike': '👎 Not interested', 'fb.rating': 'I am rating ',
      'fb.aria': 'Feedback topic', 'fb.topic': 'Topic', 'fb.source': 'Source', 'fb.repeat': 'Repetition', 'fb.style': 'Dialogue style',
      'fb.saving': 'Saving…', 'fb.savedStyle': 'Saved · shapes the next dialogue generation.', 'fb.saved': 'Saved · shapes the next news search.',
      'fb.existing': 'Your preference is saved. Press the same button to undo it.', 'fb.hint': 'Your preference steers the next news picks.',
      'fb.loadFail': 'Could not load the news preference.', 'fb.saveFail': 'Your preference was not saved. You can try again.',
      'topic.ai': 'AI', 'topic.technology': 'Technology', 'topic.germany': 'Germany', 'topic.turkey': 'Türkiye', 'topic.europe': 'Europe', 'topic.science': 'Science', 'topic.culture': 'Culture', 'topic.business': 'Business', 'topic.general': 'News',
      'tag.ai-agents': 'Autonomous agents', 'tag.model-releases': 'New models', 'tag.coding-tools': 'Coding tools', 'tag.ai-policy': 'AI regulation', 'tag.chips': 'Chips', 'tag.space': 'Space', 'tag.mobility': 'Mobility', 'tag.german-politics': 'German politics', 'tag.turkish-politics': 'Turkish politics', 'tag.careers': 'Careers', 'tag.design': 'Design', 'tag.research': 'Research',
      'wmo.0': 'clear', 'wmo.2': 'partly cloudy', 'wmo.3': 'cloudy', 'wmo.48': 'foggy', 'wmo.57': 'drizzle', 'wmo.67': 'rainy', 'wmo.77': 'snowy', 'wmo.82': 'showers', 'wmo.86': 'snow showers', 'wmo.99': 'stormy',
    },
  };

  let lang = 'tr';
  try { lang = localStorage.getItem('desk-lang') === 'en' ? 'en' : 'tr'; } catch { /* default */ }
  const listeners = new Set();
  const I = {
    get lang() { return lang; },
    t(key, vars) {
      let s = DICT[lang][key] ?? DICT.tr[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, v);
      return s;
    },
    set(next) {
      next = next === 'en' ? 'en' : 'tr';
      if (next === lang) return;
      lang = next;
      try { localStorage.setItem('desk-lang', next); } catch { /* optional preference */ }
      document.documentElement.lang = next;
      for (const fn of listeners) fn(next);
    },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** a bilingual pooled line → the turns to say in the current language (English falls back to Turkish) */
    line(l) {
      const src = lang === 'en' && l.en ? l.en : l;
      return { text: src.text, reply: src.reply, followUp: src.followUp, answer: src.answer };
    },
    hasEnglish: (l) => !!l.en,
    /** an agent's display name / desk label in the current language */
    name(A) { return A?.names?.[lang] ?? A?.name ?? ''; },
    short(A) { return A?.shorts?.[lang] ?? A?.short ?? ''; },
    /** an article headline / explanation in the current language */
    title(a) { return (lang === 'en' ? a?.titleEn : a?.titleTr) || a?.title || ''; },
    explanation(a) { return (lang === 'en' ? a?.explanationEn : a?.explanation) ?? null; },
    describe(code) {
      const keys = [0, 2, 3, 48, 57, 67, 77, 82, 86, 99];
      const k = keys.find((max) => code <= max);
      return k === undefined ? '' : I.t(`wmo.${k}`);
    },
    time: (iso, opts) => new Date(iso).toLocaleDateString(I.t('locale'), opts),
  };
  document.documentElement.lang = lang;
  window.OfficeI18n = I;
})();
