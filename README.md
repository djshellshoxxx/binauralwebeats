# Binaural We Beats

A browser-based **binaural beat generator** with monaural and isochronic modes,
timed programs, noise colours and procedurally generated nature sounds
(crashing waves, rain, thunder, rain + thunder).

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

- **Three beat types:** binaural (headphones), monaural and isochronic.
- **18 frequency presets** across every brainwave band (Epsilon, Delta, Theta, Alpha, SMR, Beta and Gamma). Each one has a description of what it is traditionally used for (sleep, meditation, creativity, focus, alertness…).
- **10 guided programs** that glide between frequencies over time: Deep Sleep Descent, Power Nap, Meditation Journey, Deep Focus, Study Pomodoro, Morning Energize, Calm Down, Creative Flow, Lucid Dream Prep and 40 Hz Gamma.
- **Manual control** of the beat (0.5–45 Hz) and carrier (60–1000 Hz), with a waveform choice, session timer and fade-in.
- **Carrier tone presets:** 432 Hz, the Solfeggio scale (396–963 Hz), OM 136.1 Hz and more.
- **Mixer with rotary volume knobs:** beats, noise (white / pink / brown), nature (crashing waves / rain / thunder / rain + thunder) and master.
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
| [06 Roadmap](docs/specs/06-roadmap.md) | Other audio techniques that could be added next |

## Disclaimer

Binaural beats are not a medical treatment, and research on their effects is
mixed. Don't use them while driving or operating machinery. If you have
epilepsy or a seizure disorder, a heart condition or a pacemaker, or are
pregnant, talk to a doctor first.
