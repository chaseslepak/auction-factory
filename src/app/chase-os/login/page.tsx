import LoginForm from './LoginForm';

export const metadata = { title: 'Sign in — Chase OS' };

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; redirect?: string };
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg p-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-navy text-white text-lg font-bold">C</div>
          <div>
            <h1 className="text-base font-semibold text-brand-navy">Chase OS</h1>
            <p className="text-xs text-slate-500">Executive operating system</p>
          </div>
        </div>
        {searchParams?.error === 'not_authorized' ? (
          <div className="mb-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            That email is not authorized. Ask Chase for an invite.
          </div>
        ) : null}
        {searchParams?.error === 'no_profile' ? (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Your profile isn&apos;t set up yet. Sign in again or contact admin.
          </div>
        ) : null}
        <LoginForm />
      </div>
    </div>
  );
}
