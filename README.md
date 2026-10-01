# Binaural We Beats

### ▶ [Open the live web app](https://djshellshoxxx.github.io/binauralwebeats/)

**https://djshellshoxxx.github.io/binauralwebeats/**: put on headphones and press play. Nothing to install.

A browser-based **binaural beat generator** with monaural, isochronic and
bilateral modes, timed programs, a program editor, noise colours,
procedurally generated nature sounds, a Shepard-tone illusion, a breathing
pacer and WAV export.

It is pure static HTML/CSS/JavaScript: **no build step, no dependencies, no
tracking.**

> ## 🎧 Headphones required
> Binaural beats only work when **each ear hears its own tone**. Through
> speakers the two tones mix in the air and the effect disappears. The app
> asks you to confirm that you are wearing headphones before it plays
> anything, and it has an **L/R** test button to check your headphones are on
> the right way round. (The monaural and isochronic modes also work on
> speakers, but headphones are still best.)

## Features

- **Four beat types:** binaural (headphones), monaural, isochronic and **bilateral** (EMDR-style left ↔ right alternation).
- **18 frequency presets** across every brainwave band (Epsilon, Delta, Theta, Alpha, SMR, Beta and Gamma). Each one has a description of what it is traditionally used for (sleep, meditation, creativity, focus, alertness…).
- **10 guided programs** (plus your own) that glide between frequencies over time: Deep Sleep Descent, Power Nap, Meditation Journey, Deep Focus, Study Pomodoro, Morning Energize, Calm Down, Creative Flow, Lucid Dream Prep and 40 Hz Gamma.
- **Manual control** of the beat (0.5–45 Hz) and carrier (60–1000 Hz), with a waveform choice, session timer and fade-in.
- **Carrier tone presets:** 432 Hz, the Solfeggio scale (396–963 Hz), OM 136.1 Hz and more.
- **Mixer with rotary volume knobs:** beats, noise (white / pink / brown), nature (crashing waves, rain, thunder, rain + thunder, wind, babbling stream, crackling fire, forest birds, cat purr), **Shepard illusion** (endlessly rising or falling tone) and master.
- **Effects:** an **8D spatial sweep** that moves the background around your head, and a **pulse** that throbs the background at the beat rate.
- **Warm pad timbre** (detuned, filtered voices) as well as pure tones, and **extra voices** to stack up to three binaural frequencies at once, with ready-made stacks.
- **Breathing pacer:** Resonance 5.5/min, Calm 4-6, Box 4-4-4-4 and 4-7-8. The orb guides you, with an optional audio swell cue.
- **Sleep fade-down:** the volume slowly lowers over the last 5–30 minutes.
- **Program editor:** build, edit, duplicate and delete your own programs.
- **Download as WAV:** render any session (up to 30 min) to a file.
- **Install as an app** (PWA). Works offline once loaded.
- A live visualizer that pulses at the beat rate and shows the L and R waveforms.
- Settings are remembered locally. It works on phones, supports keyboard shortcuts (`Space` play/pause, `Esc` stop) and lock-screen media controls.
- Safety: a hard volume ceiling, a limiter, a first-run safety notice and a health disclaimer.

## Run it

ES modules must be served over HTTP (opening `index.html` from disk won't work).

```bash
python3 -m http.server 8080
# then open http://localhost:8080
```

## Deploy to a Linux server (copy-paste friendly)

Paste this whole block into your SSH session (PuTTY: right-click to paste,
then press Enter). It installs nginx, clones the app into `/var/www/binauralwebeats`
and serves it on port 80.

```bash
sudo apt-get update && sudo apt-get install -y nginx git && \
sudo rm -rf /var/www/binauralwebeats && \
sudo git clone https://github.com/djshellshoxxx/binauralwebeats /var/www/binauralwebeats && \
sudo tee /etc/nginx/sites-available/binauralwebeats > /dev/null <<'NGINX'
server {
    listen 80;
    server_name _;
    root /var/www/binauralwebeats;
    index index.html;
    location / { try_files $uri $uri/ =404; }
    location ~ /\.git { deny all; }
}
NGINX
sudo ln -sf /etc/nginx/sites-available/binauralwebeats /etc/nginx/sites-enabled/binauralwebeats && \
sudo rm -f /etc/nginx/sites-enabled/default && \
sudo nginx -t && sudo systemctl reload nginx && \
echo "Done: open http://$(hostname -I | awk '{print $1}')/"
```

To **update** later, paste:

```bash
sudo git -C /var/www/binauralwebeats pull && echo "Updated"
```

> Browsers allow audio and wake lock on `http://localhost` and on `https://`
> sites. On a public server, add HTTPS (for example
> `sudo apt-get install -y certbot python3-certbot-nginx && sudo certbot --nginx`)
> so that every feature works.

### GitHub Pages

Live at **https://djshellshoxxx.github.io/binauralwebeats/**

`.github/workflows/static.yml` redeploys the site on every push to the default
branch (Settings → Pages → Source: GitHub Actions).

## Develop

```bash
npm test        # runs the unit tests with Node's built-in test runner (Node 20+)
```

There is nothing to install. The tests cover the frequency maths, programs,
presets, noise and nature synthesis, the store and persistence, the controller
state machine, and the audio engine (against a fake `AudioContext`).

## Specs

The app was built to these specs in [`docs/specs/`](docs/specs):

| Spec | Covers |
|------|--------|
| [00 Overview](docs/specs/00-overview.md) | Goals, architecture, file layout |
| [01 Engine](docs/specs/01-engine.md) | Audio graph, beat modes, scheduling, noise and nature synthesis, safety limits |
| [02 GUI](docs/specs/02-gui.md) | Layout, controls, knobs, states, accessibility, visualizer |
| [03 Wiring](docs/specs/03-wiring.md) | Store, controller intents, session clock, persistence, data flow |
| [04 Presets](docs/specs/04-presets.md) | Bands, the frequency catalogue with descriptions, carrier tones, programs, headphone requirement |
| [05 Quality](docs/specs/05-quality.md) | Tests, browser support, performance, deployment, CI |
| [06 Roadmap](docs/specs/06-roadmap.md) | Other audio techniques (all built) |
| [07 v2 features](docs/specs/07-v2-features.md) | Spec for every v2 feature |

## Support the project ♥

Binaural We Beats is free, open source, ad-free and tracker-free. If it helps
you, donations in **Monero (XMR)** are gratefully received:

<p align="center"><img src="icons/xmr-qr.svg" width="180" alt="Monero donation QR code"></p>

```
85cSWLFurZj8XbKWX7Kk3u1oUtp5vLGQcLSfXEdGnTUU5P9mik6GCPk8guPfAwzHdFFUCbDKChZEphQyp6BNMQwo5oyPLUD
```

The same address and QR code are in the **Support this project** section at the
bottom of the [web app](https://djshellshoxxx.github.io/binauralwebeats/#donate).

## Disclaimer

Binaural beats are not a medical treatment, and research on their effects is
mixed. Don't use them while driving or operating machinery. If you have
epilepsy or a seizure disorder, a heart condition or a pacemaker, or are
pregnant, talk to a doctor first.
