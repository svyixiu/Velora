"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const POLL_MS = 4000;
const COMPANION_URL = "http://127.0.0.1:43127";

function formatNumber(value) {
  return typeof value === "number" ? new Intl.NumberFormat().format(value) : "—";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function secondsRemaining(expirationTime) {
  const expiresAt = new Date(expirationTime).getTime();
  if (Number.isNaN(expiresAt)) return 0;
  return Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
}

function Countdown({ expirationTime }) {
  const [remaining, setRemaining] = useState(() => secondsRemaining(expirationTime));

  useEffect(() => {
    const update = () => setRemaining(secondsRemaining(expirationTime));

    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [expirationTime]);

  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, "0");

  return <span>{minutes}:{seconds}</span>;
}

function Profile({ account, onReset }) {
  return (
    <section className="mirror-card">
      <div className="profile-head">
        <div className="avatar-shell">
          {account.avatar ? <img src={account.avatar} alt="Roblox avatar" /> : <div className="avatar-fallback" />}
        </div>
        <div className="identity">
          <div className="name-row">
            <h2>{account.displayName}</h2>
            {account.hasVerifiedBadge ? <span className="verified" title="Verified">✓</span> : null}
          </div>
          <p>@{account.username}</p>
          <span className="id-chip">ID {account.id}</span>
        </div>
        <a className="profile-link" href={account.profileUrl} target="_blank" rel="noreferrer">Open profile ↗</a>
      </div>

      <div className="stats-grid">
        <article><strong>{formatNumber(account.counts?.friends)}</strong><span>Friends</span></article>
        <article><strong>{formatNumber(account.counts?.followers)}</strong><span>Followers</span></article>
        <article><strong>{formatNumber(account.counts?.following)}</strong><span>Following</span></article>
        <article><strong>{formatNumber(account.counts?.groups)}</strong><span>Groups</span></article>
      </div>

      <div className="details-grid">
        <article>
          <span className="detail-label">Created</span>
          <strong>{formatDate(account.created)}</strong>
        </article>
        <article>
          <span className="detail-label">Account state</span>
          <strong>{account.isBanned ? "Banned" : "Active"}</strong>
        </article>
      </div>

      <div className="bio-block">
        <span className="detail-label">About</span>
        <p>{account.description || "No public description."}</p>
      </div>

      {account.groups?.length ? (
        <div className="groups-block">
          <div className="section-title"><span>Groups</span><small>first {account.groups.length}</small></div>
          <div className="group-list">
            {account.groups.map((group) => (
              <div className="group-row" key={`${group.id}-${group.role}`}>
                <div><strong>{group.name}</strong><span>{group.role}</span></div>
                {group.rank !== null ? <small>Rank {group.rank}</small> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="privacy-note">
        Velora Companion used the approved Quick Sign-in session only long enough to identify this account. The Roblox session was not sent to Vercel or retained by Velora.
      </div>

      <button className="secondary-button" type="button" onClick={onReset}>Mirror another account</button>
    </section>
  );
}

export default function Home() {
  const [phase, setPhase] = useState("idle");
  const [challenge, setChallenge] = useState(null);
  const [status, setStatus] = useState("Created");
  const [accountName, setAccountName] = useState(null);
  const [account, setAccount] = useState(null);
  const [error, setError] = useState("");
  const [companionState, setCompanionState] = useState("checking");
  const pollingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const checkCompanion = async () => {
      try {
        const response = await fetch(`${COMPANION_URL}/health`, {
          method: "GET",
          cache: "no-store",
        });

        const data = await response.json();

        if (!cancelled) {
          setCompanionState(response.ok && data?.ok ? "ready" : "missing");
        }
      } catch {
        if (!cancelled) setCompanionState("missing");
      }
    };

    checkCompanion();
    const timer = window.setInterval(checkCompanion, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [companionState]);

  const statusCopy = useMemo(() => {
    if (status === "UserLinked") return accountName ? `${accountName} linked the code. Waiting for approval…` : "Account linked. Waiting for approval…";
    if (status === "Validated") return "Approved. Building your mirror…";
    if (status === "Cancelled") return "The Quick Login request was cancelled.";
    if (status === "Expired" || status === "TimedOut") return "This code expired. Generate a new one.";
    return "Waiting for you to approve the code in Roblox.";
  }, [status, accountName]);

  const reset = useCallback(() => {
    if (challenge?.challengeId) {
      fetch(`${COMPANION_URL}/quick-login/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: challenge.challengeId }),
      }).catch(() => {});
    }

    setPhase("idle");
    setChallenge(null);
    setStatus("Created");
    setAccountName(null);
    setAccount(null);
    setError("");
    pollingRef.current = false;
  }, [challenge]);

  const createCode = useCallback(async () => {
    setPhase("creating");
    setError("");
    setAccount(null);

    try {
      if (companionState !== "ready") {
        throw new Error("Velora Companion is not running on this device.");
      }

      const response = await fetch(`${COMPANION_URL}/quick-login/create`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not create a Quick Login code.");

      setChallenge(data);
      setStatus(data.status || "Created");
      setPhase("waiting");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create a Quick Login code.");
      setPhase("idle");
    }
  }, []);

  useEffect(() => {
    if (phase !== "waiting" || !challenge || pollingRef.current) return;

    pollingRef.current = true;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;

      try {
        const response = await fetch(`${COMPANION_URL}/quick-login/status`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ challengeId: challenge.challengeId }),
        });
        const data = await response.json();

        if (cancelled) return;

        if (!response.ok && response.status !== 410) {
          throw new Error(data.error || "Could not check Quick Login status.");
        }

        setStatus(data.status || "Created");
        setAccountName(data.accountName || null);

        if (data.status === "Validated" && data.account) {
          setAccount(data.account);
          setPhase("done");
          pollingRef.current = false;
          return;
        }

        if (["Cancelled", "Expired", "TimedOut"].includes(data.status)) {
          setPhase("terminal");
          pollingRef.current = false;
          return;
        }

        window.setTimeout(poll, POLL_MS);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Status check failed.");
        setPhase("terminal");
        pollingRef.current = false;
      }
    };

    poll();

    return () => {
      cancelled = true;
      pollingRef.current = false;
    };
  }, [phase, challenge]);

  const copyCode = useCallback(async () => {
    if (challenge?.code) await navigator.clipboard.writeText(challenge.code);
  }, [challenge]);

  return (
    <main className="page-shell">
      <div className="glow glow-one" />
      <div className="glow glow-two" />

      <header className="topbar">
        <a className="brand" href="/" aria-label="Velora home"><span className="brand-mark">V</span><span>Velora</span></a>
        <a className="github-link" href="https://github.com/svyixiu/Velora" target="_blank" rel="noreferrer">GitHub ↗</a>
      </header>

      <div className="content">
        <div className="hero-copy">
          <span className="eyebrow">ACCOUNT MIRROR</span>
          <h1>See your Roblox account from the outside.</h1>
          <p>Velora generates Roblox Quick Sign-in from your own computer through a local companion, then mirrors the account without ever sending the Roblox session to Vercel or browser JavaScript.</p>
        </div>

        {phase === "done" && account ? (
          <Profile account={account} onReset={reset} />
        ) : (
          <section className="login-card">
            {phase === "idle" || phase === "creating" ? (
              <>
                <div className="card-kicker">Start a mirror</div>
                <h2>Quick Sign-in from your own network.</h2>
                <p className="muted">Roblox checks that the device creating the code is near the device approving it. Velora Companion performs that request locally instead of through Vercel.</p>

                <div className={`companion-status ${companionState}`}>
                  <span className="status-dot" />
                  <span>
                    {companionState === "checking"
                      ? "Checking for Velora Companion…"
                      : companionState === "ready"
                        ? "Velora Companion is connected."
                        : "Velora Companion is not running on this device."}
                  </span>
                </div>

                {companionState === "missing" ? (
                  <div className="companion-setup">
                    <span className="detail-label">Run locally first</span>
                    <code>npm run companion</code>
                    <p>Keep that terminal open, then use this Velora page on the same computer. Approve the code from another device on the same network.</p>
                  </div>
                ) : null}

                <button className="primary-button" type="button" onClick={createCode} disabled={phase === "creating" || companionState !== "ready"}>
                  {phase === "creating" ? "Creating code…" : "Generate Quick Login code"}
                </button>
              </>
            ) : null}

            {phase === "waiting" && challenge ? (
              <>
                <div className="code-topline"><span>Quick Login</span><span className="timer"><Countdown expirationTime={challenge.expirationTime} /></span></div>
                <button type="button" className="code" onClick={copyCode} title="Copy code">{challenge.code}</button>
                <p className="copy-hint">Tap the code to copy</p>

                <ol className="steps">
                  <li>Open Roblox on a device where you are already signed in.</li>
                  <li>Go to <strong>Settings → Quick Login</strong>.</li>
                  <li>Enter the code above and review the Roblox approval screen.</li>
                </ol>

                <div className="status-line"><span className="pulse" /><span>{statusCopy}</span></div>
                <div className="safety-strip">After approval, the local companion briefly uses Roblox&apos;s resulting session only to identify the account. That cookie never leaves local RAM and is never returned to this website.</div>
              </>
            ) : null}

            {phase === "terminal" ? (
              <>
                <div className="card-kicker">Challenge ended</div>
                <h2>{status === "Cancelled" ? "Request cancelled." : "That code is no longer active."}</h2>
                <p className="muted">Nothing was saved. Start again whenever you want a fresh mirror.</p>
                <button className="primary-button" type="button" onClick={createCode}>Generate another code</button>
              </>
            ) : null}

            {error ? <div className="error-box">{error}</div> : null}
          </section>
        )}

        <footer>
          <span>Unofficial project. Not affiliated with Roblox.</span>
          <span>Open source · MIT</span>
        </footer>
      </div>
    </main>
  );
}
