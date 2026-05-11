import { AuthGuard } from "@/components/auth/AuthGuard";
import { DashboardPeriodProvider } from "@/components/layout/dashboard-period-context";
import { MainLayoutChrome } from "@/components/layout/MainLayoutChrome";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthGuard>
      <DashboardPeriodProvider>
        <div className="relative flex h-screen w-full flex-col overflow-hidden bg-[#121212] text-zinc-50">
          <MainLayoutChrome>{children}</MainLayoutChrome>
        </div>
      </DashboardPeriodProvider>
    </AuthGuard>
  );
}
