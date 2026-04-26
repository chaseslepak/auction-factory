import { About } from "@/sections/About";
import { Approach } from "@/sections/Approach";
import { Believe } from "@/sections/Believe";
import { Contact } from "@/sections/Contact";
import { Footer } from "@/sections/Footer";
import { Header } from "@/sections/Header";
import { Portfolio } from "@/sections/Portfolio";
import { Statement } from "@/sections/Statement";

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Statement />
        <About />
        <Believe />
        <Portfolio />
        <Approach />
        <Contact />
      </main>
      <Footer />
    </>
  );
}
