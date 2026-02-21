#!/bin/bash
# Generate full Next.js app fixture matching the real codebase structure
BASE="/Users/van/projects/react-graph/test/fixture-realworld"

# Helper: create a page component with imports
page() {
  local file="$1"; shift
  local name="$1"; shift
  local dir=$(dirname "$file")
  mkdir -p "$dir"

  local imports=""
  for imp in "$@"; do
    # Extract component name from path (last segment without extension)
    local comp=$(basename "$imp" | sed 's/\..*//')
    imports="$imports
import $comp from '$imp';"
  done

  cat > "$file" << EOF
import React from 'react';$imports

export default function $name() { return <div />; }
EOF
}

# Helper: layout component
layout() {
  local file="$1"; shift
  local name="$1"; shift
  local dir=$(dirname "$file")
  mkdir -p "$dir"

  local imports=""
  for imp in "$@"; do
    local comp=$(basename "$imp" | sed 's/\..*//')
    imports="$imports
import $comp from '$imp';"
  done

  cat > "$file" << EOF
import React from 'react';$imports

export default function $name({ children }: { children: React.ReactNode }) { return <div>{children}</div>; }
EOF
}

# Helper: API route (minimal)
route() {
  local file="$1"; shift
  local name="$1"; shift
  local dir=$(dirname "$file")
  mkdir -p "$dir"

  cat > "$file" << EOF
export async function GET() { return Response.json({}); }
export async function POST() { return Response.json({}); }
EOF
}

# ════════════════════════════════════════════════════════════════════
# ROOT LAYOUTS & PAGES
# ════════════════════════════════════════════════════════════════════
layout "$BASE/app/layout.tsx" "RootLayout" \
  "../components/layout/Header" \
  "../components/layout/Footer" \
  "../components/layout/GoogleTranslate"

page "$BASE/app/login/page.tsx" "LoginPage" \
  "../../components/ui/Card" \
  "../../components/ui/Input" \
  "../../components/ui/Button" \
  "../../components/ui/Label"

layout "$BASE/app/login/layout.tsx" "LoginLayout"

page "$BASE/app/signup/page.tsx" "SignupPage" \
  "../../components/ui/Card" \
  "../../components/ui/Input" \
  "../../components/ui/Button" \
  "../../components/ui/Label" \
  "../../components/ui/Select"

layout "$BASE/app/signup/layout.tsx" "SignupLayout"

page "$BASE/app/membership/page.tsx" "MembershipPage" \
  "../../components/ui/Card" \
  "../../components/ui/Button" \
  "../../components/ui/Badge"

page "$BASE/app/membership/dashboard/page.tsx" "MembershipDashboard" \
  "../../../components/ui/Card" \
  "../../../components/ui/Badge" \
  "../../../components/ui/Skeleton"

page "$BASE/app/open-in-browser/page.tsx" "OpenInBrowser" \
  "../../components/ui/Card" \
  "../../components/ui/Button"

# ════════════════════════════════════════════════════════════════════
# API ROUTES (sample — these are server-side, minimal deps)
# ════════════════════════════════════════════════════════════════════
route "$BASE/app/api/chat/route.ts" "chatApi"
route "$BASE/app/api/chat/history/route.ts" "chatHistoryApi"
route "$BASE/app/api/cycle/prediction/route.ts" "cyclePredictionApi"
route "$BASE/app/api/cycle/entries/route.ts" "cycleEntriesApi"
route "$BASE/app/api/cycle/settings/route.ts" "cycleSettingsApi"
route "$BASE/app/api/cycle/pregnancy/route.ts" "pregnancyApi"
route "$BASE/app/api/cycle/report/route.ts" "cycleReportApi"
route "$BASE/app/api/cycle/cycles/route.ts" "cyclesApi"
route "$BASE/app/api/family/members/route.ts" "familyMembersApi"
route "$BASE/app/api/family/relationships/route.ts" "familyRelationshipsApi"
route "$BASE/app/api/family/anniversaries/route.ts" "familyAnniversariesApi"
route "$BASE/app/api/family-vault/unlock/route.ts" "vaultUnlockApi"
route "$BASE/app/api/family-vault/lock/route.ts" "vaultLockApi"
route "$BASE/app/api/family-vault/setup/route.ts" "vaultSetupApi"
route "$BASE/app/api/family-vault/status/route.ts" "vaultStatusApi"
route "$BASE/app/api/family-vault/change-pin/route.ts" "changePinApi"
route "$BASE/app/api/family-vault/reset-pin/route.ts" "resetPinApi"
route "$BASE/app/api/family-vault/keepalive/route.ts" "keepaliveApi"
route "$BASE/app/api/family-vault/send-reset-otp/route.ts" "sendResetOtpApi"
route "$BASE/app/api/family-vault/update-settings/route.ts" "updateSettingsApi"
route "$BASE/app/api/sexual-health/partners/route.ts" "partnersApi"
route "$BASE/app/api/sexual-health/sessions/route.ts" "sessionsApi"
route "$BASE/app/api/sexual-health/user-profile/route.ts" "userProfileApi"
route "$BASE/app/api/sexual-health/age-ack/route.ts" "ageAckApi"
route "$BASE/app/api/sexual-health/reports/monthly/route.ts" "monthlyReportApi"
route "$BASE/app/api/sexual-health/reports/yearly/route.ts" "yearlyReportApi"
route "$BASE/app/api/blog/posts/route.ts" "blogPostsApi"
route "$BASE/app/api/blog/categories/route.ts" "blogCategoriesApi"
route "$BASE/app/api/anniversaries/route.ts" "anniversariesApi"
route "$BASE/app/api/love-diaries/upload/image/route.ts" "loveDiaryUploadApi"
route "$BASE/app/api/prescriptions/convert-heic/route.ts" "heicConvertApi"
route "$BASE/app/api/rituals/upload/offering-photo/route.ts" "ritualUploadApi"
route "$BASE/app/api/provinces/route.ts" "provincesApi"
route "$BASE/app/api/wards/route.ts" "wardsApi"
route "$BASE/app/api/configurations/route.ts" "configurationsApi"
route "$BASE/app/api/feedback/route.ts" "feedbackApi"
route "$BASE/app/api/admin/users/route.ts" "adminUsersApi"
route "$BASE/app/api/admin/customers/route.ts" "adminCustomersApi"
route "$BASE/app/api/admin/customers/paginated/route.ts" "paginatedCustomersApi"
route "$BASE/app/api/admin/products/route.ts" "adminProductsApi"
route "$BASE/app/api/admin/orders/route.ts" "adminOrdersApi"
route "$BASE/app/api/admin/orders/create/route.ts" "createOrderApi"
route "$BASE/app/api/admin/orders/payment-status/route.ts" "paymentStatusApi"
route "$BASE/app/api/admin/orders/logistics/route.ts" "logisticsApi"
route "$BASE/app/api/admin/group-categories/route.ts" "groupCategoriesApi"
route "$BASE/app/api/admin/collections/route.ts" "adminCollectionsApi"
route "$BASE/app/api/admin/categories/route.ts" "adminCategoriesApi"
route "$BASE/app/api/admin/brands/route.ts" "adminBrandsApi"
route "$BASE/app/api/admin/certificates/route.ts" "adminCertificatesApi"
route "$BASE/app/api/admin/blog/posts/route.ts" "adminBlogPostsApi"
route "$BASE/app/api/admin/blog/categories/route.ts" "adminBlogCategoriesApi"
route "$BASE/app/api/admin/configurations/route.ts" "adminConfigurationsApi"
route "$BASE/app/api/admin/upload/product-image/route.ts" "productImageUploadApi"
route "$BASE/app/api/admin/upload/blog-image/route.ts" "blogImageUploadApi"
route "$BASE/app/api/admin/upload/brand-logo/route.ts" "brandLogoUploadApi"
route "$BASE/app/auth/callback/route.ts" "authCallbackApi"

# ════════════════════════════════════════════════════════════════════
# ADMIN PAGES
# ════════════════════════════════════════════════════════════════════
layout "$BASE/app/admin/layout.tsx" "AdminLayout" \
  "../../components/admin/AdminSidebar" \
  "../../components/layout/Header"

# Override admin page.tsx
page "$BASE/app/admin/page.tsx" "AdminPage" \
  "../../components/admin/DashboardStats" \
  "../../components/admin/OrderTable" \
  "../../components/shared/SearchFilter"

page "$BASE/app/admin/products/page.tsx" "AdminProductsPage" \
  "../../../components/admin/ProductManager" \
  "../../../components/shared/SearchFilter" \
  "../../../components/shared/LoadingSkeleton"

page "$BASE/app/admin/products/new/page.tsx" "AdminNewProductPage" \
  "../../../../components/admin/ProductManager" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Tabs"

page "$BASE/app/admin/products/[id]/page.tsx" "AdminProductDetailPage" \
  "../../../../components/admin/ProductManager" \
  "../../../../components/shared/ConfirmDialog" \
  "../../../../components/shared/LoadingSkeleton"

page "$BASE/app/admin/product-tags/page.tsx" "AdminProductTagsPage" \
  "../../../components/admin/OrderTable" \
  "../../../components/shared/SearchFilter"

page "$BASE/app/admin/product-tags/new/page.tsx" "AdminNewProductTagPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Input" \
  "../../../../components/ui/Button" \
  "../../../../components/ui/Label"

page "$BASE/app/admin/product-tags/[id]/page.tsx" "AdminProductTagDetailPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Input" \
  "../../../../components/ui/Button" \
  "../../../../components/shared/ConfirmDialog"

page "$BASE/app/admin/group-categories/[slug]/page.tsx" "AdminGroupCategoryPage" \
  "../../../../components/admin/ProductManager" \
  "../../../../components/shared/SearchFilter"

page "$BASE/app/admin/group-categories/[slug]/[category-slug]/page.tsx" "AdminCategoryDetailPage" \
  "../../../../../components/ui/Card" \
  "../../../../../components/ui/Input" \
  "../../../../../components/ui/Button" \
  "../../../../../components/shared/ConfirmDialog"

page "$BASE/app/admin/collections/[slug]/page.tsx" "AdminCollectionPage" \
  "../../../../components/admin/ProductManager" \
  "../../../../components/shared/SearchFilter"

page "$BASE/app/admin/brands/page.tsx" "AdminBrandsPage" \
  "../../../components/admin/OrderTable" \
  "../../../components/shared/SearchFilter"

page "$BASE/app/admin/brands/new/page.tsx" "AdminNewBrandPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Input" \
  "../../../../components/ui/Button" \
  "../../../../components/ui/Textarea"

page "$BASE/app/admin/brands/[id]/page.tsx" "AdminBrandDetailPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Input" \
  "../../../../components/ui/Button" \
  "../../../../components/shared/ConfirmDialog"

page "$BASE/app/admin/certificates/page.tsx" "AdminCertificatesPage" \
  "../../../components/admin/OrderTable" \
  "../../../components/shared/SearchFilter" \
  "../../../components/ui/Badge"

page "$BASE/app/admin/blog/page.tsx" "AdminBlogPage" \
  "../../../components/blog/BlogCard" \
  "../../../components/admin/OrderTable" \
  "../../../components/shared/SearchFilter"

page "$BASE/app/admin/blog/[id]/edit/page.tsx" "AdminBlogEditPage" \
  "../../../../../components/ui/Card" \
  "../../../../../components/ui/Input" \
  "../../../../../components/ui/Textarea" \
  "../../../../../components/ui/Button" \
  "../../../../../components/ui/Select" \
  "../../../../../components/shared/ConfirmDialog"

page "$BASE/app/admin/blog/tags/page.tsx" "AdminBlogTagsPage" \
  "../../../../components/admin/OrderTable" \
  "../../../../components/shared/SearchFilter"

page "$BASE/app/admin/blog/tags/new/page.tsx" "AdminNewBlogTagPage" \
  "../../../../../components/ui/Card" \
  "../../../../../components/ui/Input" \
  "../../../../../components/ui/Button"

page "$BASE/app/admin/blog/tags/[id]/edit/page.tsx" "AdminBlogTagEditPage" \
  "../../../../../../components/ui/Card" \
  "../../../../../../components/ui/Input" \
  "../../../../../../components/ui/Button" \
  "../../../../../../components/shared/ConfirmDialog"

page "$BASE/app/admin/blog/categories/page.tsx" "AdminBlogCategoriesPage" \
  "../../../../components/admin/OrderTable" \
  "../../../../components/shared/SearchFilter"

page "$BASE/app/admin/blog/categories/new/page.tsx" "AdminNewBlogCategoryPage" \
  "../../../../../components/ui/Card" \
  "../../../../../components/ui/Input" \
  "../../../../../components/ui/Button"

page "$BASE/app/admin/notifications/page.tsx" "AdminNotificationsPage" \
  "../../../components/ui/Card" \
  "../../../components/ui/Badge" \
  "../../../components/ui/Skeleton"

page "$BASE/app/admin/quick-orders/page.tsx" "AdminQuickOrdersPage" \
  "../../../components/admin/OrderTable" \
  "../../../components/shared/ProductCard" \
  "../../../components/shared/SearchFilter"

page "$BASE/app/admin/chat-history/page.tsx" "AdminChatHistoryPage" \
  "../../../components/chat/ChatWindow" \
  "../../../components/chat/ChatMessage" \
  "../../../components/ui/Card"

page "$BASE/app/admin/job-applications/page.tsx" "AdminJobApplicationsPage" \
  "../../../components/admin/OrderTable" \
  "../../../components/shared/SearchFilter" \
  "../../../components/ui/Badge"

page "$BASE/app/admin/doctor-inbox/page.tsx" "AdminDoctorInboxPage" \
  "../../../components/chat/ChatWindow" \
  "../../../components/ui/Card" \
  "../../../components/ui/Badge"

page "$BASE/app/admin/doctor-inbox/[id]/page.tsx" "AdminDoctorChatPage" \
  "../../../../components/chat/ChatWindow" \
  "../../../../components/chat/ChatMessage" \
  "../../../../components/chat/ChatInput" \
  "../../../../components/ui/Card"

# ════════════════════════════════════════════════════════════════════
# PROFILE PAGES
# ════════════════════════════════════════════════════════════════════
layout "$BASE/app/(profile)/layout.tsx" "ProfileGroupLayout"

layout "$BASE/app/(profile)/profile/layout.tsx" "ProfileLayout" \
  "../../../components/layout/MobileNav" \
  "../../../components/layout/Header"

page "$BASE/app/(profile)/profile/page.tsx" "ProfilePage" \
  "../../../components/family/FamilyTree" \
  "../../../components/family/FamilyMemberForm" \
  "../../../components/family-vault/VaultGate" \
  "../../../components/profile/love-diary/LoveTimeline" \
  "../../../components/chat/ChatWindow"

page "$BASE/app/(profile)/profile/settings/page.tsx" "ProfileSettingsPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Input" \
  "../../../../components/ui/Button" \
  "../../../../components/ui/Switch" \
  "../../../../components/ui/Label" \
  "../../../../components/ui/Select" \
  "../../../../components/shared/ConfirmDialog"

page "$BASE/app/(profile)/profile/settings/family-vault/page.tsx" "FamilyVaultSettingsPage" \
  "../../../../../components/family-vault/VaultGate" \
  "../../../../../components/family-vault/PinInput" \
  "../../../../../components/ui/Card" \
  "../../../../../components/ui/Button" \
  "../../../../../components/shared/ConfirmDialog"

page "$BASE/app/(profile)/profile/orders/page.tsx" "ProfileOrdersPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Badge" \
  "../../../../components/ui/Skeleton" \
  "../../../../components/shared/EmptyState" \
  "../../../../components/shared/SearchFilter"

page "$BASE/app/(profile)/profile/orders/[id]/page.tsx" "ProfileOrderDetailPage" \
  "../../../../../components/ui/Card" \
  "../../../../../components/ui/Badge" \
  "../../../../../components/ui/Separator" \
  "../../../../../components/ui/Button" \
  "../../../../../components/shared/ProductCard"

page "$BASE/app/(profile)/profile/addresses/page.tsx" "ProfileAddressesPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Input" \
  "../../../../components/ui/Button" \
  "../../../../components/ui/Select" \
  "../../../../components/ui/Label" \
  "../../../../components/shared/ConfirmDialog"

page "$BASE/app/(profile)/profile/favorite/page.tsx" "ProfileFavoritePage" \
  "../../../../components/shared/ProductCard" \
  "../../../../components/shared/EmptyState" \
  "../../../../components/ui/Skeleton"

page "$BASE/app/(profile)/profile/notifications/page.tsx" "ProfileNotificationsPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Badge" \
  "../../../../components/ui/Skeleton" \
  "../../../../components/shared/EmptyState"

# Gia-pha
layout "$BASE/app/(profile)/profile/gia-pha/layout.tsx" "GiaPhaLayout" \
  "../../../../components/family-vault/VaultGate" \
  "../../../../components/family-vault/ProtectedPage"

page "$BASE/app/(profile)/profile/gia-pha/page.tsx" "GiaPhaPage" \
  "../../../../components/family/FamilyTree" \
  "../../../../components/family/FamilyMemberForm" \
  "../../../../components/family/RelationshipEditor" \
  "../../../../components/genealogy/FanChart" \
  "../../../../components/shared/EmptyState"

# Ky-niem
page "$BASE/app/(profile)/profile/ky-niem/page.tsx" "KyNiemPage" \
  "../../../../components/profile/love-diary/LoveTimeline" \
  "../../../../components/profile/love-diary/AnniversaryCard" \
  "../../../../components/profile/love-diary/DiaryEntry" \
  "../../../../components/shared/ConfirmDialog"

# Nghi-le (rituals)
page "$BASE/app/(profile)/profile/nghi-le/page.tsx" "NghiLePage" \
  "../../../../components/profile/ritual/AltarCard" \
  "../../../../components/profile/ritual/RitualCalendar" \
  "../../../../components/profile/ritual/GiaHuan" \
  "../../../../components/family-vault/VaultGate" \
  "../../../../components/shared/EmptyState"

# Nhat-ky (diary)
page "$BASE/app/(profile)/profile/nhat-ky/page.tsx" "NhatKyPage" \
  "../../../../components/profile/love-diary/DiaryEntry" \
  "../../../../components/profile/love-diary/LoveTimeline" \
  "../../../../components/shared/EmptyState"

# Tai-san (assets)
layout "$BASE/app/(profile)/profile/tai-san/layout.tsx" "TaiSanLayout" \
  "../../../../components/ui/Tabs" \
  "../../../../components/layout/MobileNav"

page "$BASE/app/(profile)/profile/tai-san/page.tsx" "TaiSanPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Badge" \
  "../../../../components/ui/Skeleton" \
  "../../../../components/shared/EmptyState"

page "$BASE/app/(profile)/profile/tai-san/assets/page.tsx" "TaiSanAssetsPage" \
  "../../../../../components/ui/Card" \
  "../../../../../components/ui/Badge" \
  "../../../../../components/ui/Button" \
  "../../../../../components/shared/SearchFilter" \
  "../../../../../components/shared/ConfirmDialog"

page "$BASE/app/(profile)/profile/tai-san/assets/[id]/page.tsx" "TaiSanAssetDetailPage" \
  "../../../../../../components/ui/Card" \
  "../../../../../../components/ui/Badge" \
  "../../../../../../components/ui/Button" \
  "../../../../../../components/shared/ConfirmDialog"

page "$BASE/app/(profile)/profile/tai-san/transactions/page.tsx" "TaiSanTransactionsPage" \
  "../../../../../components/ui/Card" \
  "../../../../../components/ui/Badge" \
  "../../../../../components/shared/SearchFilter" \
  "../../../../../components/shared/EmptyState"

page "$BASE/app/(profile)/profile/tai-san/budgets/page.tsx" "TaiSanBudgetsPage" \
  "../../../../../components/ui/Card" \
  "../../../../../components/ui/Badge" \
  "../../../../../components/ui/Button" \
  "../../../../../components/shared/EmptyState"

page "$BASE/app/(profile)/profile/tai-san/reminders/page.tsx" "TaiSanRemindersPage" \
  "../../../../../components/ui/Card" \
  "../../../../../components/ui/Badge" \
  "../../../../../components/ui/Button" \
  "../../../../../components/ui/Switch"

page "$BASE/app/(profile)/profile/tai-san/nong-nghiep/page.tsx" "NongNghiepPage" \
  "../../../../../components/ui/Card" \
  "../../../../../components/ui/Badge" \
  "../../../../../components/ui/Tabs" \
  "../../../../../components/shared/EmptyState"

# Diary
layout "$BASE/app/(profile)/profile/diary/layout.tsx" "DiaryLayout" \
  "../../../../components/ui/Tabs"

page "$BASE/app/(profile)/profile/diary/love-diary/page.tsx" "LoveDiaryPage" \
  "../../../../../components/profile/love-diary/LoveTimeline" \
  "../../../../../components/profile/love-diary/DiaryEntry" \
  "../../../../../components/profile/love-diary/AnniversaryCard" \
  "../../../../../components/shared/EmptyState"

page "$BASE/app/(profile)/profile/diary/birthday-diary/page.tsx" "BirthdayDiaryPage" \
  "../../../../../components/profile/love-diary/AnniversaryCard" \
  "../../../../../components/ui/Card" \
  "../../../../../components/ui/Badge" \
  "../../../../../components/shared/EmptyState"

# Vaccines
layout "$BASE/app/(profile)/profile/vaccines/layout.tsx" "VaccinesLayout" \
  "../../../../components/family-vault/VaultGate" \
  "../../../../components/family-vault/ProtectedPage"

page "$BASE/app/(profile)/profile/vaccines/page.tsx" "VaccinesPage" \
  "../../../../components/profile/health/VaccineCard" \
  "../../../../components/family/FamilyMemberCard" \
  "../../../../components/shared/EmptyState"

page "$BASE/app/(profile)/profile/vaccines/[memberId]/page.tsx" "VaccinesMemberPage" \
  "../../../../../components/profile/health/VaccineCard" \
  "../../../../../components/profile/health/MedicalRecord" \
  "../../../../../components/shared/EmptyState"

# Health
layout "$BASE/app/(profile)/profile/health/layout.tsx" "HealthLayout" \
  "../../../../components/family-vault/VaultGate" \
  "../../../../components/family-vault/ProtectedPage" \
  "../../../../components/ui/Tabs"

page "$BASE/app/(profile)/profile/health/page.tsx" "HealthPage" \
  "../../../../components/profile/health/MedicalRecord" \
  "../../../../components/profile/health/VaccineCard" \
  "../../../../components/profile/health/TreatmentTimeline" \
  "../../../../components/shared/EmptyState"

page "$BASE/app/(profile)/profile/health/[memberId]/page.tsx" "HealthMemberPage" \
  "../../../../../components/profile/health/MedicalRecord" \
  "../../../../../components/family/FamilyMemberCard" \
  "../../../../../components/shared/EmptyState"

page "$BASE/app/(profile)/profile/health/bmi/page.tsx" "BmiPage" \
  "../../../../../components/ui/Card" \
  "../../../../../components/ui/Input" \
  "../../../../../components/ui/Button" \
  "../../../../../components/ui/Label"

page "$BASE/app/(profile)/profile/health/assessment/page.tsx" "HealthAssessmentPage" \
  "../../../../../components/ui/Card" \
  "../../../../../components/ui/Select" \
  "../../../../../components/ui/Button" \
  "../../../../../components/ui/Label" \
  "../../../../../components/ui/Textarea"

page "$BASE/app/(profile)/profile/health/articles/[slug]/page.tsx" "HealthArticlePage" \
  "../../../../../../components/ui/Card" \
  "../../../../../../components/blog/BlogCard" \
  "../../../../../../components/blog/CommentSection"

page "$BASE/app/(profile)/profile/health/cam-nang/page.tsx" "CamNangPage" \
  "../../../../../components/blog/BlogCard" \
  "../../../../../components/shared/SearchFilter" \
  "../../../../../components/shared/EmptyState"

page "$BASE/app/(profile)/profile/health/cam-nang/[slug]/page.tsx" "CamNangDetailPage" \
  "../../../../../../components/blog/BlogCard" \
  "../../../../../../components/blog/CommentSection" \
  "../../../../../../components/blog/LikeSection"

page "$BASE/app/(profile)/profile/health/treatments/page.tsx" "TreatmentsPage" \
  "../../../../../components/profile/health/TreatmentTimeline" \
  "../../../../../components/shared/EmptyState"

page "$BASE/app/(profile)/profile/health/treatments/new/page.tsx" "NewTreatmentPage" \
  "../../../../../../components/ui/Card" \
  "../../../../../../components/ui/Input" \
  "../../../../../../components/ui/Button" \
  "../../../../../../components/ui/Select" \
  "../../../../../../components/ui/Textarea" \
  "../../../../../../components/ui/Label"

page "$BASE/app/(profile)/profile/health/treatments/[id]/page.tsx" "TreatmentDetailPage" \
  "../../../../../../components/profile/health/TreatmentTimeline" \
  "../../../../../../components/shared/ConfirmDialog"

page "$BASE/app/(profile)/profile/health/treatments/[id]/edit/page.tsx" "TreatmentEditPage" \
  "../../../../../../../components/ui/Card" \
  "../../../../../../../components/ui/Input" \
  "../../../../../../../components/ui/Button" \
  "../../../../../../../components/ui/Select" \
  "../../../../../../../components/ui/Textarea" \
  "../../../../../../../components/shared/ConfirmDialog"

# Cycle
layout "$BASE/app/(profile)/profile/cycle/layout.tsx" "CycleLayout" \
  "../../../../components/family-vault/VaultGate" \
  "../../../../components/family-vault/ProtectedPage"

page "$BASE/app/(profile)/profile/cycle/page.tsx" "CyclePage" \
  "../../../../components/profile/cycle/CycleTracker" \
  "../../../../components/profile/cycle/PeriodCalendar" \
  "../../../../components/profile/cycle/SexualHealthForm"

# Consultations
layout "$BASE/app/(profile)/profile/consultations/layout.tsx" "ConsultationsLayout" \
  "../../../../components/ui/Tabs"

page "$BASE/app/(profile)/profile/consultations/page.tsx" "ConsultationsPage" \
  "../../../../components/chat/ChatWindow" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Badge" \
  "../../../../components/shared/EmptyState"

page "$BASE/app/(profile)/profile/consultations/[id]/page.tsx" "ConsultationDetailPage" \
  "../../../../../components/chat/ChatWindow" \
  "../../../../../components/chat/ChatMessage" \
  "../../../../../components/chat/ChatInput"

# Lekha AI
layout "$BASE/app/(profile)/profile/lekha-ai/layout.tsx" "LekhaAiLayout" \
  "../../../../components/ui/Tabs"

page "$BASE/app/(profile)/profile/lekha-ai/page.tsx" "LekhaAiPage" \
  "../../../../components/chat/ChatWindow" \
  "../../../../components/ui/Card"

page "$BASE/app/(profile)/profile/lekha-ai/[chatId]/page.tsx" "LekhaAiChatPage" \
  "../../../../../components/chat/ChatWindow" \
  "../../../../../components/chat/ChatMessage" \
  "../../../../../components/chat/ChatInput"

# ════════════════════════════════════════════════════════════════════
# STOREFRONT PAGES
# ════════════════════════════════════════════════════════════════════
layout "$BASE/app/(storefront)/layout.tsx" "StorefrontLayout" \
  "../../components/layout/Header" \
  "../../components/layout/Footer" \
  "../../components/layout/CartButton"

page "$BASE/app/(storefront)/page.tsx" "StorefrontHomePage" \
  "../../components/pages/HomepageHero" \
  "../../components/shared/ProductCard" \
  "../../components/shared/MenuCategory" \
  "../../components/ui/Skeleton"

page "$BASE/app/(storefront)/products/page.tsx" "ProductsPage" \
  "../../../components/shared/ProductCard" \
  "../../../components/shared/SearchFilter" \
  "../../../components/ui/Skeleton" \
  "../../../components/shared/EmptyState"

page "$BASE/app/(storefront)/search/page.tsx" "SearchPage" \
  "../../../components/shared/ProductCard" \
  "../../../components/shared/SearchFilter" \
  "../../../components/shared/EmptyState"

layout "$BASE/app/(storefront)/cart/layout.tsx" "CartLayout"

page "$BASE/app/(storefront)/cart/page.tsx" "CartPage" \
  "../../../components/pages/CartDrawer" \
  "../../../components/shared/ProductCard" \
  "../../../components/ui/Button" \
  "../../../components/ui/Separator"

layout "$BASE/app/(storefront)/checkout/layout.tsx" "CheckoutLayout"

page "$BASE/app/(storefront)/checkout/page.tsx" "CheckoutPage" \
  "../../../components/ui/Card" \
  "../../../components/ui/Input" \
  "../../../components/ui/Button" \
  "../../../components/ui/Select" \
  "../../../components/ui/Label" \
  "../../../components/ui/Separator" \
  "../../../components/shared/ProductCard"

page "$BASE/app/(storefront)/order-success/[id]/page.tsx" "OrderSuccessPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Badge" \
  "../../../../components/ui/Button"

page "$BASE/app/(storefront)/brands/page.tsx" "BrandsPage" \
  "../../../components/ui/Card" \
  "../../../components/shared/SearchFilter" \
  "../../../components/ui/Skeleton"

page "$BASE/app/(storefront)/brands/[slug]/page.tsx" "BrandDetailPage" \
  "../../../../components/shared/ProductCard" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Badge"

page "$BASE/app/(storefront)/collections/[slug]/page.tsx" "CollectionPage" \
  "../../../../components/shared/ProductCard" \
  "../../../../components/shared/SearchFilter" \
  "../../../../components/shared/EmptyState"

page "$BASE/app/(storefront)/category/[slug]/page.tsx" "CategoryPage" \
  "../../../../components/shared/ProductCard" \
  "../../../../components/shared/SearchFilter" \
  "../../../../components/shared/EmptyState"

page "$BASE/app/(storefront)/group-category/[slug]/page.tsx" "GroupCategoryPage" \
  "../../../../components/shared/ProductCard" \
  "../../../../components/shared/MenuCategory" \
  "../../../../components/shared/SearchFilter"

page "$BASE/app/(storefront)/tag/[slug]/page.tsx" "TagPage" \
  "../../../../components/shared/ProductCard" \
  "../../../../components/shared/SearchFilter" \
  "../../../../components/shared/EmptyState"

page "$BASE/app/(storefront)/pr/[slug]/page.tsx" "PrPage" \
  "../../../../components/ui/Card" \
  "../../../../components/shared/ProductCard"

# Blog
page "$BASE/app/(storefront)/blog/page.tsx" "BlogPage" \
  "../../../components/blog/BlogCard" \
  "../../../components/shared/SearchFilter" \
  "../../../components/ui/Skeleton"

page "$BASE/app/(storefront)/blog/newsroom/page.tsx" "NewsroomPage" \
  "../../../../components/blog/BlogCard" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Skeleton"

page "$BASE/app/(storefront)/blog/[category]/page.tsx" "BlogCategoryPage" \
  "../../../../components/blog/BlogCard" \
  "../../../../components/shared/SearchFilter" \
  "../../../../components/shared/EmptyState"

page "$BASE/app/(storefront)/blog/[category]/[post]/page.tsx" "BlogPostPage" \
  "../../../../../components/blog/BlogCard" \
  "../../../../../components/blog/CommentSection" \
  "../../../../../components/blog/LikeSection" \
  "../../../../../components/shared/ProductCard"

page "$BASE/app/(storefront)/blog/category/[slug]/page.tsx" "BlogCategorySlugPage" \
  "../../../../../components/blog/BlogCard" \
  "../../../../../components/shared/SearchFilter"

# Careers
page "$BASE/app/(storefront)/careers/page.tsx" "CareersPage" \
  "../../../components/ui/Card" \
  "../../../components/ui/Badge" \
  "../../../components/shared/EmptyState"

page "$BASE/app/(storefront)/careers/tinh-thue/page.tsx" "TinhThuePage" \
  "../../../../components/hkd-tax/TaxCalculator" \
  "../../../../components/ui/Card"

page "$BASE/app/(storefront)/careers/disc/page.tsx" "DiscPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Button" \
  "../../../../components/ui/Select"

page "$BASE/app/(storefront)/careers/[position]/page.tsx" "CareerPositionPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Button" \
  "../../../../components/ui/Badge"

page "$BASE/app/(storefront)/tien-ich-cua-ban/page.tsx" "TienIchPage" \
  "../../../components/ui/Card" \
  "../../../components/ui/Badge" \
  "../../../components/hkd-tax/TaxCalculator"

# Static pages
layout "$BASE/app/(storefront)/(static)/about/layout.tsx" "AboutLayout"
page "$BASE/app/(storefront)/(static)/about/page.tsx" "AboutPage" \
  "../../../../components/ui/Card"

layout "$BASE/app/(storefront)/(static)/gioi-thieu/layout.tsx" "GioiThieuLayout"
page "$BASE/app/(storefront)/(static)/gioi-thieu/page.tsx" "GioiThieuPage" \
  "../../../../components/ui/Card"

layout "$BASE/app/(storefront)/(static)/lien-he/layout.tsx" "LienHePage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Input" \
  "../../../../components/ui/Textarea" \
  "../../../../components/ui/Button"

page "$BASE/app/(storefront)/(static)/lien-he/page.tsx" "LienHePageContent" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Input" \
  "../../../../components/ui/Textarea" \
  "../../../../components/ui/Button" \
  "../../../../components/ui/Label"

page "$BASE/app/(storefront)/(static)/policies/page.tsx" "PoliciesPage" \
  "../../../../components/ui/Card"

page "$BASE/app/(storefront)/(static)/policies/privacy-policy/page.tsx" "PrivacyPolicyPage" \
  "../../../../../components/ui/Card"

page "$BASE/app/(storefront)/(static)/policies/return-policy/page.tsx" "ReturnPolicyPage" \
  "../../../../../components/ui/Card"

page "$BASE/app/(storefront)/(static)/policies/shipping/page.tsx" "ShippingPolicyPage" \
  "../../../../../components/ui/Card"

page "$BASE/app/(storefront)/(static)/policies/payment/page.tsx" "PaymentPolicyPage" \
  "../../../../../components/ui/Card"

page "$BASE/app/(storefront)/(static)/policies/payment-security/page.tsx" "PaymentSecurityPage" \
  "../../../../../components/ui/Card"

page "$BASE/app/(storefront)/(static)/policies/data-processing/page.tsx" "DataProcessingPage" \
  "../../../../../components/ui/Card"

page "$BASE/app/(storefront)/(static)/tinh-thue-hkd/page.tsx" "TinhThueHkdPage" \
  "../../../../components/hkd-tax/TaxCalculator"

page "$BASE/app/(storefront)/(static)/terms/page.tsx" "TermsPage" \
  "../../../../components/ui/Card"

page "$BASE/app/(storefront)/(static)/press/page.tsx" "PressPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Badge"

page "$BASE/app/(storefront)/(static)/csr/page.tsx" "CsrPage" \
  "../../../../components/ui/Card"

page "$BASE/app/(storefront)/(static)/esg/page.tsx" "EsgPage" \
  "../../../../components/ui/Card"

page "$BASE/app/(storefront)/(static)/huong-dan-su-dung/page.tsx" "HuongDanSuDungPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Tabs"

page "$BASE/app/(storefront)/(static)/tra-cuu-hoa-don/page.tsx" "TraCuuHoaDonPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Input" \
  "../../../../components/ui/Button"

page "$BASE/app/(storefront)/(static)/kiem-tra-don-hang/page.tsx" "KiemTraDonHangPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Input" \
  "../../../../components/ui/Button"

page "$BASE/app/(storefront)/(static)/khao-sat-khach-hang/page.tsx" "KhaoSatKhachHangPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Select" \
  "../../../../components/ui/Textarea" \
  "../../../../components/ui/Button"

page "$BASE/app/(storefront)/(static)/thu-vien-sach/page.tsx" "ThuVienSachPage" \
  "../../../../components/ui/Card" \
  "../../../../components/shared/SearchFilter"

page "$BASE/app/(storefront)/(static)/bao-quan-san-pham/page.tsx" "BaoQuanSanPhamPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Tabs"

page "$BASE/app/(storefront)/(static)/dang-ky-hop-tac/page.tsx" "DangKyHopTacPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Input" \
  "../../../../components/ui/Textarea" \
  "../../../../components/ui/Button" \
  "../../../../components/ui/Label"

page "$BASE/app/(storefront)/(static)/dieu-khoan-dich-vu/page.tsx" "DieuKhoanDichVuPage" \
  "../../../../components/ui/Card"

page "$BASE/app/(storefront)/(static)/du-an-189-ngay-kncb/page.tsx" "DuAn189NgayPage" \
  "../../../../components/ui/Card" \
  "../../../../components/ui/Badge"

page "$BASE/app/(storefront)/(static)/share-to-build-understanding-collaborate-to-achieve-success/page.tsx" "ShareToBuildPage" \
  "../../../../components/ui/Card"

page "$BASE/app/(storefront)/(static)/you-should-sell-emotions-not-just-your-products-or-services/page.tsx" "SellEmotionsPage" \
  "../../../../components/ui/Card"

# product page (re-create from previous)
page "$BASE/app/(storefront)/product-page.tsx" "ProductPage" \
  "../../components/pages/ProductDetail" \
  "../../components/pages/CartDrawer" \
  "../../components/blog/CommentSection" \
  "../../components/blog/LikeSection"

# HKD tax
page "$BASE/app/hkd-tax-page.tsx" "HkdTaxPage" \
  "../components/hkd-tax/TaxCalculator"

echo "Generated $(find "$BASE" -name '*.tsx' -o -name '*.ts' | wc -l | tr -d ' ') total files"
