(() => {
  "use strict";

  // All preview sounds are original, synthesized locally in the visitor's browser.
  // Audio starts only after a user gesture. No remote model, music or audio library.
  const RATE = 48000;
  const SOUNDS = {
    impact:     { name: "Cinematic Impact", duration: 1.1,  seed: 7241,  category: "cinematic" },
    riser:      { name: "Rising Tension",   duration: 2.4,  seed: 3281,  category: "cinematic" },
    game:       { name: "Game Reward",      duration: 0.95, seed: 5859,  category: "gaming" },
    commercial: { name: "Product Reveal",   duration: 1.8,  seed: 9472,  category: "commercial" },
    bonk:       { name: "Comedy Bonk",      duration: 0.6,  seed: 2268,  category: "comedy" },
    drone:      { name: "Mystery Drone",    duration: 3.2,  seed: 4637,  category: "audio_drama" }
  };
  const CATEGORY = {
    cinematic: {
      index: "01 / 05", sound: "impact", eyebrow: "FOR THE MOMENT",
      heading: "Make the moment hit.",
      description: "Impact yang terasa, transisi yang punya bobot, dan cerita yang lebih jelas melalui sound design.",
      label: "cinematic"
    },
    gaming: {
      index: "02 / 05", sound: "game", eyebrow: "FOR THE INTERACTION",
      heading: "Make every action respond.",
      description: "Feedback suara yang responsif membantu pemain membaca aksi, hadiah, dan perubahan situasi.",
      label: "game audio"
    },
    commercial: {
      index: "03 / 05", sound: "commercial", eyebrow: "FOR THE REVEAL",
      heading: "Give the brand its moment.",
      description: "Sweep, detail transisi, dan penekanan yang menambah rasa pada motion serta product reveal.",
      label: "commercial"
    },
    comedy: {
      index: "04 / 05", sound: "bonk", eyebrow: "FOR THE TIMING",
      heading: "Let the punchline land.",
      description: "Komedi hidup lewat jeda, respons cepat, dan efek yang muncul pada frame yang tepat.",
      label: "comedy"
    },
    audio_drama: {
      index: "05 / 05", sound: "drone", eyebrow: "FOR THE ATMOSPHERE",
      heading: "Let the unseen be felt.",
      description: "Tekstur dan atmosfer yang membantu pendengar merasakan ruang, tensi, dan apa yang tidak terlihat.",
      label: "audio drama"
    }
  };

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const cache = new Map();
  let audioContext = null;
  let analyser = null;
  let activeSource = null;
  let activeKind = null;
  let activeStart = 0;
  let activeOffset = 0;
  let pendingSceneTimeout = null;
  let sceneFrame = 0;
  let toastTimeout = 0;
  let heroVisible = true;
  let heroFrame = 0;
  let heroTime = 0;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const fmt = (seconds) => (seconds < 10 ? "0" : "") + seconds.toFixed(1) + "s";

  function synthesize(kind) {
    if (!SOUNDS[kind]) throw new Error("Unknown SFX preview: " + kind);
    if (cache.has(kind)) return cache.get(kind);
    const definition = SOUNDS[kind];
    const frames = Math.round(RATE * definition.duration);
    const values = new Float32Array(frames);
    let rng = definition.seed >>> 0;
    let phase = 0, phase2 = 0, noiseLP = 0;
    const random = () => {
      rng ^= rng << 13; rng ^= rng >>> 17; rng ^= rng << 5;
      return (rng >>> 0) / 2147483648 - 1;
    };
    const notes = [587.33, 783.99, 987.77, 1318.51];

    for (let i = 0; i < frames; i++) {
      const t = i / RATE;
      const u = t / definition.duration;
      const noise = random();
      noiseLP += 0.06 * (noise - noiseLP);
      let value = 0, frequency = 0;

      if (kind === "impact") {
        frequency = 48 + 180 * Math.exp(-22 * t);
        phase += 2 * Math.PI * frequency / RATE;
        const thump = Math.sin(phase) + 0.19 * Math.sin(2 * phase);
        value = thump * Math.exp(-7.8 * u) + noise * Math.exp(-52 * t) * 0.45;
      } else if (kind === "riser") {
        frequency = 95 + 1450 * u * u;
        phase += 2 * Math.PI * frequency / RATE;
        value = (Math.sin(phase) + 0.18 * Math.sin(phase * 2) + noiseLP * 0.15) * Math.pow(u, 1.7);
      } else if (kind === "bonk") {
        frequency = 155 + 660 * Math.exp(-11 * u);
        phase += 2 * Math.PI * frequency / RATE;
        value = (Math.sin(phase) + 0.25 * Math.sin(3 * phase)) * Math.exp(-6.1 * u);
      } else if (kind === "game") {
        const segment = definition.duration / notes.length;
        const index = Math.min(notes.length - 1, Math.floor(t / segment));
        const local = t - index * segment;
        const envelope = Math.min(1, local / 0.005) * Math.exp(-3.9 * local / segment);
        value = (Math.sin(2 * Math.PI * notes[index] * local) +
                 0.16 * Math.sin(4 * Math.PI * notes[index] * local)) * envelope;
      } else if (kind === "commercial") {
        frequency = 180 + 1200 * u * u;
        phase += 2 * Math.PI * frequency / RATE;
        const sweep = (noiseLP * 1.3 + Math.sin(phase) * 0.22) *
          Math.pow(Math.sin(Math.PI * u), 1.3);
        const endToneT = t - 1.23;
        const endTone = endToneT > 0 ?
          Math.sin(2 * Math.PI * 990 * endToneT) *
          Math.exp(-8 * endToneT) * 0.37 : 0;
        value = sweep + endTone;
      } else if (kind === "drone") {
        const wind = 0.55 * Math.sin(2 * Math.PI * 71 * t) +
                     0.4 * Math.sin(2 * Math.PI * 74.7 * t);
        phase2 += 2 * Math.PI * 0.43 / RATE;
        value = (wind + noiseLP * 0.09) *
                (0.52 + 0.48 * Math.sin(Math.PI * u) ** 2) *
                (0.82 + 0.18 * Math.sin(phase2));
      }

      // Force edge fades to prevent clicks and preserve 1+ dB of headroom.
      const fadeSamples = Math.round(RATE * 0.008);
      const fade = clamp(Math.min(i / fadeSamples, (frames - 1 - i) / fadeSamples), 0, 1);
      values[i] = value * fade;
    }
    let peak = 0;
    for (const sample of values) peak = Math.max(peak, Math.abs(sample));
    if (peak < 1e-8) throw new Error("Empty synthesizer output");
    for (let i = 0; i < values.length; i++) values[i] = values[i] * (0.78 / peak);
    cache.set(kind, values);
    return values;
  }

  function getOrCreateContext() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw new Error("Your browser does not support Web Audio");
    if (!audioContext) {
      audioContext = new Context();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.78;
      analyser.connect(audioContext.destination);
    }
    return audioContext;
  }

  function removePlaybackState() {
    $$(".sound-row").forEach((row) => row.classList.remove("is-playing"));
    $$(".sound-play").forEach((b) => {
      b.textContent = "▶";
      b.setAttribute("aria-pressed", "false");
    });
    const hero = $("#heroPlayLabel");
    if (hero) hero.textContent = "Play the sound";
    const category = $("#categoryPlayLabel");
    if (category) category.textContent = "Listen to " + (CATEGORY[selectedCategory]?.label || "sound");
    const status = $("#visualStatus");
    if (status) status.textContent = "SIGNAL IDLE";
    if (heroFrame === 0) drawHero();
  }

  function updatePlaybackState(kind) {
    removePlaybackState();
    if (!kind) return;
    $$(".sound-row").filter((row) => row.dataset.sound === kind).forEach((row) => {
      row.classList.add("is-playing");
      const b = row.querySelector(".sound-play");
      if (b) {
        b.textContent = "■";
        b.setAttribute("aria-pressed", "true");
      }
    });
    if (kind === "impact") $("#heroPlayLabel").textContent = "Stop the sound";
    if (kind === CATEGORY[selectedCategory].sound)
      $("#categoryPlayLabel").textContent = "Stop the sound";
    $("#visualStatus").textContent = "SIGNAL ACTIVE ●";
  }

  function stopSound() {
    const source = activeSource;
    activeSource = null;
    activeKind = null;
    activeOffset = 0;
    if (source) {
      source.onended = null;
      try { source.stop(0); } catch (_) {}
      try { source.disconnect(); } catch (_) {}
    }
    removePlaybackState();
    refreshSoundWaves();
  }

  async function playSound(kind, options = {}) {
    if (!SOUNDS[kind]) return;
    const offset = clamp(options.offset || 0, 0, SOUNDS[kind].duration - 0.02);
    const delay = Math.max(0, options.delay || 0);
    stopSound();
    const ctx = getOrCreateContext();
    await ctx.resume();
    // Another click may have superseded the gesture while resume was pending.
    if (activeSource) stopSound();
    const raw = synthesize(kind);
    const buffer = ctx.createBuffer(1, raw.length, RATE);
    buffer.copyToChannel(raw, 0);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);
    activeSource = source;
    activeKind = kind;
    activeStart = ctx.currentTime + delay;
    activeOffset = offset;
    source.onended = () => {
      if (activeSource !== source) return;
      activeSource = null;
      activeKind = null;
      activeOffset = 0;
      removePlaybackState();
      refreshSoundWaves();
    };
    source.start(activeStart, offset);
    updatePlaybackState(kind);
    refreshSoundWaves();
  }

  async function toggleSound(kind, offset = 0) {
    if (activeKind === kind && !offset) {
      stopSound();
      return;
    }
    try {
      await playSound(kind, { offset });
    } catch (error) {
      showToast("Audio tidak bisa diputar di browser ini");
      console.error(error);
    }
  }

  function progressFor(kind) {
    if (activeKind !== kind || !audioContext || !activeSource) return 0;
    const progress = (Math.max(0, audioContext.currentTime - activeStart) + activeOffset) /
      SOUNDS[kind].duration;
    return clamp(progress, 0, 1);
  }

  function encodeWAV(kind) {
    const samples = synthesize(kind);
    const bytes = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(bytes);
    const str = (offset, value) => {
      for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
    };
    str(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    str(8, "WAVE");
    str(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, RATE, true);
    view.setUint32(28, RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    str(36, "data");
    view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++)
      view.setInt16(44 + i * 2, Math.round(clamp(samples[i], -1, 1) * 32767), true);
    return new Blob([bytes], { type: "audio/wav" });
  }

  function downloadSound(kind) {
    if (!SOUNDS[kind]) return;
    try {
      const link = document.createElement("a");
      const url = URL.createObjectURL(encodeWAV(kind));
      link.href = url;
      link.download = "LokalAudioLab_Demo_" + kind + ".wav";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast("Demo " + SOUNDS[kind].name + " siap diunduh");
    } catch (error) {
      showToast("Gagal menyiapkan WAV");
      console.error(error);
    }
  }

  function showToast(message) {
    const toast = $("#toast");
    if (!toast) return;
    window.clearTimeout(toastTimeout);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimeout = window.setTimeout(() => toast.classList.remove("is-visible"), 3300);
  }

  // High-DPI canvas sizing is shared across responsive waveform visualizations.
  function canvasSetup(canvas) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext("2d");
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: context, w: rect.width, h: rect.height };
  }

  const heroCanvas = $("#heroCanvas");
  const categoryCanvas = $("#categoryCanvas");
  let categoryAmplitude = 0;
  let selectedCategory = "cinematic";

  function drawHero() {
    const surface = canvasSetup(heroCanvas);
    if (!surface) return;
    const { ctx, w, h } = surface;
    ctx.clearRect(0, 0, w, h);
    const playing = Boolean(activeSource) &&
      audioContext && audioContext.currentTime >= activeStart;
    let energy = 0.08;
    if (playing && analyser) {
      const frequencies = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(frequencies);
      energy = 0.1 + frequencies.slice(0, 80).reduce((a, b) => a + b, 0) / (80 * 255);
      energy = clamp(energy, 0.09, 0.9);
    }
    const t = reducedMotion.matches ? 0 : heroTime;
    const cx = w / 2, cy = h / 2;
    const min = Math.min(w, h), radius = min * 0.24;
    const count = 128;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = "rgba(189,255,104,.11)";
    ctx.lineWidth = 1;
    for (const scale of [0.77, 1.03, 1.4]) {
      ctx.beginPath();
      ctx.arc(0, 0, radius * scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2;
      const rhythm = Math.abs(Math.sin(i * 0.24 + t * 1.12) *
                              Math.cos(i * 0.081 - t * .64));
      const amplitude = (12 + rhythm * (26 + energy * 79));
      const r1 = radius * 0.9;
      const r2 = r1 + amplitude;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
      ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
      ctx.lineWidth = i % 3 === 0 ? 2 : 1.3;
      ctx.strokeStyle = i % 4 === 0 ? "rgba(233,255,205,.82)" :
                        "rgba(189,255,104,.72)";
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, 5 + energy * 7, 0, Math.PI * 2);
    ctx.fillStyle = "#bdff68";ctx.fill();
    ctx.beginPath();ctx.arc(0, 0, 18 + energy * 15, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(189,255,104,.26)";
    ctx.stroke();
    ctx.restore();
    if (playing) {
      $$("[data-play]").forEach((btn) => {
        const matches = btn.dataset.play === activeKind;
        btn.classList.toggle("is-active-audio", matches);
      });
    } else {
      $$("[data-play]").forEach((btn) => btn.classList.remove("is-active-audio"));
    }
  }

  function drawCategory() {
    const surface = canvasSetup(categoryCanvas);
    if (!surface) return;
    const { ctx, w, h } = surface;
    ctx.clearRect(0, 0, w, h);
    const sound = CATEGORY[selectedCategory].sound;
    const raw = synthesize(sound);
    const count = 100;
    const cx = w / 2, cy = h / 2;
    const baseRadius = Math.min(w, h) * 0.24;
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < count; i++) {
      const pos = Math.floor(i * (raw.length - 1) / count);
      const end = Math.min(raw.length, pos + Math.max(1, Math.floor(raw.length / count)));
      let samplePeak = 0;
      for (let j = pos; j < end; j++) samplePeak = Math.max(samplePeak, Math.abs(raw[j]));
      const length = 10 + samplePeak * 48;
      const angle = i / count * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * baseRadius, Math.sin(angle) * baseRadius);
      ctx.lineTo(Math.cos(angle) * (baseRadius + length),
                 Math.sin(angle) * (baseRadius + length));
      ctx.strokeStyle = i % 4 === 0 ? "#e4ffb9" : "#bdff68";
      ctx.lineWidth = 1.7;
      ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, baseRadius * .73, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(189,255,104,.16)";ctx.stroke();
    ctx.fillStyle = "#bdff68";
    ctx.beginPath();ctx.arc(0, 0, 4, 0, Math.PI * 2);ctx.fill();
    ctx.restore();
  }

  function getPeaks(kind, count) {
    const samples = synthesize(kind);
    const peaks = [];
    for (let i = 0; i < count; i++) {
      const start = Math.floor(samples.length * i / count);
      const end = Math.max(start + 1, Math.floor(samples.length * (i + 1) / count));
      let peak = 0;
      for (let j = start; j < end; j++) peak = Math.max(peak, Math.abs(samples[j]));
      peaks.push(peak);
    }
    return peaks;
  }

  function drawSoundWave(canvas) {
    const surface = canvasSetup(canvas);
    if (!surface) return;
    const { ctx, w, h } = surface;
    const kind = canvas.dataset.wave;
    const count = Math.max(22, Math.floor(w / 5));
    const peaks = getPeaks(kind, count);
    const progress = progressFor(kind);
    ctx.clearRect(0, 0, w, h);
    const step = w / count;
    for (let i = 0; i < count; i++) {
      const magnitude = 4 + (h - 11) * peaks[i];
      const x = i * step + step * .3;
      ctx.fillStyle = i / count < progress ? "#bdff68" : "rgba(154,178,185,.41)";
      ctx.fillRect(x, (h - magnitude) / 2, Math.max(1.5, step * .44), magnitude);
    }
  }

  function refreshSoundWaves() {
    $$(".sound-wave").forEach(drawSoundWave);
  }

  function tick() {
    heroFrame = 0;
    if (document.hidden) return;
    heroTime += reducedMotion.matches ? 0 : 1 / 60;
    if (heroVisible) drawHero();
    // Progress overlays only redraw while a user is listening.
    if (activeSource) refreshSoundWaves();
    if (!reducedMotion.matches || activeSource) {
      heroFrame = requestAnimationFrame(tick);
    }
  }

  const sceneCanvas = $("#sceneCanvas");
  const sceneKind = $("#sceneKind");
  const sceneModes = $$("#compareModes [data-mode]");
  let sceneMode = "after";
  let scenePlaying = false;

  function setSceneMode(mode) {
    if (mode !== "before" && mode !== "after") return;
    resetScene();
    sceneMode = mode;
    sceneCanvas.dataset.mode = mode;
    sceneModes.forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.mode === mode)));
    $("#sceneAudioState").textContent = mode === "after" ? "SOUND EFFECT: ON" : "SOUND EFFECT: OFF";
    $("#sceneStatus").textContent = "READY TO PLAY";
  }

  function resetScene() {
    scenePlaying = false;
    sceneCanvas.classList.remove("is-playing");
    if (pendingSceneTimeout) clearTimeout(pendingSceneTimeout);
    pendingSceneTimeout = null;
    if (sceneFrame) cancelAnimationFrame(sceneFrame);
    sceneFrame = 0;
    $("#sceneCounter").textContent = "00:00 / 00:03";
    $("#sceneReplayLabel").textContent = "Play scene";
    $("#sceneReplay").disabled = false;
    stopSound();
  }

  function playScene() {
    resetScene();
    scenePlaying = true;
    sceneCanvas.classList.remove("is-playing");
    // Restart keyframes after each explicit play gesture.
    void sceneCanvas.offsetWidth;
    sceneCanvas.classList.add("is-playing");
    $("#sceneReplayLabel").textContent = "Playing";
    $("#sceneReplay").disabled = true;
    $("#sceneStatus").textContent = sceneMode === "after" ? "SFX ACTIVE" : "SILENT COMPARISON";
    const now = performance.now();
    const loop = () => {
      if (!scenePlaying) return;
      const elapsed = Math.min(3.25, (performance.now() - now) / 1000);
      $("#sceneCounter").textContent = "00:" + String(Math.floor(elapsed)).padStart(2, "0") + " / 00:03";
      sceneFrame = requestAnimationFrame(loop);
    };
    sceneFrame = requestAnimationFrame(loop);
    if (sceneMode === "after") {
      // The actual generated SFX is scheduled on the visual cut at 1.35 s.
      playSound(sceneKind.value, { delay: 1.35 }).catch((error) => {
        console.error(error);
        showToast("Audio tidak tersedia di browser ini");
      });
    }
    pendingSceneTimeout = setTimeout(() => {
      scenePlaying = false;
      sceneCanvas.classList.remove("is-playing");
      $("#sceneStatus").textContent = "READY TO REPLAY";
      $("#sceneReplayLabel").textContent = "Replay scene";
      $("#sceneReplay").disabled = false;
      cancelAnimationFrame(sceneFrame);
      sceneFrame = 0;
    }, 3250);
  }

  function selectCategory(category) {
    if (!CATEGORY[category]) return;
    selectedCategory = category;
    const data = CATEGORY[category];
    $$(".category-row").forEach((btn) => {
      const active = btn.dataset.category === category;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
    $("#categoryStage").dataset.category = category;
    $("#categoryIndex").textContent = data.index;
    $("#categoryEyebrow").textContent = data.eyebrow;
    $("#categoryHeading").textContent = data.heading;
    $("#categoryDescription").textContent = data.description;
    $("#categoryPlay").dataset.play = data.sound;
    $("#categoryPlayLabel").textContent = "Listen to " + data.label;
    drawCategory();
  }

  function selectFilter(filter) {
    $$(".filter-btn").forEach((b) => {
      const active = b.dataset.filter === filter;
      b.classList.toggle("is-active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    $$(".sound-row").forEach((row) => {
      row.hidden = filter !== "all" && row.dataset.category !== filter;
      if (!row.hidden) drawSoundWave(row.querySelector("canvas"));
    });
  }

  function setupMotion() {
    if (reducedMotion.matches || !("IntersectionObserver" in window)) {
      $$(".reveal").forEach((e) => e.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.065, rootMargin: "0px 0px 35px 0px" });
    document.body.classList.add("has-motion");
    $$(".reveal").forEach((element) => observer.observe(element));
  }

  function setupNavigation() {
    const menu = $("#menuToggle");
    const mobile = $("#mobileNav");
    const closeMenu = () => {
      menu.setAttribute("aria-expanded", "false");
      menu.setAttribute("aria-label", "Buka navigasi");
      mobile.hidden = true;
    };
    menu.addEventListener("click", () => {
      const open = menu.getAttribute("aria-expanded") !== "true";
      menu.setAttribute("aria-expanded", String(open));
      menu.setAttribute("aria-label", open ? "Tutup navigasi" : "Buka navigasi");
      mobile.hidden = !open;
    });
    mobile.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
    const progress = $("#scrollProgress");
    const onScroll = () => {
      const range = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      progress.style.width = Math.round((window.scrollY / range) * 1000) / 10 + "%";
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function bindEvents() {
    $$("[data-play]").forEach((button) => {
      button.addEventListener("click", () => toggleSound(button.dataset.play));
    });
    $$("[data-download]").forEach((button) =>
      button.addEventListener("click", () => downloadSound(button.dataset.download)));
    $$(".filter-btn").forEach((button) =>
      button.addEventListener("click", () => selectFilter(button.dataset.filter)));
    $$(".category-row").forEach((button) =>
      button.addEventListener("click", () => selectCategory(button.dataset.category)));
    sceneModes.forEach((button) =>
      button.addEventListener("click", () => setSceneMode(button.dataset.mode)));
    sceneKind.addEventListener("change", () => {
      resetScene();
      sceneCanvas.dataset.kind = sceneKind.value;
      $("#sceneStatus").textContent = "READY TO PLAY";
    });
    $("#sceneReplay").addEventListener("click", playScene);
    $$(".sound-wave").forEach((canvas) => {
      canvas.addEventListener("click", (event) => {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width) return;
        const fraction = clamp((event.clientX - rect.left) / rect.width, 0, 0.98);
        toggleSound(canvas.dataset.wave, SOUNDS[canvas.dataset.wave].duration * fraction);
      });
    });
    window.addEventListener("resize", () => {
      drawHero(); drawCategory(); refreshSoundWaves();
    }, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopSound();
        if (heroFrame) cancelAnimationFrame(heroFrame);
        heroFrame = 0;
      } else if (!heroFrame) {
        heroFrame = requestAnimationFrame(tick);
      }
    });
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        heroVisible = entries[0]?.isIntersecting ?? true;
      }, { rootMargin: "200px" });
      observer.observe($("#top"));
    }
  }

  function init() {
    $("#year").textContent = new Date().getFullYear();
    $$(".sound-row").forEach((row) => {
      const kind = row.dataset.sound;
      const durationLabel = row.querySelector(".sound-duration");
      if (durationLabel) durationLabel.textContent = fmt(SOUNDS[kind].duration);
    });
    bindEvents();
    selectCategory("cinematic");
    selectFilter("all");
    setupMotion();
    setupNavigation();
    drawHero();
    refreshSoundWaves();
    heroFrame = requestAnimationFrame(tick);
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
