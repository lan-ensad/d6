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

function getLeafOrder(node) {
  if (!node.children) return [node.members[0]];
  return [...getLeafOrder(node.children[0]), ...getLeafOrder(node.children[1])];
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

  const xLeaf = margin.left + dendroW;
  const xScale = (h) => margin.left + (1 - h / maxHeight) * dendroW;

  function drawNode(node) {
    const x = xScale(node.height);

    if (node.children) {
      for (const child of node.children) {
        const cx = xScale(child.height);
        const hl = document.createElementNS(ns, 'line');
        hl.setAttribute('x1', x); hl.setAttribute('y1', child.y);
        hl.setAttribute('x2', cx); hl.setAttribute('y2', child.y);
        hl.setAttribute('stroke', '#95a5a6'); hl.setAttribute('stroke-width', '2');
        svg.appendChild(hl);
        drawNode(child);
      }

      const ys = node.children.map(c => c.y);
      const vl = document.createElementNS(ns, 'line');
      vl.setAttribute('x1', x); vl.setAttribute('y1', Math.min(...ys));
      vl.setAttribute('x2', x); vl.setAttribute('y2', Math.max(...ys));
      vl.setAttribute('stroke', '#95a5a6'); vl.setAttribute('stroke-width', '2');
      svg.appendChild(vl);

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

      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', xLeaf);
      c.setAttribute('cy', node.y);
      c.setAttribute('r', 6);
      c.setAttribute('fill', typeColor(entry.type));
      svg.appendChild(c);

      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', xLeaf + 14);
      t.setAttribute('y', node.y + 5);
      t.setAttribute('fill', '#2c3e50');
      t.setAttribute('font-size', '14');
      t.setAttribute('font-weight', '600');
      t.textContent = labelFor(entry);
      svg.appendChild(t);

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

  let maxDist = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      if (distMatrix[order[i]][order[j]] > maxDist)
        maxDist = distMatrix[order[i]][order[j]];

  function distColor(d) {
    const t = maxDist > 0 ? d / maxDist : 0;
    const r = Math.round(74 + t * (232 - 74));
    const g = Math.round(144 + t * (238 - 144));
    const b = Math.round(217 + t * (244 - 217));
    return `rgb(${r},${g},${b})`;
  }

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

      const val = document.createElementNS(ns, 'text');
      val.setAttribute('x', ox + ci * cellSize + cellSize / 2 - 1);
      val.setAttribute('y', oy + ri * cellSize + cellSize / 2 + 3);
      val.setAttribute('text-anchor', 'middle');
      val.setAttribute('fill', i === j ? '#bdc3c7' : '#2c3e50');
      val.setAttribute('font-size', '12');
      val.setAttribute('font-weight', '600');
      val.textContent = i === j ? '—' : `${sim}%`;

      const entryI = textes[i], entryJ = textes[j];
      rect.addEventListener('mouseenter', () => {
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

  for (let ri = 0; ri < n; ri++) {
    const entry = textes[order[ri]];
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', ox - 22);
    dot.setAttribute('cy', oy + ri * cellSize + cellSize / 2 - 1);
    dot.setAttribute('r', 4);
    dot.setAttribute('fill', typeColor(entry.type));
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

  for (let ci = 0; ci < n; ci++) {
    const entry = textes[order[ci]];
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', ox + ci * cellSize + cellSize / 2 - 1);
    dot.setAttribute('cy', oy - 22);
    dot.setAttribute('r', 4);
    dot.setAttribute('fill', typeColor(entry.type));
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

// ===================== WORD LISTS =====================

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
      <h2><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${typeColor(entry.type)};margin-right:6px;"></span>${labelFor(entry)}</h2>
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

// ===================== UPDATE =====================

function update() {
  const minLen = +document.getElementById('minLen').value;
  const linkage = document.getElementById('linkage').value;
  document.getElementById('minLenVal').textContent = minLen;

  const { vectors, wordScores } = buildTFIDFVectors(textes.map(t => t.texte), minLen);
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

loadTextes(update);
