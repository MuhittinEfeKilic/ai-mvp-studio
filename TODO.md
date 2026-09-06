# AI MVP Studio — TODO

Son güncelleme: 29 Ağustos 2026

Bu liste, güncel mimari ve test incelemesinde doğrulanan işleri içerir. Maddeler
öncelik sırasındadır. Bir madde tamamlandığında ilgili regresyon testi eklenmeli,
`npm run check` ve `npm test` çalıştırılmalı, ardından `PROJECT_STATUS.md`
güncellenmelidir.

## P0 — Reviewer kabul kriteri sınırını kapat

- [ ] `validateReviewerResult` içinde beklenen listede bulunmayan kriter
  kimliklerini reddet.
- [ ] Aynı kriter kimliğinin birden fazla kez bildirilmesini reddet.
- [ ] Kimlik karşılaştırmasını açık ve deterministik yap (`AC1`, `AC2` vb.).
- [ ] Bilinmeyen bir kriteri `FAIL` göstererek projenin bloklanamadığını kanıtlayan
  regresyon testi ekle.
- [ ] Bütün beklenen kriterlerin tam olarak bir kez cevaplandığını test et.

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

- [ ] `runFlutterAsync` için yapılandırılabilir süre sınırı ekle.
- [ ] Timeout sırasında yalnız doğrudan child'ı değil bütün process tree'yi kapat.
- [ ] Timeout sonucunu stdout, stderr, exit/signal ve açık hata nedeniyle raporla.
- [ ] `flutter pub get`, `flutter analyze`, `flutter test` ve `flutter build apk`
  çağrılarının aynı güvenli çalıştırıcıyı kullandığını doğrula.
- [ ] Takılan sahte Flutter komutunun süre sonunda kapanıp pipeline slotunu serbest
  bıraktığını test et.

### Neden

`src/orchestrator.mjs` içindeki `runFlutterAsync` şu anda timeout içermiyor. Flutter,
Dart veya Gradle süreci takılırsa proje ve çalışma slotu süresiz tutulabilir.

### Tamamlanma kriteri

Takılan bir toolchain süreci belirlenen sürede bütün alt süreçleriyle sonlanmalı,
kalite raporunda teşhis edilebilir bir FAIL üretmeli ve HTTP/panel event loop'u
cevap vermeye devam etmelidir.

## P0 — Windows process-tree sonlandırmasını güvenilir yap

- [ ] `killProcessTree` içinde `taskkill` sonucunu kontrol et.
- [ ] `taskkill` başarısız olduğunda güvenli `child.kill('SIGKILL')` fallback'i
  çalıştır.
- [ ] Sonlandırmadan sonra `close` olayının gelmemesi ihtimali için kontrollü settle
  davranışı ekle.
- [ ] Windows, izin kısıtlı ortam ve zaten kapanmış süreç senaryolarını test et.
- [ ] Aynı mekanizmayı Codex, Flutter ve cihaz komutlarında tekrar kullanılabilecek
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

- [ ] `npm run check` komutunu tüm `src/*.mjs` modüllerini kapsayacak biçimde
  güncelle.
- [ ] En az `device-tester.mjs`, `android-environment.mjs`, `quality-report.mjs`,
  `source-diagnostics.mjs`, `task-plan.mjs`, `task-scheduler.mjs`,
  `task-worktree.mjs` ve `context-packager.mjs` dosyalarını dahil et.
- [ ] Komutun Windows PowerShell ve normal npm çalıştırmasında taşınabilir olduğuna
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
- [ ] Panelde `INSTALL_FAILED_INSUFFICIENT_STORAGE` kök nedenini genel “uygulama
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

- [ ] `src/orchestrator.mjs` içindeki cihaz kapısının hâlâ `spawnSync` tabanlı
  olduğunu söyleyen yorumu güncelle.
- [ ] `PROJECT_STATUS.md` proje tablosuna güncel `Bakım Takvimi` koşusunu ekle.
- [ ] `Stok Cep` açıklamasını gerçek veritabanı durumuyla uyumlu hâle getir.
- [ ] Test toplamını ancak tam `npm test` güncel ortamda başarıyla bittikten sonra
  belgeye yaz.

### Neden

Kod asenkron cihaz kapısına geçmiş olsa da eski yorum kalmış. Ayrıca güncel çalışma
durumu ile handoff belgesindeki proje özeti arasında küçük farklar bulunuyor.

## Değişiklik setini güvenli şekilde teslim et

- [ ] Mevcut 22 değiştirilmiş dosyayı mantıksal paketlere göre gözden geçir.
- [ ] `git diff --check` çalıştır.
- [ ] Tam test paketinin bütün testlerle tamamlandığını doğrula.
- [ ] Çalışan sunucuyu `src/*.mjs` değişikliklerinden sonra yeniden başlat.
- [ ] Health endpoint, panel ve en az bir gerçek proje durumunu doğrula.
- [ ] Değişiklikleri açıklayıcı tek veya birkaç stabilizasyon commit'i olarak kaydet.

## Önerilen uygulama sırası

1. Reviewer kriter kimliği doğrulaması.
2. Ortak async process runner ve güvenli process-tree timeout davranışı.
3. Codex, Flutter ve cihaz süreçlerini ortak runner'a taşıma.
4. `npm run check` kapsamını genişletme.
5. Cihaz depolama preflight ve hata mesajı iyileştirmesi.
6. Dokümantasyon güncellemesi, tam regresyon ve commit.
