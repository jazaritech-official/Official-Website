import { Navbar } from "@/components/navigation/Navbar";
import { Hero } from "@/components/sections/Hero";
import { LogoMarquee } from "@/components/products/LogoMarquee";
import { ProductCards } from "@/components/products/ProductCards";
import { ServicesGrid } from "@/components/services/ServicesGrid";
import { StartProjectForm } from "@/components/forms/StartProjectForm";
import { BrandStatement } from "@/components/sections/BrandStatement";
import { Footer } from "@/components/layout/Footer";
import { VisitTracker } from "@/components/tracking/VisitTracker";
import { PointerGlow } from "@/components/motion/PointerGlow";

export default function Home() {
  return (
    <>
      {/* Desktop-only subtle spotlight (z-0); main/footer sit above it (z-1). */}
      <PointerGlow />
      <Navbar />
      <main id="main" className="relative z-[1] flex-1">
        <Hero />
        <LogoMarquee />
        <ProductCards />
        <ServicesGrid />
        <StartProjectForm />
        <BrandStatement />
      </main>
      <Footer />
      <VisitTracker />
    </>
  );
}
