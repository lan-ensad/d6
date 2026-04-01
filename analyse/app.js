// --- Stopwords français ---
const STOPWORDS = new Set(`
le la les l un une des de du d et est en que qui au aux ce cette ces
il elle ils elles nous vous on je tu son sa ses leur leurs mon ma mes
ton ta tes notre nos votre vos ne pas plus par pour dans avec sur sans
se sont été être avoir fait faire tout tous toute toutes même aussi bien
fait où ou y a au comme mais quand dont car si entre ni très peut
ont été avait après avant ici là encore trop peu aussi déjà lors donc
quel quelle quels quelles chaque autre autres cela cet cette celui celle ceux celles
était étaient sera serait font faut sans sous vers chez dès lors non oui
qu c s n m j t me te le la lui eux moi toi soi
ainsi alors comment parce pourquoi lequel laquelle lesquels lesquelles
auquel auxquels auxquelles duquel desquels desquelles dont lorsque puisque
tant quelque quelques chacun chacune certains certaines plusieurs aucun aucune
jamais toujours souvent parfois peut-être déjà encore assez autant
deux trois entre contre pendant depuis jusqu jusque elles eux
`.trim().split(/\s+/));

let textes = [];

async function load() {
  const r = await fetch('textes.json');
  textes = await r.json();
  update();
}

function tokenize(text, minLen) {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['']/g, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= minLen && !STOPWORDS.has(w));
}

function computeTFIDF(docs, minLen) {
  const N = docs.length;
  const tfs = docs.map(doc => {
    const tokens = tokenize(doc, minLen);
    const freq = {};
    for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
    const max = Math.max(...Object.values(freq), 1);
    const tf = {};
    for (const [w, c] of Object.entries(freq)) tf[w] = c / max;
    return tf;
  });
  const df = {};
  for (const tf of tfs) {
    for (const w of Object.keys(tf)) df[w] = (df[w] || 0) + 1;
  }
  const tfidf = tfs.map(tf => {
    const scores = {};
    for (const [w, v] of Object.entries(tf)) {
      scores[w] = v * Math.log(N / df[w]);
    }
    return scores;
  });
  return { tfidf, df };
}

function buildOriginalMap(text, minLen) {
  const words = text
    .replace(/['']/g, ' ')
    .split(/[\s,.;:!?()\[\]{}"«»—–]+/)
    .filter(w => w.length >= minLen);
  const map = {};
  for (const w of words) {
    const key = w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
    if (key && !map[key]) map[key] = w.toLowerCase();
  }
  return map;
}

function update() {
  const topN = +document.getElementById('topN').value;
  const minLen = +document.getElementById('minLen').value;
  const filter = document.getElementById('filterType').value;

  document.getElementById('topNVal').textContent = topN;
  document.getElementById('minLenVal').textContent = minLen;

  const filtered = filter === 'all' ? textes : textes.filter(t => t.type === filter);
  const { tfidf: tfidfAll, df } = computeTFIDF(filtered.map(t => t.texte), minLen);

  const grid = document.getElementById('grid');
  grid.innerHTML = '';

  // Collect top-N keywords per card, then count in how many cards each word appears
  const topKeywordsPerDoc = filtered.map((_, i) => {
    const scores = tfidfAll[i];
    return new Set(Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, topN).map(([w]) => w));
  });
  const cardFreq = {};
  for (const keywords of topKeywordsPerDoc) {
    for (const w of keywords) cardFreq[w] = (cardFreq[w] || 0) + 1;
  }

  filtered.forEach((entry, i) => {
    const scores = tfidfAll[i];
    const origMap = buildOriginalMap(entry.texte, minLen);
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, topN);
    const maxScore = sorted.length ? sorted[0][1] : 1;

    const card = document.createElement('div');
    card.className = `card ${entry.type}`;
    card.innerHTML = `
      <h2>${entry.type} — ${entry.auteur.toUpperCase()}</h2>
      <div class="meta">${entry.texte.split(/\s+/).length} mots</div>
      <ul class="keyword-list">
        ${sorted.map(([word, score]) => {
          const isShared = cardFreq[word] > 1;
          return `
          <li>
            <span class="word${isShared ? ' shared' : ''}">${origMap[word] || word}</span>
            <span class="bar-bg"><span class="bar" style="width:${(score / maxScore * 100).toFixed(1)}%"></span></span>
            <span class="score">${score.toFixed(3)}</span>
          </li>`;
        }).join('')}
      </ul>
    `;
    grid.appendChild(card);
  });
}

document.getElementById('topN').addEventListener('input', update);
document.getElementById('minLen').addEventListener('input', update);
document.getElementById('filterType').addEventListener('change', update);

load();
