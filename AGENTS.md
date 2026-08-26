# AI MVP Studio — Agent Çalışma Sözleşmesi

Bu dosya repository üzerinde çalışan tüm AI agent'ları için bağlayıcı proje
bağlamıdır. İşe başlamadan önce `README.md` ve `PROJECT_STATUS.md` dosyalarını da
tamamen okuyun.

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

## Standart çalışma sırası

1. `git status --short` ile mevcut değişiklikleri inceleyin.
2. `PROJECT_STATUS.md` içindeki mevcut hedefi ve bilinen sorunları okuyun.
3. Değiştirilecek akışın kaynaklarını ve testlerini birlikte inceleyin.
4. Kapsamı küçük tutarak uygulayın.
5. En az `npm run check` ve `npm test` çalıştırın.
6. Davranış değiştiyse README ve `PROJECT_STATUS.md` dosyasını güncelleyin.
7. Sonuçta değişen dosyaları, test sonucunu ve kalan riski açıkça bildirin.

## Mimari sınırlar

- HTTP/UI: `src/server.mjs` ve `src/mvp_studio/static/index.html`
- Pipeline: `src/orchestrator.mjs`
- Codex süreç adaptörü: `src/codex-runner.mjs`
- Kalıcılık: `src/database.mjs`
- Spec ve task sözleşmeleri: `src/spec-validator.mjs`, `src/task-plan.mjs`
- Paralellik/path izolasyonu: `src/task-scheduler.mjs`, `src/task-worktree.mjs`
- Kalite sözleşmesi: `src/quality-report.mjs`

Yeni davranış mümkünse saf, export edilen bir yardımcı fonksiyonla ayrıştırılmalı ve
Node yerleşik test koşucusuyla regresyon testi eklenmelidir. Harici bağımlılık
eklemeden önce gerçekten gerekli olup olmadığını değerlendirin.

## Tamamlanma ölçütü

Bir Studio değişikliği; sözdizimi kontrolleri, tam test paketi ve etkilenen gerçek
akış doğrulandıktan sonra tamamlanır. Mobil ürün için gerçek cihaz/emülatör testi
yapılmadıysa teknik kalite ile ürün kabulünü birbirinden ayırın.
