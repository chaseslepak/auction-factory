import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-brand-navy flex flex-col items-center justify-center px-6">
      {/* Logo */}
      <div className="mb-10 text-center">
        <div className="w-24 h-24 gradient-btn rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-brand-blue/30">
          <svg className="w-14 h-14 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14.22 6.157l2.747-4.12a.674.674 0 011.12 0l2.747 4.12c.135.202.112.47-.056.646l-5.502 5.784a.674.674 0 01-.977 0L8.797 6.803a.5.5 0 01-.056-.646L11.488 2.037a.674.674 0 011.12 0l1.612 4.12z" />
            <path d="M5 17h14v2H5zm0 4h14v2H5z" />
          </svg>
        </div>
        <h1 className="text-white font-black text-2xl tracking-[0.25em] uppercase">
          Auction Factory
        </h1>
        <p className="text-gray-400 text-lg tracking-[0.2em] uppercase mt-2">
          Ohio Lotter
        </p>
      </div>

      {/* CTA */}
      <Link
        href="/auctions"
        className="gradient-btn text-white font-black text-base tracking-[0.15em] uppercase py-4 px-12 rounded-full shadow-lg shadow-brand-blue/30 transition-transform active:scale-95"
      >
        Start Lotting
      </Link>

      {/* Footer */}
      <p className="absolute bottom-8 text-gray-500 text-xs tracking-[0.1em] uppercase">
        Cleveland, OH
      </p>
    </div>
  );
}
