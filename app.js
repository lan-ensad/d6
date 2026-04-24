let isPinned = false;
let nodes = [];
let personData = new Map();
let topicData = new Map();
let zoom;
let activeFilter = null; // { category: 'papier'|'web', type: string }

function statusColor(status) {
    if (status === 'revu') return '#27ae60';
    if (status === 'relecture') return '#e67e22';
    return '#e74c3c';
}

function statusClass(status) {
    if (status === 'revu') return 'revu';
    if (status === 'relecture') return 'relecture';
    return 'todo';
}

function statusLabel(status) {
    if (status === 'revu') return 'revu';
    if (status === 'relecture') return 'en cours';
    return 'à faire';
}

// ============================================================
// PARSING DES DONNÉES
// ============================================================

function parseData(data) {
    const links = [];
    const topicSet = new Set();
    const personSet = new Set();
    const typesPapier = new Map();
    const typesWeb = new Map();

    data.forEach((contribution, index) => {
        if (!contribution.qui) return;
        const personnes = Array.isArray(contribution.qui) ? contribution.qui : [contribution.qui];
        const topics = Array.isArray(contribution.topic) ? contribution.topic : [];
        const typologie = contribution.typologie || { papier: 'N/A', web: 'N/A' };
        contribution.typologie = typologie;

        // Collecter les types de contributions avec comptage
        if (typologie.papier && typologie.papier !== 'N/A') {
            typesPapier.set(typologie.papier, (typesPapier.get(typologie.papier) || 0) + 1);
        }
        if (typologie.web && typologie.web !== 'N/A') {
            typesWeb.set(typologie.web, (typesWeb.get(typologie.web) || 0) + 1);
        }

        // Stocker les données de chaque personne
        personnes.forEach(p => {
            if (!personSet.has(p.nom)) {
                personSet.add(p.nom);
                personData.set(p.nom, {
                    rattachement: p.rattachement,
                    contact: p.contact,
                    topics: [],
                    typologie: contribution.typologie,
                    status: contribution.status || ''
                });
            }
            topics.forEach(t => {
                if (!personData.get(p.nom).topics.includes(t)) {
                    personData.get(p.nom).topics.push(t);
                }
            });
        });

        // Créer le nœud : collectif ou individuel
        let nodeId;
        if (personnes.length > 1) {
            nodeId = `contrib-${index}`;
            nodes.push({
                id: nodeId,
                type: 'contribution',
                personnes: personnes.map(p => p.nom),
                contacts: personnes.map(p => p.contact),
                rattachements: personnes.map(p => p.rattachement),
                typologie: contribution.typologie,
                status: contribution.status || '',
                topics
            });
        } else {
            const p = personnes[0];
            nodeId = p.nom;
            if (!nodes.find(n => n.id === p.nom)) {
                nodes.push({ id: p.nom, type: 'person', rattachement: p.rattachement, contact: p.contact, status: contribution.status || '' });
            }
        }
        topics.forEach(t => links.push({ source: nodeId, target: t }));

        // Topics
        topics.forEach(t => {
            if (!topicSet.has(t)) {
                topicSet.add(t);
                nodes.push({ id: t, type: 'topic' });
                topicData.set(t, { personnes: [] });
            }
            personnes.forEach(p => {
                if (!topicData.get(t).personnes.find(x => x.nom === p.nom)) {
                    topicData.get(t).personnes.push({ nom: p.nom, contact: p.contact });
                }
            });
        });
    });

    return { links, typesPapier, typesWeb, personSet, topicSet };
}

// ============================================================
// DRAG & DROP
// ============================================================

function dragstarted(event, simulation) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
}

function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
}

function dragended(event, simulation) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
}

// ============================================================
// PANNEAU D'INFO
// ============================================================

function showInfo(d, pin) {
    const info = document.getElementById('info');
    const content = document.getElementById('info-content');

    if (pin) {
        isPinned = true;
        info.classList.add('pinned');
    }

    let html = '';

    if (d.type === 'person') {
        const p = personData.get(d.id);
        html = `
            <span class="type-badge type-person">Personne</span>
            <h3>${d.id}</h3>
            <p><strong>Rattachement:</strong> ${p.rattachement}</p>
            <p><strong>Contact:</strong> <a href="mailto:${p.contact}">${p.contact}</a></p>
            <p><strong>Status:</strong> <span class="status-badge status-${statusClass(p.status)}">${statusLabel(p.status)}</span></p>
            ${p.topics.length ? `<p><strong>Topics:</strong></p><ul>${p.topics.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
            <p><strong>Contribution:</strong></p>
            <ul>
                <li>Papier: ${p.typologie.papier}</li>
                <li>Web: ${p.typologie.web}</li>
            </ul>
        `;
    } else {
        const t = topicData.get(d.id);
        html = `
            <span class="type-badge type-topic">Topic</span>
            <h3>${d.id}</h3>
            <p><strong>Contributeur·ices:</strong></p>
            <ul>${t.personnes.map(p => `<li>${p.nom}<br><a href="mailto:${p.contact}">${p.contact}</a></li>`).join('')}</ul>
        `;
    }

    content.innerHTML = html;
    info.style.display = 'block';
}

function showContributionInfo(contrib, pin) {
    const info = document.getElementById('info');
    const content = document.getElementById('info-content');

    if (pin) {
        isPinned = true;
        info.classList.add('pinned');
    }

    const html = `
        <span class="type-badge type-contribution">Contribution collective</span>
        <h3>${contrib.personnes.join(' + ')}</h3>
        <p><strong>Auteur·ices:</strong></p>
        <ul>${contrib.personnes.map((nom, i) => `<li>${nom}<br><a href="mailto:${contrib.contacts[i]}">${contrib.contacts[i]}</a></li>`).join('')}</ul>
        ${contrib.topics.length ? `<p><strong>Topics:</strong></p><ul>${contrib.topics.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
        <p><strong>Format:</strong></p>
        <ul>
            <li>Papier: ${contrib.typologie.papier}</li>
            <li>Web: ${contrib.typologie.web}</li>
        </ul>
        <p><strong>Status:</strong> <span class="status-badge status-${statusClass(contrib.status)}">${statusLabel(contrib.status)}</span></p>
    `;

    content.innerHTML = html;
    info.style.display = 'block';
}

function hideInfoIfNotPinned() {
    if (!isPinned) {
        document.getElementById('info').style.display = 'none';
    }
}

function closeInfo() {
    const info = document.getElementById('info');
    info.style.display = 'none';
    info.classList.remove('pinned');
    isPinned = false;
}

// ============================================================
// SIMULATION DE FORCE
// ============================================================

function createSimulation(links, width, height) {
    const simulation = d3.forceSimulation(nodes)
        .force('link', d3.forceLink(links).id(d => d.id).distance(100))
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide().radius(40))
        .force('x', d3.forceX(width / 2).strength(0.05))
        .force('y', d3.forceY(height / 2).strength(0.05));

    return simulation;
}

// ============================================================
// CRÉATION DU GRAPHE
// ============================================================

function createGraph(svg, links, simulation, width, height, margin) {
    const g = svg.append('g');

    // Zoom
    zoom = d3.zoom()
        .scaleExtent([0.3, 3])
        .on('zoom', (event) => g.attr('transform', event.transform));

    svg.call(zoom);

    // Liens
    const link = g.append('g')
        .selectAll('line')
        .data(links)
        .join('line')
        .attr('class', 'link');

    // Nœuds
    const node = g.append('g')
        .selectAll('g')
        .data(nodes)
        .join('g')
        .attr('class', d => `node-${d.type}`)
        .call(d3.drag()
            .on('start', (e) => dragstarted(e, simulation))
            .on('drag', dragged)
            .on('end', (e) => dragended(e, simulation)))
        .on('mouseenter', (_, d) => {
            if (d.type === 'contribution') showContributionInfo(d, false);
            else showInfo(d, false);
        })
        .on('mouseleave', hideInfoIfNotPinned)
        .on('click', (event, d) => {
            event.stopPropagation();
            if (d.type === 'contribution') showContributionInfo(d, true);
            else showInfo(d, true);
        });

    // Forme selon le type : cercle pour person/contribution, carré pour topic
    node.each(function(d) {
        const el = d3.select(this);
        if (d.type === 'topic') {
            el.append('rect')
                .attr('width', 12)
                .attr('height', 12)
                .attr('x', -6)
                .attr('y', -6);
        } else {
            el.append('circle')
                .attr('r', d.type === 'person' ? 8 : 10)
                .style('fill', (d.type === 'person' || d.type === 'contribution') ? statusColor(d.status) : null);
        }
    });

    // Labels
    node.each(function(d) {
        const el = d3.select(this);
        if (d.type === 'contribution') {
            // Noms empilés pour les contributions collectives
            d.personnes.forEach((nom, i) => {
                el.append('text')
                    .attr('class', 'label')
                    .attr('dx', 16)
                    .attr('dy', i * 14 - ((d.personnes.length - 1) * 7) + 4)
                    .text(nom);
            });
        } else {
            el.append('text')
                .attr('class', 'label')
                .attr('dx', 12)
                .attr('dy', 4)
                .text(d.id);
        }
    });

    // Mise à jour à chaque tick
    simulation.on('tick', () => {
        // Contraindre les nœuds dans les marges
        nodes.forEach(d => {
            d.x = Math.max(margin, Math.min(width - margin, d.x));
            d.y = Math.max(margin, Math.min(height - margin, d.y));
        });

        link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y);

        node.attr('transform', d => `translate(${d.x},${d.y})`);
    });

    // Fermer le panneau au clic sur le SVG
    svg.on('click', closeInfo);
}

// ============================================================
// FILTRE PAR TYPE DE CONTRIBUTION
// ============================================================

function applyFilter(category, type) {
    const svg = d3.select('svg');

    // Toggle : si on clique sur le filtre actif, on le désactive
    if (activeFilter && activeFilter.category === category && activeFilter.type === type) {
        activeFilter = null;
        svg.classed('filtered', false);
        // Retirer toutes les classes de filtre
        svg.selectAll('.node-person, .node-topic, .node-contribution').classed('filter-match', false).classed('filter-dim', false);
        svg.selectAll('.link').classed('filter-dim', false);
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('#topic-list li').forEach(li => li.classList.remove('active'));
        return;
    }

    activeFilter = { category, type };
    svg.classed('filtered', true);

    // Trouver les personnes/contributions qui correspondent au filtre
    const matchingNodeIds = new Set();
    personData.forEach((data, name) => {
        if (data.typologie[category] === type) {
            matchingNodeIds.add(name);
        }
    });
    // Aussi checker les nœuds contribution
    nodes.forEach(n => {
        if (n.type === 'contribution' && n.typologie[category] === type) {
            matchingNodeIds.add(n.id);
            n.personnes.forEach(name => matchingNodeIds.add(name));
        }
    });

    // Trouver les topics connectés
    const matchingTopics = new Set();
    topicData.forEach((data, topicName) => {
        data.personnes.forEach(p => {
            if (matchingNodeIds.has(p.nom)) {
                matchingTopics.add(topicName);
            }
        });
    });

    // Appliquer les classes aux nœuds
    svg.selectAll('.node-person, .node-topic, .node-contribution').each(function(d) {
        const el = d3.select(this);
        const isMatch = (d.type === 'person' && matchingNodeIds.has(d.id)) ||
                        (d.type === 'contribution' && matchingNodeIds.has(d.id)) ||
                        (d.type === 'topic' && matchingTopics.has(d.id));
        el.classed('filter-match', isMatch);
        el.classed('filter-dim', !isMatch);
    });

    // Appliquer aux liens
    svg.selectAll('.link').each(function(d) {
        const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
        const targetId = typeof d.target === 'object' ? d.target.id : d.target;
        const isMatch = (matchingNodeIds.has(sourceId) && matchingTopics.has(targetId));
        d3.select(this).classed('filter-dim', !isMatch);
    });

    // Mettre à jour les boutons actifs
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`#contribution-types .filter-btn[data-category="${category}"][data-type="${type}"]`);
    if (activeBtn) activeBtn.classList.add('active');
}

function applyTopicFilter(topicName) {
    const svg = d3.select('svg');

    // Toggle : si on clique sur le filtre actif, on le désactive
    if (activeFilter && activeFilter.category === 'topic' && activeFilter.type === topicName) {
        activeFilter = null;
        svg.classed('filtered', false);
        svg.selectAll('.node-person, .node-topic, .node-contribution').classed('filter-match', false).classed('filter-dim', false);
        svg.selectAll('.link').classed('filter-dim', false);
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('#topic-list li').forEach(li => li.classList.remove('active'));
        return;
    }

    activeFilter = { category: 'topic', type: topicName };
    svg.classed('filtered', true);

    // Trouver les personnes connectées à ce topic
    const matchingPersons = new Set();
    const tData = topicData.get(topicName);
    if (tData) {
        tData.personnes.forEach(p => matchingPersons.add(p.nom));
    }

    // Trouver les nœuds contribution dont au moins un membre est connecté
    const matchingContribIds = new Set();
    nodes.forEach(n => {
        if (n.type === 'contribution' && n.topics.includes(topicName)) {
            matchingContribIds.add(n.id);
        }
    });

    // Appliquer les classes aux nœuds
    svg.selectAll('.node-person, .node-topic, .node-contribution').each(function(d) {
        const el = d3.select(this);
        const isMatch = (d.type === 'topic' && d.id === topicName) ||
                        (d.type === 'person' && matchingPersons.has(d.id)) ||
                        (d.type === 'contribution' && matchingContribIds.has(d.id));
        el.classed('filter-match', isMatch);
        el.classed('filter-dim', !isMatch);
    });

    // Appliquer aux liens
    svg.selectAll('.link').each(function(d) {
        const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
        const targetId = typeof d.target === 'object' ? d.target.id : d.target;
        const isMatch = (matchingPersons.has(sourceId) || matchingContribIds.has(sourceId)) && targetId === topicName;
        d3.select(this).classed('filter-dim', !isMatch);
    });

    // Mettre à jour les éléments actifs
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#topic-list li').forEach(li => li.classList.remove('active'));
    document.querySelectorAll('#topic-list li').forEach(li => {
        if (li.dataset.topic === topicName) li.classList.add('active');
    });
}

// ============================================================
// SIDEBARS
// ============================================================

function populateSidebars(data, typesPapier, typesWeb, personSet, topicSet) {
    const statsEl = document.getElementById('stats');
    const topicListEl = document.getElementById('topic-list');
    const typesEl = document.getElementById('contribution-types');

    // Statistiques
    statsEl.innerHTML = `
        <p>Contributions <span>${data.length}</span></p>
        <p>Contributeur·ices <span>${personSet.size}</span></p>
        <p>Topics <span>${topicSet.size}</span></p>
    `;

    // Statuts
    const statusCounts = { todo: 0, relecture: 0, revu: 0 };
    data.forEach(d => {
        const s = d.status || '';
        if (s === 'revu') statusCounts.revu++;
        else if (s === 'relecture') statusCounts.relecture++;
        else statusCounts.todo++;
    });
    document.getElementById('status-legend').innerHTML = `
        <p><span class="legend-dot status-todo-dot"></span>à faire <span>${statusCounts.todo}</span></p>
        <p><span class="legend-dot status-relecture-dot"></span>en cours <span>${statusCounts.relecture}</span></p>
        <p><span class="legend-dot status-revu-dot"></span>revu <span>${statusCounts.revu}</span></p>
    `;

    // Types de contributions (cliquables pour filtrer)
    const papierList = Array.from(typesPapier.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => `<p class="filter-btn" data-category="papier" data-type="${type}">${type} <span>${count}</span></p>`)
        .join('');
    const webList = Array.from(typesWeb.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => `<p class="filter-btn" data-category="web" data-type="${type}">${type} <span>${count}</span></p>`)
        .join('');
    typesEl.innerHTML = `
        <h5>Papier</h5>
        ${papierList}
        <h5>Web</h5>
        ${webList}
    `;

    // Ajouter les event listeners sur les boutons de filtre
    typesEl.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            applyFilter(btn.dataset.category, btn.dataset.type);
        });
    });

    // Liste des topics triés par nombre de contributeurs
    document.getElementById('topic-count').textContent = topicSet.size;
    const topicsSorted = Array.from(topicData.entries())
        .sort((a, b) => b[1].personnes.length - a[1].personnes.length);

    topicsSorted.forEach(([topic, topicInfo]) => {
        const li = document.createElement('li');
        li.dataset.topic = topic;
        li.innerHTML = `<span>${topic}</span><span class="count">${topicInfo.personnes.length}</span>`;
        li.addEventListener('click', () => {
            applyTopicFilter(topic);
        });
        topicListEl.appendChild(li);
    });
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function initEventListeners() {
    document.querySelector('#info .close').addEventListener('click', closeInfo);
}

// ============================================================
// INITIALISATION
// ============================================================

function init(data) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const margin = 50;

    const svg = d3.select('svg')
        .attr('width', width)
        .attr('height', height);

    const { links, typesPapier, typesWeb, personSet, topicSet } = parseData(data);
    const simulation = createSimulation(links, width, height);

    createGraph(svg, links, simulation, width, height, margin);
    populateSidebars(data, typesPapier, typesWeb, personSet, topicSet);
    initEventListeners();
}

// ============================================================
// CHARGEMENT DES DONNÉES
// ============================================================

fetch('https://raw.githubusercontent.com/lan-ensad/d6/refs/heads/main/contributions.json') //→ on push
// fetch('contributions.json') //→dev mod
    .then(response => response.json())
    .then(init);
