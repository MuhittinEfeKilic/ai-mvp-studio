---
spec_version: "1.0"
project_name: "Ders Notu"
project_slug: "ders-notu"
project_profile: "flutter_mobile"
application_type: "mobile"
framework: "flutter"
target_platform: "android"
package_name: "com.aimvpstudio.dersnotu"
min_android_sdk: "24"
orientation: "portrait"
device_test: "required"
language: "tr"
status: "approved"
---

# Ürün Özeti

Ders Notu, bir öğrencinin dönem içindeki derslerini ve sınav notlarını internetsiz
olarak takip etmesini sağlayan local-first bir Android uygulamasıdır. MVP; ders
oluşturma, derse not ekleme, ders başına ortalama hesaplama, geçersiz not girişini
engelleme ve uygulama yeniden açıldığında tüm verilerin korunmasını eksiksiz sunar.

## Hedef Kullanıcılar

- Dönem boyunca 4-10 ders alan, notlarını tek cihazda tutan üniversite öğrencileri.
- Uygulamayı sınav sonrası kısa oturumlarda, tek elle kullanan kişiler.

# MVP Kapsamı

## Dahil

- Ders adı ve kredi değeriyle ders oluşturma.
- Ders listesini, her dersin ortalamasıyla birlikte görme.
- Var olan bir dersi seçerek sınav adı ve 0-100 arası puanla not ekleme.
- Ders detayında o derse ait notların listesi ve ortalaması.
- 0-100 aralığı dışındaki puanın kaydedilmesinin engellenmesi ve nedeninin gösterilmesi.
- Tüm verilerin cihazda kalıcı saklanması ve çevrimdışı çalışma.

## Kapsam Dışı

- Hesap, giriş, backend, bulut senkronizasyonu, yedekleme yoktur.
- Not silme/düzenleme, ders silme, dönem yönetimi, ağırlıklı GNO hesabı yoktur.
- Bildirim, takvim, dosya dışa aktarma, tema seçimi ve çoklu dil yoktur.

# Kullanıcı Akışları

## Ana Akış

1. Kullanıcı uygulamayı açar ve ders listesini görür.
2. Yeni ders ekler.
3. Ders listesinden bir derse not ekler.
4. Dersin ortalamasının güncellendiğini görür.

## Hata Akışları

- Ders adı boş bırakılırsa kayıt engellenir ve alanın altında neden gösterilir.
- Puan 0-100 aralığı dışındaysa kayıt engellenir ve neden gösterilir.
- Hiç ders yokken not ekleme ekranı açılırsa kullanıcı önce ders eklemeye yönlendirilir.

# Kritik Kullanıcı Akışları

Bu akışların her biri gerçek cihazda çalıştırılabilir integration testiyle
doğrulanmalıdır. Adımlar UI üzerinden yapılır; doğrulama kalıcı veri katmanına
kadar iner.

### Ders ekleme ve kalıcılık akışı

1. Uygulama açılır ve ders listesi ekranı görünür.
2. "Ders ekle" düğmesine basılır.
3. Ders adı "Veri Yapıları" ve kredi 4 girilip kaydedilir.
4. Ders listesine dönülür ve "Veri Yapıları" satırı görünür.
5. Uygulama yeniden başlatılır ve liste tekrar açılır.
- Beklenen sonuç: "Veri Yapıları" dersi yeniden açılışta listede korunur ve kredisi 4 görünür.

### Ders seçerek not ekleme ve ortalama akışı

1. Listede en az bir ders bulunan ekranda "Not ekle" düğmesine basılır.
2. Ders alanı için açılan seçim ekranından "Veri Yapıları" dersi seçilir.
3. Sınav adı "Vize" ve puan 80 girilip kaydedilir.
4. Aynı derse ikinci bir not olarak "Final" ve puan 60 eklenir.
5. Ders detay ekranı açılır.
- Beklenen sonuç: Ders detayında iki not listelenir ve ortalama 70 olarak gösterilir.

### Geçersiz puan engelleme akışı

1. Not ekleme ekranı açılır ve mevcut bir ders seçilir.
2. Sınav adı "Quiz" ve puan 130 girilir.
3. Kaydet düğmesine basılır.
- Beklenen sonuç: Kayıt yapılmaz, puan alanının altında 0-100 aralığı gerektiğini belirten hata görünür ve ders ortalaması değişmez.

# Ekranlar

## Ders Listesi Ekranı

Uygulamanın açılış ekranıdır. Dersleri ad, kredi ve ortalama ile listeler. Hiç ders
yoksa boş durum metni ve "Ders ekle" çağrısı gösterir. Üstte "Ders ekle" ve
"Not ekle" eylemleri bulunur.

## Ders Ekleme Ekranı

Ders adı (zorunlu, en az 2 karakter) ve kredi (zorunlu, 1-10 arası tam sayı)
alanlarını içerir. Kaydet düğmesi doğrulama başarısızsa kaydı yapmaz.

## Not Ekleme Ekranı

Ders alanı, sınav adı (zorunlu, en az 2 karakter) ve puan (zorunlu, 0-100 arası tam
sayı) alanlarını içerir. Ders alanı serbest metin değildir; dokunulduğunda kayıtlı
derslerin listelendiği bir seçim ekranı açılır ve seçilen dersin adı gösterilir.

## Ders Detay Ekranı

Seçilen dersin adını, kredisini, ortalamasını ve o derse ait notların listesini
sınav adı ve puanıyla gösterir. Notu olmayan ders için boş durum metni gösterir.

# Veri Modeli

- `courses`: `id` (TEXT, birincil anahtar), `name` (TEXT), `credit` (INTEGER),
  `created_at` (TEXT).
- `grades`: `id` (TEXT, birincil anahtar), `course_id` (TEXT, `courses.id` alanına
  foreign key, ON DELETE CASCADE), `exam_name` (TEXT), `score` (INTEGER),
  `created_at` (TEXT).
- Ortalama saklanmaz; ilgili dersin notlarından hesaplanır ve tam sayıya yuvarlanır.
- `grades.course_id` değeri yalnızca var olan bir ders kaydından gelir. Kullanıcı
  arayüzünde ders bir seçim ekranından seçilir; hiçbir ekranda kimlik değeri veya
  ders adı serbest metin olarak alınmaz.

# Mobil Platform Kararları

- Framework: Flutter, kararlı sürüm.
- Hedef platform: Android, minimum SDK 24.
- Ekran yönü: yalnızca dikey (portrait).
- Kalıcılık: cihaz üzerinde SQLite (`sqflite`), foreign key kısıtları etkin.
- Durum yönetimi: Flutter'ın yerleşik `StatefulWidget` ve `ValueNotifier` yapıları;
  ek durum yönetimi paketi kullanılmaz.
- Ağ erişimi yoktur; uygulama tamamen çevrimdışı çalışır.

# Navigasyon ve Ekran Davranışları

- Ders Listesi kök ekrandır; geri tuşu uygulamadan çıkar.
- Ders Ekleme, Not Ekleme, Ders Seçim ve Ders Detay ekranları kök ekranın üstüne
  itilir; geri tuşu bir önceki ekrana döner.
- Ders Seçim ekranı seçilen dersi Not Ekleme ekranına sonuç olarak döndürür; geri
  tuşuyla kapatılırsa seçim değişmez.
- Kaydetme işlemi sürerken kaydet düğmesi devre dışı kalır ve tekrar kayıt önlenir.
- Başarılı kayıttan sonra bir önceki ekrana dönülür ve liste güncellenmiş görünür.

# İzinler ve Cihaz Özellikleri

- Uygulama hiçbir Android çalışma zamanı izni istemez.
- İnternet, kamera, konum, dosya ve bildirim izinleri kullanılmaz; ürün manifesti
  `android/app/src/main/AndroidManifest.xml` hiçbir `uses-permission` satırı içermez.
- Flutter'ın yalnızca debug/profile yapılandırmalarında ürettiği manifestler
  toolchain dosyasıdır ve bu kuralın dışındadır.
- Kullanılan tek cihaz özelliği yerel dosya sistemindeki SQLite veritabanıdır.

# Teknik Kararlar

- Veri erişimi bir repository katmanı arkasındadır; UI doğrudan SQL çalıştırmaz.
- Doğrulama kuralları saf fonksiyonlarda tutulur ve birim testleriyle kapsanır.
- Hatalar yutulmaz: yakalanan hata ya incelenip kullanıcıya nedeniyle gösterilir ya
  da yeniden fırlatılır. Genel "işlem başarısız" mesajı tek başına yeterli değildir.
- Puan ve kredi alanları tam sayı olarak saklanır; ondalık değer kabul edilmez.
- Ortalama hesabı sıfır nota karşı güvenlidir; notu olmayan ders ortalama yerine
  "Not yok" gösterir.
- Her kritik kullanıcı akışı için `integration_test/` altında ayrı bir test dosyası
  bulunur.

# Tasarım Yönü

- Material 3 varsayılan bileşenleri, açık tema.
- Liste satırlarında ders adı birincil, kredi ve ortalama ikincil metin olarak yer alır.
- Dokunma hedefleri en az 48dp yüksekliğindedir.
- Hata metinleri ilgili alanın hemen altında kırmızı olarak gösterilir.
- Türkçe arayüz metinleri kullanılır.

# Kabul Kriterleri

- Ders eklenir, listede görünür ve uygulama yeniden başlatıldığında korunur.
- Not, yalnızca seçim ekranından seçilen bir derse eklenebilir.
- İki notu olan dersin ortalaması doğru hesaplanır ve detayda görünür.
- 0-100 aralığı dışındaki puan kaydedilmez ve nedeni ekranda görünür.
- Boş ders adı kaydedilmez ve nedeni ekranda görünür.
- Uygulama çevrimdışı çalışır ve hiçbir izin istemez.
- Üç kritik akış bir Android cihazda veya emülatörde uçtan uca çalışır.

# Kalite Gereksinimleri

- `flutter analyze` uyarısız geçer.
- Doğrulama ve ortalama hesabı için birim testleri bulunur.
- Repository katmanı için kalıcılık testleri bulunur.
- Üç kritik akışın her biri için `integration_test/` altında bir test dosyası bulunur.
- `flutter build apk --debug` başarıyla tamamlanır.
- Kaynak kodda hatayı ne inceleyen ne yeniden fırlatan `catch` bloğu bulunmaz.

# Açık Kararlar

Yok.
