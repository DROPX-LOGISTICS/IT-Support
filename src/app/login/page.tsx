import { AlertTriangle } from "lucide-react";
import { BrandMark } from "@/components/ui";
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
      <div className="card">
        <BrandMark size={26} />
        <h1>DropX IT Support</h1>
        <p className="muted" style={{ marginBottom: 22 }}>
          Report a problem or ask for a feature. Sign in once with your work Google account.
        </p>
        {error && (
          <div className="banner bad" role="alert" style={{ textAlign: "left" }}>
            <AlertTriangle size={18} aria-hidden /> <div>{error}</div>
          </div>
        )}
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={searchParams.next ?? "/"} />
          <button className="btn wide" type="submit">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
              <path fill="#fff" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37a13 13 0 1 1 8.4-22.9l6-6A21.5 21.5 0 1 0 24 45c11.4 0 21-8 21-21 0-1.4-.2-2.700-.5-4z" />
            </svg>
            Sign in with Google
          </button>
        </form>
        {domain && <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>Only @{domain} accounts can sign in.</p>}
      </div>
    </main>
  );
}
