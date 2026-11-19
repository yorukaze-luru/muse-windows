CI stages the standalone Muse Link installer here as Muse-Link-Setup.exe
before building the Muse app installer (see .github/workflows in the
muse-windows repo). Local builds need this file present because
package.json extraFiles references it.
