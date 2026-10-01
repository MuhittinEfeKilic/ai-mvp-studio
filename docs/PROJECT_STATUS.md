# AI MVP Studio — Güncel Durum ve Handoff

Son güncelleme: 29 Eylül 2026

## Nerede duruyoruz

Studio kişisel bir startup/MVP fabrikasıdır; hedef döngü **fikir → çalışan MVP →
yayınlanabilir MVP → gerçek kullanıcı → ölçülebilir geri bildirim → KILL / ITERATE /
SCALE**. Amacı ve optimize ettiği şeyler [README](../README.md) başında anlatılır.

Bu dosya sistemin **bugün ne olduğunu** anlatır. Denenip başarısız olmuş
yaklaşımlar, olumsuz ölçüm sonuçları ve tekrar edilmemesi gereken hatalar
[LESSONS.md](LESSONS.md) içindedir.

Bugün uygulanmış olan kısım **fikir → doğrulanmış MVP → ölçülmüş
yayınlanabilirlik**tir. Hat, onaylanmış bir spec'ten kalite ve cihaz kapılarını
geçmiş, incelenmiş bir uygulama üretir; koşunun sonunda uygulamanın tamamlanmamışlık
izleri deterministik olarak ölçülür; kabul edilmiş bir projede release hazırlığı
deterministik olarak ölçülür ve gerçek bir release APK üretilir.

**Yayınlama otomasyonu yoktur.** İmza anahtarı üretimi, mağaza yükleme, dağıtım,
analitik ve deney sözleşmeleri hâlâ yazılmadı ve bu dosyada var gibi
anlatılmamalıdır. Ölçülen şey yayınlanabilirlik; yapılan şey yayınlama değil.

**Tasarım hattı gerçek bir koşuda sınandı (1 Ekim 2026).** Aynı spec, aynı ürün,
tek değişen hat: `Seri Takip` sözleşmeden önce (`d3441c561fed`) ve sonra
(`81cfde18afe2`) üretildi.

| Proje | dosya | derinlik | hareket | köşe | çizim/gradient | tipografi | tema dışı sabit renk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Seri Takip — yeni hat (`81cfde18afe2`)** | 35 | 4 | 7 | 3 | **7** | 22 | 0 |
| **Seri Takip — eski hat (`d3441c561fed`)** | 57 | 4 | 8 | 5 | 2 | 25 | 0 |
| Sipariş Defteri (`99c447beb0d8`) | 52 | 4 | 7 | 15 | 0 | 35 | 0 |
| AboneCep (`1c30b97a4b89`) | 26 | 1 | 6 | 16 | 0 | 32 | 2 |
| Akış Cep (`1d95246c0382`) | 33 | 0 | 5 | 7 | 4 | 24 | 8 |
| Stok Cep (`b9c53b9a14bf`) | 43 | 0 | 4 | 2 | 0 | 17 | 2 |
| Servis Cep (`a87cfbf38ea4`) | 39 | 0 | 2 | 0 | 2 | 13 | 3 |

**Ölçülen getiri çizimde.** Çizim/gradient 2 → 7; kabul edilmiş iki uygulamada bu
sayı sıfırdı. Spec'in istediği `CustomPainter` boş durum çizimleri koda girdi.
Tipografi 35 dosyada 22 kullanım (eski hatta 57 dosyada 25), yani dosya başına
yoğunluk 0,44 → 0,63. Derinlik, hareket ve köşe yaklaşık sabit — ama sözleşme
`elevation: [0, 1, 6]` ile "liste ve takvim düz, yalnız diyalog ve snackbar
yükselir" kararını taşıyordu ve kod bunu uyguladı; buradaki düzlük eksiklik değil
karardır. `DESIGN_REPORT.json` durumu **`APPLIED`**, sıfır uyarı.

Sözleşmenin **koda yansımayan** tek tarafı imza öğesinin yerleşimi oldu: Seri
Halkası alışkanlık kataloğu satırlarında eksikti ve bunu hiçbir kapı değil,
**reviewer** yakaladı (AC10 FAIL). Sözleşme imza öğesini beyan ettirebiliyor,
nerede görüneceğini zorlayamıyor.

Hâlâ hiçbirinde özel font veya asset yok — sözleşme bunu zaten zorlamıyor, çünkü
ürün çevrimdışı ve agent sandbox'ının ağı yok.

### Cihaz hedefi politikası

Cihaz doğrulaması **desteklenen bir Android çalışma zamanına** karşı yapılır, tek
bir emülatör türüne değil. Üç hedef kategorisi desteklenir:

| Kategori | `type` | AVD wipe |
| --- | --- | --- |
| Android Studio AVD | `android_studio_avd` | uygulanır |
| Üçüncü taraf Android emülatörü | `third_party_emulator` | uygulanmaz |
| Fiziksel Android cihaz | `physical_device` | uygulanmaz |

- **Sıfırlama ölçüme bağlı ve iki kademeli.** Temizlikten sonra boş alan eşiğin
  (`MVP_STUDIO_DEVICE_RECLAIM_BELOW_MB`, varsayılan 3072 MB) üstündeyse hiçbir şey
  yapılmaz. Altındaysa kapı `studio_clean` anlık görüntüsünü **yerinde** yükler
  (ölçülen 3–5 sn, emülatör düşmez). Tam wipe (ölçülen 48 sn) yalnız koşunun
  sonunda ve bir kez çalışır; host `userdata-qemu.img.qcow2` dosyasını yalnız o
  küçültebilir.
- Hedef, cihaz edinildikten hemen sonra `detectDeviceTarget` ile sınıflandırılır ve
  `DEVICE_REPORT.json` içinde `target` alanında (tür, üretici, model, `ro.hardware`,
  Android sürümü) raporlanır; panelde cihaz kapısı kartının üstünde görünür.
- **`emulator-NNNN` kimliği AVD kanıtı değildir.** Üçüncü taraf emülatörler de bu
  kimliği alır, AVD konsol komutlarına yanıt vermez ve gerçek cihaz profili taklit
  eder. Sınıflandırma `ro.hardware` (goldfish/ranchu) ve qemu boot özellikleriyle
  yapılır. Hiçbir hedef olmadığı şeymiş gibi etiketlenmez.
- **AVD'ye özgü işlemler yalnız AVD hedefinde çalışır.** Bunlar snapshot
  sıfırlaması ve tam wipe'tır; diğer hedeflerde `SKIPPED`, gerekçesiyle birlikte.
  Yapılacak bir şey olmaması arıza değildir.
- Cihaz kapısı integration testten önce hedef paketi kaldırır ve `/data` boş
  alanını kontrol eder. Varsayılan eşik 1536 MB'dir.
- Yetersiz alan ürün hatası değildir; gerçek boş/gerekli alanla birlikte
  `awaiting_device_test` durumuna geçer. Başka uygulama verileri otomatik silinmez.
- **Test sonrası temizlik kapı değildir.** Hedef paket kaldırma, cihaz
  artefaktlarının silinmesi ve gerekiyorsa sıfırlama, ürün kararı verildikten
  sonra çalışır; sonuçları `housekeeping` altında (`app_cleanup`,
  `device_artifacts`, `avd_reset`) ve başarısızsa `notes` uyarısı olarak
  raporlanır, fakat geçmiş bir koşuyu WAITING'e düşüremez.

Bu dosya sistemin **bugünkü hâlini** anlatır: hangi sözleşmeler bağlayıcıdır, hangi
kararlar bilinçli olarak verilmiştir, hangi ölçümler gerçek koşulardan gelir ve
hangi tuzaklara düşülmüştür. Kronolojik değişiklik geçmişi için `git log` kullanın.

## Mevcut durum

- Panel `npm start` ile `http://127.0.0.1:8000` adresinde çalışır.
- Boru hattı uçtan uca çalışır durumda ve **gerçek bir koşuda kanıtlanmıştır**:
  spec → planlama → paralel builder → kalite kapısı → cihaz kapısı → inceleme →
  kullanıcı onayı. Kullanıcı geri bildirimi turu da cihaz kapısından geçerek
  gerçek bir kusuru düzeltmiştir.
- Mobil spec template'i v2'dir. Advanced projeler Architecture, UX, Data Contract
  ve Test Strategy planlarını dört ayrı worktree'de eşzamanlı üretir; Coordinator
  4–8 builder görevi ve en az dört genişliğinde ayrık bir görev grafiği oluşturur.
- Studio regresyonu: **235/235 test**. Cihaz temizliği ayrımı, cihaz hedefi
  sınıflandırması, AVD adı fallback'i, reviewer sözleşme düzeltmesi, Codex stdin
  arızası, bayat APK yedeği kurtarması, deterministik process timeout'u, event loop
  canlılığı, path-scoped commit davranışı, analiz şiddet politikası,
  spec/toolchain Android API uyumu, rol bazlı model seçimi, tasarım sözleşmesi ve
  tasarım uyum taraması, teslim artefaktının korunması, release hazırlık değerlendirmesi ve uygulama bütünlüğü
  taraması kapsanır.
- **Orchestrator commit'leri path-scoped'tur.** `commitPaths` hem "değişen var mı"
  sorusunu hem commit'i aynı yollarla sınırlar. Bunun öncesinde dar bir `git add`,
  bütün çalışma ağacına bakan `gitChanged()` ile korunuyordu; hattın sahibi olmadığı
  kirli bir dosya ikisini çelişkiye düşürüp git'i 1 koduyla düşürüyordu.
- **Analiz şiddet politikası:** `flutter analyze --no-fatal-infos`. Hata ve uyarı
  bloklar, `info` seviyesindeki stil önerisi bloklamaz ama raporda görünür.
- **Preflight spec/toolchain uyumunu sorar.** Spec'in istediği minimum Android
  API, kurulu Flutter'ın tabanının altındaysa koşu ilk agent başlamadan durur.
  Taban SDK kaynağından okunur; okunamazsa kontrol `SKIPPED`'tır.
- **`DEVICE_REPORT.json` artık agent artefaktı gibi commit edilmiyor.** Ana
  workspace'te toolchain'in yazdığı dosya, agent sınır ihlali sayılamaz.
- **Agent modeli rol bazında seçilebilir.** `MVP_STUDIO_AGENT_MODELS` ile
  `role=model[:effort]`; atanmayan rol bayrak almaz ve Codex yapılandırmasını
  kullanır. Bilinmeyen rol adı hata verir. `agent_runs` **istenen** değeri tutar,
  kullanılanı değil — `exec --json` akışı model bildirmiyor (ölçüldü).
- **Cihaz seçimi sabitlenebilir.** `MVP_STUDIO_AVD` ayarlıysa kapı yalnız o AVD'yi
  kullanır: adı doğrulanamayan bağlı cihazı benimsemez, gerekirse kendisi başlatır.
  Ayar boşken eski "listedeki ilk emülatör" davranışı sürer. Ayarlar `.env`
  dosyasından okunur.
- **Tasarım sözleşmesi zorunlu ve makinece denetleniyor.** UX agent'ı artık iki
  artefakt üretir: `UX_SPEC.md` ve `DESIGN_TOKENS.json`. İkincisi
  `src/design-tokens.mjs` tarafından doğrulanır: dokuz zorunlu renk rolü, beş
  kontrast çifti (metin 4.5:1, sınır 3:1, gerçek WCAG bağıl parlaklık hesabıyla),
  en az beş tipografi rolü, her rolde `lineHeight` ve `letterSpacing`, en az üç
  ayrık ağırlık ve üç ayrık boyut, boşluk/köşe/yükseklik ölçekleri, hareket süreleri
  ve adı konmuş bir **imza bileşeni**. Reddedilirse sözleşme gerekçesiyle **bir kez**
  düzeltme istenir; ikinci ret koşuyu düşürür — reddedilen `TASK_PLAN.json` ile
  aynı ilke. Bütün ihlaller tek seferde bildirilir ki tek düzeltme turu hepsini
  kapatabilsin.
- **Font ailesi kayıt, ölçek sözleşmedir.** Ürün sözleşmesi INTERNET iznini
  yasaklar, `google_fonts` yüzleri çalışma zamanında indirir ve agent sandbox'ının
  ağı yoktur — yani hiçbir agent font dosyası edinemez. Bu yüzden `font_family`
  *beyan edilmiş karar* olarak kaydedilir; zorlanan şey çevrimdışı gerçekten
  ulaşılabilir olan ve algılanan kalitenin çoğunu taşıyan kısımdır: gerçek bir
  boyut rampası, bilinçli satır yüksekliği, bilinçli harf aralığı ve birden çok ağırlık.
- **Tasarım uyumu ölçülür, zorlanmaz** (`src/design-diagnostics.mjs`).
  `DESIGN_REPORT.json`, sözleşmenin koda gerçekten yansıyıp yansımadığını sayar:
  kullanılmayan yükseklik/hareket/köşe ölçeği, koda hiç değmemiş tipografi rampası,
  tema dışına yazılmış sabit renk. **Kapı değildir ve hiçbir onarım turunu
  beslemez** — gerekçe [LESSONS.md → 4](LESSONS.md).
- **Cihaz testi kırılganlık taraması** (`src/integration-test-diagnostics.mjs`):
  metin girildikten sonra odak bırakılmadan/kaydırmadan yapılan varlık iddialarını
  bildirir. Kapı değildir; `DEVICE_REPORT.json` → `test_diagnostics` alanına yazılır
  ve kapı FAIL verdiğinde `notes` içine de geçer. Planlama, builder ve device repair
  prompt'ları aynı kuralı taşır.
- **Hiçbir toolchain komutu event loop'u bloke etmez.** Flutter, Gradle, adb ve
  aapt çağrılarının tamamı `async-process-runner` üzerinden çalışır; orchestrator
  içinde senkron kalan tek şey yerel Git plumbing'idir.

### Projeler

| Kimlik | Ad | Durum | Ne kanıtlıyor |
| --- | --- | --- | --- |
| `81cfde18afe2` | Seri Takip (2. koşu) | `awaiting_user_review` | Tasarım hattının ilk gerçek sınavı. `DESIGN_TOKENS.json` ilk denemede reddedildi (eksik `letterSpacing`), tek düzeltme turunda kabul edildi. Kalite PASS, cihaz 5/5 PASS, bütünlük `COMPLETE`, tasarım uyumu `APPLIED`. Reviewer 3 tur: imza öğesi eksikliği ve Review Repair'in bozduğu UTF-8 metni yakaladı, sonra AC1–AC11 PASS. 1.415.409 token |
| `99c447beb0d8` | Sipariş Defteri | `awaiting_user_review` | Bugüne kadarki en zor spec: üç varlık (Ürün · Sipariş · Sipariş Kalemi), 13 değişmez, 12 kabul kriteri, atomik stok onay/iptal. Kalite PASS, cihaz 8/8 PASS, bütünlük `COMPLETE`, reviewer AC1–AC12 hepsi PASS. İki parçada ~1,82M token; Codex limiti ve review-repair kusuru bu koşuda bulundu |
| `1c30b97a4b89` | AboneCep | `accepted` | Dört Studio kusurunun bulunup kapatıldığı vaka (info lint kapısı, pubspec commit'i, cihaz raporu commit'i, spec/toolchain API çelişkisi). Düzeltilmiş hatta yeniden koşuldu: 20 dk, 449k token, sekiz akış PASS, kullanıcı kabul etti |
| `1d95246c0382` | Akış Cep | `awaiting_device_test` | Final kodda 47/47 kalite testi, 6/6 emülatör akışı ve yenilenmiş reviewer PASS. Kayıt, temizliğin kapı olduğu dönemde oluştu; **veritabanı durumu bilerek değiştirilmedi**. Aynı koşu güncel semantikte PASS üretir (aşağıya bakın) |
| `7b6df59adcb9` | Ders Notu (2. koşu) | `awaiting_user_review` | Yeni sözleşmelerin ilk gerçek doğrulaması; tek incelemede temiz geçti |
| `c67140223074` | Ders Notu (1. koşu) | `awaiting_user_review` | İlk tam uçtan uca başarı; cihaz kapısı PASS; feedback turu gerçek kusuru düzeltti |
| `f87128fb48bf` | Bakım Takvimi | `interrupted` | Beş cihaz akışından dördü tamamlandıktan sonra Studio yeniden başlatıldığı için checkpoint'te durdu; son ölçümde 4973 MB boş alan vardı |
| `d3441c561fed` | Seri Takip | `failed` | Rol bazlı ucuz model denemesinin ölçüldüğü koşu. 1.038.597 token harcandı, çalışan uygulama çıkmadı; ucuz `repair` üç turda var olmayan Flutter API'siyle uğraştı. Deneme reddedildi — [LESSONS.md → 1](LESSONS.md) |
| `b9c53b9a14bf` | Stok Cep | `failed` | Eski cihaz koşusunda emülatör çevrimdışı kaldı ve prerelease `aapt` çöktü; kayıt güncel ortam sınıflandırmasından önce oluştu |
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
- `ACCEPTANCE_CRITERIA.json` — `Kabul Kriterleri`. İki biçim tanınır: `- ...`
  maddeleri (sırayla `AC1..ACn`) ve `### AC1 — Başlık` bölümleri (kimlik spec'ten
  okunur). Bölüm dolu ama ayrıştırılamıyorsa **engel**; kimlik tekrarı da engeldir.
  Sözleşme dosyaları her koşu başında `ensureSpecContracts` ile idempotent olarak
  onarılır, böylece eski projeler de kazanır; **mevcut dosya asla yeniden yazılmaz.**

Mobil profilde `device_test: "required"` zorunludur.

Spec v2 ayrıca özellik modülleri, iş kuralları, ekran durum matrisi, veri
sözleşmeleri, ürün-özel tasarım DNA/tokenları ve test izlenebilirliğini zorunlu
kılar. `complexity_tier` görev ölçeğini, `target_parallelism` ise validator'ın
kabul edeceği minimum grafik genişliğini belirler. V1 spec'ler eski davranışı korur.

### Tasarım sözleşmesi (`src/design-tokens.mjs`)

`DESIGN_TOKENS.json` UX aşamasında üretilir ve `validateDesignTokens` ile
doğrulanır. Sözleşmeyi karşılamayan çıktı **bir kez**, ihlallerin tamamı
listelenerek geri gönderilir; ikinci ret koşuyu düşürür.

- Dokuz zorunlu renk rolü: `surface`, `onSurface`, `surfaceVariant`,
  `onSurfaceVariant`, `primary`, `onPrimary`, `error`, `onError`, `outline`.
  Değerler `#RRGGBB` veya Flutter'ın `#AARRGGBB` biçiminde olmalıdır.
- Beş kontrast çifti gerçek WCAG bağıl parlaklık hesabıyla denetlenir: okunan her
  şey 4.5:1, `outline`/`surface` sınırı 3:1.
- En az beş tipografi rolü; her rolde `size`, `weight`, `lineHeight` (1.0–2.0) ve
  `letterSpacing` (−2…4). En az üç ayrık ağırlık ve üç ayrık boyut gerekir.
- Boşluk, köşe ve yükseklik ölçekleri artan ve geçerli olmalıdır; yükseklikte 0
  meşru bir kademedir ("her şey düz" bir tasarım kararıdır).
- `signature_element.surfaces` imza öğesinin göründüğü **en az iki** ekranı sayar.
  Koordinatör `DESIGN_TOKENS.json` okur ve bu listedeki her yüzeyi bir göreve
  dağıtmak zorundadır. Zorlanan şey **beyan**dır; kodun imza öğesini "kullandığını"
  saymak Goodhart'a açıktır, adı geçen bir widget eklemek ucuzdur.
- `font_family` ve adı/açıklaması olan bir **imza bileşeni** beyan edilir.
  Ailenin kendisi zorlanamaz — agent sandbox'ının ağı yok, `google_fonts` yüzleri
  çalışma zamanında indirir ve ürün sözleşmesi INTERNET iznini yasaklar — bu yüzden
  aile beyan, ölçek ise sözleşmedir.

Uyum ayrıca ölçülür (`DESIGN_REPORT.json`) ama **kapı değildir**; gerekçe
[LESSONS.md → 4](LESSONS.md).

### Görev planı sözleşmesi (`src/task-plan.mjs`)

`TASK_PLAN.json` şu kurallara uymazsa reddedilir ve Coordinator'dan **gerekçesiyle
bir kez daha** istenir:

- V1 spec'lerde görev üst sınırı içerik <15.000 karakterse 3, değilse 5'tir.
  V2'de `simple` 2–3, `standard` 3–5, `advanced` 4–8 görev üretir;
  `target_parallelism` kadar görevin gerçekten eşzamanlı çalışabilmesi gerekir.
- Birbirine bağlı **olmayan** görevler aynı yolları sahiplenemez. İç içe yollar da
  çakışma sayılır: `test/features/**` ile `test/features/detail/**` iki bağımsız
  göreve verilemez.
- Üç veya daha fazla görevli legacy plan tamamen seri olamaz; v2 planları ayrıca
  profile özgü minimum görev sayısı ve grafik genişliğini geçmek zorundadır.
- V2 planında yalnız sonraki bir seviyenin geniş olması yetmez;
  `target_parallelism` kadar root görev ilk builder dalgasında hazır olmalıdır.
  Tek foundation görevine bağlanan geniş fan-out planlar reddedilir.
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
- **Sözleşmeyi bozan çıktı projeyi düşürmez.** `INVALID_REVIEWER_RESULT`
  durumunda inceleme, somut ayrıştırma gerekçesiyle **bir kez** daha istenir —
  reddedilen `TASK_PLAN.json` ile aynı ilke. İkinci çıktı da geçersizse proje
  normal biçimde başarısız olur; döngü yoktur.

Kriter dosyası olmayan eski projelerde `expectedCriteria` boş kalır ve doğrulama
zarifçe eski davranışa döner.

## Kapılar ve onarım döngüleri

Cihaz akışları tek geçici Dart girişinde grup olarak kaydedilir ve tek test APK
kurulumuyla çalışır. Senaryo sonuçları JSON test olaylarından çıkarılır; skip veya
eksik kanıt PASS değildir. Test başına 120 saniye, toplamda 180 saniye + dosya
başına 120 saniye sınırı vardır. Teslim APK'sı test derlemesinden korunur ve normal
açılış için bir kez kurulur. Sonunda hedef paket kaldırılır ve uygunsa AVD
temizliği uygulanır; bu iki adım `housekeeping` altında raporlanır ve karara
karışmaz. Agent talimatları senaryo bazında kaynak/veri temizliği gerektirir.

Teslim APK'sı `<apk>.studio-backup` dosyasına kopyalanır ve test derlemesinden
sonra geri yüklenir. Studio bu iki adım arasında yeniden başlatılırsa yedek diskte
kalır; sonraki koşu onu **geri yükleyip siler**, çünkü yedek tanımı gereği bozulmamış
teslim APK'sıdır. Eskiden yedeğin üzerine yazmayı reddetmek o projedeki bütün
sonraki cihaz koşularını kalıcı olarak bloke ediyordu.

Gerçek Akış Cep toplu doğrulaması: 6 dosyada 7 senaryo PASS, teslim APK açılışı
ve hedef paket kaldırma PASS; cihaz kapısı 58.5 saniye. Kanıt:
`.tool_state/suite-live-report.json`. O koşu, temizliğin kapı sayıldığı dönemde
AVD adı okunamadığı için WAITING kaydedilmişti; **kayıt olduğu gibi bırakıldı**.
Aynı host bugün ölçüldüğünde `emulator-5554`'ün Android Studio AVD'si olmadığı
görüldü (`ro.hardware=qcom`, konsol portu reddediyor, qemu özellikleri boş), bu
yüzden temizlik artık `SKIPPED` ve aynı koşu **PASS** üretir.

Kalite kapısı analizi `--no-fatal-infos` ile koşar. `flutter analyze` her bulguda —
`info` dahil — 1 ile çıkar; bayrak olmadan tek bir stil önerisi `analyze`'ı FAIL
yapıyor, döngü ilk hatada kırıldığı için `test` ve `apk` hiç çalışmıyor ve üç
onarım turu da buna harcanıyordu. Info bulguları raporda ve
`QUALITY_LOGS/analyze.log` içinde durmaya devam eder; yalnız kapı kararını
değiştirmezler. Hata ve uyarı bloklamaya devam eder.

| Kapı | Sahibi olduğu şey | Onarım turu | Erken durma |
| --- | --- | --- | --- |
| Kalite (`TEST_REPORT.json`) | `analyze` (`--no-fatal-infos`), `test`, `apk`, `diagnostics` | 3 (review repair sonrası 2) | Aynı hata imzası iki turda tekrarlarsa → `ROOT_CAUSE_REPORT.md` |
| Cihaz (`DEVICE_REPORT.json`) | `flow_coverage`, `integration_test`, `apk_install`, `launch` | 2 | Aynı imza tekrarı veya düzeltilemez bulgu → `DEVICE_ROOT_CAUSE_REPORT.md` |
| İnceleme | Kabul kriterleri, akış bütünlüğü, kapsam | 2 | Bulgular değişmezse durur; gerekçe hataya yazılır |

Kalite kapısını PASS'e sürükleyen döngü tek yerdedir (`#settleQualityGate`) ve iki
yoldan da çağrılır: ana hat ve Review Repair sonrası. Eskiden ikincisi ilk seferde
PASS talep ediyordu; kod yazan bir agent'ın kendi düzeltmesiyle kapıyı kırması
hâlinde koşu **hiç onarım hakkı olmadan** ölüyordu.

Kapılar **yetkilidir**: reviewer bunların sonuçlarını yeniden yargılamaz, PASS'i
kanıt kabul eder. Her onarım turundan sonra kod değiştiği için alt kapılar yeniden
koşar. Device repair kodu değiştirdiyse eşzamanlı veya önceki checkpoint'ten gelen
reviewer mesajı da geçersiz kılınır; final kalite ve cihaz raporları commit edildikten
sonra reviewer yeniden tamamlanmadan proje kullanıcı onayına sunulamaz.

Her `DEVICE_REPORT.json` PASS, FAIL veya WAITING sonucunda orchestrator-owned ayrı
bir Git commit'ine alınır. Böylece rapor dependency/repair commit'lerine karışmaz ve
cihaz kapısı generated repository'yi kirli bırakmaz.

ADB hazırlık, APK install, launch, logcat, screenshot ve UI dump komutları 120
saniyelik ayrı timeout taşır. Takılan bir ADB işlemi ortak 10 dakikalık process
sınırını tüketmeden environment arızası olarak `awaiting_device_test` durumuna döner.

**Ölçülen ama kapı olmayan üç tarama var** ve bu ayrım bilinçlidir:
`src/app-completeness.mjs` (`APPLICATION_COMPLETENESS.json`),
`src/integration-test-diagnostics.mjs` (`DEVICE_REPORT.json` → `test_diagnostics`)
ve `src/design-diagnostics.mjs` (`DESIGN_REPORT.json`). Hiçbiri koşuyu düşürmez ve
hiçbiri bir onarım turuna girdi olmaz. Gerekçe Goodhart: bir tamir ajanına "şu
uyarıyı temizle" denseydi hat, ölçümü kapatmayı öğrenirdi — anlamsız bir gradient
ekleyip tasarım uyarısını geçmek, gerçek bir tasarım yapmaktan ucuzdur. Bulgu
insanın ve ekranı zaten yazan agent'ın önünde durur; sayı hedef hâline gelmez.

Kalite kapısındaki dördüncü çek `src/source-diagnostics.mjs`'tir ve **iki** şey
arar. Birincisi **boş catch bloğu** veya **hatayı ne inceleyen ne yeniden fırlatan**
blok. Dize interpolasyonu kod sayılır (`log('kayıt: $error')` kabul edilir);
`catch (_) { cleanup(); rethrow; }` de kabul edilir, çünkü hata korunur.

İkincisi **bozuk metin kodlaması**: bir agent ASCII dışı metni çift kodladığında
(`günlük` → `gÃ¼nlÃ¼k`, bayt düzeyinde `C3 83 C2 BC`) ortaya çıkan
`[Â-Å][\u0080-¿]` deseni. Analyze, test, APK ve bütünlük taraması
bunu göremez — mojibake geçerli Dart ve geçerli bir string'dir. Gerçek bir koşuda
reviewer yakaladı ve bedeli **106.506 token** oldu. Bu da bloklar, çünkü çıktı
kriteri tartışmasız: bir Dart kaynağında `Ã` + devam karakteri dizisi hiçbir zaman
kasıtlı değildir.

## Bilinçli kararlar

Bunlar tartışıldı ve bilerek böyle bırakıldı. Değiştirmeden önce nedenini okuyun.

- **Codex thread resume kullanılmıyor.** `paused_context` sonrası aynı thread'e
  dönmek tükenmiş context penceresine dönmek olurdu. `thread_id` yine kaydedilir.
- **Tanınmayan cihaz hatası `product` sayılır.** Aksi hâlde gerçek bir kusur
  sessizce bekleme durumuna park edilirdi.
- **Desteklenen her Android çalışma zamanı `device_test` şartını karşılar.**
  Android Studio AVD'si, üçüncü taraf emülatör ve fiziksel cihaz eşit derecede
  geçerli hedeftir; fiziksel donanım şartı koşmak her koşuyu düşürürdü. Hedefe
  özgü işlemler (bugün yalnız AVD wipe) yalnız o hedefte çalışır.
- **`UX_SPEC.md` rehberdir, sözleşme `PROJECT_SPEC.md`'dir.** UX agent'ı kabul
  listesine yalnız testle doğrulanabilir maddeleri koyar; ekran okuyucu, yazı
  ölçeği gibi manuel kontroller ayrı başlık altında öneridir.
- **Tasarım çeşitliliği rastgele tema seçimi değildir.** Template ürün-özel Tasarım
  DNA'sı, kaçınılacak klişeler ve imza öğesi ister; ortak tokenlar tutarlılık sağlar
  fakat ekranları tek bir yerleşim kalıbına zorlamaz.
- **Toolchain dosyaları ürün kapsamı dışıdır:** `android/app/src/debug/**`,
  `android/app/src/profile/**`, üretilmiş dosyalar, `test/scaffold_test.dart`.
  Debug manifesti INTERNET iznini meşru olarak taşır; ürün izinleri yalnız
  `android/app/src/main/AndroidManifest.xml`'dedir. Kalite kapısı debug/profile
  manifestlerinde VM Service için gereken izni eksikse idempotent biçimde geri yükler.
- **build-tools sürümü sabitlenmedi.** Bir kez görülen `aapt` çöküşü geçiciydi;
  preflight sağlık kontrolü kalıcı bir bozulmayı zaten yakalar.
- **`analyze` ve `test` paralelleştirilmedi.** Ölçüm analyze'ı 1.8s gösterdi;
  kazanç ~2s iken tüm kalite kapısını yeniden yapılandırma riski taşıyordu.
- **Teknik kapı ürün kabulü değildir.** Analyze/test/APK PASS, kritik akışların
  çalıştığını kanıtlamaz; cihaz kapısı bu yüzden hem ana hatta hem feedback
  turunda zorunludur.
- **Reviewer her turda yeniden koşar ve bu zayıflatılmadı.** 29 Eylül'de ölçüldü:
  kayıtlı **23 reviewer koşusunun hiçbiri** bir öncekiyle aynı HEAD'den
  başlamamış (`agent_runs.checkpoint_commit`). Yani tekrar diye bir şey yok;
  reviewer pahalı çünkü her tur gerçekten yeni koda bakıyor. Maliyet hedefi
  onarım turu sayısı olmalı, inceleme sıklığı değil.
- **Bütünlük taraması onarım döngüsüne bağlanmadı.** 11 üretilmiş depoda 13
  bulgu, **0 yanlış pozitif** — ama reviewer'a ulaşan hiçbir koşu `INCOMPLETE`
  değil; iki bulgu da başarısız/eski kayıtlardan. Bugün hiç tetiklenmeyecek bir
  onarım turu ölü kod olur ve yanında Goodhart riski taşır. Gerçek bir koşu
  `INCOMPLETE` verdiğinde yeniden değerlendirilir.
- **Otomatik resume yapılmıyor.** Duraklama artık doğru etiketlense de kullanıcı
  yokken devam etmek yeni bir token bütçesi penceresi açar; harcama kararı
  bilinçli olarak insanda kalır.
- **Eski örnek projeler yeniden üretilmiyor.** `Servis Cep` ve `Stok Cep`
  referans kayıttır; güncel sözleşmeleri sınamak için yeni bir spec koşulur,
  eski kayıt olduğu gibi bırakılır.
- **Tasarım sözleşmesi zorlanır, tasarım uyumu zorlanmaz.** Kontrast ve tipografi
  rampası mekanik olarak doğrulanabilir; "güzel mi" doğrulanamaz. Uyum taraması
  bu yüzden kapı değildir: optimize edilebilen her ölçüm optimize edilir ve
  ortaya çıkan şey iyi tasarım değil, ölçümü geçen tasarım olurdu.
- **Tekrarlayan reviewer bulgusu mekanik kontrole çevrilir.** Bu bir kural, açık
  iş değil. Sessiz `catch` için bir kez yapıldı (`source-diagnostics.mjs`) ve
  reviewer'ı o konudan tamamen çıkardı: deterministik bir kontrol, her koşuda aynı
  şeyi yargılayan bir agent turundan hem ucuz hem güvenilirdir. Aynı bulgu ikinci
  kez görüldüğünde aynı yol izlenmelidir.
- **Ucuz model rol bazında kullanılmıyor.** Yetenek kodda duruyor, `.env` boş.
  Gerçek bir koşuda ölçüldü ve hattı böldü; ayrım "mekanik / yargı" değil
  "bilgi gerektiren / gerektirmeyen" çıktı. Maliyet hedefi model kalitesi değil
  **koşu sayısı** olmalı — [LESSONS.md → 1](LESSONS.md).
- **Kurtarılabilir altyapı arızası koşuyu yok etmez.** Test sonrası temizlik,
  bozuk reviewer JSON'ı, kırılan Codex stdin pipe'ı ve yarım kalmış APK yedeği
  ürün kalitesi hakkında hiçbir şey söylemez; her biri ya uyarıya ya tek bir
  düzeltme turuna ya da deterministik kurtarmaya bağlanır. Gerçek ürün kusurları
  bu muameleyi görmez — onlar hâlâ kapıları bloklar.

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

## Doğrulama kanıtı arşivi

Tarihli ölçümler. Güncel test sayıları ve nasıl koşulacağı
[README → Doğrulama](../README.md#doğrulama) içindedir; burada **ne zaman neyin
kanıtlandığı** durur.

**Son doğrulama kanıtı (23 Eylül 2026):** `npm run check` başarılı (17 modül); tam paket
**163/163 PASS**. Yeni olan 8 test, gerçek bir koşuyu düşüren dört kusuru kapatır:
path-scoped commit (ilgisiz kirli dosyayla, yeni dosyayla ve silme ile) ve analiz
şiddet politikası. `flutter analyze` şiddet davranışı gerçek toolchain'de ölçüldü
(Flutter 3.44.6): tek bir `use_null_aware_elements` info bulgusu bayraksız **1**,
`--no-fatal-infos` ile **0** kodunda çıkar ve info her iki durumda da raporlanır.
Düzeltme, koşuyu gerçekten düşüren depo durumuna karşı da doğrulandı: `AboneCep`
(`1c30b97a4b89`) çalışma ağacında kirli `android/app/build.gradle.kts` dururken
`pubspec` commit'i artık fırlatmıyor, `false` dönüyor ve depoyu değiştirmiyor.

Aynı koşu iki kusur daha ortaya çıkardı ve ikisi de kapatıldı. Cihaz raporu
commit'i, kapıların tamamı PASS olduğu hâlde Flutter'ın gradle migration'ını agent
ihlali sanıp koşuyu düşürüyordu; artık path-scoped ve orchestrator testi bunu
toolchain'in gate ortasında dosya yeniden yazdığı senaryoyla doğruluyor. Spec ise
Flutter'ın desteklemediği bir Android API'si isteyebiliyordu; preflight bunu artık
ilk agent'tan önce engel olarak raporluyor. Flutter 3.44.6'nın tabanı SDK
kaynağından okundu: `minSdkVersionInt = 24`.

**Önceki doğrulama kanıtı (10 Eylül 2026):** tam paket **155/155 PASS**. Yeni olan
13 test uygulama bütünlüğü taramasını ve raporun hatta iliştirilmesini kapsar.

**Önceki doğrulama kanıtı (9 Eylül 2026):** tam paket 142/142 PASS.
Timeout/stability testleri 30 kez koşuldu, sıfır flake. `npm run test:minimal-live` uçtan uca PASS: tek gerçek
Codex çağrısı, 33.592 giriş / 16.512 cache / 194 çıkış tokenı (**17.274
faturalanabilir**), proje `accepted` durumuna ulaştı. Gerçek Windows toolchain'inde
`flutter --version` asenkron yoldan 2465 ms sürdü ve bu süre boyunca event loop 235 kez
tick attı.

**Gerçek Flutter release kanıtı (9 Eylül 2026):** `Akış Cep` (`1d95246c0382`)
üzerinde gerçek bir `flutter build apk --release` koşuldu. Sonuç `READY`: 98 saniye,
`com.aimvpstudio.akiscep` · Akış Cep · 1.0.0+1, 55.838.362 baytlık APK,
sha256 `b382a7a1…` (bağımsız olarak yeniden hesaplanıp doğrulandı), 0 engel,
2 uyarı (`product_description` iskelet varsayılanı, `signing` debug anahtarı).
Bu **gerçek toolchain kanıtıdır**; testlerdeki diğer release senaryoları enjekte
edilmiş derlemelerle çalışan simülasyondur.

**Gerçek üretilmiş uygulama kanıtı (10 Eylül 2026):** bütünlük değerlendiricisi `projects/`
altındaki 10 üretilmiş repository'ye (186 üretim Dart dosyası) uygulandı. Sekizi
`COMPLETE`; iki proje gerçek bir bulguyla `INCOMPLETE`: `1ddc9c6ed5ae` iskelet sayaç
uygulamasını hâlâ `lib/main.dart` içinde taşıyor, `b9c53b9a14bf` (`Stok Cep`) hareket
listesinde `onTap: () {}` ile hiçbir şey yapmayan bir satır içeriyor. Yanlış pozitif
yok. Kayıtlı projelerin durumu ve Git geçmişi bu ölçüm için değiştirilmedi.

## Bilinen tuzaklar

Bu oturumda gerçekten zaman kaybettiren şeyler. Kısa liste hâli
[LESSONS.md](LESSONS.md) içindedir; burası **kanıtlı ayrıntı** kaydıdır.

1. **Kod değişikliği sunucu yeniden başlatılmadan devreye girmez.** Node modülleri
   süreç başlangıcında yükler. Bir resume, kaynak düzeltildiği hâlde eski kodla
   koşup aynı hatayı tekrarlamıştı. *(Panel HTML'i artık istek başına okunuyor,
   bu kural yalnız `src/*.mjs` için geçerli.)*
2. **Teşhis için `agent_runs.context_manifest` sütununa bakın.** Bir agent'a hangi
   belgelerin gerçekten gittiğini gösterir; reviewer'ın cihaz kanıtını görmediğini
   bu sütun kanıtladı.
3. **Harici süreçlerde senkron çalıştırıcı kullanmayın.** Codex, Flutter/Gradle,
   adb ve aapt komutlarının **tamamı** `async-process-runner.mjs` üzerinden
   çalışır; timeout bütün süreç ağacını kapatır ve Windows `taskkill` için
   fallback uygular. Bir kez tetiklenen timeout sonucu kesindir: süreç
   sonlandırma sırasında gelen `close`/`error` olayları sonucu değiştirmez,
   yalnız `exit_during_termination` alanına teşhis için yazılır. Yerel Git
   plumbing'i (`spawnSync('git', …)`) bilinçli istisnadır — çevrimdışı ve
   milisaniyelik; `pipeline-stability` içindeki bekçi testi başka bir senkron
   toolchain çağrısı eklenmesini engeller.
4. **Üretilen repository'lerde satır sonları karışıktır** (CRLF/LF). Bu dosyalara
   dokunan betikler satır sonundan bağımsız eşleşmelidir.
5. **`markStaleRunsInterrupted` kapsamı** `IN_FLIGHT_PROJECT_STATUSES` listesidir.
   Yeni bir ara durum eklerken bu listeye de ekleyin, yoksa proje kurtarılamaz.
6. **Dar `git add` ile `gitChanged()` aynı soruyu sormaz.** `gitChanged()` çalışma
   ağacının kirli olup olmadığını, pathspec'siz `git commit` ise index'i sorar.
   Kimsenin staging'e almadığı bir dosya ikisini çelişkiye düşürür ve git
   "no changes added to commit" ile 1 kodunda çıkarak **koşuyu düşürür**. Gerçek
   vaka: Flutter tool'u ısınma derlemesi sırasında `android/app/build.gradle.kts`
   dosyasını yeniden yazıyor, devam eden koşuda zaten kurulu paketler `pubspec`'te
   değişiklik bırakmıyor, index boş kalıyor. Orchestrator'ın rapor commit'leri
   artık `commitPaths` üzerinden path-scoped'tur. `git add` eşleşmeyen bir
   pathspec'te de sert hata verir; yardımcı bu yüzden yalnız diskte var olan veya
   hâlâ tracked olan (silinme kaydı) yolları geçirir.
7. **`flutter analyze` `info` bulgusunda da 1 ile çıkar.** Çıkış kodunu tek
   başına PASS/FAIL'e çevirmek, tek bir stil önerisinin bütün kalite kapısını
   düşürmesi demekti. Şiddet politikası artık komutun kendisinde:
   `--no-fatal-infos`. Toolchain'in çıkış kodunu ürün kararına çevirirken hangi
   şiddetin bloklaması gerektiğini her zaman açıkça seçin.
8. **Codex durma nedenini stderr'e yazmaz.** Kullanım limiti ve context penceresi
   kendi JSONL akışından gelir (`type:"error"`, `type:"turn.failed"`). Yalnız
   stderr okuyan bir hata yolu, duraklamayı `Codex 1 çıkış koduyla sonlandı.`
   mesajına indirger; bu hiçbir duraklama kalıbına uymaz ve proje `paused_usage`
   yerine `failed` olur. Ölçülen koşu: `Sipariş Defteri` 1.075.521 token
   harcadıktan sonra Repair turunda limite takıldı ve yanlış etiketlendi.
   `codex-runner` artık akıştaki ilk hata mesajını hataya taşıyor.
9. **Toolchain ana workspace'i de değiştirir; agent sanmayın.** `#commitArtifact`
   "artefakt dışında kirli dosya varsa agent sınırı aşmıştır" der. Bu bir agent
   worktree'sinde doğrudur, ana workspace'te değildir: orada `flutter create`,
   `pub get`, `pub add`, ısınma derlemesi ve cihaz kapısı komutlarını
   orchestrator'ın kendisi çalıştırır. Gerçek koşuda bu, Flutter'ın gradle
   migration'ını `Agent izin verilmeyen dosyaları değiştirdi` diye raporlayıp
   bütün kapıları geçmiş bir koşuyu düşürdü ve cihaz sonucu kaydedilmeden kayboldu.
   `DEVICE_REPORT.json` artık `commitPaths` ile yazılıyor. **Kalan risk:**
   `TASK_PLAN.json` hâlâ ana workspace'te `#commitArtifact` ile commit ediliyor
   (`orchestrator.mjs:748`); Coordinator'dan önce toolchain bir dosya yazarsa aynı
   yanlış suçlama oradan gelir. Bugün tetiklenmedi, çünkü iskeletin `minSdk`
   değeri zaten migration'ın hedefi değil.
10. **Spec toolchain'in yasakladığını isteyebilir.** Flutter yalnız uyarmaz:
   `MinSdkVersionMigration` 16–23 arası her `minSdk` değerini Gradle'a dokunan her
   komutta geri yazar. Böyle bir gereksinim hiçbir onarım turuyla karşılanamaz;
   reviewer bloklar, repair düzeltir, kapı geri alır, turlar biter. Preflight artık
   bunu ilk agent'tan önce engelliyor. Yeni bir platform gereksinimi eklerken
   "toolchain bunu geri yazar mı" sorusunu sorun.
11. **Hata imzası filtresi analiz bulgularını görmüyordu.** `qualityFailureSignature`
   yalnız `error|failed|exception|…` kelimelerini taşıyan satırları alıyordu;
   `  info - … - rule_name` satırında bunların hiçbiri yok, bu yüzden bütün
   lint-only arızalar aynı boş imzaya hash'leniyordu — iki farklı lint "aynı hata"
   sayılıp onarım döngüsünü erken durdurabilirdi. Filtre artık analiz şiddet
   satırlarını da alıyor. `ROOT_CAUSE_REPORT.md` de iki farklı çıkışı ayırıyor:
   imza tekrarı ile tur üst sınırına ulaşma aynı cümleyle anlatılmıyor.
12. **Kalıcı kayıt, araçların sahibi olduğu dizinde durmamalı.** `artifact_path`
   `repository/build/app/outputs/flutter-apk/` altını gösteriyordu; oysa `build/`
   Flutter'ın istediği anda sildiği bir cache. 29 Eylül temizliğinde `projects/`
   24,6 GB'tan 1,56 GB'a indi ve bağlantıların kopmaması için dokuz APK'nın elle
   taşınıp aynı yola geri konması gerekti. **Kapatıldı:** `preserveArtifact`
   teslim APK'sını `projects/<id>/artifacts/` altına kopyalıyor, API
   `artifact_available` hesaplıyor, panel bayat bağlantıyı gizliyor ve mevcut
   dokuz kayıt taşındı. `build/` artık her proje için tamamen atılabilir.

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

Sekmeli, proje odaklı: **Genel · Çalışma · Doğrulama · Etkinlik**.

- **Çalışma** — mevcut agent görünümü, token/rol tabloları ve eski Pipeline
  görev ayrıntıları ile yeniden deneme eylemleri.
- **Genel** — durum, önerilen eylem, pipeline özeti ve dört proje ölçümü.
- **Doğrulama** — kalite, cihaz, kriterler, uygulama bütünlüğü, release ve ayrı
  ortam/temizlik bölümleri; kanıtlar ve ham raporlar açılır ayrıntılarda.
- **Etkinlik** — mevcut filtreli olay akışı.

Yoklama, görünen veri değişmedikçe yeniden çizim yapmaz; açık panel, taslak metin ve
kaydırma konumu korunur. Olay uç noktası son 400 olayı döndürür.

## Henüz kanıtlanmamış olanlar

Açık işlerin listesi ve öncelik sırası **tek yerde**, [TODO.md](TODO.md)
içindedir. Burada yalnız durum kaydı var: bugüne kadar **neyin kanıtı yok**.

- **`signature_element.surfaces` sözleşmesi gerçek koşuda sınanmadı.** Alan
  zorunlu hâle getirildi ve koordinatör prompt'una bağlandı, ama imza öğesinin
  gerçekten her yüzeye konup konmadığı ancak bir sonraki koşuda görülecek.
- **Mojibake kontrolü gerçek koşuda tetiklenmedi.** Ölçülen vakaya karşı
  doğrulandı ve birim testleri her Türkçe harfi kapsıyor, fakat canlı bir
  bozulmayı henüz yakalamadı.
- **Reviewer'ın önceki bulgu hafızası tetiklenmedi.** Review Repair'in kendisi
  tetiklendi ve ölçüldü: `Sipariş Defteri` koşusunda reviewer AC11'i FAIL verdi
  (semantik renk tokenları ana ekranlarda uygulanmamıştı), Review Repair düzeltmeyi
  yaptı ve bu sırada dört widget testini kırdı — kapıya onarım hakkı veren
  `#settleQualityGate` düzeltmesi bu vakadan çıktı. Ama **ikinci reviewer turuna
  geçen geçmiş bulgu aktarımı** çalışmadı; yalnız birim testleriyle korunuyor.
  Zorlanacak bir şey değil; bir koşu reviewer'ı iki kez bloklarsa doğal olarak
  sınanır.
- **`Akış Cep` kaydı `awaiting_device_test` olarak duruyor ve öyle bırakılacak.**
  Kayıtlı raporda üç ürün kontrolü de PASS; `WAITING` yalnız temizliğin kapı
  sayıldığı dönemden geliyor ve o semantiğin değiştiği canlı `wipeAvdAfterTest`
  ölçümüyle doğrulandı. Yeniden koşmak kapalı bir soruyu tekrar sormaktır; cihaz
  kapısı güncel kodla zaten bir sonraki uçtan uca koşuda sınanacak.
- **Yeni "uydurma API yazma" kuralının işe yarayıp yaramadığı ölçülmedi.** Prompt
  kuralı deterministik garanti değildir; sonraki koşuda API kaynaklı analyzer
  hatası sayısı düşmezse mekanik bir kontrole çevrilmelidir.

## Bilerek ertelenenler

Bunlar gerçek fakat MVP çıktısını, güvenilirliği, maliyeti veya pazar testini
bugün iyileştirmiyor. Kayda geçiyorlar ki tekrar keşfedilmesinler.

- **`#execute` hata yolunda `#syncProjectState` çağırmıyor.** Feedback yolu çağırıyor.
  Sonuç: bir hata sonrası `PROJECT_STATE.json` bayat kalır. Bu dosya yalnız agent
  context'i içindir ve resume başlangıcında yeniden yazılır, yani gözlenen bir
  arızaya yol açmadı.
- **Planlama agent'ları resume'da görev durumuna değil dosya varlığına bakıyor.**
  `integration`/`reviewer` için kullanılan `#taskCompleted` kontrolü planlama
  aşamasında yok; worktree kirliyse tamamlanmış bir agent yeniden koşabilir.
  Pratikte `#commitArtifact` worktree'yi temiz bıraktığı için tetiklenmedi.
- **Kabul kriteri metni API’de eksik.** Doğrulama görünümü reviewer
  verdict'indeki `text` alanını kullanır; sözleşmenin şekli `{id, status, evidence}` ve
  `ACCEPTANCE_CRITERIA.json` API'de hiç servis edilmiyor, bu yüzden kriter satırında
  yalnız kimlik görünüyor. Kanıt metni ayrıca gösteriliyor, bilgi kaybı sınırlı.
- **`server.mjs` sözleşme hatalarına 500 dönüyor.** "Bu proje X durumundayken devam
  ettirilemez" gibi durumlar 409/422 olmalı. Panel mesajı yine gösteriyor.
- **HTTP katmanının test kapsamı yok.** 142 testin hiçbiri `server.mjs` üzerinden
  geçmiyor; ayrıca modül import edilir edilmez `listen` çağırdığı için exported
  `createServer` test içinden güvenle kullanılamıyor.

## Uygulama bütünlüğü

Kapılar "çalışıyor mu" sorusunu yanıtlar; bu ölçüm **"bitmiş görünüyor mu"** sorusunun
mekanik olarak savunulabilir kısmını yanıtlar. Sözleşmesi `src/app-completeness.mjs`,
raporu üretilen repository kökündeki `APPLICATION_COMPLETENESS.json`, kopyası
`projects.completeness_report` sütununda.

**Neden kapı değil.** İlk dilim yalnız ölçer. Kapıya çevirmek tek bir yanlış pozitifin,
kalite ve cihaz kapılarını geçmiş bir koşuyu öldürmesine izin verirdi; ayrıca kabul
edilmiş geçmiş projeleri geriye dönük olarak eksik gösterirdi. Ölçüm proje durumunu,
kapı sonuçlarını ve kabul akışını değiştirmez, otomatik onarım tetiklemez. Ölçümün
kendisi başarısız olursa bu da ürün hakkında bir şey söylemez: olay olarak
(`application_completeness.failed`) kaydedilir ve hat devam eder.

**Nerede çalışır.** Ana hatta reviewer PASS verdikten sonra ve geri bildirim turunun
sonunda, `awaiting_user_review` durumuna geçmeden hemen önce. Yalnız dosya okur;
toolchain komutu, cihaz veya agent turu maliyeti yoktur. Rapor, release raporu gibi
path'e sınırlı ayrı bir commit'e alınır ve üretilen repository'yi temiz bırakır.

**Kapsam.** Yalnız `lib/` altındaki üretim kaynağı. `test/`, `integration_test/`,
üretilmiş dosyalar ve toolchain dosyaları taranmaz; oralarda stub ve boş geri çağrı
meşrudur.

**Şiddet anlamı.** `blocker` = mekanik olarak savunulabilir tamamlanmamışlık olgusu
(kod hâlâ şablon, kontrol hiçbir şey yapmıyor, yol `UnimplementedError` fırlatıyor,
kullanıcı metni yer tutucu) → `INCOMPLETE`. `warning` = gerçek iz, ama bilinçli bir
karar olabilir; durumu asla değiştirmez. `info` = yargısız kayıt.

| Kontrol | Şiddet | Ne arar |
| --- | --- | --- |
| `scaffold_remnant` | blocker | `MyHomePage`, `_incrementCounter`, `Flutter Demo`, "You have pushed the button" |
| `noop_interaction` | blocker | Boş fonksiyona bağlı eylem geri çağrısı |
| `unimplemented_stub` | blocker | Üretim kodunda `UnimplementedError` |
| `placeholder_copy` | blocker | `lorem ipsum`, `coming soon`, yalnız "Yakında" yazan etiket, `not implemented`, `placeholder`/`dummy`/`TBD` |
| `unfinished_marker` | warning | `TODO` / `FIXME` / `HACK` |

**Yanlış pozitif politikası.** Kaynak kod/yorum/dize parçalarına ayrıştırılır ve
interpolasyon kod olarak okunur, bu yüzden yorumdaki kesme işareti veya URL'deki `//`
taramayı bozmaz. `onPressed: null` bulgu değildir (devre dışı kontrol).
`onChanged`/`onSaved` gibi değer geri çağrıları, sqflite yaşam döngüsü kancaları
(`onCreate`, `onUpgrade`, `onOpen` …) ve `*Changed`/`*Update`/`*Invoked` ile biten
adlar kapsam dışıdır. Gövdesi yalnız açıklama içeren boş geri çağrı uyarıdır.
`debugPrint` **bilerek** kapsam dışıdır: kaynak teşhis sözleşmesi hatanın yüzeye
çıkarılmasını istiyor, aynı satırı "debug artığı" saymak kendi sözleşmemizle çelişirdi.

**Spec farkındalığı.** `PROJECT_SPEC.md` yer tutucu dizenin birebir kendisini
içeriyorsa bulgu uyarıya düşer ve `spec_permitted` işaretlenir. Karşılaştırma dizenin
tamamı üzerindedir; spec'in sözcüğü geçiyor olması gerçek bir "yakında" ekranını
susturmaz.

**Gerçek üretilmiş uygulama kanıtı (10 Eylül 2026):** değerlendirici `projects/`
altındaki 10 repository'ye (186 üretim Dart dosyası) uygulandı. Sekizi `COMPLETE`;
`1ddc9c6ed5ae` hâlâ iskelet sayaç uygulamasını taşıdığı için, `b9c53b9a14bf`
(`Stok Cep`) hareket listesindeki `onTap: () {}` yüzünden `INCOMPLETE`. Yanlış pozitif
yok. Kayıtlı projelerin durumu, kaydı ve Git geçmişi bu ölçüm için **değiştirilmedi**;
ölçüm scratchpad'de çalıştırıldı.

**Kapsam dışı bırakılanlar (bilinçli).** Ölü uçlu navigasyon, eksik yükleniyor/boş/hata
durumları, doğrulanmayan formlar, kalıcılık eksikleri ve kısmen uygulanmış özellikler.
Bunların bir kısmı kabul kriterleri, cihaz kapısı ve reviewer tarafından zaten
kapsanıyor; kalanı deterministik olarak ölçülebilir hâle gelmeden eklenmeyecek.
`pubspec.yaml` açıklamasının iskelet varsayılanı olması ve `com.example` kimliği
release hazırlığında zaten kontrol edildiği için burada tekrarlanmaz.

## Release hazırlığı

Kabul edilmiş bir projede elle tetiklenen, tamamen deterministik bir ölçüm.
Sözleşmesi `src/release-readiness.mjs`, raporu üretilen repository kökündeki
`RELEASE_READINESS.json`, kopyası `projects.release_report` sütununda.

**Neden proje durumu değil.** Yeni bir durum `IN_FLIGHT_PROJECT_STATUSES`,
`RESUMABLE_PROJECT_STATUSES`, `markStaleRunsInterrupted` ve bütün resume
yollarından geçirilmek zorunda kalırdı; ayrıca geçmişteki `accepted` projeleri
geriye dönük olarak eksikmiş gibi gösterirdi. Kullanıcının istediğinde sorduğu bir
soru için bu karmaşıklık gereksizdi. Değerlendirme projeyi `busyProjects` üzerinden
kilitler (release derlemesi resume'un kullanacağı worktree'ye yazar) ama durumu
değiştirmez.

**Şiddet anlamı.** `blocker` = tek cümleyle savunulabilir, mekanik olarak
doğrulanan ve artefaktı harici kullanıcı için kullanılamaz/yanlış kimlikli yapan
olgu. `warning` = gerçek eksik, ama APK'yı bir test kullanıcısına vermeyi
engellemez; durumu asla değiştirmez. `info` = yargısız kayıt.

**İmza gerçeği.** Flutter şablonu release derlemesini debug anahtarıyla imzalar.
Rapor bunu `signing.state: "debug_signing"` ve
`store_distribution_verified: false` olarak bildirir. Studio anahtar üretmez,
parola/keystore saklamaz, Play App Signing yapılandırmaz. `READY` yalnız
**sideload ile harici teste verilebilir** demektir.

**Gerçek toolchain kanıtı (9 Eylül 2026):** `Akış Cep` üzerinde gerçek
`flutter build apk --release` koşuldu → `READY`, 98 saniye, 55.838.362 baytlık APK,
sha256 `b382a7a10649ec3e5697a53b213a7597c051ce53bd088110e30dd9f8a1680010` (bağımsız
olarak yeniden hesaplandı), 0 engel, 2 uyarı (`product_description`, `signing`).
Üretilen repository build sonrası temiz kaldı. Rapor scratchpad'e yazıldı; projenin
kaydı ve Git durumu bilerek değiştirilmedi.

## Planlanan yön (henüz uygulanmadı)

Sıradaki adım gerçek dağıtım tarafıdır. Bunların **hiçbiri bugün mevcut değildir**:
imzalama/keystore otomasyonu, mağaza yükleme, store listing üretimi, dağıtım
otomasyonu, analitik, crash reporting, faturalama, deney sözleşmeleri veya pazar
deneyi panoları.

## Harita, ayarlar ve komutlar

Tekrar tutulmaz; tek kaynakları:

- Repository haritası (hangi modül neyi yapar):
  [README → Repository haritası](../README.md#repository-haritası)
- Ortam değişkenleri ve eşzamanlılık sınırları: [.env.example](../.env.example),
  özet [README → Çalıştırma](../README.md#çalıştırma)
- Kurulum, çalıştırma ve doğrulama komutları:
  [README → Çalıştırma](../README.md#çalıştırma) ve
  [README → Doğrulama](../README.md#doğrulama)
- Panel sekmeleri ve bilgi hiyerarşisi:
  [UI_DESIGN_SYSTEM.md](UI_DESIGN_SYSTEM.md) §12–§15
- Aşama ve kapı ayrıntıları: [PIPELINE.md](PIPELINE.md)
