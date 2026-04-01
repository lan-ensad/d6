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

loadTextes(update);
