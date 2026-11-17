// 수업 화면 효과음 — 파일 없이 브라우저에서 바로 합성(Web Audio). 🔔 버튼으로 켜고 끔.
(() => {
  let ctx = null, on = true;
  try { on = localStorage.getItem('sfx') !== 'off'; } catch (e) {}
  const ac = () => { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (ctx.state === 'suspended') ctx.resume(); return ctx; };
  document.addEventListener('pointerdown', () => { if (on) ac(); }, { capture: true });
  const tone = (f, t0, dur, vol = .18, type = 'sine', f2) => { const c = ctx, o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f, c.currentTime + t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, c.currentTime + t0 + dur);
    g.gain.setValueAtTime(0, c.currentTime + t0); g.gain.linearRampToValueAtTime(vol, c.currentTime + t0 + .015); g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + t0 + dur); o.connect(g).connect(c.destination); o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + dur + .05); };
  const swish = (t0, dur, vol = .22, from = 1800, to = 600) => { const c = ctx, n = Math.floor(c.sampleRate * dur), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = b; f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(from, c.currentTime + t0); f.frequency.exponentialRampToValueAtTime(to, c.currentTime + t0 + dur); g.gain.value = vol; s.connect(f).connect(g).connect(c.destination); s.start(c.currentTime + t0); };
  const chime = (t0, notes, vol = .12, gap = .09, dur = 1.4) => notes.forEach((f, i) => { tone(f, t0 + i * gap, dur, vol); tone(f * 2, t0 + i * gap, dur * .6, vol * .3); });
  const S = {
    shuffle: () => { for (let i = 0; i < 9; i++) swish(i * .07, .09, .16, 2600, 900); chime(.7, [523, 784], .06, .12, .9); },
    flip: () => { swish(0, .16, .25, 900, 3000); chime(.12, [659, 988, 1319], .09, .07, 1.2); },
    close: () => swish(0, .14, .18, 2400, 700),
    reveal: () => { swish(0, .5, .12, 400, 3200); chime(.25, [523, 659, 784, 1047, 1319], .08, .08, 1.8); },
    tick: () => tone(1500, 0, .05, .07, 'triangle'),
    done: () => chime(0, [784, 1175], .09, .1, 1),
    bell: () => { [0, .9, 1.8].forEach(t => { tone(880, t, 2.2, .2); tone(1760, t, 1.2, .07); tone(2640, t, .6, .04); }); }
  };
  window.sfx = k => { if (!on || !S[k]) return; if (!ac()) return; try { S[k](); } catch (e) { window.__sfxErr = e.message; } };
  window.sfxOn = () => on;
  window.sfxToggle = () => { on = !on; try { localStorage.setItem('sfx', on ? 'on' : 'off'); } catch (e) {} if (on) window.sfx('done'); return on; };
})();
