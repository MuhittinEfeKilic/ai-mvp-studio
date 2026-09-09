# AI MVP Studio — Agent Çalışma Sözleşmesi

Bu dosya repository üzerinde çalışan tüm AI agent'ları için bağlayıcı proje
bağlamıdır. İşe başlamadan önce:

- `docs/PROJECT_STATUS.md` içindeki mevcut hedefi ve görevle ilgili bilinen sorunları okuyun.
- `README.md` yalnız görev ürün davranışı, kullanım veya mimari bağlam gerektiriyorsa okunmalıdır.
- Küçük ve lokal görevlerde bu dosyaları tamamen okumayın; yalnız ilgili bölümleri inceleyin.

## Amaç

AI MVP Studio, onaylanmış bir `PROJECT_SPEC.md` dosyasını Codex tabanlı paralel
agent akışıyla çalışan Flutter mobil MVP'ye dönüştüren local-first bir sistemdir.
Studio yayınlanmaz; yalnızca ürettiği uygulamalar kullanıcı kararıyla yayınlanabilir.
Claude entegrasyonu henüz kapsam dışıdır.

## Değişmez kurallar

- Kullanıcının mevcut ve commit edilmemiş değişikliklerini koruyun.
- `data/`, `projects/`, `.git`, agent worktree'leri veya checkpoint branch'lerini
  açık talimat olmadan silmeyin, taşımayın ya da sıfırlamayın.
- Destructive Git komutları (`reset --hard`, zorla checkout vb.) kullanmayın.
- Studio'nun gerçek kaynak dizini repository köküdür; üretilen uygulamalar
  `projects/<project-id>/repository/` altında ayrı Git repository'leridir.
- Builder görevlerinin `allowed_paths` sınırlarını genişletmeden önce scheduler ve
  path doğrulama etkisini kontrol edin.
- Flutter/Gradle kalite komutlarını builder prompt'larına taşımayın; bunları
  orchestrator merkezi olarak çalıştırır.
- Bir projeyi yalnız analyze/test/APK PASS olduğu için kullanıcı akışları çalışıyor
  kabul etmeyin. Cihaz/E2E doğrulaması yapılmadıysa bunu açıkça belirtin.
- Release hazırlığı yalnız `accepted` projelerde çalışır, proje durumunu değiştirmez
  ve deterministiktir; bir modele "hazır görünüyor mu" diye sorulmaz. `READY` yalnız
  **sideload ile harici teste verilebilir** demektir. Hiçbir yerde mağaza hazırlığı
  iddia etmeyin, imza anahtarı üretmeyin, parola/keystore saklamayın.
- Kapılar yetkilidir: `TEST_REPORT.json` ve `DEVICE_REPORT.json` sonuçları yeniden
  yargılanmaz. Reviewer yalnız `ACCEPTANCE_CRITERIA.json` maddeleri üzerinden
  bloklayabilir; doğrulanamayan gözlem `notes` alanına yazılır.
- Harici süreçleri (`flutter`, `gradle`, `adb`, `aapt`, `codex`) asla `spawnSync`
  ile çalıştırmayın; hepsi `async-process-runner.mjs` üzerinden geçer. Yerel Git
  plumbing'i tek bilinçli istisnadır ve `pipeline-stability` içindeki bekçi testi
  bunu korur.
- Cihaz doğrulaması desteklenen bir Android çalışma zamanı hedefine karşı yapılır:
  Android Studio AVD, üçüncü taraf emülatör veya fiziksel cihaz. Hiçbir hedefi
  olmadığı kategoriymiş gibi etiketlemeyin; AVD'ye özgü işlemler yalnız gerçek AVD
  hedefinde çalışır. Test sonrası temizlik kapı değildir ve ürün kararını
  değiştiremez.
- `src/*.mjs` değiştikten sonra çalışan panel sunucusu yeniden başlatılmadan
  değişiklik devreye girmez; bir düzeltmeyi "işe yaramadı" diye değerlendirmeden
  önce bunu doğrulayın.

## Standart çalışma sırası

1. `git status --short` ile mevcut değişiklikleri inceleyin.
2. `docs/PROJECT_STATUS.md` içindeki mevcut hedefi ve bilinen sorunları okuyun.
3. Değiştirilecek akışın kaynaklarını ve testlerini birlikte inceleyin.
4. Kapsamı küçük tutarak uygulayın.
5. Değişikliğe uygun en küçük doğrulamayı çalıştırın:
   - Kod davranışı değiştiyse en az `npm run check` ve ilgili testleri çalıştırın.
   - Ortak/pipeline davranışı değiştiyse tam `npm test` çalıştırın.
   - Yalnız dokümantasyon veya statik içerik değişikliğinde gereksiz test çalıştırmayın.
6. Davranış değiştiyse README ve `docs/PROJECT_STATUS.md` dosyasını güncelleyin.
7. Sonuçta değişen dosyaları, test sonucunu ve kalan riski açıkça bildirin.

## Mimari sınırlar

- HTTP/UI: `src/server.mjs` ve `src/mvp_studio/static/index.html`
- Pipeline: `src/orchestrator.mjs`
- Codex süreç adaptörü: `src/codex-runner.mjs`
- Bütün harici süreçler, timeout ve process-tree sonlandırma: `src/async-process-runner.mjs`
- Kalıcılık: `src/database.mjs`
- Spec ve task sözleşmeleri: `src/spec-validator.mjs`, `src/task-plan.mjs`
- Paralellik/path izolasyonu: `src/task-scheduler.mjs`, `src/task-worktree.mjs`
- Kalite ve inceleme sözleşmesi: `src/quality-report.mjs`
- Kaynak teşhis taraması: `src/source-diagnostics.mjs`
- Cihaz kapısı: `src/device-tester.mjs`, `src/android-environment.mjs`
- Release hazırlığı: `src/release-readiness.mjs`
- Rol bazlı context: `src/context-packager.mjs`

Yeni davranış mümkünse saf, export edilen bir yardımcı fonksiyonla ayrıştırılmalı ve
Node yerleşik test koşucusuyla regresyon testi eklenmelidir. Harici bağımlılık
eklemeden önce gerçekten gerekli olup olmadığını değerlendirin.

## Tamamlanma ölçütü

Davranışsal bir Studio değişikliği; sözdizimi kontrolleri, değişikliğin kapsamına uygun
testler ve etkilenen gerçek akış doğrulandıktan sonra tamamlanır. Ortak/pipeline davranışını
etkileyen değişikliklerde tam test paketi çalıştırılmalıdır. Yalnız dokümantasyon veya statik
içerik değişikliklerinde tam test paketi zorunlu değildir. Mobil ürün için gerçek
cihaz/emülatör testi yapılmadıysa teknik kalite ile ürün kabulünü birbirinden ayırın.
