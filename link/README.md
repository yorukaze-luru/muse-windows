# Muse Link (unofficial, personal use only)

Version 1.0.0 - agent-only app, separated from the Muse wrapper.

Icons: assets/icon.ico and assets/icon.png are stored base64-encoded
(.b64) and must be decoded before building; the GitHub Actions workflow
does this automatically.

Distribution (revised 2026-11-19, supersedes the muse-link-repo plan):
- Published as part of "Muse Windows" (repo yorukaze-luru/muse-windows,
  Public, decided by the user): one release carries the Muse app
  installer (with Muse Link as an optional component in the installer),
  the standalone Muse Link installer, and the portable Muse exe.
- Versions are unified across both apps per release (this release is
  1.0.0 for both). Auto-update: the Muse app reads latest.yml, Muse
  Link reads link.yml (channel "link"), both from the same release.
  A generic feed URL (env MUSE_LINK_UPDATE_URL or the updateFeedUrl
  setting) still overrides for Link.
- Staging repo: ~/workspace/muse-windows-repo (app/ + link/ + Actions).
- The installed folder build stays at 0.4.2 until the first installer
  release is out and installed.

Fix in 0.4.2 (display only; the connection itself was fine):
- The agent status showed the Muse public key as "not set / stopped"
  because the check only tested the dedicated user's profile path, which
  the unelevated agent process cannot read, and the key sshd actually
  uses lives under ProgramData since 0.4.1. The check now also reads the
  setup log: registered if the last key event is "Public key: registered",
  not registered if a revoke removal came after it.

Fix in 0.4.1 (found in the first SSH connection test):
- TCP through the tailnet reached the notebook and sshd answered, but the
  public key was rejected. Likely cause: the dedicated user has never
  logged on interactively, so sshd does not resolve its profile .ssh path.
- setup.ps1 now also registers the key at C:\ProgramData\MuseLink\
  authorized_keys (SYSTEM/Administrators full, muselink read-only) and adds
  a "Match User muselink" AuthorizedKeysFile block to sshd_config, then
  restarts sshd. revoke.ps1 removes that file too. Re-running the wizard's
  step 2 applies this; all other steps skip if already done.

Change in 0.4.0 (requested 2026-11-19):
- The Muse window was removed from Muse Link. Muse Link is now ONLY the
  link agent (tray + status/settings window + setup wizard).
- The earlier Muse Windows wrapper (folder version v0.2.2) remains a
  separate, untouched app and is used for Muse as before. The two apps have
  separate names, settings and user data, and can run side by side.
- Agent and wizard windows now have an explicit "Quit Muse Link" button.
  Closing a window still keeps the tray agent alive (that is its job);
  quit from the button or the tray menu when deleting the folder etc.
- Note: the step-2 setup runs in a separate elevated process, so closing
  or quitting the app does not stop a setup already in progress. Reboot
  the PC to stop it.

Fix in 0.3.1 (found in the first real-machine test of 0.3.0):
- The wizard showed "done" but no setup log was created and nothing ran.
  Cause: setup.ps1 / revoke.ps1 were addressed by file path inside app.asar,
  which external PowerShell cannot open, and the elevated launcher did not
  propagate the inner exit code, so failure looked like success.
  Fix: the main process reads the bundled script content (fs can read asar)
  and passes it as an encoded command; the elevated launcher now returns the
  inner exit code; the wizard warns when no log file was created.

What it is:
- Muse window: the v0.2.2 wrapper as-is (muse.ai in its own window).
- Tray agent: link status (Tailscale / sshd / base folder / dedicated user / key),
  auto-start setting, open base folder, revoke Muse's key.
- First-run setup wizard:
  1. Choose agent auto-start (default ON, changeable later).
  2. Run the automatic setup (elevated, one UAC): Tailscale via winget,
     OpenSSH Server enable + Automatic, dedicated user "muselink" with a random
     unknown password, Muse public key registration, base folder
     C:\MuseWorkspaces creation + grant to the dedicated user.
  3. Sign in to Tailscale manually (only the user can do this).
  4. Manual security checklist: tailnet lock, minimal ACL (Muse device to
     this PC port 22 only), account MFA. Tailscale SSH / Serve are NOT used.
  5. Finish. Connection test is done later from chat, after the Muse device
     is approved in the tailnet.

Decisions baked in (2026-11-19):
- First target PC: the Intel Arc A730M notebook.
- Base folder: C:\MuseWorkspaces. Per-chat work folders live under it.
  Chats without a folder link never touch the PC.
- Uninstall: recommended cleanup is the default (remove app, dedicated user
  and key; keep workspace contents, Tailscale and OpenSSH). The agent's
  "revoke key" button performs the security-critical part before uninstall,
  and the choice is presented there.

Auto update:
- electron-updater is wired in main.js but DISABLED until a feed URL is set
  (settings updateFeedUrl or env MUSE_LINK_UPDATE_URL). A GitHub Releases
  feed is not configured yet: this app is unofficial/personal, and a private
  repo feed needs a token, so the distribution route is a remaining decision.

Not verified yet:
- Everything Windows-side needs a real-machine test on the Arc notebook:
  install, wizard run (UAC, winget, OpenSSH capability), tray, auto-start.
- The SSH connection test from Muse (list + create a test file in
  C:\MuseWorkspaces) happens after Tailscale sign-in and device approval.
