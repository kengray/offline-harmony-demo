# Offline harmony player: proof of concept

A small demo of how a website for practising vocal harmony could work with no internet connection,
using standard browser features only. The audio is generated tones, not real songs.

Live demo: https://kengray.github.io/offline-harmony-demo/

## Try it (best on a phone)
1. Open the demo page while online. The page installs itself (a service worker stores the player).
2. Press **Get demo access token** (choose 1 minute to watch it expire, or 30 days).
3. Pick Song A and press **Save for offline**. Leave Song B unsaved.
4. Switch on flight mode, close the browser tab and open the page again.
5. Song A still plays. Song B says it is not saved. After the token expires, Song A stops until you are online again.

## What is in it
- `sw.js`: service worker. Stores the player and serves saved songs with no network.
- `player.js`: four-part player (Web Audio), per-song save to Cache Storage, signed access token.
- Token: ECDSA P-256 signature checked on the device with WebCrypto. Demo only: the page signs its own token.
  A real build has the server sign it after checking the subscription, with a 30-day check-in.
- No encryption of the audio (left out on purpose for the first demo).
- `tests/run.py`: 17 checks in headless Chromium (needs python playwright). `node tests/serve.js 8080` serves the demo locally.
- `gen_audio.py`: regenerates the dummy audio.

## Known limits
- Setting the device clock back re-opens an expired token. A technical user can copy saved files out of browser storage.
- Storage quota and eviction differ by browser. iPhones are strictest; adding the page to the home screen helps.
- Not yet tested: iPhone Safari, large real files, a real server.
