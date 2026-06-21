import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { MobileNav } from "./MobileNav";
import { StoreHydration } from "./StoreHydration";
import { PageTransition } from "./PageTransition";
import { Toaster } from "@/components/ui/toaster";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-canvas relative min-h-screen bg-app-radial">
      {/* Atmospheric accents */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute right-0 top-1/3 h-[22rem] w-[22rem] rounded-full bg-violet-400/10 blur-3xl" />
      </div>

      <StoreHydration />
      <Sidebar />

      <div className="relative lg:pl-[264px]">
        <Topbar />
        <main className="mx-auto w-full max-w-[1480px] px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-10">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>

      <MobileNav />
      <Toaster />
    </div>
  );
}
