import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen brand-backdrop flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="w-72 h-72 bg-white rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-black/30 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/icons/logo-full.png"
            alt="Auction Factory"
            className="w-full h-full object-contain"
          />
        </div>
        <p className="text-white text-lg font-black tracking-[0.25em] uppercase">
          Official Lotter
        </p>
      </div>

      {/* CTA */}
      <Link
        href="/auctions"
        className="gradient-btn text-white font-black text-base tracking-[0.15em] uppercase py-4 px-12 rounded-full shadow-lg shadow-brand-blue/30 transition-transform active:scale-95"
      >
        Start Lotting
      </Link>
    </div>
  );
}
