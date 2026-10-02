import { Navbar } from "@/components/navigation/Navbar";
import { Hero } from "@/components/sections/Hero";
import { LogoMarquee } from "@/components/products/LogoMarquee";
import { ProductCards } from "@/components/products/ProductCards";
import { ServicesGrid } from "@/components/services/ServicesGrid";
import { StartProjectForm } from "@/components/forms/StartProjectForm";
import { BrandStatement } from "@/components/sections/BrandStatement";
import { Footer } from "@/components/layout/Footer";
import { VisitTracker } from "@/components/tracking/VisitTracker";

export default function Home() {
  return (
    <>
      <Navbar />
      <main id="main" className="flex-1">
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
