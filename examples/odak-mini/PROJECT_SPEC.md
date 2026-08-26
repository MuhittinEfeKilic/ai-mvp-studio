---
spec_version: "1.0"
project_name: "Odak Mini"
project_slug: "odak-mini"
project_profile: "flutter_mobile"
application_type: "mobile"
framework: "flutter"
target_platform: "android"
package_name: "com.aimvpstudio.odakmini"
min_android_sdk: "24"
orientation: "portrait"
device_test: "required"
language: "tr"
status: "approved"
---

# Ürün Özeti

Odak Mini, kullanıcının gün içinde tamamlamak istediği en fazla üç kısa odak görevini cihazında tutan basit bir Android uygulamasıdır. MVP'nin amacı görev ekleme, tamamlandı işaretleme ve günlük listeyi temizleme akışlarını internetsiz ve hesap açmadan sunmaktır.

## Hedef Kullanıcılar

- Telefonunda karmaşık proje yönetimi istemeyen öğrenciler ve bireysel çalışanlar.
- Uygulama çoğunlukla tek elle ve kısa oturumlarla kullanılacaktır.

# MVP Kapsamı

## Dahil

- Bugünün en fazla üç görevini listeleme.
- Başlığı 1–60 karakter olan görev ekleme.
- Görevi tamamlandı veya tamamlanmadı olarak işaretleme.
- Tek bir görevi silme ve tüm tamamlananları temizleme.
- Veriyi uygulama kapanıp açıldığında yerel olarak koruma.

## Kapsam Dışı

- Hesap, backend, bulut senkronizasyonu, bildirim, tekrar eden görev, takvim, paylaşım, analitik ve ödeme yoktur.

# Kullanıcı Akışları

## Ana Akış

1. Kullanıcı uygulamayı açar ve Bugün ekranını görür.
2. Ekle düğmesine dokunup görev başlığını yazar ve kaydeder.
3. Görev listeye eklenir; kullanıcı onay kutusuyla tamamlandı durumunu değiştirir.
4. Kullanıcı tamamlanan görevleri temizleyebilir; kalan liste cihazda saklanır.

## Hata Akışları

- Boş başlıkta kayıt yapılmaz ve alan altında Türkçe doğrulama mesajı gösterilir.
- 60 karakter aşılırsa sayaç ve hata mesajı görünür.
- Üç görev sınırında Ekle düğmesi devre dışı olur ve açıklayıcı metin gösterilir.
- Yerel kayıt okunamazsa uygulama boş listeyle açılır ve tekrar denenebilir bir hata bandı gösterir.

# Kritik Kullanıcı Akışları

### Görev oluşturma ve kalıcılık

1. Kullanıcı uygulamayı temiz veriyle açar.
2. Ekle düğmesine dokunup geçerli bir görev başlığı yazar.
3. Kaydet düğmesine dokunup görevin Bugün listesinde göründüğünü doğrular.
4. Uygulamayı kapatıp yeniden açar.
- Beklenen sonuç: Oluşturulan görev yeniden açılıştan sonra Bugün listesinde korunur.

### Geçersiz görev başlığı

1. Kullanıcı görev ekleme panelini açar.
2. Başlığı boş bırakır.
3. Kaydet düğmesine dokunur.
- Beklenen sonuç: Görev oluşturulmaz ve başlık alanında anlaşılır doğrulama mesajı görünür.

# Ekranlar

## Bugün Ekranı

- Uygulama başlığı, ilerleme özeti, görev listesi, Ekle düğmesi ve Tamamlananları temizle eylemi bulunur.
- Liste boşsa kısa açıklama ve birincil Ekle eylemi gösterilir.
- Yerel veri okunurken küçük yükleniyor göstergesi, hata halinde tekrar dene bandı gösterilir.

## Görev Ekleme Ekranı

- Modal alt panel içinde başlık alanı, karakter sayacı, İptal ve Kaydet eylemleri bulunur.
- Klavye açıldığında panel görünür kalır. Başarılı kayıtta panel kapanır ve yeni görev listeye gelir.

# Mobil Platform Kararları

- Yalnızca Android telefon desteklenir; tablet düzeni kapsam dışıdır.
- Ekran yönü dikeydir ve çalışma sırasında yön değiştirilmez.
- Uygulama tamamen local-first çalışır ve internet bağlantısı gerektirmez.
- Minimum SDK 24, kullanılan Flutter 3.44 sürümünün desteklediği taban Android seviyesidir.
- Arka plan görevi, deep link ve bildirim kullanılmaz.

# Navigasyon ve Ekran Davranışları

- Başlangıç ekranı Bugün ekranıdır; görev ekleme aynı ekran üzerinde modal alt panel açar.
- Android geri düğmesi önce açık paneli kapatır, panel yoksa uygulamanın normal geri davranışını uygular.
- Panel kapanıp yeniden açılırsa kaydedilmemiş form verisi korunmaz.
- Boş, yükleniyor, yerel kayıt hatası, üç görev sınırı ve başarılı ekleme durumları ayrı gösterilir.

# İzinler ve Cihaz Özellikleri

- Kamera: yok. Konum: yok. Depolama sistem izni: yok. Bildirim: yok. Mikrofon: yok.
- Runtime izin talebi yapılmayacaktır; sensör veya platform entegrasyonu yoktur.

# Veri Modeli

`FocusTask`: `id` benzersiz metin, `title` metin, `isCompleted` boolean ve `createdAt` ISO zaman alanlarından oluşur. Görevler oluşturulma sırasıyla saklanır. Silme kalıcıdır. Veri, harici paket gerektirmeyen küçük bir yerel JSON/değer deposunda tutulur; en fazla üç kayıt olduğu için ilişkisel veritabanı kullanılmaz.

# Teknik Kararlar

- UI framework: Flutter ve Material 3.
- Dil: Dart.
- State yönetimi: Küçük kapsam nedeniyle `ChangeNotifier`; ek state paketi yoktur.
- Navigasyon: Tek ekran ve modal alt panel; ek router paketi yoktur.
- Veri saklama: Soyutlanmış yerel key-value repository; testlerde bellek içi implementasyon.
- Backend: Yok.
- Test: Veri modeli/repository unit testleri ve ekleme/tamamlama widget testleri.
- Build hedefi: Android debug APK.

# Tasarım Yönü

- Sakin, sade Material 3 görünümü; açık tema, koyu lacivert metin ve yeşil vurgu rengi.
- Etkileşim hedefleri en az 48x48 dp, tüm ikon düğmelerinde semantics etiketi bulunur.
- Sistem metin ölçeği desteklenir; 320–480 dp telefon genişliklerinde taşma olmamalıdır.
- Koyu tema MVP kapsamı dışındadır fakat renkler tek tema dosyasında tutulur.

# Kabul Kriterleri

- [ ] Kullanıcı geçerli bir görev ekleyebilir ve uygulamayı yeniden açtığında görebilir.
- [ ] Boş veya 60 karakterden uzun başlık kaydedilemez.
- [ ] Dördüncü görev eklenemez ve kullanıcı nedenini görür.
- [ ] Görev tamamlandı durumu değiştirilebilir ve kalıcıdır.
- [ ] Tek görev silinebilir, tamamlanan görevler topluca temizlenebilir.
- [ ] Android geri düğmesi açık görev panelini kapatır.
- [ ] Boş, yükleniyor, hata ve başarı durumları uygulanır.
- [ ] `flutter analyze` ve `flutter test` başarılıdır.
- [ ] Android debug APK üretilebilir.

# Kalite Gereksinimleri

- Kaynak kodda gizli anahtar veya ağ servisi bulunmamalıdır.
- Flutter/Android gereksinimleri ile kurulum, çalıştırma, test ve debug APK komutları README'de bulunmalıdır.
- Temel widget'lar erişilebilir etiketler taşımalı ve farklı telefon genişliklerinde test edilmelidir.
- Uygulama otomatik olarak yayınlanmamalıdır.

# Açık Kararlar

Yok.
