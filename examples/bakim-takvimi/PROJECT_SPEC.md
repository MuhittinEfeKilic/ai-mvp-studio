---
spec_version: "1.0"
project_name: "Bakım Takvimi"
project_slug: "bakim-takvimi"
project_profile: "flutter_mobile"
application_type: "mobile"
framework: "flutter"
target_platform: "android"
package_name: "com.aimvpstudio.bakimtakvimi"
min_android_sdk: "24"
orientation: "portrait"
device_test: "required"
language: "tr"
status: "approved"
---

# Ürün Özeti

Bakım Takvimi, küçük bir atölyenin makinelerinin periyodik bakımlarını internetsiz
olarak takip etmesini sağlayan local-first bir Android uygulamasıdır. MVP; ekipman
tanımlama, bakım kaydı girme, her ekipmanın sonraki bakım tarihini periyoda göre
hesaplama, gecikmiş ve yaklaşan bakımları listede ayırt etme ve geçersiz girdileri
nedeniyle birlikte reddetme işlerini eksiksiz sunar.

## Hedef Kullanıcılar

- 5-30 makinesi olan, bakım takibini şu anda kağıt veya akılda tutan atölye sahipleri.
- Uygulamayı makine başında, tek elle ve kısa oturumlarda kullanan teknisyenler.

# MVP Kapsamı

## Dahil

- Ekipman adı, benzersiz ekipman kodu ve gün cinsinden bakım periyoduyla ekipman tanımlama.
- Aynı ekipman kodunun ikinci kez kullanılmasının engellenmesi.
- Var olan bir ekipmanı seçerek, tarih ve isteğe bağlı notla bakım kaydı girme.
- Her ekipman için sonraki bakım tarihinin son bakımdan ve periyottan hesaplanması.
- Ekipman listesinin bakım durumuna göre sıralanması ve durumun listede gösterilmesi.
- Ekipman detayında bakım geçmişinin en yeniden eskiye listelenmesi.
- Gelecek tarihli bakım kaydının engellenmesi ve nedeninin gösterilmesi.
- Tüm verilerin cihazda kalıcı saklanması ve çevrimdışı çalışma.

## Kapsam Dışı

- Hesap, giriş, backend, bulut senkronizasyonu ve yedekleme yoktur.
- Ekipman veya bakım kaydı silme/düzenleme, arşivleme yoktur.
- Bildirim, hatırlatma, takvim entegrasyonu, fotoğraf, barkod ve dışa aktarma yoktur.
- Çoklu kullanıcı, yetkilendirme, tema seçimi ve çoklu dil yoktur.

# Kullanıcı Akışları

## Ana Akış

1. Kullanıcı uygulamayı açar ve ekipman listesini bakım durumuyla birlikte görür.
2. Yeni ekipman tanımlar.
3. Listeden bir ekipmana bakım kaydı girer.
4. Ekipmanın sonraki bakım tarihinin ve durumunun güncellendiğini görür.

## Hata Akışları

- Ekipman kodu daha önce kullanılmışsa kayıt engellenir ve alanın altında neden gösterilir.
- Bakım tarihi bugünden ileriyse kayıt engellenir ve nedeni gösterilir.
- Bakım periyodu 1-365 aralığı dışındaysa kayıt engellenir ve nedeni gösterilir.
- Hiç ekipman yokken bakım kaydı ekranı açılırsa kullanıcı önce ekipman eklemeye yönlendirilir.

# Kritik Kullanıcı Akışları

Bu akışların her biri gerçek cihazda çalıştırılabilir integration testiyle
doğrulanmalıdır. Adımlar UI üzerinden yapılır; doğrulama kalıcı veri katmanına
kadar iner.

### Ekipman tanımlama ve kalıcılık akışı

1. Uygulama açılır ve ekipman listesi ekranı görünür.
2. "Ekipman ekle" düğmesine basılır.
3. Ad "Torna Tezgahı", kod "TRN-01" ve periyot 30 girilip kaydedilir.
4. Ekipman listesine dönülür ve "Torna Tezgahı" satırı görünür.
5. Uygulama yeniden başlatılır ve liste tekrar açılır.
- Beklenen sonuç: "Torna Tezgahı" ekipmanı yeniden açılışta listede korunur ve kodu "TRN-01" görünür.

### Bakım kaydı girme ve sonraki tarih akışı

1. Listede en az bir ekipman bulunan ekranda "Bakım ekle" düğmesine basılır.
2. Ekipman alanı için açılan seçim ekranından "Torna Tezgahı" seçilir.
3. Bakım tarihi olarak bugün seçilir ve kaydedilir.
4. Ekipman detay ekranı açılır.
- Beklenen sonuç: Bakım geçmişinde bugünkü kayıt görünür ve sonraki bakım tarihi bugünden 30 gün sonrası olarak gösterilir.

### Gecikmiş bakımın listede ayırt edilmesi akışı

1. Periyodu 7 gün olan bir ekipman tanımlanır.
2. Bu ekipmana bakım tarihi bugünden 30 gün önce olan bir kayıt girilir.
3. Ekipman listesine dönülür.
- Beklenen sonuç: Ekipman listede "Gecikmiş" durumuyla işaretlenir ve gecikmiş ekipmanlar listenin en üstünde yer alır.

### Gelecek tarihli bakım engelleme akışı

1. Bakım ekleme ekranı açılır ve mevcut bir ekipman seçilir.
2. Bakım tarihi olarak yarının tarihi seçilir.
3. Kaydet düğmesine basılır.
- Beklenen sonuç: Kayıt yapılmaz, tarih alanının altında bakım tarihinin gelecekte olamayacağını belirten hata görünür ve ekipmanın sonraki bakım tarihi değişmez.

### Yinelenen ekipman kodu engelleme akışı

1. "TRN-01" kodlu bir ekipman zaten tanımlıyken "Ekipman ekle" ekranı açılır.
2. Ad "İkinci Torna", kod "TRN-01" ve periyot 15 girilir.
3. Kaydet düğmesine basılır.
- Beklenen sonuç: Kayıt yapılmaz, kod alanının altında bu kodun kullanıldığını belirten hata görünür ve listedeki ekipman sayısı değişmez.

# Ekranlar

## Ekipman Listesi Ekranı

Uygulamanın açılış ekranıdır. Her satırda ekipman adı, kodu, sonraki bakım tarihi ve
bakım durumu rozeti bulunur. Liste önce gecikmiş, sonra yaklaşan, sonra normal
ekipmanları gösterir; her grup kendi içinde sonraki bakım tarihine göre artan
sıralanır. Hiç ekipman yoksa boş durum metni ve "Ekipman ekle" çağrısı gösterilir.
Üstte "Ekipman ekle" ve "Bakım ekle" eylemleri bulunur.

## Ekipman Ekleme Ekranı

Ad (zorunlu, en az 2 karakter), kod (zorunlu, 2-16 karakter, büyük harfe çevrilir,
benzersiz) ve periyot (zorunlu, 1-365 arası tam sayı) alanlarını içerir. Kaydet
düğmesi doğrulama başarısızsa kaydı yapmaz.

## Bakım Ekleme Ekranı

Ekipman alanı, bakım tarihi ve isteğe bağlı not alanlarını içerir. Ekipman alanı
serbest metin değildir; dokunulduğunda tanımlı ekipmanların listelendiği bir seçim
ekranı açılır ve seçilen ekipmanın adı ile kodu gösterilir. Bakım tarihi varsayılan
olarak bugündür ve tarih seçiciyle değiştirilir.

## Ekipman Detay Ekranı

Seçilen ekipmanın adını, kodunu, periyodunu, sonraki bakım tarihini, durum rozetini
ve bakım geçmişini en yeniden eskiye listeler. Her kayıtta tarih ve varsa not
görünür. Hiç bakım kaydı yoksa boş durum metni gösterilir.

# Veri Modeli

- `equipment`: `id` (TEXT, birincil anahtar), `name` (TEXT), `code` (TEXT, benzersiz),
  `interval_days` (INTEGER), `created_on` (TEXT, ISO 8601 tarih), `created_at` (TEXT).
- `maintenance_records`: `id` (TEXT, birincil anahtar), `equipment_id` (TEXT,
  `equipment.id` alanına foreign key, ON DELETE CASCADE), `performed_on` (TEXT,
  ISO 8601 tarih), `note` (TEXT, boş olabilir), `created_at` (TEXT).
- `equipment.code` üzerinde benzersiz kısıt bulunur; yinelenen kod veritabanı
  seviyesinde de reddedilir.
- Sonraki bakım tarihi saklanmaz; hesaplanır. Ekipmanın en yeni `performed_on`
  değeri varsa ona, yoksa `created_on` değerine `interval_days` eklenir.
- Bakım durumu da saklanmaz; sonraki bakım tarihi ile bugünün tarihi karşılaştırılarak
  belirlenir.
- `maintenance_records.equipment_id` değeri yalnızca var olan bir ekipman kaydından
  gelir. Kullanıcı arayüzünde ekipman bir seçim ekranından seçilir; hiçbir ekranda
  kimlik değeri veya ekipman kodu serbest metin olarak alınmaz.

# Mobil Platform Kararları

- Framework: Flutter, kararlı sürüm.
- Hedef platform: Android, minimum SDK 24.
- Ekran yönü: yalnızca dikey (portrait).
- Kalıcılık: cihaz üzerinde SQLite (`sqflite`), foreign key kısıtları etkin.
- Durum yönetimi: Flutter'ın yerleşik `StatefulWidget` ve `ValueNotifier` yapıları;
  ek durum yönetimi paketi kullanılmaz.
- Ağ erişimi yoktur; uygulama tamamen çevrimdışı çalışır.

# Navigasyon ve Ekran Davranışları

- Ekipman Listesi kök ekrandır; geri tuşu uygulamadan çıkar.
- Ekipman Ekleme, Bakım Ekleme, Ekipman Seçim ve Ekipman Detay ekranları kök ekranın
  üstüne itilir; geri tuşu bir önceki ekrana döner.
- Ekipman Seçim ekranı seçilen ekipmanı Bakım Ekleme ekranına sonuç olarak döndürür;
  geri tuşuyla kapatılırsa seçim değişmez.
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
- Tarih hesapları saf fonksiyonlarda tutulur ve birim testleriyle kapsanır.
- Tarihler yerel saat diliminde gün hassasiyetiyle işlenir; saat, dakika ve saniye
  bileşenleri yok sayılır. Karşılaştırmalar gün başlangıcına normalize edilerek yapılır.
- Bakım durumu şu kurala göre belirlenir: sonraki bakım tarihi bugünden önceyse
  `Gecikmiş`, bugün ile bugünden 7 gün sonrası arasındaysa `Yaklaşıyor`, daha ileriyse
  `Normal`.
- Ekipman kodu kaydedilmeden önce büyük harfe çevrilir ve baştaki/sondaki boşluklar
  kırpılır; benzersizlik bu normalize edilmiş değer üzerinden kontrol edilir.
- Hatalar yutulmaz: yakalanan hata ya incelenip kullanıcıya nedeniyle gösterilir ya
  da yeniden fırlatılır. Genel "işlem başarısız" mesajı tek başına yeterli değildir.
- Yinelenen kod hatası veritabanı kısıtından gelse bile kullanıcıya kod alanının
  altında anlaşılır bir mesaj olarak gösterilir.
- Her kritik kullanıcı akışı için `integration_test/` altında ayrı bir test dosyası
  bulunur.

# Tasarım Yönü

- Material 3 varsayılan bileşenleri, açık tema.
- Bakım durumu rozetleri renk ve metni birlikte kullanır; yalnız renge dayanmaz.
- Liste satırlarında ekipman adı birincil, kod ve sonraki bakım tarihi ikincil metindir.
- Dokunma hedefleri en az 48dp yüksekliğindedir.
- Hata metinleri ilgili alanın hemen altında kırmızı olarak gösterilir.
- Türkçe arayüz metinleri ve gün/ay/yıl biçiminde tarih gösterimi kullanılır.

# Kabul Kriterleri

- Ekipman tanımlanır, listede görünür ve uygulama yeniden başlatıldığında korunur.
- Bakım kaydı yalnızca seçim ekranından seçilen bir ekipmana eklenebilir.
- Bakım kaydından sonra sonraki bakım tarihi, kayıt tarihine periyot eklenerek gösterilir.
- Sonraki bakım tarihi geçmişte kalan ekipman listede "Gecikmiş" olarak işaretlenir
  ve gecikmiş ekipmanlar listenin başında yer alır.
- Gelecek tarihli bakım kaydı kaydedilmez ve nedeni ekranda görünür.
- Daha önce kullanılmış bir ekipman kodu kaydedilmez ve nedeni ekranda görünür.
- 1-365 aralığı dışındaki bakım periyodu kaydedilmez ve nedeni ekranda görünür.
- Uygulama çevrimdışı çalışır ve hiçbir izin istemez.

# Kalite Gereksinimleri

- `flutter analyze` uyarısız geçer.
- Tarih hesabı, durum belirleme ve doğrulama kuralları için birim testleri bulunur.
- Repository katmanı için kalıcılık ve benzersizlik kısıtı testleri bulunur.
- Beş kritik akışın her biri için `integration_test/` altında bir test dosyası bulunur.
- `flutter build apk --debug` başarıyla tamamlanır.
- Kaynak kodda hatayı ne inceleyen ne yeniden fırlatan `catch` bloğu bulunmaz.

# Açık Kararlar

Yok.
