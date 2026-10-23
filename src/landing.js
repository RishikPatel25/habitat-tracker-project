const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const nav = document.querySelector('#site-nav');
const menu = document.querySelector('.menu-toggle');
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  nav?.classList.toggle('open', open);
});
nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  nav.classList.remove('open'); menu?.setAttribute('aria-expanded', 'false'); menu?.setAttribute('aria-label', 'Open navigation');
}));

const heroVideo = document.querySelector('.showcase-video');
if (heroVideo) {
  heroVideo.volume = 0.65;
  heroVideo.play().catch(() => {});

  const musicToggle = document.querySelector('.video-music-toggle');
  musicToggle?.addEventListener('click', async () => {
    heroVideo.muted = !heroVideo.muted;
    const musicOn = !heroVideo.muted;
    musicToggle.setAttribute('aria-pressed', String(musicOn));
    musicToggle.setAttribute('aria-label', musicOn ? 'Turn music off' : 'Turn music on');
    musicToggle.querySelector('.video-music-label').textContent = musicOn ? 'Music on' : 'Music off';
    if (musicOn && heroVideo.paused) {
      try { await heroVideo.play(); } catch { heroVideo.muted = true; }
    }
  });
}

if ('IntersectionObserver' in window && !reducedMotion) {
  const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
  }), { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((element) => observer.observe(element));
} else document.querySelectorAll('.reveal').forEach((element) => element.classList.add('visible'));

