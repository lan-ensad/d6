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
leurs notre cette entre même faire sous vers aussi avons
`.trim().split(/\s+/));

let textes = [];

async function load() {
  const r = await fetch('textes.json');
  textes = await r.json();
  update();
}

function normalize(w) {
  return w.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
}

// Reduce French word to a root that merges singular/plural
function stem(w) {
  // -eaux -> -eau (tableaux -> tableau)
  if (w.endsWith('eaux')) return w.slice(0, -1);
  // -aux -> -al (journaux -> journal)
  if (w.endsWith('aux') && w.length > 4) return w.slice(0, -3) + 'al';
  // -ies -> -ie
  if (w.endsWith('ies')) return w.slice(0, -1);
  // -ses -> -se, -tes -> -te, -ces -> -ce, -ees -> -ee, etc.
  if (w.endsWith('es') && w.length > 4) {
    const before = w.slice(0, -2);
    // Only strip -es if the base looks reasonable (ends in consonant+e pattern or double vowel)
    if (/[^aeiou]$/.test(before)) return before + 'e';
  }
  // -s (simple plural)
  if (w.endsWith('s') && w.length > 3 && !w.endsWith('ss')) return w.slice(0, -1);
  // -x (bijoux, etc.)
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

// Tokenize with stemming: returns array of { stem, raw }
function tokenizeStemmed(text, minLen) {
  const tokens = tokenize(text, minLen);
  return tokens.map(w => ({ stem: stem(w), raw: w }));
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

// Build a map stem -> most frequent original accented form
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
    // Pick the singular form (shortest) among the most frequent
    const sorted = Object.entries(forms).sort((a, b) => b[1] - a[1] || a[0].length - b[0].length);
    map[s] = sorted[0][0];
  }
  return map;
}

function computeTags(minLen, minDf, maxDf, topN) {
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

  // Rank by total TF-IDF score (relevance across docs)
  const sorted = Object.entries(wordData)
    .sort((a, b) => b[1].totalScore - a[1].totalScore)
    .slice(0, topN);

  // Stem display maps (stem -> best original accented form)
  const stemMaps = textes.map(t => buildStemDisplayMap(t.texte, minLen));

  return { tags: sorted, stemMaps };
}

function dotClass(type) {
  if (type === 'essai') return 'dot-essai';
  if (type === 'portfolio') return 'dot-portfolio';
  return 'dot-entretien';
}

// ===================== NETWORK GRAPH =====================

let simulation = null;
let graphPinById = null;

function typeColor(type) {
  if (type === 'essai') return '#4a90d9';
  if (type === 'portfolio') return '#a27ff5';
  return '#e67e22';
}

function drawGraph(tags, stemMaps) {
  const svg = d3.select('#graph');
  svg.selectAll('*').remove();
  if (simulation) simulation.stop();

  const container = document.getElementById('graph-container');
  const width = container.clientWidth || 900;
  const height = 600;
  svg.attr('width', width).attr('height', height);

  // Build nodes & links
  const nodes = [];
  const links = [];
  const docNodeIds = new Set();

  // Doc nodes
  textes.forEach((t, i) => {
    const id = `doc-${i}`;
    docNodeIds.add(id);
    nodes.push({ id, nodeType: 'doc', idx: i, label: t.auteur.toUpperCase(), docType: t.type });
  });

  // Tag nodes + links
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

  // Zoom
  svg.call(d3.zoom().scaleExtent([0.3, 3]).on('zoom', (e) => g.attr('transform', e.transform)));

  // Links
  const link = g.append('g')
    .selectAll('line')
    .data(links)
    .join('line')
    .attr('class', 'link')
    .attr('stroke-width', d => Math.max(0.5, d.score * 2));

  // Doc nodes
  const docNode = g.append('g')
    .selectAll('g')
    .data(nodes.filter(n => n.nodeType === 'doc'))
    .join('g')
    .attr('class', 'node-doc');

  docNode.append('circle')
    .attr('r', 10)
    .attr('fill', d => typeColor(d.docType));

  docNode.append('text')
    .attr('class', 'label-doc')
    .attr('dx', 14).attr('dy', 4)
    .text(d => d.label);

  // Tag nodes
  const maxTotal = tags.length ? tags[0][1].totalScore : 1;
  const tagNode = g.append('g')
    .selectAll('g')
    .data(nodes.filter(n => n.nodeType === 'tag'))
    .join('g')
    .attr('class', 'node-tag');

  tagNode.append('rect')
    .attr('width', d => Math.max(8, 6 + (d.totalScore / maxTotal) * 10))
    .attr('height', d => Math.max(8, 6 + (d.totalScore / maxTotal) * 10))
    .attr('x', d => -Math.max(4, 3 + (d.totalScore / maxTotal) * 5))
    .attr('y', d => -Math.max(4, 3 + (d.totalScore / maxTotal) * 5))
    .attr('rx', 2)
    .attr('fill', '#95a5a6');

  tagNode.append('text')
    .attr('class', 'label-tag')
    .attr('dx', d => Math.max(8, 6 + (d.totalScore / maxTotal) * 10) / 2 + 4)
    .attr('dy', 3)
    .text(d => d.label);

  // Highlight on hover + pin on click
  const allDocNodes = docNode;
  const allTagNodes = tagNode;
  const allLinks = link;
  let pinnedId = null;

  function highlightNode(d) {
    svg.classed('highlight', true);
    const connectedIds = new Set();
    connectedIds.add(d.id);

    allLinks.each(function(l) {
      const sid = typeof l.source === 'object' ? l.source.id : l.source;
      const tid = typeof l.target === 'object' ? l.target.id : l.target;
      if (sid === d.id || tid === d.id) {
        connectedIds.add(sid);
        connectedIds.add(tid);
        d3.select(this).classed('active', true);
      }
    });

    allDocNodes.classed('dimmed', n => !connectedIds.has(n.id));
    allTagNodes.classed('dimmed', n => !connectedIds.has(n.id));
  }

  function unhighlight() {
    if (pinnedId) return;
    svg.classed('highlight', false);
    allLinks.classed('active', false);
    allDocNodes.classed('dimmed', false);
    allTagNodes.classed('dimmed', false);
  }

  function pinById(id) {
    if (pinnedId === id) {
      pinnedId = null;
      svg.classed('highlight', false);
      allLinks.classed('active', false);
      allDocNodes.classed('dimmed', false);
      allTagNodes.classed('dimmed', false);
    } else {
      pinnedId = id;
      allLinks.classed('active', false);
      const node = nodes.find(n => n.id === id);
      if (node) highlightNode(node);
    }
  }

  // Expose for tag-card clicks
  graphPinById = pinById;

  svg.on('click', () => {
    pinnedId = null;
    svg.classed('highlight', false);
    allLinks.classed('active', false);
    allDocNodes.classed('dimmed', false);
    allTagNodes.classed('dimmed', false);
  });

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

  // Drag with click detection (no movement = click)
  let dragMoved = false;
  const drag = d3.drag()
    .on('start', (e) => {
      dragMoved = false;
      if (!e.active) simulation.alphaTarget(0.3).restart();
      e.subject.fx = e.subject.x;
      e.subject.fy = e.subject.y;
    })
    .on('drag', (e) => {
      dragMoved = true;
      e.subject.fx = e.x;
      e.subject.fy = e.y;
    })
    .on('end', (e) => {
      if (!e.active) simulation.alphaTarget(0);
      e.subject.fx = null;
      e.subject.fy = null;
      if (!dragMoved) {
        e.sourceEvent.stopPropagation();
        pinById(e.subject.id);
      }
    });

  docNode.call(drag);
  tagNode.call(drag);

  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x).attr('y1', d => d.source.y)
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
    container.innerHTML = '<p style="color:#7f8c8d;font-size:13px;">Aucun tag trouvé avec ces paramètres. Essayez de baisser la longueur min. ou le seuil de docs min.</p>';
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
      card.classList.toggle('active', card.classList.contains('active') ? false : true);
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

  document.getElementById('minLenVal').textContent = minLen;
  document.getElementById('minDfVal').textContent = minDf;
  document.getElementById('maxDfVal').textContent = maxDf;
  document.getElementById('topNVal').textContent = topN;

  const { tags, stemMaps } = computeTags(minLen, minDf, maxDf, topN);

  drawGraph(tags, stemMaps);
  drawTagList(tags, stemMaps);
}

document.getElementById('minLen').addEventListener('input', update);
document.getElementById('minDf').addEventListener('input', update);
document.getElementById('maxDf').addEventListener('input', update);
document.getElementById('topN').addEventListener('input', update);

load();
