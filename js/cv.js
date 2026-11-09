// Plain-text résumé dialog, built from window.RESUME. Also fills name/role on the title and end screens.
(() => {
  const R = window.RESUME, cv = R.cv;
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  document.querySelectorAll('.screen h1').forEach((h) => { h.textContent = R.name; });
  document.querySelectorAll('.screen .role').forEach((p) => { p.textContent = R.role; });
  const tag = document.querySelector('.title .tagline'); if (tag) tag.textContent = R.tagline;

  const body = document.getElementById('cvBody');
  const head = el('header', 'cv-head');
  const img = el('img'); img.src = R.photo; img.alt = R.name; img.width = 96; img.height = 96;
  const hb = el('div');
  hb.append(el('h1', null, R.name), el('p', 'cv-role', R.role));
  if (R.telegram) {
    const a = el('a', 'cv-contact', 'Telegram: @' + R.telegram);
    a.href = 'https://t.me/' + R.telegram; a.target = '_blank'; a.rel = 'noopener';
    hb.append(a);
  }
  if (R.email) {
    const a = el('a', 'cv-contact', 'Почта: ' + R.email);
    a.href = 'mailto:' + R.email;
    hb.append(a);
  }
  head.append(img, hb);
  body.append(head);

  const sec = (title) => { const s = el('section'); s.append(el('h2', null, title)); body.append(s); return s; };

  const about = sec('Обо мне');
  cv.about.forEach((p) => about.append(el('p', null, p)));

  const exp = sec('Опыт');
  cv.experience.forEach((j) => {
    const d = el('div', 'cv-job');
    d.append(el('div', 'cv-period', j.period));
    const m = el('div');
    m.append(el('h3', null, j.title), el('p', 'cv-place', j.place));
    const ul = el('ul'); j.points.forEach((p) => ul.append(el('li', null, p)));
    if (j.points.length) m.append(ul);
    d.append(m); exp.append(d);
  });

  const sk = sec('Навыки');
  for (const g in cv.skills) {
    const row = el('div', 'cv-skill');
    row.append(el('b', null, g));
    const chips = el('div', 'cv-chips'); cv.skills[g].forEach((s) => chips.append(el('span', null, s)));
    row.append(chips); sk.append(row);
  }

  const ed = sec('Образование');
  [].concat(cv.education).forEach((e) => {
    const d = el('div', 'cv-job');
    d.append(el('div', 'cv-period', e.year));
    const m = el('div'); m.append(el('h3', null, e.title), el('p', 'cv-place', e.place + ' · ' + e.spec));
    d.append(m); ed.append(d);
  });

  const dlg = document.getElementById('cv');
  document.querySelectorAll('[data-cv], #btnCv').forEach((b) => b.addEventListener('click', () => dlg.showModal()));
  document.getElementById('cvClose').addEventListener('click', () => dlg.close());
  document.getElementById('cvPrint').addEventListener('click', () => window.print());
  dlg.addEventListener('click', (ev) => { if (ev.target === dlg) dlg.close(); });
})();
