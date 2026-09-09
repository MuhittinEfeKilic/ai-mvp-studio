# AI MVP Studio — Güncel Durum ve Handoff

Son güncelleme: 9 Eylül 2026

## Nerede duruyoruz

Studio kişisel bir startup/MVP fabrikasıdır; hedef döngü **fikir → çalışan MVP →
yayınlanabilir MVP → gerçek kullanıcı → ölçülebilir geri bildirim → KILL / ITERATE /
SCALE**. Amacı ve optimize ettiği şeyler [README](README.md) başında anlatılır.

Bugün uygulanmış olan kısım **fikir → doğrulanmış MVP → ölçülmüş
yayınlanabilirlik**tir. Hat, onaylanmış bir spec'ten kalite ve cihaz kapılarını
geçmiş, incelenmiş bir uygulama üretir; kabul edilmiş bir projede release hazırlığı
deterministik olarak ölçülür ve gerçek bir release APK üretilir.

**Yayınlama otomasyonu yoktur.** İmza anahtarı üretimi, mağaza yükleme, dağıtım,
analitik ve deney sözleşmeleri hâlâ yazılmadı ve bu dosyada var gibi
anlatılmamalıdır. Ölçülen şey yayınlanabilirlik; yapılan şey yayınlama değil.

### Cihaz hedefi politikası

Cihaz doğrulaması **desteklenen bir Android çalışma zamanına** karşı yapılır, tek
bir emülatör türüne değil. Üç hedef kategorisi desteklenir:

| Kategori | `type` | AVD wipe |
| --- | --- | --- |
| Android Studio AVD | `android_studio_avd` | uygulanır |
| Üçüncü taraf Android emülatörü | `third_party_emulator` | uygulanmaz |
| Fiziksel Android cihaz | `physical_device` | uygulanmaz |

- Hedef, cihaz edinildikten hemen sonra `detectDeviceTarget` ile sınıflandırılır ve
  `DEVICE_REPORT.json` içinde `target` alanında (tür, üretici, model, `ro.hardware`,
  Android sürümü) raporlanır; panelde cihaz kapısı kartının üstünde görünür.
- **`emulator-NNNN` kimliği AVD kanıtı değildir.** Üçüncü taraf emülatörler de bu
  kimliği alır, AVD konsol komutlarına yanıt vermez ve gerçek cihaz profili taklit
  eder. Sınıflandırma `ro.hardware` (goldfish/ranchu) ve qemu boot özellikleriyle
  yapılır. Hiçbir hedef olmadığı şeymiş gibi etiketlenmez.
- **AVD'ye özgü işlemler yalnız AVD hedefinde çalışır.** Bugün bu yalnız wipe'tır;
  diğer hedeflerde `SKIPPED`, gerekçesiyle birlikte. Yapılacak bir şey olmaması
  arıza değildir.
- Cihaz kapısı integration testten önce hedef paketi kaldırır ve `/data` boş
  alanını kontrol eder. Varsayılan eşik 1536 MB'dir.
- Yetersiz alan ürün hatası değildir; gerçek boş/gerekli alanla birlikte
  `awaiting_device_test` durumuna geçer. Başka uygulama verileri otomatik silinmez.
- **Test sonrası temizlik kapı değildir.** Hedef paket kaldırma ve AVD wipe,
  ürün kararı verildikten sonra çalışır; sonuçları `housekeeping` altında ve
  `notes` uyarısı olarak raporlanır, fakat geçmiş bir koşuyu WAITING'e düşüremez.

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
- Studio regresyonu: **142/142 test**. Cihaz temizliği ayrımı, cihaz hedefi
  sınıflandırması, AVD adı fallback'i, reviewer sözleşme düzeltmesi, Codex stdin
  arızası, bayat APK yedeği kurtarması, deterministik process timeout'u, event loop
  canlılığı ve release hazırlık değerlendirmesi kapsanır.
- **Hiçbir toolchain komutu event loop'u bloke etmez.** Flutter, Gradle, adb ve
  aapt çağrılarının tamamı `async-process-runner` üzerinden çalışır; orchestrator
  içinde senkron kalan tek şey yerel Git plumbing'idir.

### Projeler

| Kimlik | Ad | Durum | Ne kanıtlıyor |
| --- | --- | --- | --- |
| `1d95246c0382` | Akış Cep | `awaiting_device_test` | Final kodda 47/47 kalite testi, 6/6 emülatör akışı ve yenilenmiş reviewer PASS. Kayıt, temizliğin kapı olduğu dönemde oluştu; **veritabanı durumu bilerek değiştirilmedi**. Aynı koşu güncel semantikte PASS üretir (aşağıya bakın) |
| `7b6df59adcb9` | Ders Notu (2. koşu) | `awaiting_user_review` | Yeni sözleşmelerin ilk gerçek doğrulaması; tek incelemede temiz geçti |
| `c67140223074` | Ders Notu (1. koşu) | `awaiting_user_review` | İlk tam uçtan uca başarı; cihaz kapısı PASS; feedback turu gerçek kusuru düzeltti |
| `f87128fb48bf` | Bakım Takvimi | `interrupted` | Beş cihaz akışından dördü tamamlandıktan sonra Studio yeniden başlatıldığı için checkpoint'te durdu; son ölçümde 4973 MB boş alan vardı |
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
- `ACCEPTANCE_CRITERIA.json` — `Kabul Kriterleri` maddeleri `AC1..ACn` olarak.

Mobil profilde `device_test: "required"` zorunludur.

Spec v2 ayrıca özellik modülleri, iş kuralları, ekran durum matrisi, veri
sözleşmeleri, ürün-özel tasarım DNA/tokenları ve test izlenebilirliğini zorunlu
kılar. `complexity_tier` görev ölçeğini, `target_parallelism` ise validator'ın
kabul edeceği minimum grafik genişliğini belirler. V1 spec'ler eski davranışı korur.

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

| Kapı | Sahibi olduğu şey | Onarım turu | Erken durma |
| --- | --- | --- | --- |
| Kalite (`TEST_REPORT.json`) | `analyze`, `test`, `apk`, `diagnostics` | 3 | Aynı hata imzası iki turda tekrarlarsa → `ROOT_CAUSE_REPORT.md` |
| Cihaz (`DEVICE_REPORT.json`) | `flow_coverage`, `integration_test`, `apk_install`, `launch` | 2 | Aynı imza tekrarı veya düzeltilemez bulgu → `DEVICE_ROOT_CAUSE_REPORT.md` |
| İnceleme | Kabul kriterleri, akış bütünlüğü, kapsam | 2 | Bulgular değişmezse durur; gerekçe hataya yazılır |

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

## Bilinen tuzaklar

Bu oturumda gerçekten zaman kaybettiren şeyler:

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
- **Genel** — kalite ve cihaz kapıları çek çek, cihaz temizliği ayrı bir tabloda
  ve başarısızsa uyarı bloğunda, kabul kriteri sonuçları, engelleyici olmayan
  notlar, onay ve geri bildirim eylemleri.

Yoklama, görünen veri değişmedikçe yeniden çizim yapmaz; açık panel, taslak metin ve
kaydırma konumu korunur. Olay uç noktası son 400 olayı döndürür.

## Açık kalan işler

1. **`Akış Cep` yeniden koşulmadı.** Güncel semantikte PASS üreteceği hem kayıtlı
   rapordan hem canlı `wipeAvdAfterTest` ölçümünden doğrulandı, fakat veritabanı
   durumu geçmişi bozmamak için `awaiting_device_test` bırakıldı. Panelden
   "Cihaz testini yeniden dene" ile temiz bir sonuç alınabilir.
2. **Review Repair ve önceki bulgu hafızası hâlâ gerçek koşuda tetiklenmedi.**
   Plan ve kabul kriteri sözleşmeleri 2. koşuda doğrulandı, ancak reviewer ilk turda
   PASS verdiği için onarım döngüsü ve geçmiş bulgu aktarımı çalışmadı. Bunlar yalnız
   birim testleriyle korunuyor. Zorlanacak bir şey değil; bir koşu reviewer'ı
   bloklarsa doğal olarak sınanır.
3. **Eski örnek projeler yeni sözleşmelerin gerisinde.** `Servis Cep` kritik akış
   sözleşmesinden önce üretildiği için `USER_FLOWS.json` ve `integration_test/`
   içermez; cihaz kapısı `isRepairableDeviceFailure` kuralıyla hemen durur. Elle
   akış eklemek yerine güncel spec'le yeniden üretmek doğru yol. `Stok Cep` eski
   cihaz koşusunun başarısız kaydıdır; yeniden deneme öncesinde güncel ortam kapısı
   ve stabil Android build-tools ile değerlendirilmelidir.
4. **Tekrarlayan reviewer bulgularını mekanik kontrole çevirmek** — bu bir kural,
   açık iş değil. Sessiz `catch` için bir kez yapıldı ve reviewer'ı o konudan
   tamamen çıkardı; aynı bulgu ikinci kez görüldüğünde aynı yol izlenmelidir.

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
- **Panel kabul kriteri metnini göstermiyor.** `criterionText()` reviewer
  verdict'inde `text` alanı arıyor; sözleşmenin şekli `{id, status, evidence}` ve
  `ACCEPTANCE_CRITERIA.json` API'de hiç servis edilmiyor, bu yüzden kriter satırında
  yalnız kimlik görünüyor. Kanıt metni ayrıca gösteriliyor, bilgi kaybı sınırlı.
- **`server.mjs` sözleşme hatalarına 500 dönüyor.** "Bu proje X durumundayken devam
  ettirilemez" gibi durumlar 409/422 olmalı. Panel mesajı yine gösteriyor.
- **HTTP katmanının test kapsamı yok.** 142 testin hiçbiri `server.mjs` üzerinden
  geçmiyor; ayrıca modül import edilir edilmez `listen` çağırdığı için exported
  `createServer` test içinden güvenle kullanılamıyor.

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

## Repository haritası

| Yol | Sorumluluk |
| --- | --- |
| `src/server.mjs` | HTTP API ve panel |
| `src/orchestrator.mjs` | Pipeline, kapılar, onarım döngüleri, iskelet üretimi |
| `src/codex-runner.mjs` | Codex süreci, timeout, JSONL olayları |
| `src/async-process-runner.mjs` | Bütün harici süreçler: asenkron yürütme, deterministik timeout, process-tree sonlandırma |
| `src/database.mjs` | SQLite; proje/görev/agent kayıtları ve durum sözleşmeleri |
| `src/spec-validator.mjs` | Spec doğrulama, kritik akış ve kabul kriteri ayrıştırma |
| `src/task-plan.mjs` | Plan sözleşmesi ve paralellik kuralları |
| `src/task-scheduler.mjs`, `src/task-worktree.mjs` | Hazır görev seçimi ve path izolasyonu |
| `src/quality-report.mjs` | Kalite raporu ve inceleme sözleşmesi |
| `src/source-diagnostics.mjs` | Üretilen Dart kaynağında sessiz hata yutma taraması |
| `src/device-tester.mjs` | Cihaz kapısı, arıza sınıflandırması, imza |
| `src/release-readiness.mjs` | Deterministik release hazırlık değerlendirmesi ve raporu |
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
Flutter/Gradle komut sınırı `MVP_STUDIO_FLUTTER_TIMEOUT_MS` ile belirlenir
(varsayılan 10 dakika).
Varsayılan proje içi builder sınırı 4, sistem genelindeki agent sınırı 5'tir.

## Hızlı komutlar

```powershell
cd C:\Users\efeklc\Documents\GitHub\ai-mvp-studio
npm start
npm run check
npm test
```

Sunucuyu durdurmak için çalışan terminalde `Ctrl+C` kullanın. `src/*.mjs`
değiştikten sonra sunucuyu **yeniden başlatın**.
