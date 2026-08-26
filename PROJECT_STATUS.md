# AI MVP Studio — Güncel Durum ve Handoff

Son güncelleme: 27 Ağustos 2026

## Mevcut durum

- Yerel panel `npm start` ile `http://127.0.0.1:8000` adresinde çalışır.
- Çoklu-agent Flutter pipeline; Architecture, UX, Coordinator, paralel Builder,
  Integration, Test, Repair ve Reviewer aşamalarını içerir.
- SQLite görev grafiği, Git checkpoint/resume, path izolasyonu ve üç turlu repair
  stabilizasyonu uygulanmıştır.
- Flutter preflight, tam `QUALITY_LOGS`, yapılandırılmış `TEST_REPORT` ve gerçek APK
  varlık kontrolü mevcuttur.
- Son bilinen Studio regresyon sonucu: 36/36 test başarılı (22 Ağustos 2026).
  Yeni oturum bunu güncel ortamda yeniden doğrulamalıdır.

## Örnek proje: Servis Cep

- Proje kimliği: `a87cfbf38ea4`
- Repository: `projects/a87cfbf38ea4/repository/`
- APK analyze/test/build kalite kapısından geçmiş ve LDPlayer'a kurulmuştur.
- LDPlayer testi ana ekranın ve yeni iş emri formunun açıldığını doğruladı.
- Kritik ürün hatası: Yeni İş Emri formundaki müşteri alanı serbest metin alıyor,
  repository ise `customers` tablosundaki gerçek `customer_id` değerini bekliyor.
  Bu nedenle dashboard üzerinden iş emri kaydı foreign-key hatasıyla başarısız oluyor
  ve UI yalnız “İşlem tamamlanamadı. Tekrar deneyin.” mesajını gösteriyor.
- Bu hata Studio'nun mevcut unit/repository kalite kapısının özellikler arası gerçek
  kullanıcı akışlarını garanti etmediğini göstermiştir.

## Stabilizasyon V2 ilerlemesi

Tamamlanan ilk paket:

- Mobil spec için `device_test: "required"` kararı zorunlu hâle getirildi.
- `Kritik Kullanıcı Akışları` bölümü; başlıklı akış, en az üç numaralı adım ve
  `Beklenen sonuç` sözleşmesi olmadan spec onaylanmıyor.
- Akışlar yeni proje repository'sine `USER_FLOWS.json` olarak kaydediliyor.
- Architecture, UX, Coordinator, Integration ve Reviewer prompt'ları bu sözleşmeyi
  kullanıyor; foreign-key/reference değerlerinin serbest metin alanından gelmesi
  bloklayıcı hata olarak tanımlandı.
- Coordinator her kritik akış için `integration_test` çıktısı istemekle yükümlü.

Tamamlanan bağlantı paketi:

- Kritik akış sayısı kadar `integration_test/*_test.dart` dosyası zorunlu.
- ADB yolu ortam değişkeni, Android SDK ve LDPlayer konumlarından bulunuyor.
- Bağlı cihazda integration test, APK kurulum, uygulama açılışı, process ve logcat
  crash kontrolleri çalışıyor.
- `DEVICE_REPORT.json`, cihaz ekran görüntüsü, UI ağacı ve tam loglar saklanıyor.
- Cihaz yokken proje `awaiting_device_test` durumunda güvenli biçimde bekliyor.
- Cihaz sonucu SQLite ve web panelinde gösteriliyor.

Sıradaki alt paket:

1. Sessiz `catch (_)` kullanımını engelleyen kalite kontrolü ve teşhis edilebilir
   hata raporlaması.
2. Cihaz integration testi başarısız olduğunda hedefli Device Repair döngüsü.

Önce bu paketin Studio tarafında uygulanması, ardından Servis Cep hatasının düzeltilip
aynı cihaz senaryosunun yeniden çalıştırılması önerilir.

## Hızlı komutlar

```powershell
cd C:\Users\efeklc\Documents\GitHub\ai-mvp-studio
npm start
npm run check
npm test
```

Sunucuyu durdurmak için çalışan terminalde `Ctrl+C` kullanın.
