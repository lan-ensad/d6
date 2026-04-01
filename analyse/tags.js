let simulation = null;
let graphPinById = null;

function computeTags(minLen, minDf, maxDf, topN, minTagsPerDoc) {
  const N = textes.length;
  const docs = textes.map(t => t.texte);

  // TF per doc (stemmed)
  const tfs = docs.map(doc => {
    const tokens = tokenizeStemmed(doc, minLen);
    const freq = {};
    for (const { stem: s } of tokens) freq[s] = (freq[s] || 0) + 1;
    const max = Math.max(...Object.values(freq), 1);
    const tf = {};
    for (const [w, c] of Object.entries(freq)) tf[w] = c / max;
    return tf;
  });

  // DF
  const df = {};
  for (const tf of tfs) {
    for (const w of Object.keys(tf)) df[w] = (df[w] || 0) + 1;
  }

  // TF-IDF scores per word per doc
  const wordData = {};
  for (const [word, docFreq] of Object.entries(df)) {
    if (docFreq < minDf || docFreq > maxDf) continue;

    const idf = Math.log(N / docFreq);
    const docsWithScores = [];
    let totalScore = 0;

    for (let i = 0; i < N; i++) {
      if (tfs[i][word]) {
        const score = tfs[i][word] * idf;
        docsWithScores.push({ idx: i, score });
        totalScore += score;
      }
    }

    wordData[word] = { df: docFreq, totalScore, docs: docsWithScores };
  }

  // Rank by total TF-IDF score
  const allSorted = Object.entries(wordData)
    .sort((a, b) => b[1].totalScore - a[1].totalScore);

  let selected;
  if (minTagsPerDoc > 0) {
    const mandatory = [];
    const mandatoryWords = new Set();
    const docTagCount = new Map();
    for (const entry of allSorted) {
      let allCovered = true;
      for (let i = 0; i < N; i++) {
        if ((docTagCount.get(i) || 0) < minTagsPerDoc) { allCovered = false; break; }
      }
      if (allCovered) break;
      const helps = entry[1].docs.some(d => (docTagCount.get(d.idx) || 0) < minTagsPerDoc);
      if (!helps) continue;
      mandatory.push(entry);
      mandatoryWords.add(entry[0]);
      for (const d of entry[1].docs) {
        docTagCount.set(d.idx, (docTagCount.get(d.idx) || 0) + 1);
      }
    }
    selected = [...mandatory];
    for (const entry of allSorted) {
      if (selected.length >= topN) break;
      if (mandatoryWords.has(entry[0])) continue;
      selected.push(entry);
    }
  } else {
    selected = allSorted.slice(0, topN);
  }

  selected.sort((a, b) => b[1].totalScore - a[1].totalScore);

  const stemMaps = textes.map(t => buildStemDisplayMap(t.texte, minLen));
  return { tags: selected, stemMaps };
}

// ===================== NETWORK GRAPH =====================

function drawGraph(tags, stemMaps) {
  const svg = d3.select('#graph');
  svg.selectAll('*').remove();
  if (simulation) simulation.stop();

  const container = document.getElementById('graph-container');
  const width = container.clientWidth || 900;
  const height = 600;
  svg.attr('width', width).attr('height', height);

  const nodes = [];
  const links = [];

  textes.forEach((t, i) => {
    nodes.push({ id: `doc-${i}`, nodeType: 'doc', idx: i, label: t.auteur.toUpperCase(), docType: t.type });
  });

  for (const [word, data] of tags) {
    let display = word;
    for (const stemMap of stemMaps) {
      if (stemMap[word]) { display = stemMap[word]; break; }
    }
    const tagId = `tag-${word}`;
    nodes.push({ id: tagId, nodeType: 'tag', label: display, df: data.df, totalScore: data.totalScore });
    for (const d of data.docs) {
      links.push({ source: `doc-${d.idx}`, target: tagId, score: d.score });
    }
  }

  const g = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.3, 3]).on('zoom', (e) => g.attr('transform', e.transform)));

  const link = g.append('g')
    .selectAll('line').data(links).join('line')
    .attr('class', 'link')
    .attr('stroke-width', d => Math.max(0.5, d.score * 2));

  const docNode = g.append('g')
    .selectAll('g').data(nodes.filter(n => n.nodeType === 'doc')).join('g')
    .attr('class', 'node-doc');
  docNode.append('circle').attr('r', 10).attr('fill', d => typeColor(d.docType));
  docNode.append('text').attr('class', 'label-doc').attr('dx', 14).attr('dy', 4).text(d => d.label);

  const maxTotal = tags.length ? tags[0][1].totalScore : 1;
  const tagNode = g.append('g')
    .selectAll('g').data(nodes.filter(n => n.nodeType === 'tag')).join('g')
    .attr('class', 'node-tag');
  tagNode.append('rect')
    .attr('width', d => Math.max(8, 6 + (d.totalScore / maxTotal) * 10))
    .attr('height', d => Math.max(8, 6 + (d.totalScore / maxTotal) * 10))
    .attr('x', d => -Math.max(4, 3 + (d.totalScore / maxTotal) * 5))
    .attr('y', d => -Math.max(4, 3 + (d.totalScore / maxTotal) * 5))
    .attr('rx', 2).attr('fill', '#95a5a6');
  tagNode.append('text').attr('class', 'label-tag')
    .attr('dx', d => Math.max(8, 6 + (d.totalScore / maxTotal) * 10) / 2 + 4)
    .attr('dy', 3).text(d => d.label);

  // Highlight
  let pinnedId = null;

  function highlightNode(d) {
    svg.classed('highlight', true);
    const connectedIds = new Set([d.id]);
    link.each(function(l) {
      const sid = typeof l.source === 'object' ? l.source.id : l.source;
      const tid = typeof l.target === 'object' ? l.target.id : l.target;
      if (sid === d.id || tid === d.id) {
        connectedIds.add(sid); connectedIds.add(tid);
        d3.select(this).classed('active', true);
      }
    });
    docNode.classed('dimmed', n => !connectedIds.has(n.id));
    tagNode.classed('dimmed', n => !connectedIds.has(n.id));
  }

  function unhighlight() {
    if (pinnedId) return;
    svg.classed('highlight', false);
    link.classed('active', false);
    docNode.classed('dimmed', false);
    tagNode.classed('dimmed', false);
  }

  function pinById(id) {
    if (pinnedId === id) {
      pinnedId = null;
      svg.classed('highlight', false);
      link.classed('active', false);
      docNode.classed('dimmed', false);
      tagNode.classed('dimmed', false);
    } else {
      pinnedId = id;
      link.classed('active', false);
      const node = nodes.find(n => n.id === id);
      if (node) highlightNode(node);
    }
  }

  graphPinById = pinById;

  svg.on('click', () => { pinnedId = null; unhighlight(); });
  docNode
    .on('mouseenter', (_, d) => { if (!pinnedId) highlightNode(d); })
    .on('mouseleave', () => { if (!pinnedId) unhighlight(); });
  tagNode
    .on('mouseenter', (_, d) => { if (!pinnedId) highlightNode(d); })
    .on('mouseleave', () => { if (!pinnedId) unhighlight(); });

  // Simulation
  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d => d.id).distance(80))
    .force('charge', d3.forceManyBody().strength(-200))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(d => d.nodeType === 'doc' ? 30 : 20))
    .force('x', d3.forceX(width / 2).strength(0.04))
    .force('y', d3.forceY(height / 2).strength(0.04));

  let dragMoved = false;
  const drag = d3.drag()
    .on('start', (e) => {
      dragMoved = false;
      if (!e.active) simulation.alphaTarget(0.3).restart();
      e.subject.fx = e.subject.x; e.subject.fy = e.subject.y;
    })
    .on('drag', (e) => { dragMoved = true; e.subject.fx = e.x; e.subject.fy = e.y; })
    .on('end', (e) => {
      if (!e.active) simulation.alphaTarget(0);
      e.subject.fx = null; e.subject.fy = null;
      if (!dragMoved) { e.sourceEvent.stopPropagation(); pinById(e.subject.id); }
    });

  docNode.call(drag);
  tagNode.call(drag);

  simulation.on('tick', () => {
    link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
    docNode.attr('transform', d => `translate(${d.x},${d.y})`);
    tagNode.attr('transform', d => `translate(${d.x},${d.y})`);
  });
}

// ===================== TAG LIST =====================

function drawTagList(tags, stemMaps) {
  const container = document.getElementById('tags');
  container.innerHTML = '';

  if (tags.length === 0) {
    container.innerHTML = '<p style="color:#7f8c8d;font-size:13px;">Aucun tag trouvé avec ces paramètres.</p>';
    return;
  }

  const maxTotal = tags[0][1].totalScore;

  for (const [word, data] of tags) {
    const card = document.createElement('div');
    card.className = 'tag-card';

    let display = word;
    for (const stemMap of stemMaps) {
      if (stemMap[word]) { display = stemMap[word]; break; }
    }

    const docBadges = data.docs
      .sort((a, b) => b.score - a.score)
      .map(d => {
        const entry = textes[d.idx];
        return `<span class="tag-doc"><span class="dot ${dotClass(entry.type)}"></span>${entry.auteur.toUpperCase()}<span class="doc-score">${d.score.toFixed(2)}</span></span>`;
      }).join('');

    card.innerHTML = `
      <div class="tag-header">
        <span class="tag-word">${display}</span>
        <span class="tag-df">${data.df} documents</span>
      </div>
      <div class="tag-score-bar"><div class="tag-score-fill" style="width:${(data.totalScore / maxTotal * 100).toFixed(1)}%"></div></div>
      <div class="tag-docs">${docBadges}</div>
    `;
    const tagId = `tag-${word}`;
    card.addEventListener('click', () => {
      if (graphPinById) graphPinById(tagId);
      container.querySelectorAll('.tag-card').forEach(c => c.classList.remove('active'));
      card.classList.toggle('active');
    });
    container.appendChild(card);
  }
}

// ===================== UPDATE =====================

function update() {
  const minLen = +document.getElementById('minLen').value;
  const minDf = +document.getElementById('minDf').value;
  const maxDf = +document.getElementById('maxDf').value;
  const topN = +document.getElementById('topN').value;
  const minTagsPerDoc = +document.getElementById('minTagsPerDoc').value;

  document.getElementById('minLenVal').textContent = minLen;
  document.getElementById('minDfVal').textContent = minDf;
  document.getElementById('maxDfVal').textContent = maxDf;
  document.getElementById('topNVal').textContent = topN;
  document.getElementById('minTagsPerDocVal').textContent = minTagsPerDoc;

  const { tags, stemMaps } = computeTags(minLen, minDf, maxDf, topN, minTagsPerDoc);
  drawGraph(tags, stemMaps);
  drawTagList(tags, stemMaps);
}

document.getElementById('minLen').addEventListener('input', update);
document.getElementById('minDf').addEventListener('input', update);
document.getElementById('maxDf').addEventListener('input', update);
document.getElementById('topN').addEventListener('input', update);
document.getElementById('minTagsPerDoc').addEventListener('input', update);

loadTextes(update);
