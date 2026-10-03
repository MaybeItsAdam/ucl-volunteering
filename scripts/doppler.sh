#!/bin/sh
# The society's Doppler CLI: `doppler-volsoc` (your own Doppler login kept
# apart, see README) when it's installed, otherwise plain `doppler` signed in to
# the VolSoc workplace. Always the volsoc-webapp project, prd config: local dev
# reads the production database anyway.
if command -v doppler-volsoc >/dev/null 2>&1; then cli=doppler-volsoc; else cli=doppler; fi
exec "$cli" "$@"
