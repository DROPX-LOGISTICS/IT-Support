import { AlertTriangle, BellRing, CheckCircle2, MessagesSquare } from "lucide-react";
import { Logo } from "@/components/ui";
import { allowedDomain } from "@/lib/config";
import { signInWithGoogle } from "./actions";

const MESSAGES: Record<string, string> = {
  domain: "That Google account is not on the company domain. Please choose your DropX work account.",
  inactive: "Your access has been switched off. Please contact the IT team.",
  failed: "We could not sign you in. Please try again.",
  unconfigured: "Sign-in is not configured yet. Please contact the IT team.",
};

export default function LoginPage({ searchParams }: { searchParams: { error?: string; next?: string } }) {
  const error = searchParams.error ? MESSAGES[searchParams.error] ?? MESSAGES.failed : null;
  const domain = allowedDomain();
  return (
    <main className="login">
      <section className="login-art">
        <span className="logo-chip"><Logo /></span>
        <div>
          <h2>Tell the tech team once. Follow it to done.</h2>
          <p>One place to report a problem with People, OpsPulse, DropX One or the Dashboard, ask for a feature, or get help.</p>
          <ul>
            <li><MessagesSquare size={18} aria-hidden /> Raise a ticket in about a minute, with screenshots</li>
            <li><BellRing size={18} aria-hidden /> See who has it and when to expect it</li>
            <li><CheckCircle2 size={18} aria-hidden /> It closes only when you say it works</li>
          </ul>
        </div>
        <span style={{ fontSize: 12.5, color: "rgba(255,255,255,.6)" }}>DropX Logistics · IT Support</span>
      </section>

      <section className="login-form">
        <div className="inner">
          <p className="eyebrow">IT Support</p>
          <h1>Sign in</h1>
          <p className="muted" style={{ margin: "0 0 22px" }}>Use your work Google account. There is no separate password.</p>
          {error && (
            <div className="banner bad" role="alert">
              <AlertTriangle size={18} aria-hidden /> <div>{error}</div>
            </div>
          )}
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={searchParams.next ?? "/"} />
            <button className="gbtn" type="submit">
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.500 5.400 2.600 13.200l7.900 6.100C12.400 13.600 17.700 9.500 24 9.500z" />
                <path fill="#4285F4" d="M46.500 24.500c0-1.600-.100-3.100-.400-4.500H24v9h12.700c-.600 3-2.300 5.500-4.800 7.200l7.700 6c4.500-4.200 6.900-10.300 6.900-17.700z" />
                <path fill="#FBBC05" d="M10.500 28.700c-.500-1.500-.800-3.100-.800-4.700s.300-3.200.800-4.700l-7.900-6.100C.900 16.500 0 20.100 0 24s.900 7.500 2.600 10.800l7.900-6.100z" />
                <path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.700-6c-2.200 1.500-4.900 2.300-8.200 2.300-6.300 0-11.600-4.100-13.500-9.800l-7.900 6.100C6.500 42.600 14.600 48 24 48z" />
              </svg>
              Continue with Google
            </button>
          </form>
          {domain && <p className="muted" style={{ fontSize: 13, marginTop: 14, textAlign: "center" }}>Only @{domain} accounts can sign in.</p>}
        </div>
      </section>
    </main>
  );
}
