/* Bíblia RPG — trilha e sons de ambiente gerados no navegador (Web Audio, sem arquivos).
   BRPG_SOM.ligar() precisa ser chamado num toque do usuário (regra dos navegadores). */
(function (G) {
  let ac = null, mestre, musGain, ambGain, ligado = false, timer = null, cenaAtual = 'eden';
  const amb = {};             // camadas de ambiente: {gain}
  const ALVO = {              // volume de cada camada por cena
    criacao: { vento: .5, brilho: .35, agua: 0, passaros: 0, gente: 0, obra: 0 },
    eden:    { vento: .12, brilho: 0, agua: .35, passaros: .6, gente: 0, obra: 0 },
    enoque:  { vento: .15, brilho: 0, agua: .15, passaros: .15, gente: .55, obra: .7 },
    misterio:{ vento: .45, brilho: .25, agua: 0, passaros: 0, gente: 0, obra: 0 }
  };
  let pref = 'on'; try { pref = localStorage.getItem('biblia_som') || 'on'; } catch (e) {}

  function ruido(seg, tipo) {
    const n = Math.floor(ac.sampleRate * seg), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    let ult = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (tipo === 'marrom') { ult = (ult + .02 * w) / 1.02; d[i] = ult * 3.5; } else d[i] = w; }
    return b;
  }
  function fonteRuido(tipo) { const s = ac.createBufferSource(); s.buffer = ruido(4, tipo); s.loop = true; s.start(); return s; }
  function camada(nome) { const g = ac.createGain(); g.gain.value = 0; g.connect(ambGain); amb[nome] = g; return g; }

  function montar() {
    ac = new (G.AudioContext || G.webkitAudioContext)();
    mestre = ac.createGain(); mestre.gain.value = .8; mestre.connect(ac.destination);
    musGain = ac.createGain(); musGain.gain.value = .16; musGain.connect(mestre);
    ambGain = ac.createGain(); ambGain.gain.value = .5; ambGain.connect(mestre);
    // vento: ruído marrom passa-faixa lento
    { const s = fonteRuido('marrom'), f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = .6;
      const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = .07; lg.gain.value = 250; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
      s.connect(f); f.connect(camada('vento')); }
    // água: ruído branco filtrado
    { const s = fonteRuido('branco'), f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = .8;
      const g = ac.createGain(); g.gain.value = .25; s.connect(f); f.connect(g); g.connect(camada('agua')); }
    // murmúrio de gente: ruído marrom na faixa da voz, com volume oscilando
    { const s = fonteRuido('marrom'), f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 650; f.Q.value = 1.2;
      const g = ac.createGain(); g.gain.value = .6; const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = .3; lg.gain.value = .25; lfo.connect(lg); lg.connect(g.gain); lfo.start();
      s.connect(f); f.connect(g); g.connect(camada('gente')); }
    camada('passaros'); camada('obra'); camada('brilho');
    aplicarCena(true);
  }

  // ---------- eventos curtos ----------
  function tom(dest, freq, ini, dur, vol, tipo, glide) {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = tipo || 'sine'; o.frequency.setValueAtTime(freq, ini);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, ini + dur);
    g.gain.setValueAtTime(0, ini); g.gain.linearRampToValueAtTime(vol, ini + .008); g.gain.exponentialRampToValueAtTime(.0001, ini + dur);
    o.connect(g); g.connect(dest); o.start(ini); o.stop(ini + dur + .05);
  }
  function batida(dest, ini, vol, freq, dur) {
    const s = ac.createBufferSource(); s.buffer = ruido(.2, 'branco'); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.5;
    const g = ac.createGain(); g.gain.setValueAtTime(vol, ini); g.gain.exponentialRampToValueAtTime(.0001, ini + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(ini); s.stop(ini + dur + .05);
  }
  function martelo(t) { batida(amb.obra, t, .9, 1800, .09); tom(amb.obra, 2400 + Math.random() * 600, t, .25, .12, 'triangle'); tom(amb.obra, 3700, t, .15, .05, 'sine'); }
  function serrote(t) { for (let i = 0; i < 4; i++) batida(amb.obra, t + i * .16, .25, 3000, .12); }
  function voz(t) { const f0 = 140 + Math.random() * 160; tom(amb.gente, f0, t, .18 + Math.random() * .2, .06, 'sawtooth', f0 * (.85 + Math.random() * .3)); }
  function ovelha(t) { const o = ac.createOscillator(), g = ac.createGain(), l = ac.createOscillator(), lg = ac.createGain();
    o.type = 'sawtooth'; o.frequency.value = 330; l.frequency.value = 18; lg.gain.value = 25; l.connect(lg); lg.connect(o.frequency);
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 2;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.08, t + .05); g.gain.linearRampToValueAtTime(0, t + .6);
    o.connect(f); f.connect(g); g.connect(amb.gente); o.start(t); l.start(t); o.stop(t + .7); l.stop(t + .7); }
  function passaro(t) { const n = 2 + Math.floor(Math.random() * 3), b = 2400 + Math.random() * 1600;
    for (let i = 0; i < n; i++) tom(amb.passaros, b, t + i * .11, .09, .07, 'sine', b * 1.35); }
  function brilho(t) { const notas = [1046.5, 1318.5, 1568, 2093]; tom(amb.brilho, notas[Math.floor(Math.random() * 4)], t, 1.2, .05, 'sine'); }

  // ---------- música: loop chiptune animado ----------
  const BPM = 112, PASSO = 60 / BPM / 2; // colcheias
  // escala de Ré com sabor oriental (Ré, Mi bemol, Fá#, Sol, Lá, Si bemol, Dó)
  const N = { D3: 146.83, A2: 110, G2: 98, C3: 130.81, D4: 293.66, Eb4: 311.13, Fs4: 369.99, G4: 392, A4: 440, Bb4: 466.16, C5: 523.25, D5: 587.33 };
  const MEL = ['D4', 0, 'Fs4', 'G4', 'A4', 0, 'A4', 'G4', 'Fs4', 'G4', 'A4', 0, 'Bb4', 'A4', 'G4', 'Fs4',
               'Eb4', 0, 'Fs4', 'G4', 'Fs4', 'Eb4', 'D4', 0, 'D4', 'Fs4', 'A4', 'D5', 'C5', 'Bb4', 'A4', 0];
  const BAIXO = ['D3', 'D3', 'A2', 'D3', 'G2', 'G2', 'C3', 'A2'];
  let passo = 0, prox = 0;
  function agendarMusica() {
    while (prox < ac.currentTime + .25) {
      const i = passo % 32;
      const m = MEL[i]; if (m) tom(musGain, N[m], prox, PASSO * .9, .22, 'square');
      if (i % 4 === 0) tom(musGain, N[BAIXO[(i / 4) % 8]], prox, PASSO * 3.6, .35, 'triangle');
      if (i % 2 === 1) batida(musGain, prox, .18, 7000, .04);             // chocalho
      if (i % 8 === 0 || i % 8 === 5) tom(musGain, 90, prox, .12, .5, 'sine', 45); // tambor
      passo++; prox += PASSO;
    }
  }
  function agendarAmbiente() {
    const t = ac.currentTime + .05, a = ALVO[cenaAtual] || ALVO.eden;
    if (a.obra > 0 && Math.random() < .35) { const n = 1 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) martelo(t + i * .32); }
    if (a.obra > 0 && Math.random() < .05) serrote(t + .2);
    if (a.gente > 0 && Math.random() < .5) voz(t + Math.random() * .4);
    if (a.gente > 0 && Math.random() < .04) ovelha(t + .1);
    if (a.passaros > 0 && Math.random() < .3) passaro(t + Math.random() * .3);
    if (a.brilho > 0 && Math.random() < .25) brilho(t);
  }
  function aplicarCena(ja) {
    if (!ac) return; const a = ALVO[cenaAtual] || ALVO.eden, t = ac.currentTime;
    Object.keys(amb).forEach(k => { const g = amb[k].gain; g.cancelScheduledValues(t); g.setTargetAtTime(a[k] || 0, t, ja ? .01 : .8); });
  }

  function ligar() {
    if (!ac) montar();
    if (ac.state === 'suspended') ac.resume();
    if (ligado) return; ligado = true; prox = ac.currentTime + .1;
    mestre.gain.cancelScheduledValues(ac.currentTime); mestre.gain.setTargetAtTime(.8, ac.currentTime, .3);
    timer = setInterval(() => { agendarMusica(); agendarAmbiente(); }, 120);
    try { localStorage.setItem('biblia_som', 'on'); } catch (e) {}
    avisar();
  }
  function desligar() {
    ligado = false; clearInterval(timer);
    if (ac) { mestre.gain.setTargetAtTime(0, ac.currentTime, .15); setTimeout(() => { if (!ligado && ac) ac.suspend(); }, 600); }
    try { localStorage.setItem('biblia_som', 'off'); } catch (e) {}
    avisar();
  }
  const ouvintes = [];
  function avisar() { ouvintes.forEach(f => f(ligado)); }
  document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend(); else if (ligado) ac.resume(); });

  G.BRPG_SOM = {
    ligar, desligar, alternar() { ligado ? desligar() : ligar(); },
    get ligado() { return ligado; }, get preferencia() { return pref; },
    cena(id) { if (id === cenaAtual) return; cenaAtual = ALVO[id] ? id : 'eden'; aplicarCena(false); },
    aoMudar(f) { ouvintes.push(f); }
  };
})(window);
