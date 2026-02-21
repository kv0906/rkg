#!/bin/bash
# Generate realistic fixture files for react-graph stress test
BASE="/Users/van/projects/react-graph/test/fixture-realworld"

cat_component() {
  local file="$1"; shift
  local name="$1"; shift
  local imports=""
  for imp in "$@"; do
    imports="$imports
import { $imp } from './__fake__';"
  done
  cat > "$file" << EOF
import React from 'react';$imports

export default function $name() {
  return <div />;
}
EOF
}

cat_named() {
  local file="$1"; shift
  local name="$1"; shift
  cat > "$file" << EOF
import React from 'react';

export const $name = () => <div />;
EOF
}

cat_hook() {
  local file="$1"; shift
  local name="$1"; shift
  cat > "$file" << EOF
import { useState, useEffect } from 'react';

export function $name() {
  const [state, setState] = useState(null);
  useEffect(() => {}, []);
  return state;
}
EOF
}

cat_store() {
  local file="$1"; shift
  local name="$1"; shift
  cat > "$file" << EOF
export const $name = { state: {} };
EOF
}

cat_util() {
  local file="$1"; shift
  local name="$1"; shift
  cat > "$file" << EOF
export function $name() { return null; }
EOF
}

# ── UI PRIMITIVES (atoms) ──────────────────────────────
for comp in Button Input Avatar Badge Card Dialog Select Tabs Tooltip Skeleton Switch Textarea Label Separator DropdownMenu Sheet ScrollArea; do
  cat_named "$BASE/components/ui/$comp.tsx" "$comp"
done

# ── SVG ICONS (atoms) ──────────────────────────────────
for comp in IconFamily IconHeart IconShield IconCart IconUser; do
  cat_named "$BASE/components/svg/$comp.tsx" "$comp"
done

# ── LAYOUT (organisms) ─────────────────────────────────
# Header uses Button, Avatar, IconCart, Input (search), Sheet (mobile menu)
cat > "$BASE/components/layout/Header.tsx" << 'EOF'
import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { Input } from '../ui/Input';
import { Sheet } from '../ui/Sheet';
import { IconCart } from '../svg/IconCart';
import { IconUser } from '../svg/IconUser';

export default function Header() { return <div />; }
EOF

# Footer uses Button, Input (newsletter), Separator
cat > "$BASE/components/layout/Footer.tsx" << 'EOF'
import React from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Separator } from '../ui/Separator';
import { IconHeart } from '../svg/IconHeart';

export default function Footer() { return <div />; }
EOF

# CartButton uses Badge, IconCart, Sheet, Button
cat > "$BASE/components/layout/CartButton.tsx" << 'EOF'
import React, { useState } from 'react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { IconCart } from '../svg/IconCart';
import { ProductCard } from '../shared/ProductCard';

export default function CartButton() { return <div />; }
EOF

# GoogleTranslate uses Select, Button
cat > "$BASE/components/layout/GoogleTranslate.tsx" << 'EOF'
import React from 'react';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';

export default function GoogleTranslate() { return <div />; }
EOF

# MobileNav uses Sheet, Button, Avatar, Separator
cat > "$BASE/components/layout/MobileNav.tsx" << 'EOF'
import React, { useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { Separator } from '../ui/Separator';
import { IconFamily } from '../svg/IconFamily';
import { IconHeart } from '../svg/IconHeart';

export default function MobileNav() { return <div />; }
EOF

# ── SHARED (molecules) ─────────────────────────────────
cat > "$BASE/components/shared/ProductCard.tsx" << 'EOF'
import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';

export default function ProductCard() { return <div />; }
EOF

cat > "$BASE/components/shared/MenuCategory.tsx" << 'EOF'
import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';

export default function MenuCategory() { return <div />; }
EOF

cat > "$BASE/components/shared/SearchFilter.tsx" << 'EOF'
import React, { useState } from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

export default function SearchFilter() { return <div />; }
EOF

cat > "$BASE/components/shared/EmptyState.tsx" << 'EOF'
import React from 'react';
import { Button } from '../ui/Button';
import { IconHeart } from '../svg/IconHeart';

export default function EmptyState() { return <div />; }
EOF

cat > "$BASE/components/shared/ConfirmDialog.tsx" << 'EOF'
import React from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';

export default function ConfirmDialog() { return <div />; }
EOF

cat > "$BASE/components/shared/LoadingSkeleton.tsx" << 'EOF'
import React from 'react';
import { Skeleton } from '../ui/Skeleton';
import { Card } from '../ui/Card';

export default function LoadingSkeleton() { return <div />; }
EOF

# ── PROFILE / RITUAL ───────────────────────────────────
cat > "$BASE/components/profile/ritual/AltarCard.tsx" << 'EOF'
import React from 'react';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';
import { Badge } from '../../ui/Badge';
import { Dialog } from '../../ui/Dialog';
import { IconShield } from '../../svg/IconShield';
import { ConfirmDialog } from '../../shared/ConfirmDialog';

export default function AltarCard() { return <div />; }
EOF

cat > "$BASE/components/profile/ritual/RitualCalendar.tsx" << 'EOF'
import React, { useState, useEffect } from 'react';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { Tooltip } from '../../ui/Tooltip';
import { Skeleton } from '../../ui/Skeleton';

export default function RitualCalendar() { return <div />; }
EOF

cat > "$BASE/components/profile/ritual/GiaHuan.tsx" << 'EOF'
import React, { useState } from 'react';
import { Card } from '../../ui/Card';
import { Textarea } from '../../ui/Textarea';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { ConfirmDialog } from '../../shared/ConfirmDialog';

export default function GiaHuan() { return <div />; }
EOF

# ── PROFILE / CYCLE ────────────────────────────────────
cat > "$BASE/components/profile/cycle/CycleTracker.tsx" << 'EOF'
import React, { useState, useEffect, useReducer } from 'react';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Tooltip } from '../../ui/Tooltip';
import { ConfirmDialog } from '../../shared/ConfirmDialog';

export default function CycleTracker() { return <div />; }
EOF

cat > "$BASE/components/profile/cycle/SexualHealthForm.tsx" << 'EOF'
import React, { useState } from 'react';
import { Card } from '../../ui/Card';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { Textarea } from '../../ui/Textarea';
import { Button } from '../../ui/Button';
import { Label } from '../../ui/Label';
import { Switch } from '../../ui/Switch';
import { ConfirmDialog } from '../../shared/ConfirmDialog';

export default function SexualHealthForm() { return <div />; }
EOF

cat > "$BASE/components/profile/cycle/PeriodCalendar.tsx" << 'EOF'
import React, { useState, useEffect } from 'react';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { Tooltip } from '../../ui/Tooltip';
import { Button } from '../../ui/Button';

export default function PeriodCalendar() { return <div />; }
EOF

# ── PROFILE / HEALTH ───────────────────────────────────
cat > "$BASE/components/profile/health/VaccineCard.tsx" << 'EOF'
import React from 'react';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Tooltip } from '../../ui/Tooltip';

export default function VaccineCard() { return <div />; }
EOF

cat > "$BASE/components/profile/health/TreatmentTimeline.tsx" << 'EOF'
import React from 'react';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { Separator } from '../../ui/Separator';
import { Skeleton } from '../../ui/Skeleton';
import { EmptyState } from '../../shared/EmptyState';

export default function TreatmentTimeline() { return <div />; }
EOF

cat > "$BASE/components/profile/health/MedicalRecord.tsx" << 'EOF'
import React, { useState } from 'react';
import { Card } from '../../ui/Card';
import { Tabs } from '../../ui/Tabs';
import { Button } from '../../ui/Button';
import { Dialog } from '../../ui/Dialog';
import { Input } from '../../ui/Input';
import { VaccineCard } from './VaccineCard';
import { TreatmentTimeline } from './TreatmentTimeline';

export default function MedicalRecord() { return <div />; }
EOF

# ── PROFILE / LOVE DIARY ──────────────────────────────
cat > "$BASE/components/profile/love-diary/DiaryEntry.tsx" << 'EOF'
import React, { useState } from 'react';
import { Card } from '../../ui/Card';
import { Textarea } from '../../ui/Textarea';
import { Button } from '../../ui/Button';
import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { IconHeart } from '../../svg/IconHeart';
import { ConfirmDialog } from '../../shared/ConfirmDialog';

export default function DiaryEntry() { return <div />; }
EOF

cat > "$BASE/components/profile/love-diary/AnniversaryCard.tsx" << 'EOF'
import React from 'react';
import { Card } from '../../ui/Card';
import { Badge } from '../../ui/Badge';
import { Tooltip } from '../../ui/Tooltip';
import { IconHeart } from '../../svg/IconHeart';

export default function AnniversaryCard() { return <div />; }
EOF

cat > "$BASE/components/profile/love-diary/LoveTimeline.tsx" << 'EOF'
import React, { useState } from 'react';
import { Card } from '../../ui/Card';
import { Separator } from '../../ui/Separator';
import { DiaryEntry } from './DiaryEntry';
import { AnniversaryCard } from './AnniversaryCard';
import { EmptyState } from '../../shared/EmptyState';

export default function LoveTimeline() { return <div />; }
EOF

# ── FAMILY ─────────────────────────────────────────────
cat > "$BASE/components/family/FamilyTree.tsx" << 'EOF'
import React, { useState, useEffect, useReducer } from 'react';
import { Card } from '../ui/Card';
import { Avatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Skeleton } from '../ui/Skeleton';
import { FamilyMemberCard } from './FamilyMemberCard';
import { EmptyState } from '../shared/EmptyState';

export default function FamilyTree() { return <div />; }
EOF

cat > "$BASE/components/family/FamilyMemberForm.tsx" << 'EOF'
import React, { useState } from 'react';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Label } from '../ui/Label';
import { Avatar } from '../ui/Avatar';
import { Dialog } from '../ui/Dialog';
import { ConfirmDialog } from '../shared/ConfirmDialog';

export default function FamilyMemberForm() { return <div />; }
EOF

cat > "$BASE/components/family/FamilyMemberCard.tsx" << 'EOF'
import React from 'react';
import { Card } from '../ui/Card';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Tooltip } from '../ui/Tooltip';
import { DropdownMenu } from '../ui/DropdownMenu';
import { IconFamily } from '../svg/IconFamily';

export default function FamilyMemberCard() { return <div />; }
EOF

cat > "$BASE/components/family/RelationshipEditor.tsx" << 'EOF'
import React, { useState } from 'react';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Label } from '../ui/Label';
import { FamilyMemberCard } from './FamilyMemberCard';
import { ConfirmDialog } from '../shared/ConfirmDialog';

export default function RelationshipEditor() { return <div />; }
EOF

# ── FAMILY VAULT ───────────────────────────────────────
cat > "$BASE/components/family-vault/VaultGate.tsx" << 'EOF'
import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { IconShield } from '../svg/IconShield';
import { PinInput } from './PinInput';

export default function VaultGate() { return <div />; }
EOF

cat > "$BASE/components/family-vault/PinInput.tsx" << 'EOF'
import React, { useState, useEffect } from 'react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { Label } from '../ui/Label';

export default function PinInput() { return <div />; }
EOF

cat > "$BASE/components/family-vault/ProtectedPage.tsx" << 'EOF'
import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { VaultGate } from './VaultGate';

export default function ProtectedPage() { return <div />; }
EOF

# ── BLOG ───────────────────────────────────────────────
cat > "$BASE/components/blog/BlogCard.tsx" << 'EOF'
import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Avatar } from '../ui/Avatar';
import { Skeleton } from '../ui/Skeleton';

export default function BlogCard() { return <div />; }
EOF

cat > "$BASE/components/blog/CommentSection.tsx" << 'EOF'
import React, { useState } from 'react';
import { Avatar } from '../ui/Avatar';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { Separator } from '../ui/Separator';
import { ConfirmDialog } from '../shared/ConfirmDialog';

export default function CommentSection() { return <div />; }
EOF

cat > "$BASE/components/blog/LikeSection.tsx" << 'EOF'
import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Tooltip } from '../ui/Tooltip';
import { IconHeart } from '../svg/IconHeart';

export default function LikeSection() { return <div />; }
EOF

# ── CHAT ───────────────────────────────────────────────
cat > "$BASE/components/chat/ChatWindow.tsx" << 'EOF'
import React, { useState, useEffect, useReducer } from 'react';
import { Card } from '../ui/Card';
import { ScrollArea } from '../ui/ScrollArea';
import { Button } from '../ui/Button';
import { Skeleton } from '../ui/Skeleton';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

export default function ChatWindow() { return <div />; }
EOF

cat > "$BASE/components/chat/ChatMessage.tsx" << 'EOF'
import React from 'react';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Tooltip } from '../ui/Tooltip';

export default function ChatMessage() { return <div />; }
EOF

cat > "$BASE/components/chat/ChatInput.tsx" << 'EOF'
import React, { useState } from 'react';
import { Textarea } from '../ui/Textarea';
import { Button } from '../ui/Button';
import { IconHeart } from '../svg/IconHeart';

export default function ChatInput() { return <div />; }
EOF

# ── PAGES COMPONENTS (templates) ───────────────────────
cat > "$BASE/components/pages/HomepageHero.tsx" << 'EOF'
import React from 'react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { ProductCard } from '../shared/ProductCard';
import { MenuCategory } from '../shared/MenuCategory';

export default function HomepageHero() { return <div />; }
EOF

cat > "$BASE/components/pages/ProductDetail.tsx" << 'EOF'
import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Tabs } from '../ui/Tabs';
import { Select } from '../ui/Select';
import { Skeleton } from '../ui/Skeleton';
import { ProductCard } from '../shared/ProductCard';
import { CommentSection } from '../blog/CommentSection';
import { LikeSection } from '../blog/LikeSection';

export default function ProductDetail() { return <div />; }
EOF

cat > "$BASE/components/pages/CartDrawer.tsx" << 'EOF'
import React, { useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Separator } from '../ui/Separator';
import { Badge } from '../ui/Badge';
import { ProductCard } from '../shared/ProductCard';
import { ConfirmDialog } from '../shared/ConfirmDialog';

export default function CartDrawer() { return <div />; }
EOF

# ── ADMIN ──────────────────────────────────────────────
cat > "$BASE/components/admin/AdminSidebar.tsx" << 'EOF'
import React from 'react';
import { Button } from '../ui/Button';
import { Separator } from '../ui/Separator';
import { Badge } from '../ui/Badge';
import { ScrollArea } from '../ui/ScrollArea';
import { IconUser } from '../svg/IconUser';

export default function AdminSidebar() { return <div />; }
EOF

cat > "$BASE/components/admin/OrderTable.tsx" << 'EOF'
import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { Input } from '../ui/Input';
import { DropdownMenu } from '../ui/DropdownMenu';
import { Skeleton } from '../ui/Skeleton';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { SearchFilter } from '../shared/SearchFilter';

export default function OrderTable() { return <div />; }
EOF

cat > "$BASE/components/admin/DashboardStats.tsx" << 'EOF'
import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';
import { Tooltip } from '../ui/Tooltip';

export default function DashboardStats() { return <div />; }
EOF

cat > "$BASE/components/admin/ProductManager.tsx" << 'EOF'
import React, { useState, useReducer } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';
import { Select } from '../ui/Select';
import { Dialog } from '../ui/Dialog';
import { Tabs } from '../ui/Tabs';
import { ProductCard } from '../shared/ProductCard';
import { SearchFilter } from '../shared/SearchFilter';
import { ConfirmDialog } from '../shared/ConfirmDialog';

export default function ProductManager() { return <div />; }
EOF

# ── HKD TAX ────────────────────────────────────────────
cat > "$BASE/components/hkd-tax/TaxCalculator.tsx" << 'EOF'
import React, { useState, useReducer } from 'react';
import { Card } from '../ui/Card';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { Label } from '../ui/Label';
import { Tooltip } from '../ui/Tooltip';
import { TaxBreakdown } from './TaxBreakdown';

export default function TaxCalculator() { return <div />; }
EOF

cat > "$BASE/components/hkd-tax/TaxBreakdown.tsx" << 'EOF'
import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Separator } from '../ui/Separator';
import { Tooltip } from '../ui/Tooltip';

export default function TaxBreakdown() { return <div />; }
EOF

# ── GENEALOGY ──────────────────────────────────────────
cat > "$BASE/components/genealogy/FanChart.tsx" << 'EOF'
import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Skeleton } from '../ui/Skeleton';
import { Tooltip } from '../ui/Tooltip';
import { Button } from '../ui/Button';
import { Select } from '../ui/Select';
import { FamilyMemberCard } from '../family/FamilyMemberCard';
import { EmptyState } from '../shared/EmptyState';

export default function FanChart() { return <div />; }
EOF

# ── HOOKS ──────────────────────────────────────────────
cat_hook "$BASE/hooks/useAuth.ts" "useAuth"
cat_hook "$BASE/hooks/useCart.ts" "useCart"
cat_hook "$BASE/hooks/useSupabase.ts" "useSupabase"
cat_hook "$BASE/hooks/useMediaQuery.ts" "useMediaQuery"

# ── STORE ──────────────────────────────────────────────
cat_store "$BASE/store/cartStore.ts" "cartStore"
cat_store "$BASE/store/checkoutStore.ts" "checkoutStore"
cat_store "$BASE/store/customerStore.ts" "customerStore"

# ── LIB/UTILS ─────────────────────────────────────────
cat_util "$BASE/lib/validators.ts" "validators"
cat_util "$BASE/lib/constants.ts" "constants"
cat_util "$BASE/lib/formatters.ts" "formatters"
cat_util "$BASE/utils/supabase/client.ts" "createClient"
cat_util "$BASE/utils/supabase/server.ts" "createServerClient"
cat_util "$BASE/utils/supabase/admin.ts" "createAdminClient"
cat_util "$BASE/services/actions.ts" "serverActions"

# ── APP PAGES (the chaos layer) ───────────────────────
cat > "$BASE/app/page.tsx" << 'EOF'
import React from 'react';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import CartButton from '../components/layout/CartButton';
import HomepageHero from '../components/pages/HomepageHero';
import ProductCard from '../components/shared/ProductCard';
import MenuCategory from '../components/shared/MenuCategory';

export default function HomePage() { return <div />; }
EOF

cat > "$BASE/app/(storefront)/blog/page.tsx" << 'EOF'
import React from 'react';
import Header from '../../../components/layout/Header';
import Footer from '../../../components/layout/Footer';
import BlogCard from '../../../components/blog/BlogCard';
import CommentSection from '../../../components/blog/CommentSection';
import LikeSection from '../../../components/blog/LikeSection';
import SearchFilter from '../../../components/shared/SearchFilter';

export default function BlogPage() { return <div />; }
EOF

cat > "$BASE/app/(storefront)/careers/page.tsx" << 'EOF'
import React from 'react';
import Header from '../../../components/layout/Header';
import Footer from '../../../components/layout/Footer';
import EmptyState from '../../../components/shared/EmptyState';

export default function CareersPage() { return <div />; }
EOF

cat > "$BASE/app/(profile)/profile/page.tsx" << 'EOF'
import React from 'react';
import Header from '../../../components/layout/Header';
import Footer from '../../../components/layout/Footer';
import MobileNav from '../../../components/layout/MobileNav';
import FamilyTree from '../../../components/family/FamilyTree';
import FamilyMemberForm from '../../../components/family/FamilyMemberForm';
import VaultGate from '../../../components/family-vault/VaultGate';
import LoveTimeline from '../../../components/profile/love-diary/LoveTimeline';
import ChatWindow from '../../../components/chat/ChatWindow';

export default function ProfilePage() { return <div />; }
EOF

cat > "$BASE/app/(profile)/profile/gia-pha/page.tsx" << 'EOF'
import React from 'react';
import Header from '../../../../components/layout/Header';
import Footer from '../../../../components/layout/Footer';
import FamilyTree from '../../../../components/family/FamilyTree';
import FamilyMemberForm from '../../../../components/family/FamilyMemberForm';
import RelationshipEditor from '../../../../components/family/RelationshipEditor';
import FanChart from '../../../../components/genealogy/FanChart';
import VaultGate from '../../../../components/family-vault/VaultGate';
import ProtectedPage from '../../../../components/family-vault/ProtectedPage';
import EmptyState from '../../../../components/shared/EmptyState';

export default function GiaPhaPage() { return <div />; }
EOF

cat > "$BASE/app/(profile)/profile/ky-niem/page.tsx" << 'EOF'
import React from 'react';
import Header from '../../../../components/layout/Header';
import Footer from '../../../../components/layout/Footer';
import LoveTimeline from '../../../../components/profile/love-diary/LoveTimeline';
import AnniversaryCard from '../../../../components/profile/love-diary/AnniversaryCard';
import DiaryEntry from '../../../../components/profile/love-diary/DiaryEntry';
import ConfirmDialog from '../../../../components/shared/ConfirmDialog';

export default function KyNiemPage() { return <div />; }
EOF

cat > "$BASE/app/(profile)/profile/health/page.tsx" << 'EOF'
import React from 'react';
import Header from '../../../../components/layout/Header';
import Footer from '../../../../components/layout/Footer';
import MedicalRecord from '../../../../components/profile/health/MedicalRecord';
import VaccineCard from '../../../../components/profile/health/VaccineCard';
import TreatmentTimeline from '../../../../components/profile/health/TreatmentTimeline';
import VaultGate from '../../../../components/family-vault/VaultGate';
import ProtectedPage from '../../../../components/family-vault/ProtectedPage';
import EmptyState from '../../../../components/shared/EmptyState';

export default function HealthPage() { return <div />; }
EOF

cat > "$BASE/app/(profile)/profile/cycle/page.tsx" << 'EOF'
import React from 'react';
import Header from '../../../../components/layout/Header';
import Footer from '../../../../components/layout/Footer';
import CycleTracker from '../../../../components/profile/cycle/CycleTracker';
import PeriodCalendar from '../../../../components/profile/cycle/PeriodCalendar';
import SexualHealthForm from '../../../../components/profile/cycle/SexualHealthForm';
import VaultGate from '../../../../components/family-vault/VaultGate';
import ProtectedPage from '../../../../components/family-vault/ProtectedPage';

export default function CyclePage() { return <div />; }
EOF

cat > "$BASE/app/admin/page.tsx" << 'EOF'
import React from 'react';
import AdminSidebar from '../../components/admin/AdminSidebar';
import OrderTable from '../../components/admin/OrderTable';
import DashboardStats from '../../components/admin/DashboardStats';
import ProductManager from '../../components/admin/ProductManager';
import SearchFilter from '../../components/shared/SearchFilter';
import Header from '../../components/layout/Header';

export default function AdminPage() { return <div />; }
EOF

# Product page with cross-feature chaos
cat > "$BASE/app/(storefront)/product-page.tsx" << 'EOF'
import React from 'react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import CartButton from '../../components/layout/CartButton';
import ProductDetail from '../../components/pages/ProductDetail';
import CartDrawer from '../../components/pages/CartDrawer';
import CommentSection from '../../components/blog/CommentSection';
import LikeSection from '../../components/blog/LikeSection';

export default function ProductPage() { return <div />; }
EOF

# HKD Tax page
cat > "$BASE/app/hkd-tax-page.tsx" << 'EOF'
import React from 'react';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import TaxCalculator from '../components/hkd-tax/TaxCalculator';

export default function HkdTaxPage() { return <div />; }
EOF

echo "Generated $(find "$BASE" -name '*.tsx' -o -name '*.ts' | wc -l | tr -d ' ') files"
