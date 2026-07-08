# account-web-app — Sıfırdan Anlama Rehberi: Bir React SPA'nın Anatomisi

> Bu yazı, hiç React SPA mimarisine bakmamış bir geliştiricinin projeyi açıp "bu ne yapıyor, nerede başlıyor, nasıl çalışıyor?" sorularını tek bir oturuşta yanıtlamasını sağlamak için yazılmıştır.

---

## Projenin Özeti: Ne İş Yapar Bu Uygulama?

Bu, bir **sigorta/finans yönetim paneli**dir. İçinde şunlar var:

- Kullanıcı, rol ve izin yönetimi (IAM)
- Poliçe (sigorta sözleşmesi) oluşturma ve takibi
- Cari hesap, banka ve banka hareketi yönetimi
- Tahsilat, ödeme ve masraf takibi
- Raporlama ve dashboard grafikleri
- IoT cihaz ve birim yönetimi

---

## 1. Proje Kökü — Başlamadan Önce Bilmen Gerekenler

```
account-web-app/
├── index.html
├── vite.config.js
├── package.json
├── eslint.config.js
├── .prettierrc.json
├── translationKeys.js
├── translationFormKeys.js
├── commit-and-tag.js
└── deploy.sh
```

### index.html
Her React uygulamasının tek HTML dosyasıdır. Tarayıcı buraya gelir, içinde sadece `<div id="root"></div>` vardır. React bütün uygulamayı bu `div` içine enjekte eder. Vite bu dosyayı giriş noktası olarak kullanır.

### vite.config.js
Build aracı konfigürasyonu. Projenin `@components`, `@pages`, `@hooks` gibi path alias'larını (kısa yollarını) burada tanımlar. Yani kodun içinde `import X from '@components/Grid'` yazabiliyorsun, tam path yazmana gerek yok.

### package.json
Projenin kimlik kartı. Şu kütüphaneler kullanılıyor:

| Kütüphane | Ne İşe Yarar |
|-----------|-------------|
| `react` v19 | UI framework |
| `react-router-dom` v7 | Sayfa yönlendirme |
| `@tanstack/react-query` v5 | API istekleri ve cache |
| `zustand` v5 | Global state yönetimi |
| `@mui/material` v6 | UI component kütüphanesi |
| `ag-grid-enterprise` v33 | Gelişmiş veri tablosu |
| `echarts` | Grafik/chart kütüphanesi |
| `axios` | HTTP client |
| `react-hook-form` | Form yönetimi |
| `i18next` | Çoklu dil desteği |
| `dayjs` / `date-fns` | Tarih işlemleri |
| `ol` (OpenLayers) | Harita bileşeni |
| `xlsx` | Excel export |

### translationKeys.js ve translationFormKeys.js
Uygulamadaki tüm Türkçe/İngilizce metin anahtarları bu dosyalarda tanımlanmıştır. i18n sistemi bunları okur. `translationFormKeys.js` özellikle form alanlarının etiketlerini barındırır.

### commit-and-tag.js ve deploy.sh
Otomatik versiyon yönetimi. Build sonrası çalışır, git tag'i atar ve deploy eder. `package.json`'daki `postbuild` scripti bunu tetikler.

---

## 2. src/ — Uygulamanın Kalbi

```
src/
├── main.jsx          ← Giriş noktası
├── api/              ← HTTP istek fonksiyonları
├── components/       ← Paylaşılan UI bileşenleri
├── container/        ← Provider sarmalayıcısı
├── features/         ← Özellik bazlı modüller
├── hooks/            ← Global özel hook'lar
├── layouts/          ← Sayfa iskelet şablonları
├── pages/            ← Route bileşenleri
├── router/           ← Yönlendirme tanımları
├── shared/           ← Sabitler, utils, providers
├── store/            ← Global state (Zustand)
└── styles/           ← Global SCSS değişkenleri
```

### src/main.jsx
**Uygulamanın ilk çalışan satırı.** React'in `createRoot` ile `#root` elementine bağlandığı yer. Yapı şudur:

```
StrictMode
  └── Container (tüm Provider'ları sarar)
        └── App (Router)
```

`StrictMode`, geliştirme aşamasında hataları erken yakalar.

---

## 3. src/container/ — Sihirli Sarmalayıcı

### Container.jsx
Tüm Provider'ları iç içe sarmalar. Yani uygulamanın herhangi bir yerinden theme, notification, query, auth bilgilerine erişilebilmesi için bu katman gereklidir. Şöyle düşün: bir ampulü prize takmak gibi — Container, tüm altyapıyı "fişe" bağlar.

---

## 4. src/shared/ — Ortak Altyapı

```
shared/
├── axios/
│   └── axios.jsx
├── constant/
│   ├── api-constant.js
│   └── route-paths.js
├── providers/
│   ├── NotificationProvider.jsx
│   ├── QueryProvider.jsx
│   └── ThemeProvider.jsx
├── translation/
│   ├── i18n.js
│   └── locales.js
└── utils/
    ├── common.js
    ├── formatters.js
    └── UtilComps.jsx
```

### shared/axios/axios.jsx
Axios instance'ı burada konfigüre edilir. **Token yenileme mantığı** burada çalışır: her API isteğinden önce JWT token süresi kontrol edilir, `TOKEN_REFRESH_BUFFER` süresi dolmak üzereyse otomatik olarak refresh endpoint'i çağrılır. Kullanıcı oturumu sessizce uzatılmış olur.

### shared/constant/route-paths.js
URL path sabitleri tek yerde tanımlı. `/users`, `/policies/create-policy` gibi tüm path'ler buradan import edilir. String hardcode yazmak yerine `Routes.Users` yazılır — URL değişince tek yerden güncellenir.

### shared/constant/api-constant.js
API base URL gibi sabit değerler.

### shared/providers/QueryProvider.jsx
TanStack Query (React Query) `queryClient` örneğini oluşturur ve uygulamaya sağlar. Bu sayede her component, global cache'den veri okuyabilir, invalidate edebilir.

### shared/providers/ThemeProvider.jsx
MUI tema konfigürasyonu ve dark/light mode yönetimi burada. Renk paleti, tipografi, component override'ları hepsi buradan geçer.

### shared/providers/NotificationProvider.jsx
`NotificationContext` oluşturur. Uygulamanın herhangi bir yerinden `useNotification()` hook'u ile başarı/hata bildirimi gösterilebilir.

### shared/translation/i18n.js
i18next kütüphanesini başlatır. Türkçe ve İngilizce dil dosyalarını yükler, tarayıcı diline göre otomatik seçim yapar.

### shared/utils/common.js
Matematiksel yardımcılar: `round`, `addAndRound`, `subtractAndRound`, `divideAndRound` ve 13 daha. Para hesaplamalarında floating point hatalarını önlemek için kullanılır.

### shared/utils/formatters.js
Görüntü formatlayıcılar: IBAN'ı görüntüleme formatına çevirme, telefon numarasını DB formatına alma, email'i küçük harfe çevirme gibi.

### shared/utils/UtilComps.jsx
`TreeIconSelector` bileşeni: ağaç yapısındaki node'lara ikon atayan küçük bir yardımcı component.

---

## 5. src/store/ — Global State (Zustand)

```
store/
├── index.jsx
├── appStore.jsx
├── authStore.jsx
├── gridStore.jsx
├── themeStore.jsx
├── uiStore.jsx
└── slices/
    ├── graphSlice.jsx
    ├── modalSlice.jsx
    ├── refreshSlice.jsx
    └── userSlice.jsx
```

Bu proje **Zustand** ile global state yönetimi yapar. Redux gibi ama çok daha az boilerplate.

### store/authStore.jsx
Kullanıcı oturum bilgisi: token, kullanıcı rolü, giriş durumu. `useAuthStore()` hook'u ile her yerden erişilir.

### store/appStore.jsx
Genel uygulama state'i: aktif tenant, dil, genel konfigürasyonlar.

### store/gridStore.jsx
AG Grid'in kolon görünürlükleri, sıralama, filtreleme gibi durumlarını persiste eder. Sayfa yenilenince grid ayarları kaybolmaz.

### store/themeStore.jsx
Dark/light mode tercihi.

### store/uiStore.jsx
Sol menünün açık/kapalı durumu, loading spinner gibi UI state'leri.

### store/slices/
Zustand slice'ları — büyük store'u parçalara böler:
- **modalSlice.jsx**: hangi modal'ın açık olduğu
- **userSlice.jsx**: giriş yapmış kullanıcı detayları
- **refreshSlice.jsx**: grid'lerin yenileme trigger'ları
- **graphSlice.jsx**: dashboard grafik verileri

---

## 6. src/router/ — Sayfa Yönlendirme

```
router/
├── App.jsx
├── routeUtils/
│   ├── ProtectedRoute.jsx
│   ├── PermProtectedRoute.jsx
│   └── RoleProtectedRoute.jsx
└── routes/
    ├── publicRoutes.jsx
    ├── protectedRoutes.jsx
    └── errorRoutes.jsx
```

### router/App.jsx
React Router'ın `<Routes>` wrapper'ı. Üç route grubunu birleştirir: public, protected, error. Bu dosya çok sade — sadece organize eder.

### routes/publicRoutes.jsx
Giriş yapmadan erişilebilen sayfalar: `/login`, `/sign-up`.

### routes/protectedRoutes.jsx
**Uygulamanın tüm sayfa haritası.** `ProtectedRoute` wrapper'ı içinde şu pattern tekrarlanır:

```
/users              → Users (liste sayfası)
/users/create-user  → UserManagement create={true}
/users/edit-user    → UserManagement edit={true}
/users/view-user    → UserManagement view={true}
```

Aynı pattern: devices, units, accounts, policies, banks için de geçerli. Liste sayfası + 3 action sayfası (create/edit/view).

### routes/errorRoutes.jsx
`/unauthorized` gibi hata sayfaları.

### routeUtils/ProtectedRoute.jsx
Auth guard. Token yoksa `/login`'e yönlendirir. Token varsa `<Outlet />` ile alt route'ları render eder.

### routeUtils/PermProtectedRoute.jsx
Belirli izinlere sahip olmayan kullanıcıları engeller. `requiredPermissions` prop'u alır.

### routeUtils/RoleProtectedRoute.jsx
Belirli rollere göre erişim kısıtlaması.

---

## 7. src/layouts/ — Sayfa İskelet Şablonları

```
layouts/
├── Main/
│   ├── Main.jsx
│   └── Main.module.scss
└── Page/
    ├── Page.jsx
    └── Page.module.scss
```

### layouts/Main/Main.jsx
Giriş yapılmış tüm sayfaların ortak iskeletidir. İçinde `TopBar` (üst menü) ve `LeftBar` (sol menü) bulunur. Ortada `<Outlet />` ile aktif sayfa render edilir. Şöyle düşün:

```
┌─────────────────────────────────┐
│           TopBar                │
├──────────┬──────────────────────┤
│          │                      │
│ LeftBar  │   <Outlet />         │
│  (menü)  │   (aktif sayfa)      │
│          │                      │
└──────────┴──────────────────────┘
```

### layouts/Page/Page.jsx
İçerik alanı wrapper'ı. Her sayfanın doğru padding/margin alması için.

---

## 8. src/components/ — Paylaşılan UI Bileşenleri

Bu klasör, uygulamanın **tekrar kullanılabilir tuğlaları**dır. Hiçbir iş mantığı içermez, sadece UI. 50+ bileşen var, gruplar halinde açıklıyorum.

### Layout ve Navigasyon

**TopBar/** — Sayfanın üst çubuğu.
- `TopBar.jsx`: Container bileşeni
- `IconMenu.jsx`: Bildirim, ayarlar ikonları
- `UserAvatar.jsx`: Kullanıcı avatarı + çıkış menüsü

**LeftBar/** — Sol navigasyon menüsü.
- `LeftBar.jsx`: Ana menü container'ı
- `AbsoluteMenu.jsx`: Hover'da görünen ikincil menü
- `SettingMenu.jsx`: Ayarlar alt menüsü (dark mode, dil seçimi vb.)
- `ToggleBtn.jsx`: Menüyü açıp kapatan buton

**MenuAccordion/** — Sol menüdeki accordion (katlanır) menü grupları.

**Tabs/** ve **TabPanel/** — Sayfa içi sekme navigasyonu. `Tabs.jsx` içinde `useNavigate` kullanır, yani sekmeler URL ile senkronize çalışır.

### Grid (Veri Tabloları)

**Grid/Grid.jsx** — Bu projenin en kritik bileşeni. AG Grid Enterprise'ı sarar. `gridStatesToSave` ile kolon genişlikleri, sıralama, filtreler kullanıcı bazlı localStorage'da saklanır. Tüm liste sayfaları bu bileşeni kullanır.

**Grid/hooks/useGridUtils.jsx** — Satır yüksekliği hesaplama yardımcısı.

### Form Sistemi

**FormContainer/FormContainer.jsx** — Form'ların etrafındaki sarmalayıcı container.

**FormCreator/FormCreator.jsx** — **Projenin en önemli bileşenlerinden biri.** Bir konfigürasyon array'ine göre formu otomatik olarak oluşturur. `react-hook-form` ile çalışır. Her form elemanı için `FormInputs/` altındaki doğru bileşeni seçer.

**FormCreator/FormInputs/** — FormCreator'ın kullandığı form elemanları:

| Dosya | Ne Gösterir |
|-------|------------|
| `FormTextInput.jsx` | Metin girişi |
| `FormPasswordInput.jsx` | Şifre girişi (göster/gizle) |
| `FormSelect.jsx` | Dropdown select |
| `FormComboBox.jsx` | Çoklu seçim combobox |
| `FormComboBoxSingle.jsx` | Tekli seçim combobox |
| `FormFreeSoloComboBox.jsx` | Serbest yazım + seçim |
| `FormDateSelect.jsx` | Tarih seçici |
| `FormRangeSelect.jsx` | Tarih aralığı seçici |
| `FormSwitch.jsx` | Açık/kapalı toggle |
| `FormToggleButton.jsx` | Seçim toggle butonları |
| `FormDropdownAllUnit.jsx` | Hiyerarşik birim seçici |
| `FormValueShowcase.jsx` | Salt okunur değer gösterimi |
| `FormTextInfo.jsx` | Bilgi metni gösterimi |
| `utils.js` | Form yardımcı fonksiyonları |

### MUI Sarmalayıcılar (Mui* prefix'li)

Bu bileşenler MUI'yi projeye özel konfigürasyonla sarar:

**MuiComboBox/** — Autocomplete + çoklu seçim. `useComboBox.jsx` hook'u ile API'den veri çeker.

**MuiModal/MuiModal.jsx** — Modal dialog. Başlık, içerik, aksiyonlar için standart yapı.

**MuiModalButton/MuiModalButton.jsx** — Tıklanınca modal açan buton + modal kombinasyonu.

**MuiDatePicker/** ve **RangeDatePicker/** — Tarih seçiciler.

**MuiSimpleTree/** — MUI ağaç görünümü. Birim hiyerarşisi göstermek için kullanılır.

**MultiSelectTree/** — Checkbox'lı çoklu seçim ağacı. `findUnitById` ile hiyerarşide navigasyon yapar.

**MuiSelect/** ve **MuiSelectLabel/** — Etiketli dropdown.

**MuiLabel/**, **MuiTextInfo/**, **MuiTextInput/** — Etiket, bilgi metni, metin girişi.

**MuiButton/** — Standart buton. MUI Button wrapper'ı.

**MuiCheckbox/** — Checkbox bileşeni.

**MuiDivider/** — Bölme çizgisi.

**MuiToggleButtons/** — Grup toggle butonlar.

**MuiFreeSoloComboBox/** — Hem listeden seçim hem serbest yazım yapılabilen alan.

### Grafik Bileşenleri (ECharts)

Tüm chart bileşenleri `echarts-for-react` kütüphanesini kullanır ve `useMemo` ile performans optimizasyonu yapar:

- **BarChart/** — Dikey/yatay bar grafik. `handleDataZoom` ile zoom özelliği var.
- **MultiBarChart/** — Çok serili bar grafik.
- **PieChart/** — Pasta grafik.
- **CircularChart/** — Halka/dairesel grafik.
- **Gauge/** — Gösterge ibresi grafik (speedometer tarzı).
- **TemperatureGauge/** — Sıcaklık göstergesi tarzı özel gauge.
- **ChartCreator/** — Konfigürasyona göre farklı chart tipleri oluşturan meta-bileşen.

### Diğer UI Bileşenleri

**Calendar/** ve **DailyCalendar/** — Takvim gösterimi. `react-calendar` kütüphanesi üzerine.

**MapView/** — OpenLayers harita bileşeni. `useRef` + `useEffect` ile canvas'a mount edilir.

**DropdownAllUnit/** — Tüm birim hiyerarşisini listeleyen dropdown. Büyük ağaç yapıları için optimize edilmiş.

**Droppable/** — Sürükle-bırak hedef alanı. `useRef` + `useEffect` ile tarayıcı DnD API'si kullanılır.

**DeleteModalButton/** — "Sil" butonu + onay modalı kombinasyonu. `useState` ile modal görünürlüğü yönetilir.

**InfiniteLoading/** — Sonsuz scroll için yükleme göstergesi.

**Loading/** — Tam ekran veya inline spinner.

**InfoRow/** ve **ModalsInfoRow/** — Etiket: Değer satırı (detay sayfalarında kullanılır).

**PageTitle/** — Sayfa başlığı bileşeni.

**SearchComponent/** — Arama kutusu.

**ShadowButton/** — Gölgeli özel buton stili.

**RadioButton/** — Radio seçim.

**ToggleButton/**, **ToggleButtonGroup/**, **ToggleButtonWChild/** — Toggle buton varyantları. `ToggleButtonWChild` açıldığında alt içerik gösterir.

**SelectableAccordion/**, **SelectableMenuItem/** — Seçilebilir accordion ve menü öğeleri.

**ColorModeSelect/** — Dark/light mod seçici buton.

**TimeDisplay/** — Canlı saat göstergesi.

**PasswordInput/** — Göster/gizle toggle'lı şifre alanı.

---

## 9. src/hooks/ — Global Özel Hook'lar

```
hooks/
├── useGridHooks.jsx
├── useNotification.jsx
├── useOverflowMap.jsx
└── useOverflowText.jsx
```

### hooks/useGridHooks.jsx
AG Grid için `useCallback` + `useMemo` ile optimize edilmiş genel grid davranışları. Tüm grid hook'larının ortak mantığını sağlar.

### hooks/useNotification.jsx
`NotificationContext`'i consume eder. `const { showSuccess, showError } = useNotification()` şeklinde kullanılır.

### hooks/useOverflowText.jsx
Bir metin elemanının taşıp taşmadığını `useRef` + `useEffect` ile algılar. Tooltip gösterip göstermeme kararı için kullanılır.

### hooks/useOverflowMap.jsx
Birden fazla eleman için overflow tespiti — map yapısında çalışır.

---

## 10. src/api/ — HTTP İstek Fonksiyonları

```
api/
├── index.jsx     ← Otomatik import (barrel)
├── app.jsx       ← Genel uygulama endpoint'leri
├── entity.jsx    ← Cihaz ve birim endpoint'leri
├── iam.jsx       ← IAM, poliçe, finans endpoint'leri (58 endpoint)
└── meter.jsx     ← Sayaç/ölçüm endpoint'leri
```

Bu dosyalar saf fonksiyonlar içerir — axios ile API çağrısı yapıp sonucu döner. Business logic yok, sadece HTTP. Örnek pattern:

```js
export const getUsers = () => axios.get('/users')
export const createUser = (data) => axios.post('/users', data)
```

**api/iam.jsx** — En kalabalık dosya. Kullanıcı, rol, poliçe, hesap, banka, tahsilat, ödeme gibi tüm IAM endpoint'lerini içerir (58 adet).

**api/entity.jsx** — Cihaz, birim, tarife, metadata endpoint'leri (15 adet).

**api/meter.jsx** — Sayaç okuma endpoint'leri (4 adet).

---

## 11. src/features/ — Özellik Modülleri

Bu klasör, **feature-based (özellik bazlı) mimari**nin kalbi. Her özellik kendi `components/`, `hooks/`, `forms/`, `config/` klasörlerine sahip.

```
features/
├── iam/
│   ├── components/
│   ├── hooks/
│   ├── forms/
│   └── config/
└── entity/
    ├── components/
    └── hooks/
```

### features/iam/forms/

Form konfigürasyon dosyaları. `FormCreator` bileşenine verilecek alan dizilerini export eder.

| Dosya | İçeriği |
|-------|---------|
| `loginForm.jsx` | Email + şifre alanları |
| `signUpForm.jsx` | Kayıt formu alanları |
| `saveUserForm.jsx` | Kullanıcı kayıt formu |
| `saveAccountForm.jsx` | Cari hesap formu |
| `saveBankForm.jsx` | Banka formu (hardcoded banka isimleri) |
| `savePolicyForm.jsx` | Poliçe hızlı form |
| `policyForm.jsx` | Detaylı poliçe formu |

### features/iam/config/

**blockRenderConfig.js** — Poliçe detay sayfasındaki blokların (AccountInfoDisplay, InstallmentBlock vb.) hangi tip için nasıl render edileceğini tanımlar. `BLOCK_TYPES` ve `getBlockConfig` export eder.

### features/iam/components/ — IAM Özellik Bileşenleri

**LoginContainer/** — Login sayfasının içerik wrapper'ı. Form ve sosyal giriş butonlarını organize eder.

**SocialLogins/** — Google, vb. sosyal giriş butonları. `useNavigate` ile yönlendirme yapar.

**SaveUser/SaveUser.jsx** — Kullanıcı oluşturma/düzenleme formu. `saveUserForm` konfigürasyonunu `FormCreator`'a verir.

**SaveAccount/SaveAccount.jsx** — Cari hesap kayıt formu. `useMemo` ile dinamik form alanları hesaplar.

**SaveBank/SaveBank.jsx** — Banka kayıt formu.

**SavePolicy/** — **En karmaşık bileşen grubu.** Poliçe oluşturma ve düzenleme:

| Dosya | Ne Yapar |
|-------|---------|
| `SavePolicy.jsx` | Ana poliçe formu (~6800 token) |
| `AccountInstallmentBlock.jsx` | Taksit planı yönetimi (~9000 token) |
| `AccountInfoDisplay.jsx` | Hesap bilgisi özeti |
| `BankInfoDisplay.jsx` | Banka bilgisi özeti |
| `PolicyAttachments.jsx` | Dosya/evrak yönetimi (Google Drive) |
| `CancelPolicyModal.jsx` | Poliçe iptal onay modalı |
| `QuickAccountModal.jsx` | Hızlı hesap oluşturma modalı |

**PolicyHandler/PolicyHandler.jsx** — Poliçe liste sayfasındaki filtre ve aksiyon butonları. Toggle butonlarla görünüm değiştirilir.

**Collections/** — Tahsilat filtreleri ve tahsilat işlem modalı.

**Payments/** — Ödeme filtreleri ve ödeme işlem modalı.

**BankTransactions/** — Banka hareketi filtreleri.

**ReceivablePayable/** — Alacak/borç işlemleri: filtreler + yeni kayıt modalı.

**Expenses/ExpenseModal.jsx** — Masraf kayıt modalı. `BLOCK_ID` ile blok yapısı kullanır.

**Reports/PivotReportFilters.jsx** — Pivot rapor filtre paneli.

**CreateRole/** — Rol oluşturma formu.

**CreateUserGroup/**, **CreateDeviceGroup/**, **CreateUnitGroup/** — Grup oluşturma formları.

**AddUserGroupUser/**, **AddDeviceGroupDevice/**, **AddUnitGroupUnit/** — Gruba üye ekleme bileşenleri. `useRef` + `useCallback` + `useEffect` üçlüsüyle grid içi seçim yönetilir.

**RolePermission/**, **RolePolicy/**, **RoleDeviceGroup/**, **RoleUnitGroup/**, **RoleUserGroup/** — Rol-varlık ilişki yönetim bileşenleri. Rol sayfasında sekmeler arasında gösterilir.

### features/iam/hooks/ — IAM Hook'ları

Bu, projenin en kalabalık hook koleksiyonudur. Her hook tek bir sorumluluğa sahiptir. İki ana kategoride düşün:

**Veri Okuma Hook'ları (useQuery kullananlar):**

| Hook | Ne Döner |
|------|---------|
| `useGetUser` | Tek kullanıcı |
| `useGetAccount` | Tek cari hesap |
| `useGetPolicy` | Tek poliçe |
| `useGetPolicyDetailed` | Taksitli poliçe detayı |
| `useGetBank` | Tek banka |
| `useGetInstallments` | Taksit listesi |
| `useAccountTypes` | Hesap tipleri listesi |
| `useRoles` | Rol listesi |
| `useDeviceGroup` | Cihaz grubu |
| `useUnitGroup` | Birim grubu |
| `useUserGroup` | Kullanıcı grubu |

**Veri Yazma Hook'ları (useMutation kullananlar):**

| Hook | Ne Yapar |
|------|---------|
| `useSaveUser` | Kullanıcı kaydeder/günceller |
| `useSaveAccount` | Cari hesap kaydeder |
| `useSaveAccountModal` | Modal içinden hızlı hesap |
| `useSaveBank` | Banka kaydeder |
| `useSavePolicy` | Poliçe kaydeder |
| `usePolicySave` | Poliçe günceller |
| `useSaveRole` | Rol kaydeder |
| `useCancelPolicy` | Poliçe iptal eder |
| `useCollectInstallments` | Taksit tahsilatı |
| `usePayInstallments` | Taksit ödemesi |
| `useCancelInstallments` | Taksit iptal |
| `useSaveInstallments` | Taksit düzenler |
| `useSaveExpense` | Masraf kaydeder |
| `useDeleteExpense` | Masraf siler |
| `useSaveReceivablePayable` | Alacak/borç kaydeder |
| `useLogin` | Giriş yapar, token alır |
| `useLogout` | Çıkış yapar, token siler |
| `useSignUp` | Kayıt olur |

**Grid Hook'ları (useMemo + useCallback ile kolon tanımları):**

| Hook | Grid'i |
|------|--------|
| `useUserGrid` | Kullanıcılar listesi |
| `useAccountGrid` | Cari hesaplar listesi |
| `useBankGrid` | Bankalar listesi |
| `useGetPolicyGrid` | Poliçeler listesi |
| `usePolicyGrid` | Poliçe yardımcısı |
| `useInstallmentGrid` | Taksitler listesi |
| `useBankTransactionGrid` | Banka hareketleri |
| `useReceivablePayableGrid` | Alacak/borç listesi |
| `usePendingCollectionsGrid` | Bekleyen tahsilatlar |
| `usePendingPaymentsGrid` | Bekleyen ödemeler |
| `useExpenseGrid` | Masraflar listesi |
| `useRolePermission` | Rol-izin grid |
| `useRoleDeviceGroup` vb. | Rol ilişki grid'leri |

**Özel Hook'lar:**

**useDashboardData.jsx** — Dashboard verilerini çeker ve formatlar. `useState` + `useCallback`.

**usePivotReportDownloader.jsx** — Pivot raporu Excel formatında indirir. `xlsx` kütüphanesi kullanılır (~3858 token — en büyük hook).

**usePolicyAttachments.jsx** — Poliçeye eklenen dosyaları (Google Drive) yönetir.

### features/entity/ — Cihaz ve Birim Modülü

**components:**
- **CreateDevice/** — Cihaz kayıt formu
- **CreateUnit/** — Birim kayıt formu
- **CreateTariff/** — Tarife kayıt formu (`tariffForms.js` ile konfigürasyon)
- **SelectMetadata/** — Metadata seçim formu
- **MultiSelectUnitTreeBtn/** — Ağaç yapısında çoklu birim seçim butonu

**hooks:**
- **useDeviceGrid/** ve **useUnitGrid/** — Grid kolon tanımları
- **useGetDevice/** ve **useGetUnit/** — Tekil veri çekme
- **usePostDevice/** ve **usePostUnit/** — Kayıt mutation'ları
- **useAllUnitTree/** — Tüm birim hiyerarşisi
- **useAsyncTree/** — Lazy yüklenen ağaç yapısı
- **useMetadataLibrary/** ve **useMetadataTypes/** — Metadata verileri
- **useSaveTariff/** — Tarife kaydetme

---

## 12. src/pages/ — Sayfalar (Route Bileşenleri)

Her sayfa, route'dan gelen `create`, `edit`, `view` prop'larını alarak aynı bileşenin farklı modlarını gösterir. Liste sayfaları Grid bileşenini, yönetim sayfaları FormCreator'ı kullanır.

### Kimlik Doğrulama Sayfaları

**login/Login.jsx** — Giriş sayfası. `LoginContainer` + `loginForm` konfigürasyonu + `useLogin` hook'u.

**sign-up/SignUp.jsx** — Kayıt sayfası. `signUpForm` + `useSignUp` hook'u.

**unauthorized/Unauthorized.jsx** — Yetkisiz erişim sayfası. "Geri Dön" butonu `useNavigate` ile.

### Dashboard

**dashboards/Dashboards.jsx** — Özet dashboard sayfası. `useDashboardData` hook'u + ECharts grafikleri. `useMemo` ile ağır hesaplamalar optimize edilir. Responsive grid layout.

### Kullanıcı Yönetimi

**users/Users.jsx** — Kullanıcı listesi. `useRef` ile grid referansı, `useNavigate` ile create/edit yönlendirmesi.

**user-management/UserManagement.jsx** — Kullanıcı oluşturma/düzenleme/görüntüleme. `create|edit|view` prop'una göre form modu değişir.

### Cihaz Yönetimi

**devices/Devices.jsx** ve **device-management/DeviceManagement.jsx** — Cihaz listesi ve CRUD sayfaları.

### Birim Yönetimi

**units/Units.jsx** ve **unit-management/UnitManagement.jsx** — Birim (organizasyon hiyerarşisi) listesi ve CRUD sayfaları.

### Rol Yönetimi

**roles/Roles.jsx** — Roller sayfası. İçinde roller, rol-izin, rol-grup sekmeleri bulunur. `useState` ile aktif sekme yönetilir.

### Cari Hesap Yönetimi

**accounts/Accounts.jsx** ve **account-management/AccountManagement.jsx** — Cari hesap listesi ve CRUD sayfaları.

### Poliçe Yönetimi

**policy/policy.jsx** — Poliçe listesi. Filtre paneli + AG Grid.

**policy-management/PolicyManagement.jsx** — Poliçe CRUD. `SavePolicy` bileşenini `create|edit|view` moduyla çağırır.

**Policies.jsx** — Kısa redirect/wrapper.

### Banka Yönetimi

**banks/Banks.jsx** ve **bank-management/BankManagement.jsx** — Banka listesi ve CRUD.

**bank-transactions/BankTransactions.jsx** — Banka hareketi listesi. `useState` + `useEffect` ile filtre state yönetimi.

### Finans Sayfaları

**receivable-payable/ReceivablePayable.jsx** — Alacak/borç listesi. `useCallback` + `useEffect` ile filtre uygulaması.

**collections/Collections.jsx** — Tahsilat listesi ve işlemleri. `useRef` ile grid + `useState` ile filtre + `useEffect` ile otomatik yenileme.

**pending-collections/PendingCollections.jsx** — Bekleyen tahsilatlar.

**payments/Payments.jsx** — Ödeme listesi.

**payments/IntermediaryPayments.jsx** — Aracı ödemeleri listesi. Payments.jsx ile aynı yapı, farklı endpoint.

**pending-payments/PendingPayments.jsx** — Bekleyen ödemeler.

**expenses/Expenses.jsx** — Masraf listesi + yeni masraf modal tetikleyici.

### Raporlama

**reports/PivotReport.jsx** — Pivot rapor sayfası. Filtreler + tablo/grafik görünümü. `usePivotReportDownloader` ile Excel export.

---

## 13. src/styles/ — Global SCSS Değişkenleri

```
styles/
├── _animations.scss   ← Animasyon değişkenleri (6 adet)
├── _breakpoints.scss  ← Responsive breakpoint'ler
├── _colors.scss       ← Renk paleti (56 CSS custom property)
└── _globals.scss      ← Global sıfırlama kuralları
```

Tüm dosyalar `_` ile başlar, bu SCSS'te "partial" anlamına gelir — doğrudan compile edilmez, diğer dosyalar import eder.

**_colors.scss** — Uygulamanın bütün renkleri CSS custom property (`--color-primary` vb.) olarak burada. Dark mode renkleri de burada. 56 renk değişkeni var.

**_breakpoints.scss** — Responsive tasarım için breakpoint mixin'leri: `sm`, `md`, `lg`, `xl`.

---

## 14. Veri Akışının Büyük Resmi

Bir sayfada ne olduğunu anlamak için tek bir örnek yeterli. **Kullanıcı "Poliçeler" sayfasına gittiğinde:**

```
1. URL: /policies
   └─ protectedRoutes.jsx → <Pages.Policies />

2. ProtectedRoute kontrol eder:
   └─ authStore'dan token var mı?
   └─ Evet → Layouts.Main render edilir
   └─ Main = TopBar + LeftBar + <Outlet />

3. Outlet içinde Policies.jsx açılır
   └─ useGetPolicyGrid() hook'u çağrılır
   └─ Hook içinde useQuery → api/iam.jsx → axios → backend API

4. Veri gelince:
   └─ Grid.jsx bileşeni AG Grid'i render eder
   └─ Kolon tanımları hook'tan gelir (useMemo ile)
   └─ Filtreler PolicyHandler.jsx ile yönetilir

5. Kullanıcı "Yeni Poliçe" butonuna tıklar:
   └─ useNavigate → /policies/create-policy
   └─ PolicyManagement create={true} render edilir
   └─ SavePolicy.jsx açılır
   └─ usePolicySave hook'u hazır bekler

6. Kullanıcı formu doldurur ve kaydeder:
   └─ usePolicySave → useMutation → api/iam.jsx → backend
   └─ Başarılıysa → useNotification ile toast gösterilir
   └─ Query invalidate → liste otomatik güncellenir
   └─ useNavigate → /policies listesine dönülür
```

---

## 15. Mimari Özet: Ne Nerede?

| Konu | Konum |
|------|-------|
| **Uygulama başlangıcı** | `src/main.jsx` |
| **Provider'lar (theme, query, notification)** | `src/container/` + `src/shared/providers/` |
| **Route tanımları** | `src/router/routes/` |
| **Auth koruması** | `src/router/routeUtils/ProtectedRoute.jsx` |
| **Sayfa iskeletleri** | `src/layouts/` |
| **Sayfa bileşenleri** | `src/pages/` |
| **İş mantığı hook'ları** | `src/features/iam/hooks/` ve `src/features/entity/hooks/` |
| **API çağrıları** | `src/api/` |
| **Global state** | `src/store/` (Zustand) |
| **Paylaşılan UI** | `src/components/` |
| **Form konfigürasyonları** | `src/features/iam/forms/` |
| **Sabitler ve path'ler** | `src/shared/constant/` |
| **Axios + token yönetimi** | `src/shared/axios/axios.jsx` |
| **Çeviri sistemi** | `src/shared/translation/` + `translationKeys.js` |
| **Renk/breakpoint değişkenleri** | `src/styles/` |

---

> Bu yapı, **"separation of concerns" (sorumlulukların ayrılması)** prensibini uygular: API çağrıları `api/`, iş mantığı `hooks/`, UI `components/`, sayfa düzeni `layouts/`, route'lar `router/` klasöründe yaşar. Yeni bir özellik eklerken hangi katmana dokunman gerektiğini her zaman bilirsin.
