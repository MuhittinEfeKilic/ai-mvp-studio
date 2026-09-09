# AI MVP Studio — TODO

Son güncelleme: 9 Eylül 2026

Bu listedeki doğrulanmış açıklar kapatılmıştır. Son tam kontrol: `npm run check`
başarılı, `npm test` **104/104 PASS**.

## Toplu cihaz testi

- [x] Tüm integration dosyalarını tek geçici Dart girişinden çalıştır.
- [x] Senaryo bazında JSON sonuçlarını ve kısmi başarısızlığı raporla.
- [x] Teslim APK'sını koru; normal açılış kontrolünden sonra hedef paketi kaldır.
- [x] Agent talimatlarına aynı oturumda test verisi/kaynak izolasyonunu ekle.
- [x] Gerçek Akış Cep üzerinde toplu koşuyu doğrula (6 dosya / 7 senaryo PASS;
  teslim APK açılışı ve paket kaldırma PASS, 58.5 saniye; eski AVD adı sorunu WAITING).

Bu liste, güncel mimari ve test incelemesinde doğrulanan işleri içerir. Maddeler
öncelik sırasındadır. Bir madde tamamlandığında ilgili regresyon testi eklenmeli,
`npm run check` ve `npm test` çalıştırılmalı, ardından `PROJECT_STATUS.md`
güncellenmelidir.

## P1 — ADB alt komutlarını cihaz kapısının genel timeout'undan ayır

- [x] APK install, logcat, UI dump, screenshot ve AVD hazırlık komutlarına ayrı
  sınırlı timeout uygula.
- [x] Takılan bir `adb install` işleminin genel 10 dakikalık process timeout'unu
  tüketmeden environment WAITING sonucuna dönmesini doğrula.
- [x] Timeout değerinin fake runner ve gerçek Windows süreçlerinde options üzerinden
  taşındığını regresyon testiyle koru.

### Bulgu

`Akış Cep` final doğrulamasında altı integration akışı tamamlandıktan sonra
`adb install -r -t` işlemi yanıt vermedi. Komut özel timeout taşımadığı için ortak
process runner'ın 10 dakikalık varsayılanına kaldı.

## P0 — Device repair sonrasında reviewer sonucunu zorunlu olarak yenile

- [x] Device repair kodu değiştirdiğinde bellekteki eski `reviewerMessage` değerini
  de geçersiz kıl; yalnız task kaydını `pending` yapmakla yetinme.
- [x] Reviewer'ı final kalite ve cihaz PASS raporlarını içeren son commit üzerinde
  yeniden çalıştır ve task'ı `completed` olmadan projeyi `awaiting_user_review`
  durumuna geçirme.
- [x] Eşzamanlı ilk reviewer tamamlandıktan sonra device repair oluşan senaryoda
  ikinci reviewer koşusunu ve tutarlı proje/task durumunu doğrulayan regresyon ekle.

### Bulgu

`Akış Cep` reviewer koşusu 8 Eylül 21:36'da tamamlandı; device repair ise 9 Eylül
09:51'de repository kodunu değiştirdi. Buna rağmen eski reviewer mesajı final karar
olarak kullanıldı. Proje `awaiting_user_review` iken reviewer task kaydı `pending`
kaldı; yani final kod gerçekten yeniden incelenmedi.

## P1 — Cihaz raporlarının Git sahipliğini ve checkpoint'ini düzelt

- [x] Her cihaz koşusunun `DEVICE_REPORT.json` çıktısını orchestrator-owned ayrı
  bir commit/checkpoint olarak kaydet.
- [x] Repair ve bağımlılık kurulumundaki genel `git add -A` işlemlerinin önceki
  cihaz raporunu yanlış commit'e sürüklemesini engelle.
- [x] PASS, FAIL ve WAITING cihaz sonuçlarından sonra generated repository'nin
  beklenmeyen kirli dosya bırakmadığını regresyonla doğrula.

### Bulgu

Resume sırasında `chore: install planned dependencies` commit'leri yalnız
`DEVICE_REPORT.json` değişikliğini taşıdı. Final 6/6 PASS raporu ise pipeline
tamamlandığında çalışma ağacında kirli kaldı ve elle commit edilmek zorunda kaldı.

## P1 — İlk builder dalgasında gerçek paralelliği zorunlu kıl

- [x] Advanced task planında yalnız toplam grafik genişliğini değil, bağımlılığı
  olmayan başlangıç görevlerinin sayısını da `target_parallelism` ile doğrula.
- [x] Coordinator prompt'unda ortak domain sözleşmelerini tek bir seri foundation
  görevine yığmak yerine feature sahiplerine veya orchestrator iskeletine dağıt.
- [x] Tek root görevinden sonra genişleyen planın reddedildiğini gösteren regresyon
  testi ekle.

### Bulgu

Gerçek `Akış Cep` koşusundaki ilk advanced plan 6 görev ve grafik genişliği 5 ile
validator'dan geçti; ancak beş feature görevinin tamamı `shared-foundation` görevine
bağlı olduğu için ilk builder dalgası yalnız x1 çalıştı. Plan sonradan paralelleşse
de ortak temel iş kritik yola seri gecikme ekliyor.

## P1 — Flutter tooling manifestlerini çevrimdışı ürün politikasından ayır

- [x] Offline ürünlerde `main` manifestin ağ izni taşımaması kuralını koru.
- [x] Flutter VM Service için gereken debug/profile `INTERNET` izinlerini kalite
  ve cihaz kapısından önce mekanik olarak geri yükle.
- [x] Builder ve Integration prompt'larında ürün izni ile tooling izninin farkını
  açıkça belirt.
- [x] Main manifesti değiştirmeden debug/profile manifestlerini onaran idempotent
  regresyon testi ekle.

### Bulgu

Gerçek `Akış Cep` koşusunda agent, çevrimdışı ürün gereksinimini debug/profile
manifestlerine de uyguladı. APK kurulmasına rağmen Flutter test sürücüsü VM Service
portuna bağlanamadı ve ilk integration test 180 saniye sonunda zaman aşımına uğradı.

## P1 — Kompleks ürün template'i ve ölçeklenen paralel planlama

- [x] Mobil template'i modül sınırları, iş kuralları, ekran durum matrisi, veri
  sözleşmeleri, tasarım DNA/tokenları ve test izlenebilirliğiyle v2'ye yükselt.
- [x] `complexity_tier` ve `target_parallelism` alanlarını doğrulanan pipeline
  politikasına bağla; eski v1 spec'leri geriye uyumlu tut.
- [x] Advanced projelerde Architecture, UX, Data Contract ve Test Strategy
  agent'larını ayrı worktree'lerde paralel çalıştır.
- [x] Coordinator'ın 4–8 görev üretmesini ve görev grafiğinin hedef genişliğe
  gerçekten ulaştığını mekanik olarak doğrula.
- [x] Builder, Coordinator ve Integration context'lerine yeni plan belgelerini ekle.
- [x] Varsayılan proje içi builder sınırını 4'e, global agent sınırını 5'e çıkar.
- [x] v2 doğrulama, plan genişliği, policy ve advanced orchestrator akışı için
  regresyon testleri ekle.

### Neden

Yalnız ayrıntılı görsel prompt, kapsamlı uygulama üretmek için yeterli değildi.
Modül sahipliği ve kabul/test izlenebilirliği tanımlanmadığında görevler ya aynı
dosyalarda çakışıyor ya da özellik sınırları arasında eksik entegrasyon bırakıyordu.

## P0 — Reviewer kabul kriteri sınırını kapat

- [x] `validateReviewerResult` içinde beklenen listede bulunmayan kriter
  kimliklerini reddet.
- [x] Aynı kriter kimliğinin birden fazla kez bildirilmesini reddet.
- [x] Kimlik karşılaştırmasını açık ve deterministik yap (`AC1`, `AC2` vb.).
- [x] Bilinmeyen bir kriteri `FAIL` göstererek projenin bloklanamadığını kanıtlayan
  regresyon testi ekle.
- [x] Bütün beklenen kriterlerin tam olarak bir kez cevaplandığını test et.

### Neden

`src/quality-report.mjs` şu anda beklenen kriterlerin eksik olup olmadığını kontrol
ediyor fakat bilinmeyen kriterleri reddetmiyor. Reviewer, tüm gerçek kriterleri PASS
işaretleyip hayali bir `AC999` kriterini FAIL göstererek acceptance kapsamı dışındaki
bir bulguyla projeyi bloklayabiliyor. Bu davranış, reviewer'ın yalnız
`ACCEPTANCE_CRITERIA.json` üzerinden bloklayabilmesi sözleşmesini ihlal ediyor.

### Tamamlanma kriteri

Beklenen kriterler `AC1` ve `AC2` ise çıktı yalnız bu iki kimliği, her birini tam bir
kez ve geçerli PASS/FAIL sonucuyla içerebilmelidir. Eksik, fazla veya tekrarlanan
kimlik `INVALID_REVIEWER_RESULT` üretmelidir.

## P0 — Flutter kalite komutlarına güvenli timeout ekle

- [x] `runFlutterAsync` için yapılandırılabilir süre sınırı ekle.
- [x] Timeout sırasında yalnız doğrudan child'ı değil bütün process tree'yi kapat.
- [x] Timeout sonucunu stdout, stderr, exit/signal ve açık hata nedeniyle raporla.
- [x] `flutter pub get`, `flutter analyze`, `flutter test` ve `flutter build apk`
  çağrılarının aynı güvenli çalıştırıcıyı kullandığını doğrula.
- [x] Takılan sahte Flutter komutunun süre sonunda kapanıp pipeline slotunu serbest
  bıraktığını test et.

### Neden

`src/orchestrator.mjs` içindeki `runFlutterAsync` şu anda timeout içermiyor. Flutter,
Dart veya Gradle süreci takılırsa proje ve çalışma slotu süresiz tutulabilir.

### Tamamlanma kriteri

Takılan bir toolchain süreci belirlenen sürede bütün alt süreçleriyle sonlanmalı,
kalite raporunda teşhis edilebilir bir FAIL üretmeli ve HTTP/panel event loop'u
cevap vermeye devam etmelidir.

## P0 — Windows process-tree sonlandırmasını güvenilir yap

- [x] `killProcessTree` içinde `taskkill` sonucunu kontrol et.
- [x] `taskkill` başarısız olduğunda güvenli `child.kill('SIGKILL')` fallback'i
  çalıştır.
- [x] Sonlandırmadan sonra `close` olayının gelmemesi ihtimali için kontrollü settle
  davranışı ekle.
- [x] Windows, izin kısıtlı ortam ve zaten kapanmış süreç senaryolarını test et.
- [x] Aynı mekanizmayı Codex, Flutter ve cihaz komutlarında tekrar kullanılabilecek
  ortak bir async process runner'a dönüştürmeyi değerlendir.

### Neden

`src/codex-runner.mjs` Windows'ta `taskkill` çağrısını başarılı varsayıyor. Bu çağrı
izin veya ortam nedeniyle başarısız olursa child çalışmaya devam ediyor ve timeout
testi/test paketi kapanmıyor.

### Mevcut kanıt

- `npm run check`: başarılı.
- `codex-runner.test.mjs` dışındaki testler: 85/85 başarılı.
- `codex-runner.test.mjs`: ilk hung-process testinde süreç kapanmadığı için bu
  ortamda tamamlanmadı.

### Tamamlanma kriteri

`node --test test/codex-runner.test.mjs` kendi başına tamamlanmalı ve tam
`npm test` koşusu 88/88 veya güncel toplamın tamamını geçmelidir. Test sonrasında
yetim Node/Codex süreci kalmamalıdır.

## P1 — Kaynak kontrol komutunun kapsamını genişlet

- [x] `npm run check` komutunu tüm `src/*.mjs` modüllerini kapsayacak biçimde
  güncelle.
- [x] En az `device-tester.mjs`, `android-environment.mjs`, `quality-report.mjs`,
  `source-diagnostics.mjs`, `task-plan.mjs`, `task-scheduler.mjs`,
  `task-worktree.mjs` ve `context-packager.mjs` dosyalarını dahil et.
- [x] Komutun Windows PowerShell ve normal npm çalıştırmasında taşınabilir olduğuna
  dikkat et; shell glob davranışına güvenme.

### Neden

Mevcut `npm run check` yalnız dört ana modülü kontrol ediyor. Yeni eklenen kritik
kapı ve sözleşme modüllerindeki sözdizimi hataları yalnız ilgili test dosyası import
edilirse yakalanıyor.

### Tamamlanma kriteri

Repository içindeki bütün birinci taraf `.mjs` kaynakları tek komutla sözdizimi
kontrolünden geçmelidir.

## P1 — Cihaz ortamı kapasite kontrolünü güçlendir

- [x] Preflight veya cihaz edinme aşamasında emülatörün kullanılabilir veri alanını
  kontrol et.
- [x] Yetersiz alanı APK kurulumundan önce `environment` arızası olarak raporla.
- [x] Güvenli ve açıkça sınırlandırılmış bir temizlik önerisi/eylemi tasarla; kullanıcı
  uygulamalarını veya verisini otomatik silme.
- [x] Panelde `INSTALL_FAILED_INSUFFICIENT_STORAGE` kök nedenini genel “uygulama
  başlatılamadı” mesajından daha görünür göster.

### Neden

`Bakım Takvimi` projesi (`f87128fb48bf`) cihaz kapısında emülatör depolaması
yetersiz olduğu için bekliyor. Sistem bunu doğru biçimde ortam arızası olarak
sınıflandırdı; fakat gerçek kök neden paneldeki üst mesajda yeterince görünür değil.

### Tamamlanma kriteri

Emülatör alanı yetersizse integration test başlamadan `awaiting_device_test`
durumuna geçilmeli ve raporda gereken/mevcut alan ile kullanıcıya uygulanabilir
çözüm gösterilmelidir.

## P2 — Güncel olmayan yorum ve dokümantasyonu temizle

- [x] `src/orchestrator.mjs` içindeki cihaz kapısının hâlâ `spawnSync` tabanlı
  olduğunu söyleyen yorumu güncelle.
- [x] `PROJECT_STATUS.md` proje tablosuna güncel `Bakım Takvimi` koşusunu ekle.
- [x] `Stok Cep` açıklamasını gerçek veritabanı durumuyla uyumlu hâle getir.
- [x] Test toplamını ancak tam `npm test` güncel ortamda başarıyla bittikten sonra
  belgeye yaz.

### Neden

Kod asenkron cihaz kapısına geçmiş olsa da eski yorum kalmış. Ayrıca güncel çalışma
durumu ile handoff belgesindeki proje özeti arasında küçük farklar bulunuyor.

## Değişiklik setini güvenli şekilde teslim et

- [x] Değişiklik setini mantıksal paketlere göre gözden geçir.
- [x] `git diff --check` çalıştır.
- [x] Tam test paketinin bütün testlerle tamamlandığını doğrula.
- [x] Çalışan sunucuyu `src/*.mjs` değişikliklerinden sonra yeniden başlat.
- [x] Health endpoint, panel ve en az bir gerçek proje durumunu doğrula.
- [x] Değişiklikleri açıklayıcı tek veya birkaç stabilizasyon commit'i olarak kaydet.

## Önerilen uygulama sırası

1. Reviewer kriter kimliği doğrulaması.
2. Ortak async process runner ve güvenli process-tree timeout davranışı.
3. Codex, Flutter ve cihaz süreçlerini ortak runner'a taşıma.
4. `npm run check` kapsamını genişletme.
5. Cihaz depolama preflight ve hata mesajı iyileştirmesi.
6. Dokümantasyon güncellemesi, tam regresyon ve commit.
