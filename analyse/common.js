// ===================== STOPWORDS =====================

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
plus être aussi cette comme tout fait faire même bien peut encore
forme travers partie travail temps texte manière point sens
peut-on chaque entre aussi cette comme tout fait plus
leurs notre cette entre même faire sous vers aussi avons https suis vraiment
absolument actuellement ailleurs apparemment assurément autant auparavant
autrefois autrement beaucoup bientôt certainement certes complètement
constamment davantage dedans dehors désormais dorénavant doucement effectivement
également enfin ensuite entièrement environ essentiellement éventuellement
évidemment exactement extrêmement facilement finalement forcément fortement
généralement grandement guère habituellement hélas immédiatement justement
lentement longtemps maintenant malheureusement mieux naturellement néanmoins
notamment nullement plutôt pourtant précisément premièrement principalement
probablement profondément progressivement presque quasiment rapidement
rarement récemment relativement seulement simplement soudain surtout
tellement totalement uniquement véritablement volontiers vraisemblablement
cependant concernant contrairement davantage derrière dessous dessus devant
durant environ hormis hors malgré moyennant outre parmi plein proche suivant
toutefois afin lorsqu puisqu quoique quoi tandis voici voilà
peu près plupart delà travers côté face sein suite propos cause grâce lieu
fois chose fait jour cas effet part moment sorte rapport question mesure
manière façon nombre terme point tour fin cours état plan sens ordre type
ensemble vue place niveau mise accord aide exemple titre mot compte nom
autour dessus dedans dehors ailleurs partout quelquefois particulièrement
`.trim().split(/\s+/));

// ===================== TEXT PROCESSING =====================

function normalize(w) {
  return w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
}

function stem(w) {
  if (w.endsWith('eaux')) return w.slice(0, -1);
  if (w.endsWith('aux') && w.length > 4) return w.slice(0, -3) + 'al';
  if (w.endsWith('ies')) return w.slice(0, -1);
  if (w.endsWith('es') && w.length > 4) {
    const before = w.slice(0, -2);
    if (/[^aeiou]$/.test(before)) return before + 'e';
  }
  if (w.endsWith('s') && w.length > 3 && !w.endsWith('ss')) return w.slice(0, -1);
  if (w.endsWith('x') && w.length > 3) return w.slice(0, -1);
  return w;
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

function tokenizeStemmed(text, minLen) {
  return tokenize(text, minLen).map(w => ({ stem: stem(w), raw: w }));
}

function buildOriginalMap(text, minLen) {
  const words = text
    .replace(/['']/g, ' ')
    .split(/[\s,.;:!?()\[\]{}"«»—–]+/)
    .filter(w => w.length >= minLen);
  const map = {};
  for (const w of words) {
    const key = normalize(w);
    if (key && !map[key]) map[key] = w.toLowerCase();
  }
  return map;
}

function buildStemDisplayMap(text, minLen) {
  const words = text
    .replace(/['']/g, ' ')
    .split(/[\s,.;:!?()\[\]{}"«»—–]+/)
    .filter(w => w.length >= minLen);
  const freq = {};
  for (const w of words) {
    const s = stem(normalize(w));
    const display = w.toLowerCase();
    if (!freq[s]) freq[s] = {};
    freq[s][display] = (freq[s][display] || 0) + 1;
  }
  const map = {};
  for (const [s, forms] of Object.entries(freq)) {
    const sorted = Object.entries(forms).sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
    map[s] = sorted[0][0];
  }
  return map;
}

// ===================== TF-IDF =====================

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

function buildTFIDFVectors(docs, minLen) {
  const vocab = new Map();
  const tfs = docs.map(doc => {
    const tokens = tokenize(doc, minLen);
    const freq = {};
    for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
    const max = Math.max(...Object.values(freq), 1);
    const tf = {};
    for (const [w, c] of Object.entries(freq)) {
      tf[w] = c / max;
      if (!vocab.has(w)) vocab.set(w, vocab.size);
    }
    return tf;
  });
  const N = docs.length;
  const df = {};
  for (const tf of tfs) {
    for (const w of Object.keys(tf)) df[w] = (df[w] || 0) + 1;
  }
  const dim = vocab.size;
  const vectors = tfs.map(tf => {
    const vec = new Float64Array(dim);
    for (const [w, v] of Object.entries(tf)) {
      vec[vocab.get(w)] = v * Math.log(N / df[w]);
    }
    return vec;
  });
  const wordScores = tfs.map(tf => {
    const scores = {};
    for (const [w, v] of Object.entries(tf)) {
      scores[w] = v * Math.log(N / df[w]);
    }
    return scores;
  });
  return { vectors, wordScores, df };
}

// ===================== DISTANCE & CLUSTERING =====================

function cosineDistance(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 1 : 1 - dot / denom;
}

function buildDistMatrix(vectors) {
  const n = vectors.length;
  const dist = Array.from({ length: n }, () => new Float64Array(n));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = cosineDistance(vectors[i], vectors[j]);
      dist[i][j] = d;
      dist[j][i] = d;
    }
  }
  return dist;
}

// ===================== DISPLAY HELPERS =====================

function typeColor(type) {
  if (type === 'essai') return '#4a90d9';
  if (type === 'portfolio') return '#a27ff5';
  return '#e67e22';
}

function labelFor(t) {
  return t.auteur.toUpperCase();
}

function dotClass(type) {
  if (type === 'essai') return 'dot-essai';
  if (type === 'portfolio') return 'dot-portfolio';
  return 'dot-entretien';
}

// ===================== DATA LOADING =====================

let textes = [];

async function loadTextes(callback) {
  const r = await fetch('textes.json');
  textes = await r.json();
  callback();
}
