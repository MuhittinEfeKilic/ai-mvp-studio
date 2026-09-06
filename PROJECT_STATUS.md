# AI MVP Studio — Güncel Durum ve Handoff

Son güncelleme: 29 Ağustos 2026

### Son cihaz ortamı kararı

- Otomatik test hedefi Android Studio AVD'dir; LDPlayer'a özel ADB yolu ve
  entegrasyon kaldırılmıştır.
- Cihaz kapısı integration testten önce hedef paketi kaldırır ve AVD `/data` boş
  alanını kontrol eder. Varsayılan eşik 1536 MB'dir.
- Yetersiz alan ürün hatası değildir; gerçek boş/gerekli alanla birlikte
  `awaiting_device_test` durumuna geçer. Başka uygulama verileri otomatik silinmez.

Bu dosya sistemin **bugünkü hâlini** anlatır: hangi sözleşmeler bağlayıcıdır, hangi
kararlar bilinçli olarak verilmiştir, hangi ölçümler gerçek koşulardan gelir ve
hangi tuzaklara düşülmüştür. Kronolojik değişiklik geçmişi için `git log` kullanın.

## Mevcut durum

- Panel `npm start` ile `http://127.0.0.1:8000` adresinde çalışır.
- Boru hattı uçtan uca çalışır durumda ve **gerçek bir koşuda kanıtlanmıştır**:
  spec → planlama → paralel builder → kalite kapısı → cihaz kapısı → inceleme →
  kullanıcı onayı. Kullanıcı geri bildirimi turu da cihaz kapısından geçerek
  gerçek bir kusuru düzeltmiştir.
- Studio regresyonu: **88/88 test** (29 Ağustos 2026, Node 24.15).
  Yeni oturum bunu güncel ortamda yeniden doğrulamalıdır.

### Projeler

| Kimlik | Ad | Durum | Ne kanıtlıyor |
| --- | --- | --- | --- |
| `7b6df59adcb9` | Ders Notu (2. koşu) | `awaiting_user_review` | Yeni sözleşmelerin ilk gerçek doğrulaması; tek incelemede temiz geçti |
| `c67140223074` | Ders Notu (1. koşu) | `awaiting_user_review` | İlk tam uçtan uca başarı; cihaz kapısı PASS; feedback turu gerçek kusuru düzeltti |
| `b9c53b9a14bf` | Stok Cep | `failed` | Ortam arızası sınıflandırmasının doğduğu vaka (emülatör koptu, `aapt` çöktü) |
| `a87cfbf38ea4` | Servis Cep | `awaiting_user_review` | Foreign-key kusurunun bulunduğu vaka; elle düzeltildi, cihaz koşusu yapılmadı |
| `52ad9da29cd7`, `16fa069d6850`, `5a2c7dfb24a2` | Odak Mini, Odak Sayacı, Mini Kanban | eski | Cihaz kapısından önceki koşular; referans değeri sınırlı |

## Bağlayıcı sözleşmeler

Bunlar prompt ricası değil, kodda **mekanik olarak doğrulanan** sözleşmelerdir.
Değiştirmeden önce ilgili testi okuyun.

### Spec → repository sözleşmeleri

`createProject` onaylanmış spec'ten üç dosya üretip commit eder:

- `PROJECT_SPEC.md` — değişmeden saklanır, tek gerçek kaynak.
- `USER_FLOWS.json` — `Kritik Kullanıcı Akışları` bölümünden; her akış başlık, en az
  üç numaralı adım ve `- Beklenen sonuç:` satırı içermek zorundadır.
- `ACCEPTANCE_CRITERIA.json` — `Kabul Kriterleri` maddeleri `AC1..ACn` olarak.

Mobil profilde `device_test: "required"` zorunludur.

### Görev planı sözleşmesi (`src/task-plan.mjs`)

`TASK_PLAN.json` şu kurallara uymazsa reddedilir ve Coordinator'dan **gerekçesiyle
bir kez daha** istenir:

- Görev sayısı `builderTaskLimit` sınırını aşamaz (spec < 15.000 karakter ise 3,
  değilse 5). Bu sınır aynı anda Coordinator prompt'una da yazılır — ikisi
  ayrışırsa plan reddedilir ve proje kurtarılamaz hâle gelirdi.
- Birbirine bağlı **olmayan** görevler aynı yolları sahiplenemez. İç içe yollar da
  çakışma sayılır: `test/features/**` ile `test/features/detail/**` iki bağımsız
  göreve verilemez.
- Üç veya daha fazla görevli plan tamamen seri olamaz; en az iki görev birbirinden
  bağımsız olmalıdır.
- Hiçbir görev `pubspec.yaml`/`pubspec.lock` sahiplenemez; paketler plandaki
  `dependencies` alanında bildirilir, orchestrator `flutter pub add` ile kurar.
- Döngüsel bağımlılık reddedilir (eskiden scheduler'ı kilitlerdi).

### İnceleme sözleşmesi (`src/quality-report.mjs`)

Reviewer çıktısı şu şekli almak zorundadır ve `validateReviewerResult` doğrular:

```json
{"status":"PASS","summary":"...","criteria":[{"id":"AC1","status":"PASS","evidence":"..."}],
 "issues":[{"criterion":"AC1","file":"lib/x.dart:12","description":"..."}],"notes":["..."]}
```

- Her kabul kriteri yanıtlanmak zorundadır; eksik kriter reddedilir.
- **Bloklama yetkisi yalnız kabul kriterleriyle sınırlıdır.** FAIL sonucu en az bir
  kriteri FAIL işaretlemelidir; PASS sonucu FAIL kriter içeremez.
- Doğrulanamayan gözlemler `notes` alanına gider ve durumu değiştirmez.
- Bulgular hem düz metin hem `{file, description}` nesnesi olabilir;
  `normalizeReviewerFindings` ikisini de okunabilir metne çevirir.

Kriter dosyası olmayan eski projelerde `expectedCriteria` boş kalır ve doğrulama
zarifçe eski davranışa döner.

## Kapılar ve onarım döngüleri

| Kapı | Sahibi olduğu şey | Onarım turu | Erken durma |
| --- | --- | --- | --- |
| Kalite (`TEST_REPORT.json`) | `analyze`, `test`, `apk`, `diagnostics` | 3 | Aynı hata imzası iki turda tekrarlarsa → `ROOT_CAUSE_REPORT.md` |
| Cihaz (`DEVICE_REPORT.json`) | `flow_coverage`, `integration_test`, `apk_install`, `launch` | 2 | Aynı imza tekrarı veya düzeltilemez bulgu → `DEVICE_ROOT_CAUSE_REPORT.md` |
| İnceleme | Kabul kriterleri, akış bütünlüğü, kapsam | 2 | Bulgular değişmezse durur; gerekçe hataya yazılır |

Kapılar **yetkilidir**: reviewer bunların sonuçlarını yeniden yargılamaz, PASS'i
kanıt kabul eder. Her onarım turundan sonra kod değiştiği için alt kapılar yeniden
koşar.

Kalite kapısındaki dördüncü çek `src/source-diagnostics.mjs`'tir: üretilen Dart
kaynağında **boş catch bloğu** veya **hatayı ne inceleyen ne yeniden fırlatan**
blok arar. Dize interpolasyonu kod sayılır (`log('kayıt: $error')` kabul edilir);
`catch (_) { cleanup(); rethrow; }` de kabul edilir, çünkü hata korunur.

## Bilinçli kararlar

Bunlar tartışıldı ve bilerek böyle bırakıldı. Değiştirmeden önce nedenini okuyun.

- **Codex thread resume kullanılmıyor.** `paused_context` sonrası aynı thread'e
  dönmek tükenmiş context penceresine dönmek olurdu. `thread_id` yine kaydedilir.
- **Tanınmayan cihaz hatası `product` sayılır.** Aksi hâlde gerçek bir kusur
  sessizce bekleme durumuna park edilirdi.
- **Emülatör `device_test` şartını karşılar.** Fiziksel donanım istemek her koşuyu
  düşürürdü.
- **`UX_SPEC.md` rehberdir, sözleşme `PROJECT_SPEC.md`'dir.** UX agent'ı kabul
  listesine yalnız testle doğrulanabilir maddeleri koyar; ekran okuyucu, yazı
  ölçeği gibi manuel kontroller ayrı başlık altında öneridir.
- **Toolchain dosyaları ürün kapsamı dışıdır:** `android/app/src/debug/**`,
  `android/app/src/profile/**`, üretilmiş dosyalar, `test/scaffold_test.dart`.
  Debug manifesti INTERNET iznini meşru olarak taşır; ürün izinleri yalnız
  `android/app/src/main/AndroidManifest.xml`'dedir.
- **build-tools sürümü sabitlenmedi.** Bir kez görülen `aapt` çöküşü geçiciydi;
  preflight sağlık kontrolü kalıcı bir bozulmayı zaten yakalar.
- **`analyze` ve `test` paralelleştirilmedi.** Ölçüm analyze'ı 1.8s gösterdi;
  kazanç ~2s iken tüm kalite kapısını yeniden yapılandırma riski taşıyordu.
- **Teknik kapı ürün kabulü değildir.** Analyze/test/APK PASS, kritik akışların
  çalıştığını kanıtlamaz; cihaz kapısı bu yüzden hem ana hatta hem feedback
  turunda zorunludur.

## Ölçülmüş performans

Aynı `Ders Notu` spec'i iki kez koşuldu; ikinci koşu tüm yeni sözleşmelerle:

| Ölçüm | 1. koşu (`c67140223074`) | 2. koşu (`7b6df59adcb9`) |
| --- | --- | --- |
| Duvar saati | 2228s (ilk geçiş) | **1567s** |
| Toplam agent süresi | 2890s, 18 koşu | **1161s, 9 koşu** |
| Builder paralelliği | x1.45 | x1.43 |
| Yeni giriş / çıkış tokenı | 714k / 75k | **332k / 44k** |
| İnceleme | 6 koşu, 21dk, agent süresinin %44'ü | **1 koşu, 149s, %13** |
| Onarım turu | 2 kalite + 2 cihaz + inceleme thrash | 1 kalite, 0 cihaz, 0 inceleme |

İkinci koşuda kalite ve cihaz kapıları ilk denemede geçti, reviewer yedi kabul
kriterini de dosya düzeyinde kanıtla yanıtlayıp tek turda PASS verdi, plan ilk
seferde paralellik kurallarına uydu (`task_plan.rejected` yok).

Kazancın büyük kısmı hızlanmadan değil **boşa giden işin ortadan kalkmasından**
geliyor: birinci koşudaki altı inceleme turunun dördü, sonradan düzelttiğimiz
reviewer kusurlarındandı. Builder paralelliği iki koşuda da aynı; plan sözleşmesi
paralelliği artırmadı, **garanti altına aldı** — önceki nesilde (`Stok Cep`) aynı
tür plan x1.00'a düşüyordu.

## Bilinen tuzaklar

Bu oturumda gerçekten zaman kaybettiren şeyler:

1. **Kod değişikliği sunucu yeniden başlatılmadan devreye girmez.** Node modülleri
   süreç başlangıcında yükler. Bir resume, kaynak düzeltildiği hâlde eski kodla
   koşup aynı hatayı tekrarlamıştı. *(Panel HTML'i artık istek başına okunuyor,
   bu kural yalnız `src/*.mjs` için geçerli.)*
2. **Teşhis için `agent_runs.context_manifest` sütununa bakın.** Bir agent'a hangi
   belgelerin gerçekten gittiğini gösterir; reviewer'ın cihaz kanıtını görmediğini
   bu sütun kanıtladı.
3. **`spawnSync` event loop'u bloklar.** Bir agent'ı "paralel" başlatmak, araya
   bloklayan bir çağrı girerse işe yaramaz. Kalite ve cihaz kapılarının ikisi de
   artık asenkron `spawn` kullanır.
4. **Üretilen repository'lerde satır sonları karışıktır** (CRLF/LF). Bu dosyalara
   dokunan betikler satır sonundan bağımsız eşleşmelidir.
5. **`markStaleRunsInterrupted` kapsamı** `IN_FLIGHT_PROJECT_STATUSES` listesidir.
   Yeni bir ara durum eklerken bu listeye de ekleyin, yoksa proje kurtarılamaz.

## Maliyet koruması

Bir çalışma `MVP_STUDIO_PROJECT_TOKEN_BUDGET` (varsayılan 1.500.000) faturalanabilir
tokenı aşarsa boru hattı **bir sonraki agent'ı başlatmadan** durur ve proje
devam ettirilebilir biçimde `failed` olur. Faturalanabilir = cache dışı giriş +
çıkış. Kontrol agent'lar arasında yapılır; çalışan bir Codex'i öldürmek işini
kaybettirirdi.

Bütçe **kesintisiz bir çalışma** içindir: devam ettirmek yeni bir bütçe başlatır,
çünkü resume kullanıcının bilerek daha fazla harcama kararıdır. Ölçek için: temiz
bir `Ders Notu` koşusu ~376k, thrash'li ilk koşu ~789k faturalanabilir token
harcadı. `0` sınırı kapatır.

## Panel

Sekmeli, proje odaklı: **Genel · Agentlar · Pipeline · Etkinlik**.

- **Agentlar** — çalışan agent'lar için rol, görev, geçen süre, son çalıştırılan
  komut, dokunulan dosya sayısı; üstte toplam/meşgul süre ve örtüşme oranı, token
  bütçesi çubuğu, altında rol bazında süre ve token tablosu.
- **Etkinlik** — Codex olay akışı komut/dosya/mesaj/kapı/stderr filtreleriyle.
- **Genel** — kalite ve cihaz kapıları çek çek, kabul kriteri sonuçları, engelleyici
  olmayan notlar, onay ve geri bildirim eylemleri.

Yoklama, görünen veri değişmedikçe yeniden çizim yapmaz; açık panel, taslak metin ve
kaydırma konumu korunur. Olay uç noktası son 400 olayı döndürür.

## Açık kalan işler

1. **Review Repair ve önceki bulgu hafızası hâlâ gerçek koşuda tetiklenmedi.**
   Plan ve kabul kriteri sözleşmeleri 2. koşuda doğrulandı, ancak reviewer ilk turda
   PASS verdiği için onarım döngüsü ve geçmiş bulgu aktarımı çalışmadı. Bunlar yalnız
   birim testleriyle korunuyor. Zorlanacak bir şey değil; bir koşu reviewer'ı
   bloklarsa doğal olarak sınanır.
2. **Eski örnek projeler yeni sözleşmelerin gerisinde.** `Servis Cep` kritik akış
   sözleşmesinden önce üretildiği için `USER_FLOWS.json` ve `integration_test/`
   içermez; cihaz kapısı `isRepairableDeviceFailure` kuralıyla hemen durur. Elle
   akış eklemek yerine güncel spec'le yeniden üretmek doğru yol. `Stok Cep` ise
   yalnız ayakta bir emülatör bekliyor; kod tarafında iş yok.
3. **Tekrarlayan reviewer bulgularını mekanik kontrole çevirmek** — bu bir kural,
   açık iş değil. Sessiz `catch` için bir kez yapıldı ve reviewer'ı o konudan
   tamamen çıkardı; aynı bulgu ikinci kez görüldüğünde aynı yol izlenmelidir.

## Repository haritası

| Yol | Sorumluluk |
| --- | --- |
| `src/server.mjs` | HTTP API ve panel |
| `src/orchestrator.mjs` | Pipeline, kapılar, onarım döngüleri, iskelet üretimi |
| `src/codex-runner.mjs` | Codex süreci, timeout, JSONL olayları |
| `src/database.mjs` | SQLite; proje/görev/agent kayıtları ve durum sözleşmeleri |
| `src/spec-validator.mjs` | Spec doğrulama, kritik akış ve kabul kriteri ayrıştırma |
| `src/task-plan.mjs` | Plan sözleşmesi ve paralellik kuralları |
| `src/task-scheduler.mjs`, `src/task-worktree.mjs` | Hazır görev seçimi ve path izolasyonu |
| `src/quality-report.mjs` | Kalite raporu ve inceleme sözleşmesi |
| `src/source-diagnostics.mjs` | Üretilen Dart kaynağında sessiz hata yutma taraması |
| `src/device-tester.mjs` | Cihaz kapısı, arıza sınıflandırması, imza |
| `src/android-environment.mjs` | Emülatör başlatma, açılış bekleme, build-tools sağlığı |
| `src/context-packager.mjs` | Rol bazlı context paketleri |
| `src/mvp_studio/static/index.html` | Panel |

## Ayarlar

Tümü `.env.example` içinde. Eşzamanlılık üç ayrı sınırla yönetilir:
`MVP_STUDIO_MAX_CONCURRENT_RUNS` (proje), `MVP_STUDIO_MAX_PARALLEL_BUILDERS`
(proje içi builder), `MVP_STUDIO_MAX_CONCURRENT_AGENTS` (tüm sistemdeki Codex
süreci — diğer ikisinin çarpımını sınırlayan üst kapı). Tek Codex çağrısının süre
sınırı `MVP_STUDIO_CODEX_TIMEOUT_MS` (varsayılan 60 dakika), bir çalışmanın token
sınırı `MVP_STUDIO_PROJECT_TOKEN_BUDGET` (varsayılan 1.500.000, 0 = sınırsız).

## Hızlı komutlar

```powershell
cd C:\Users\efeklc\Documents\GitHub\ai-mvp-studio
npm start
npm run check
npm test
```

Sunucuyu durdurmak için çalışan terminalde `Ctrl+C` kullanın. `src/*.mjs`
değiştikten sonra sunucuyu **yeniden başlatın**.
