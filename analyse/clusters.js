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

  // Word scores per doc (for display)
  const wordScores = tfs.map(tf => {
    const scores = {};
    for (const [w, v] of Object.entries(tf)) {
      scores[w] = v * Math.log(N / df[w]);
    }
    return scores;
  });

  return { vectors, wordScores, df };
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

function hac(dist, labels, linkageType) {
  const n = labels.length;
  let clusters = labels.map((label, i) => ({
    label, members: [i], children: null, height: 0
  }));

  while (clusters.length > 1) {
    let minDist = Infinity, mi = -1, mj = -1;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = clusterDist(clusters[i].members, clusters[j].members, dist, linkageType);
        if (d < minDist) { minDist = d; mi = i; mj = j; }
      }
    }
    const merged = {
      label: null,
      members: [...clusters[mi].members, ...clusters[mj].members],
      children: [clusters[mi], clusters[mj]],
      height: minDist
    };
    clusters = clusters.filter((_, i) => i !== mi && i !== mj);
    clusters.push(merged);
  }
  return clusters[0];
}

function clusterDist(a, b, dist, type) {
  const dists = [];
  for (const i of a) for (const j of b) dists.push(dist[i][j]);
  if (type === 'single') return Math.min(...dists);
  if (type === 'complete') return Math.max(...dists);
  return dists.reduce((s, v) => s + v, 0) / dists.length;
}

// Get leaf order from dendrogram (for matrix reordering)
function getLeafOrder(node) {
  if (!node.children) return [node.members[0]];
  return [...getLeafOrder(node.children[0]), ...getLeafOrder(node.children[1])];
}

function labelFor(t) {
  return t.auteur.toUpperCase();
}

function colorFor(t) {
  return t.type === 'essai' ? '#4a90d9' : '#a27ff5';
}

// ===================== DENDROGRAM =====================

function drawDendrogram(root) {
  const svg = document.getElementById('dendro');
  svg.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';

  const labelW = 60;
  const margin = { top: 20, right: 20, bottom: 20, left: 20 };
  const leafH = 50;
  const dendroW = 300;
  const n = textes.length;
  const width = margin.left + dendroW + labelW + margin.right;
  const height = margin.top + n * leafH + margin.bottom;

  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const maxHeight = root.height || 1;

  // Assign y positions
  let leafIndex = 0;
  function assignY(node) {
    if (!node.children) {
      node.y = margin.top + leafIndex * leafH + leafH / 2;
      leafIndex++;
      return;
    }
    for (const c of node.children) assignY(c);
    node.y = node.children.reduce((s, c) => s + c.y, 0) / node.children.length;
  }
  assignY(root);

  // x scale: root at left, leaves at right edge of dendro area
  const xLeaf = margin.left + dendroW;
  const xScale = (h) => margin.left + (1 - h / maxHeight) * dendroW;

  function drawNode(node) {
    const x = xScale(node.height);

    if (node.children) {
      for (const child of node.children) {
        const cx = xScale(child.height);
        // Horizontal line
        const hl = document.createElementNS(ns, 'line');
        hl.setAttribute('x1', x); hl.setAttribute('y1', child.y);
        hl.setAttribute('x2', cx); hl.setAttribute('y2', child.y);
        hl.setAttribute('stroke', '#95a5a6'); hl.setAttribute('stroke-width', '2');
        svg.appendChild(hl);
        drawNode(child);
      }

      // Vertical line
      const ys = node.children.map(c => c.y);
      const vl = document.createElementNS(ns, 'line');
      vl.setAttribute('x1', x); vl.setAttribute('y1', Math.min(...ys));
      vl.setAttribute('x2', x); vl.setAttribute('y2', Math.max(...ys));
      vl.setAttribute('stroke', '#95a5a6'); vl.setAttribute('stroke-width', '2');
      svg.appendChild(vl);

      // Distance
      const dt = document.createElementNS(ns, 'text');
      dt.setAttribute('x', x - 4);
      dt.setAttribute('y', Math.min(...ys) - 8);
      dt.setAttribute('text-anchor', 'end');
      dt.setAttribute('fill', '#7f8c8d');
      dt.setAttribute('font-size', '10');
      dt.textContent = node.height.toFixed(2);
      svg.appendChild(dt);
    } else {
      const idx = node.members[0];
      const entry = textes[idx];

      // Dot
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', xLeaf);
      c.setAttribute('cy', node.y);
      c.setAttribute('r', 6);
      c.setAttribute('fill', colorFor(entry));
      svg.appendChild(c);

      // Author label
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', xLeaf + 14);
      t.setAttribute('y', node.y + 5);
      t.setAttribute('fill', '#2c3e50');
      t.setAttribute('font-size', '14');
      t.setAttribute('font-weight', '600');
      t.textContent = labelFor(entry);
      svg.appendChild(t);

      // Type label (smaller)
      const tt = document.createElementNS(ns, 'text');
      tt.setAttribute('x', xLeaf + 14);
      tt.setAttribute('y', node.y + 19);
      tt.setAttribute('fill', '#7f8c8d');
      tt.setAttribute('font-size', '10');
      tt.textContent = entry.type;
      svg.appendChild(tt);
    }
  }

  drawNode(root);
}

// ===================== SIMILARITY MATRIX =====================

function drawMatrix(distMatrix, order) {
  const svg = document.getElementById('matrix');
  svg.innerHTML = '';
  const ns = 'http://www.w3.org/2000/svg';
  const tooltip = document.getElementById('tooltip');

  const n = order.length;
  const cellSize = 50;
  const labelW = 50;
  const margin = 10;
  const size = margin + labelW + n * cellSize + margin;

  svg.setAttribute('width', size);
  svg.setAttribute('height', size);

  const ox = margin + labelW;
  const oy = margin + labelW;

  // Find max distance for color scale
  let maxDist = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (distMatrix[order[i]][order[j]] > maxDist)
        maxDist = distMatrix[order[i]][order[j]];

  function distColor(d) {
    const t = maxDist > 0 ? d / maxDist : 0;
    // Interpolate from #4a90d9 (similar) to #e8eef4 (distant)
    const r = Math.round(74 + t * (232 - 74));
    const g = Math.round(144 + t * (238 - 144));
    const b = Math.round(217 + t * (244 - 217));
    return `rgb(${r},${g},${b})`;
  }

  // Cells
  for (let ri = 0; ri < n; ri++) {
    for (let ci = 0; ci < n; ci++) {
      const i = order[ri];
      const j = order[ci];
      const d = distMatrix[i][j];
      const sim = maxDist > 0 ? ((1 - d / maxDist) * 100).toFixed(0) : 100;

      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('class', 'matrix-cell');
      rect.setAttribute('x', ox + ci * cellSize);
      rect.setAttribute('y', oy + ri * cellSize);
      rect.setAttribute('width', cellSize - 2);
      rect.setAttribute('height', cellSize - 2);
      rect.setAttribute('rx', 3);
      rect.setAttribute('fill', i === j ? '#f8f9fa' : distColor(d));

      // Value inside cell
      const val = document.createElementNS(ns, 'text');
      val.setAttribute('x', ox + ci * cellSize + cellSize / 2 - 1);
      val.setAttribute('y', oy + ri * cellSize + cellSize / 2 + 3);
      val.setAttribute('text-anchor', 'middle');
      val.setAttribute('fill', i === j ? '#bdc3c7' : '#2c3e50');
      val.setAttribute('font-size', '12');
      val.setAttribute('font-weight', '600');
      val.textContent = i === j ? '—' : `${sim}%`;

      // Tooltip
      const entryI = textes[i], entryJ = textes[j];
      rect.addEventListener('mouseenter', (e) => {
        if (i === j) return;
        tooltip.style.display = 'block';
        tooltip.innerHTML = `<strong>${labelFor(entryI)}</strong> × <strong>${labelFor(entryJ)}</strong><br>similarité : ${sim}% · distance : ${d.toFixed(3)}`;
      });
      rect.addEventListener('mousemove', (e) => {
        tooltip.style.left = e.clientX + 12 + 'px';
        tooltip.style.top = e.clientY + 12 + 'px';
      });
      rect.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

      svg.appendChild(rect);
      svg.appendChild(val);
    }
  }

  // Row labels (left)
  for (let ri = 0; ri < n; ri++) {
    const entry = textes[order[ri]];

    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', ox - 22);
    dot.setAttribute('cy', oy + ri * cellSize + cellSize / 2 - 1);
    dot.setAttribute('r', 4);
    dot.setAttribute('fill', colorFor(entry));
    svg.appendChild(dot);

    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', ox - 12);
    t.setAttribute('y', oy + ri * cellSize + cellSize / 2 + 3);
    t.setAttribute('fill', '#2c3e50');
    t.setAttribute('font-size', '13');
    t.setAttribute('font-weight', '600');
    t.textContent = labelFor(entry);
    svg.appendChild(t);
  }

  // Col labels (top)
  for (let ci = 0; ci < n; ci++) {
    const entry = textes[order[ci]];

    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', ox + ci * cellSize + cellSize / 2 - 1);
    dot.setAttribute('cy', oy - 22);
    dot.setAttribute('r', 4);
    dot.setAttribute('fill', colorFor(entry));
    svg.appendChild(dot);

    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', ox + ci * cellSize + cellSize / 2 - 1);
    t.setAttribute('y', oy - 10);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('fill', '#2c3e50');
    t.setAttribute('font-size', '13');
    t.setAttribute('font-weight', '600');
    t.textContent = labelFor(entry);
    svg.appendChild(t);
  }
}

// ===================== UPDATE =====================

function drawWordLists(wordScores, order, minLen) {
  const container = document.getElementById('words');
  container.innerHTML = '';
  const topN = 15;

  for (const idx of order) {
    const entry = textes[idx];
    const scores = wordScores[idx];
    const origMap = buildOriginalMap(entry.texte, minLen);
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, topN);
    const maxScore = sorted.length ? sorted[0][1] : 1;

    const card = document.createElement('div');
    card.className = `card ${entry.type}`;
    card.innerHTML = `
      <h2><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${colorFor(entry)};margin-right:6px;"></span>${labelFor(entry)}</h2>
      <div class="meta">${entry.type}</div>
      <ul class="keyword-list">
        ${sorted.map(([word, score]) => `
          <li>
            <span class="word">${origMap[word] || word}</span>
            <span class="bar-bg"><span class="bar" style="width:${(score / maxScore * 100).toFixed(1)}%"></span></span>
            <span class="score">${score.toFixed(3)}</span>
          </li>`).join('')}
      </ul>
    `;
    container.appendChild(card);
  }
}

function update() {
  const minLen = +document.getElementById('minLen').value;
  const linkage = document.getElementById('linkage').value;
  document.getElementById('minLenVal').textContent = minLen;

  const { vectors, wordScores, df } = buildTFIDFVectors(textes.map(t => t.texte), minLen);
  const dist = buildDistMatrix(vectors);
  const labels = textes.map(labelFor);
  const root = hac(dist, labels, linkage);

  const order = getLeafOrder(root);

  drawDendrogram(root);
  drawMatrix(dist, order);
  drawWordLists(wordScores, order, minLen);
}

document.getElementById('minLen').addEventListener('input', update);
document.getElementById('linkage').addEventListener('change', update);

load();
