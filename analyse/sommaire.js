let textes = [];
let sortCol = 'id';
let sortAsc = true;

async function load() {
  const r = await fetch('textes.json');
  textes = await r.json();
  render();
}

function wordCount(t) {
  return t.texte.split(/\s+/).length;
}

function excerpt(t, len) {
  const clean = t.texte.replace(/\n+/g, ' ').trim();
  return clean.length > len ? clean.slice(0, len) + '…' : clean;
}

function typeClass(type) {
  if (type === 'essai') return 'type-essai';
  if (type === 'portfolio') return 'type-portfolio';
  return 'type-entretien';
}

function compare(a, b) {
  let va, vb;
  if (sortCol === 'words') {
    va = wordCount(a);
    vb = wordCount(b);
  } else {
    va = a[sortCol];
    vb = b[sortCol];
  }
  if (va < vb) return sortAsc ? -1 : 1;
  if (va > vb) return sortAsc ? 1 : -1;
  return 0;
}

function render() {
  const sorted = [...textes].sort(compare);
  const tbody = document.getElementById('tbody');
  tbody.innerHTML = sorted.map(t => `
    <tr>
      <td class="id-cell">${t.id}</td>
      <td><span class="type-badge ${typeClass(t.type)}">${t.type}</span></td>
      <td class="auteur-cell">${t.auteur.toUpperCase()}</td>
      <td class="words-cell">${wordCount(t)}</td>
      <td class="excerpt">${excerpt(t, 120)}</td>
    </tr>
  `).join('');
}

document.querySelectorAll('th[data-col]').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.col;
    if (sortCol === col) {
      sortAsc = !sortAsc;
    } else {
      sortCol = col;
      sortAsc = true;
    }
    document.querySelectorAll('th').forEach(h => { h.classList.remove('sorted', 'desc'); });
    th.classList.add('sorted');
    if (!sortAsc) th.classList.add('desc');
    render();
  });
});

load();
